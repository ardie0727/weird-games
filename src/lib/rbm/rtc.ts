"use client";

// Browser-to-browser connections for Rubber Bullet Man online. The server at /api/rbm/room
// only passes the connection offers along; after that, game traffic goes straight between
// phones over WebRTC data channels (one reliable, one fast-and-lossy for snapshots).

const ICE: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  { urls: "stun:stun.cloudflare.com:3478" },
];

const API = "/api/rbm/room";

export class NetError extends Error {}

async function api<T>(init: { method: "GET"; query: Record<string, string | number> } | { method: "POST"; body: Record<string, unknown> }): Promise<T> {
  let res: Response;
  try {
    res =
      init.method === "GET"
        ? await fetch(`${API}?${new URLSearchParams(Object.entries(init.query).map(([k, v]) => [k, String(v)]))}`, { cache: "no-store" })
        : await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(init.body) });
  } catch {
    throw new NetError("You look offline. Check your connection.");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new NetError(data.error ?? "Something went wrong. Try again.");
  return data;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wait until the browser has found its network addresses (or a couple of seconds pass). */
function gathered(pc: RTCPeerConnection, ms = 2500): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => pc.iceGatheringState === "complete" && done();
    const timer = setTimeout(done, ms);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

/** One live connection to one other player. */
export class Link {
  readonly pc: RTCPeerConnection;
  readonly rel: RTCDataChannel;
  readonly fast: RTCDataChannel;
  onMessage: (msg: unknown) => void = () => {};
  onClose: () => void = () => {};
  lastHeard = performance.now();
  private closed = false;

  constructor() {
    this.pc = new RTCPeerConnection({ iceServers: ICE });
    // Pre-agreed channel ids, so neither side has to wait for the other to announce them.
    this.rel = this.pc.createDataChannel("rel", { negotiated: true, id: 0, ordered: true });
    this.fast = this.pc.createDataChannel("fast", { negotiated: true, id: 1, ordered: false, maxRetransmits: 0 });
    for (const ch of [this.rel, this.fast]) {
      ch.onmessage = (e) => {
        this.lastHeard = performance.now();
        try {
          this.onMessage(JSON.parse(e.data as string));
        } catch {
          /* ignore junk */
        }
      };
      ch.onclose = () => this.close();
    }
    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === "failed" || this.pc.connectionState === "closed") this.close();
    };
  }

  get open() {
    return !this.closed && this.rel.readyState === "open";
  }

  /** Resolves once the reliable channel is up, or rejects after `ms`. */
  ready(ms = 15000): Promise<void> {
    if (this.rel.readyState === "open") return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new NetError("CONNECT")), ms);
      this.rel.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      });
      this.rel.addEventListener("close", () => {
        clearTimeout(timer);
        reject(new NetError("CONNECT"));
      });
    });
  }

  send(msg: unknown, fast = false) {
    const ch = fast && this.fast.readyState === "open" ? this.fast : this.rel;
    if (ch.readyState !== "open") return;
    // don't pile snapshots up behind a slow link
    if (fast && ch.bufferedAmount > 64_000) return;
    try {
      ch.send(JSON.stringify(msg));
    } catch {
      /* closing */
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try {
      this.rel.close();
      this.fast.close();
      this.pc.close();
    } catch {
      /* already gone */
    }
    this.onClose();
  }
}

const CONNECT_HELP = "Couldn't connect to your friend's game. Being on the same Wi-Fi works best: some mobile networks block direct connections.";

/** Join a friend's room by code. Resolves with a live link to the host. */
export async function joinRoom(code: string, name: string, signal?: { cancelled: boolean }): Promise<Link> {
  const link = new Link();
  try {
    await link.pc.setLocalDescription(await link.pc.createOffer());
    await gathered(link.pc);
    const { peer } = await api<{ peer: number }>({ method: "POST", body: { a: "join", code, name, sdp: link.pc.localDescription!.sdp } });
    const until = Date.now() + 25_000;
    let answer: string | null = null;
    for (let wait = 600; Date.now() < until; wait = Math.min(1500, wait + 200)) {
      if (signal?.cancelled) throw new NetError("Cancelled.");
      await sleep(wait);
      const r = await api<{ answer: string | null; open: boolean }>({ method: "GET", query: { code, peer } });
      if (!r.open) throw new NetError("That room has closed.");
      if (r.answer) {
        answer = r.answer;
        break;
      }
    }
    if (!answer) throw new NetError("The host didn't pick up. Are they still on the lobby screen?");
    await link.pc.setRemoteDescription({ type: "answer", sdp: answer });
    await link.ready().catch(() => {
      throw new NetError(CONNECT_HELP);
    });
    return link;
  } catch (e) {
    link.onClose = () => {};
    link.close();
    throw e instanceof NetError ? e : new NetError(CONNECT_HELP);
  }
}

/** A room this browser hosts: it lets friends in as they knock. */
export class Room {
  code = "";
  online = true;
  private secret = "";
  private after = 0;
  private stopped = false;
  private seen = new Set<number>();
  /** A friend connected. */
  onLink: (link: Link, name: string) => void = () => {};
  /** Polling for joiners: fast while in the lobby, slower during a game. */
  slow = false;
  /** False stops letting new people in (room full). */
  accepting = () => true;
  onError: (msg: string) => void = () => {};

  async open() {
    const r = await api<{ code: string; secret: string; online: boolean }>({ method: "POST", body: { a: "open" } });
    this.code = r.code;
    this.secret = r.secret;
    this.online = r.online;
    void this.poll();
  }

  private async poll() {
    let errors = 0;
    while (!this.stopped) {
      await sleep(this.slow ? 2500 : 1000);
      if (this.stopped) break;
      try {
        const { offers } = await api<{ offers: { peer: number; name: string; sdp: string }[] }>({ method: "GET", query: { code: this.code, secret: this.secret, after: this.after } });
        errors = 0;
        for (const o of offers) {
          this.after = Math.max(this.after, o.peer);
          if (this.seen.has(o.peer)) continue;
          this.seen.add(o.peer);
          if (this.accepting()) void this.answer(o.peer, o.name, o.sdp);
        }
      } catch (e) {
        if (++errors === 5) this.onError(e instanceof Error ? e.message : "Lost the room.");
      }
    }
  }

  private async answer(peer: number, name: string, sdp: string) {
    const link = new Link();
    try {
      await link.pc.setRemoteDescription({ type: "offer", sdp });
      await link.pc.setLocalDescription(await link.pc.createAnswer());
      await gathered(link.pc);
      await api({ method: "POST", body: { a: "answer", code: this.code, secret: this.secret, peer, sdp: link.pc.localDescription!.sdp } });
      await link.ready();
      if (this.stopped) return link.close();
      this.onLink(link, name);
    } catch {
      link.onClose = () => {};
      link.close();
    }
  }

  close() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.code) void api({ method: "POST", body: { a: "close", code: this.code, secret: this.secret } }).catch(() => {});
  }
}
