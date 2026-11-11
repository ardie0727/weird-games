"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { isMuted, onMuteChange, setMuted } from "@/lib/client/sound";
import { cleanName, getPlayer, load, save, setPlayerName } from "@/lib/client/storage";
import {
  BRAWL_TARGET,
  BULLETS,
  H,
  KINDS,
  MAX_PLAYERS,
  PLAYER_COLORS,
  POWERS,
  POWER_KINDS,
  W,
  addPlayer,
  movePlayer,
  newGame,
  removePlayer,
  step,
  type BulletKind,
  type Fx,
  type Game,
  type Input,
  type Mode,
  type Player,
  type Seat,
  type Sound,
} from "@/lib/rbm/engine";
import { INPUT_MS, Mirror, PROTOCOL, SNAP_MS, cleanCode, encodeSnap, type GuestMsg, type HostMsg, type LobbySeat } from "@/lib/rbm/net";
import { joinRoom, NetError, Room, type Link as NetLink } from "@/lib/rbm/rtc";
import { play, unlock } from "@/lib/rbm/sound";
import { DEAD, STICK, camera, drawGame, type Stick, type Theme } from "./draw";
import { applyTheme, pixelFlip, savedTheme } from "./themeFlip";

type Screen = "title" | "friends" | "connecting" | "lobby" | "play" | "over";
type Role = "solo" | "host" | "guest";

interface Result {
  score: number;
  wave: number;
  kills: number;
  bestChain: number;
  timeMs: number;
  best: boolean;
}

interface Standing {
  name: string;
  color: string;
  me: boolean;
  bot: boolean;
  points: number;
  kos: number;
  falls: number;
  score: number;
  kills: number;
}

interface MultiResult {
  mode: Mode;
  standings: Standing[];
  winner: string | null;
  wave: number;
  score: number;
}

interface Row {
  name: string;
  score: number;
  wave: number;
  kills: number;
}

/** A friend connected to the room this browser hosts. */
interface Guest {
  key: number;
  name: string;
  link: NetLink;
  pid: number | null;
  input: Input | null;
  heard: number;
}

interface LobbyView {
  code: string;
  seats: LobbySeat[];
  mode: Mode;
  you: number;
  online: boolean;
}

const BOT_NAMES = ["BOINGO", "RUBBERT", "SQUISHY"];

const newStick = (): Stick => ({ id: null, ox: 0, oy: 0, x: 0, y: 0, t0: 0 });

export function RubberBulletMan() {
  const [screen, setScreenState] = useState<Screen>("title");
  const [role, setRoleState] = useState<Role>("solo");
  const [paused, setPaused] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [theme, setThemeState] = useState<Theme>("dark");
  const themeRef = useRef<Theme>("dark");
  const themeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const t = savedTheme();
    themeRef.current = t;
    setThemeState(t);
    applyTheme(t);
    // the rest of the site stays in its own (dark) look
    return () => void delete document.documentElement.dataset.rbmTheme;
  }, []);
  const flipTheme = () =>
    pixelFlip(themeRef.current === "dark" ? "light" : "dark", themeBtn.current, (t) => {
      themeRef.current = t;
      setThemeState(t);
    });
  const [hud, setHud] = useState<{ selected: BulletKind; ammo: Record<BulletKind, number> }>(() => ({ selected: "bouncer", ammo: newGame().players[0].ammo }));
  const [result, setResult] = useState<Result | null>(null);
  const [multi, setMulti] = useState<MultiResult | null>(null);
  const [best, setBest] = useState(0);
  const [lobby, setLobby] = useState<LobbyView | null>(null);
  const [bots, setBotsState] = useState(0);
  const [netMsg, setNetMsg] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game>(null as unknown as Game);
  if (!gameRef.current) gameRef.current = newGame();
  // the player this screen controls (a fresh game's first player has id 1)
  const meRef = useRef<number>(1);
  const screenRef = useRef<Screen>("title");
  const roleRef = useRef<Role>("solo");
  const pausedRef = useRef(false);
  const scaleRef = useRef(1);
  const ctl = useRef({
    keys: new Set<string>(),
    move: newStick(),
    aim: newStick(),
    mouse: { x: 0, y: 0, down: false, active: false },
    pending: null as { x: number; y: number; t: number; sent: boolean } | null,
  });
  // hosting
  const roomRef = useRef<Room | null>(null);
  const guestsRef = useRef<Guest[]>([]);
  const nextKey = useRef(1);
  const hostMode = useRef<Mode>("coop");
  const botsRef = useRef(0);
  const outbox = useRef<{ fx: Fx[]; sounds: Sound[]; n: number; last: number }>({ fx: [], sounds: [], n: 0, last: 0 });
  // joining
  const linkRef = useRef<NetLink | null>(null);
  const mirrorRef = useRef<Mirror | null>(null);
  const guestCtl = useRef({ shots: 0, sel: null as BulletKind | null, selSends: 0, lastSend: 0, lobby: null as LobbyView | null });
  const joinCancel = useRef({ cancelled: false });

  const setScreen = useCallback((s: Screen) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);
  const setRole = useCallback((r: Role) => {
    roleRef.current = r;
    setRoleState(r);
  }, []);
  const setBots = useCallback((n: number) => {
    botsRef.current = n;
    setBotsState(n);
  }, []);

  const myName = () => getPlayer().name || "YOU";

  useEffect(() => {
    setBest(load<number>("rbm.best", 0));
    setMutedState(isMuted());
    const off = onMuteChange(setMutedState);
    // a shared invite link: /rubber-bullet-man?room=ABCD
    const code = cleanCode(new URLSearchParams(window.location.search).get("room") ?? "");
    if (code.length === 4) {
      setJoinCode(code);
      setScreen("friends");
    }
    return () => void off();
  }, [setScreen]);

  const setPause = useCallback((p: boolean) => {
    pausedRef.current = p;
    setPaused(p);
  }, []);

  const resetControls = () => {
    const c = ctl.current;
    c.pending = null;
    c.move = newStick();
    c.aim = newStick();
  };

  const me = (): Player | null => gameRef.current.players.find((p) => p.id === meRef.current) ?? null;

  // ---------- leaving / cleanup ----------

  const leaveNet = useCallback(() => {
    const room = roomRef.current;
    roomRef.current = null;
    for (const gu of guestsRef.current) {
      gu.link.onClose = () => {};
      gu.link.send({ t: "bye" } satisfies HostMsg);
      setTimeout(() => gu.link.close(), 100);
    }
    guestsRef.current = [];
    room?.close();
    const link = linkRef.current;
    linkRef.current = null;
    if (link) {
      link.onClose = () => {};
      link.send({ t: "bye" } satisfies GuestMsg);
      setTimeout(() => link.close(), 100);
    }
    mirrorRef.current = null;
    joinCancel.current.cancelled = true;
  }, []);

  useEffect(() => {
    const bye = () => leaveNet();
    window.addEventListener("pagehide", bye);
    return () => {
      window.removeEventListener("pagehide", bye);
      leaveNet();
    };
  }, [leaveNet]);

  const toTitle = useCallback(
    (msg = "") => {
      leaveNet();
      setRole("solo");
      gameRef.current = newGame();
      meRef.current = gameRef.current.players[0].id;
      setLobby(null);
      setPause(false);
      setNetMsg(msg);
      setScreen(msg ? "friends" : "title");
    },
    [leaveNet, setPause, setRole, setScreen],
  );

  // ---------- solo ----------

  const startSolo = useCallback(
    (mode: "classic" | "brawl" = "classic", botCount = 0) => {
      unlock();
      leaveNet();
      setRole("solo");
      const seats: Seat[] = [{ name: myName() }];
      for (let i = 0; i < botCount; i++) seats.push({ name: BOT_NAMES[i], bot: true });
      gameRef.current = mode === "classic" ? newGame() : newGame("brawl", seats);
      meRef.current = gameRef.current.players[0].id;
      resetControls();
      setResult(null);
      setMulti(null);
      setPause(false);
      setScreen("play");
    },
    [leaveNet, setPause, setRole, setScreen],
  );

  // ---------- hosting ----------

  const lobbySeats = (): LobbySeat[] => {
    const seats: LobbySeat[] = [{ name: myName(), bot: false }, ...guestsRef.current.map((gu) => ({ name: gu.name, bot: false }))];
    if (hostMode.current === "brawl") for (let i = 0; i < botsRef.current; i++) seats.push({ name: BOT_NAMES[i], bot: true });
    return seats;
  };

  const broadcastLobby = () => {
    const room = roomRef.current;
    if (!room) return;
    const seats = lobbySeats();
    setLobby({ code: room.code, seats, mode: hostMode.current, you: 0, online: room.online });
    guestsRef.current.forEach((gu, i) => gu.link.send({ t: "lobby", seats, mode: hostMode.current, you: i + 1 } satisfies HostMsg));
  };

  const fitBots = () => {
    const room = 4 - 1 - guestsRef.current.length;
    if (botsRef.current > room) setBots(Math.max(0, room));
  };

  const dropGuest = (gu: Guest) => {
    guestsRef.current = guestsRef.current.filter((x) => x !== gu);
    const g = gameRef.current;
    if (gu.pid !== null && roleRef.current === "host") {
      const p = g.players.find((x) => x.id === gu.pid);
      if (p && !g.over) {
        removePlayer(g, gu.pid);
        // shown on everyone's screen through the next snapshot
        g.pops.push({ x: p.x, y: p.y - 18, text: `${p.name} LEFT`, color: p.color, t: 0 });
        g.fx?.push({ k: "p", x: p.x, y: p.y - 18, text: `${p.name} LEFT`, c: p.color });
      }
    }
    broadcastLobby();
  };

  const onGuestMsg = (gu: Guest, msg: GuestMsg) => {
    gu.heard = performance.now();
    if (msg.t === "i") {
      gu.input = {
        moveX: +msg.mx || 0,
        moveY: +msg.my || 0,
        aimX: +msg.ax || 0,
        aimY: +msg.ay || 0,
        fire: msg.f === 1,
        shots: +msg.sh || 0,
        select: msg.sel >= 0 ? KINDS[msg.sel] : undefined,
        pos: Number.isFinite(msg.x) && Number.isFinite(msg.y) ? { x: msg.x, y: msg.y, walk: +msg.w || 0 } : undefined,
        tp: +msg.tp,
      };
    } else if (msg.t === "hi") {
      if (msg.v !== PROTOCOL) {
        gu.link.send({ t: "full" } satisfies HostMsg);
        return;
      }
      const n = cleanName(String(msg.name ?? ""));
      if (n.length >= 2) gu.name = n;
      fitBots();
      broadcastLobby();
      // drop straight into a game that's already going
      const g = gameRef.current;
      if (screenRef.current === "play" && !g.over) {
        if (hostMode.current === "brawl" && g.players.length >= MAX_PLAYERS) {
          const bot = g.players.find((p) => p.bot);
          if (bot) removePlayer(g, bot.id);
        }
        const p = addPlayer(g, { name: gu.name });
        if (p) {
          gu.pid = p.id;
          gu.link.send({ t: "go", mode: g.mode, you: p.id } satisfies HostMsg);
        }
      }
    } else if (msg.t === "bye") gu.link.close();
  };

  const hostRoom = useCallback(async () => {
    unlock();
    leaveNet();
    setNetMsg("");
    setRole("host");
    hostMode.current = "coop";
    setBots(0);
    const room = new Room();
    roomRef.current = room;
    room.accepting = () => guestsRef.current.length < MAX_PLAYERS - 1;
    room.onError = (m) => setNetMsg(m);
    room.onLink = (link, name) => {
      if (roomRef.current !== room) return link.close();
      if (!room.accepting()) {
        link.send({ t: "full" } satisfies HostMsg);
        setTimeout(() => link.close(), 300);
        return;
      }
      const gu: Guest = { key: nextKey.current++, name: cleanName(name) || "FRIEND", link, pid: null, input: null, heard: performance.now() };
      guestsRef.current.push(gu);
      link.onMessage = (m) => onGuestMsg(gu, m as GuestMsg);
      link.onClose = () => dropGuest(gu);
      play("pickup");
    };
    setScreen("connecting");
    try {
      await room.open();
    } catch (e) {
      if (roomRef.current === room) toTitle(e instanceof Error ? e.message : "Couldn't open a room.");
      return;
    }
    if (roomRef.current !== room) return;
    setScreen("lobby");
    broadcastLobby();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaveNet, setBots, setRole, setScreen, toTitle]);

  const setHostMode = (m: Mode) => {
    hostMode.current = m;
    if (m === "brawl" && guestsRef.current.length === 0 && botsRef.current === 0) setBots(1);
    broadcastLobby();
  };

  const changeBots = (d: number) => {
    setBots(Math.max(0, Math.min(MAX_PLAYERS - 1 - guestsRef.current.length, botsRef.current + d)));
    broadcastLobby();
  };

  const startOnline = useCallback(() => {
    unlock();
    const mode = hostMode.current;
    const guests = guestsRef.current;
    const seats: Seat[] = [{ name: myName() }, ...guests.map((gu) => ({ name: gu.name }))];
    if (mode === "brawl") for (let i = 0; i < botsRef.current; i++) seats.push({ name: BOT_NAMES[i], bot: true });
    const g = newGame(mode, seats);
    g.fx = [];
    gameRef.current = g;
    meRef.current = g.players[0].id;
    guests.forEach((gu, i) => {
      gu.pid = g.players[i + 1].id;
      gu.input = null;
      gu.link.send({ t: "go", mode, you: gu.pid } satisfies HostMsg);
    });
    outbox.current = { fx: [], sounds: [], n: 0, last: 0 };
    if (roomRef.current) roomRef.current.slow = true;
    resetControls();
    setMulti(null);
    setResult(null);
    setScreen("play");
  }, [setScreen]);

  const backToLobby = useCallback(() => {
    if (roomRef.current) roomRef.current.slow = false;
    for (const gu of guestsRef.current) gu.pid = null;
    gameRef.current = newGame();
    meRef.current = gameRef.current.players[0].id;
    setScreen("lobby");
    broadcastLobby();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setScreen]);

  // ---------- joining ----------

  const join = useCallback(
    async (code: string) => {
      unlock();
      leaveNet();
      setNetMsg("");
      setRole("guest");
      const cancel = { cancelled: false };
      joinCancel.current = cancel;
      setLobby({ code, seats: [], mode: "coop", you: 0, online: true });
      setScreen("connecting");
      let link: NetLink;
      try {
        link = await joinRoom(code, myName(), cancel);
      } catch (e) {
        if (!cancel.cancelled) toTitle(e instanceof NetError ? e.message : "Couldn't join that room.");
        return;
      }
      if (cancel.cancelled) return link.close();
      linkRef.current = link;
      guestCtl.current = { shots: 0, sel: null, selSends: 0, lastSend: 0, lobby: null };
      link.onClose = () => {
        if (linkRef.current === link) toTitle("Lost the connection to the host.");
      };
      link.onMessage = (raw) => {
        const msg = raw as HostMsg;
        if (msg.t === "s") {
          mirrorRef.current?.push(msg.s, performance.now());
        } else if (msg.t === "lobby") {
          const view = { code, seats: msg.seats, mode: msg.mode, you: msg.you, online: true };
          guestCtl.current.lobby = view;
          setLobby(view);
          if (screenRef.current === "connecting" || (mirrorRef.current === null && screenRef.current !== "lobby")) setScreen("lobby");
          // the host went back to the lobby
          if ((screenRef.current === "play" || screenRef.current === "over") && mirrorRef.current?.game.over) {
            mirrorRef.current = null;
            setScreen("lobby");
          }
        } else if (msg.t === "go") {
          const m = new Mirror(msg.mode, msg.you);
          mirrorRef.current = m;
          gameRef.current = m.game;
          meRef.current = msg.you;
          guestCtl.current.shots = 0;
          resetControls();
          setMulti(null);
          setScreen("play");
        } else if (msg.t === "full") {
          linkRef.current = null;
          link.close();
          toTitle("That room is full (4 players max).");
        } else if (msg.t === "bye") {
          linkRef.current = null;
          link.close();
          toTitle("The host closed the room.");
        }
      };
      link.send({ t: "hi", v: PROTOCOL, name: myName() } satisfies GuestMsg);
    },
    [leaveNet, setRole, setScreen, toTitle],
  );

  // ---------- bullets ----------

  const select = useCallback((k: BulletKind) => {
    if (roleRef.current === "guest") {
      const mine = mirrorRef.current?.mine;
      if (mine && mine.ammo[k] > 0) {
        guestCtl.current.sel = k;
        guestCtl.current.selSends = 8;
        setHud({ selected: k, ammo: { ...mine.ammo } });
      }
      return;
    }
    const p = me();
    if (p && p.ammo[k] > 0) p.selected = k;
  }, []);

  // ---------- sizing ----------
  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const fit = () => {
      const s = Math.min(wrap.clientWidth / W, wrap.clientHeight / H);
      scaleRef.current = s;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.width = `${Math.floor(W * s)}px`;
      canvas.style.height = `${Math.floor(H * s)}px`;
      canvas.width = Math.floor(W * s * dpr);
      canvas.height = Math.floor(H * s * dpr);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // ---------- keyboard ----------
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      if (screenRef.current === "play") {
        if ((k === "escape" || k === "p") && roleRef.current === "solo") return setPause(!pausedRef.current);
        const n = Number(k);
        if (n >= 1 && n <= KINDS.length) select(KINDS[n - 1]);
        if (k === "q" || k === "e") {
          const p = roleRef.current === "guest" ? mirrorRef.current?.mine : me();
          if (p) {
            const cur = roleRef.current === "guest" ? (guestCtl.current.sel ?? p.selected) : p.selected;
            const owned = KINDS.filter((x) => p.ammo[x] > 0);
            const i = owned.indexOf(cur);
            select(owned[(i + (k === "e" ? 1 : owned.length - 1)) % owned.length]);
          }
        }
        if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
      } else if ((k === "enter" || k === " ") && screenRef.current === "title") {
        e.preventDefault();
        startSolo();
      }
      ctl.current.keys.add(k);
    };
    const up = (e: KeyboardEvent) => ctl.current.keys.delete(e.key.toLowerCase());
    const blur = () => {
      ctl.current.keys.clear();
      ctl.current.mouse.down = false;
      // online games can't pause: everyone else is still playing
      if (screenRef.current === "play" && roleRef.current === "solo") setPause(true);
    };
    const vis = () => document.hidden && blur();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [select, setPause, startSolo]);

  // ---------- pointer (touch twin-stick, mouse aim) ----------
  useEffect(() => {
    const canvas = canvasRef.current!;
    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width };
    };
    const c = ctl.current;
    const onDown = (e: PointerEvent) => {
      if (screenRef.current !== "play" || pausedRef.current) return;
      unlock();
      e.preventDefault();
      const p = local(e);
      if (e.pointerType === "mouse") {
        c.mouse = { x: p.x, y: p.y, down: e.button === 0, active: true };
        return;
      }
      canvas.setPointerCapture(e.pointerId);
      const s = p.x < p.w / 2 ? c.move : c.aim;
      if (s.id !== null) return;
      Object.assign(s, { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y, t0: performance.now() });
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      if (e.pointerType === "mouse") {
        c.mouse.x = p.x;
        c.mouse.y = p.y;
        c.mouse.active = true;
        return;
      }
      for (const s of [c.move, c.aim]) if (s.id === e.pointerId) (s.x = p.x), (s.y = p.y);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === "mouse") {
        c.mouse.down = false;
        return;
      }
      if (c.move.id === e.pointerId) c.move = newStick();
      if (c.aim.id === e.pointerId) {
        const a = c.aim;
        const dx = a.x - a.ox, dy = a.y - a.oy;
        if (e.type === "pointerup" && screenRef.current === "play") {
          if (Math.hypot(dx, dy) > DEAD) c.pending = { x: dx, y: dy, t: 0.4, sent: false };
          else if (performance.now() - a.t0 < 300) {
            // quick tap: snap at the nearest enemy (or, in a brawl, the nearest rival)
            const g = gameRef.current;
            const p = g.players.find((x) => x.id === meRef.current);
            if (p) {
              let bestD = Infinity;
              let aim = { x: p.aimX, y: p.aimY };
              const targets: { x: number; y: number }[] = g.mode === "brawl" ? g.players.filter((q) => q !== p && !q.down) : g.enemies;
              for (const en of targets) {
                const d = Math.hypot(en.x - p.x, en.y - p.y);
                if (d < bestD) (bestD = d), (aim = { x: en.x - p.x, y: en.y - p.y });
              }
              c.pending = { ...aim, t: 0.4, sent: false };
            }
          }
        }
        c.aim = newStick();
      }
    };
    const noMenu = (e: Event) => e.preventDefault();
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("contextmenu", noMenu);
    window.addEventListener("pointerup", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("contextmenu", noMenu);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  // ---------- loop ----------
  useEffect(() => {
    const canvas = canvasRef.current!;
    const cx = canvas.getContext("2d")!;
    const fontVar = getComputedStyle(document.documentElement).getPropertyValue("--font-press").trim();
    const font = (px: number) => `${px}px ${fontVar || "monospace"}`;
    let raf = 0;
    let lastT = performance.now();
    let hudKey = "";
    let overAt = 0;

    /** Sticks, keys and mouse, relative to where this screen's man stands. */
    const readInput = (p: Player | { x: number; y: number; aimX: number; aimY: number; cooldown: number }, dt: number): Input & { tapped: boolean } => {
      const c = ctl.current;
      const k = c.keys;
      let mx = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
      let my = (k.has("s") || k.has("arrowdown") ? 1 : 0) - (k.has("w") || k.has("arrowup") ? 1 : 0);
      if (c.move.id !== null) {
        mx += (c.move.x - c.move.ox) / STICK;
        my += (c.move.y - c.move.oy) / STICK;
      }
      let ax = 0, ay = 0;
      let fire = c.mouse.down || k.has(" ");
      let tapped = false;
      const s = scaleRef.current;
      if (c.aim.id !== null && Math.hypot(c.aim.x - c.aim.ox, c.aim.y - c.aim.oy) > DEAD) {
        ax = c.aim.x - c.aim.ox;
        ay = c.aim.y - c.aim.oy;
      } else if (c.mouse.active) {
        const cam = camera(gameRef.current, p);
        ax = c.mouse.x / s + cam.x - p.x;
        ay = c.mouse.y / s + cam.y - p.y;
      }
      if (c.pending) {
        c.pending.t -= dt;
        ax = c.pending.x;
        ay = c.pending.y;
        if (roleRef.current === "guest") {
          // the host fires it; we just hold the aim for a moment
          if (!c.pending.sent) (c.pending.sent = true), (tapped = true);
          if (c.pending.t <= 0.1) c.pending = null;
        } else if (p.cooldown <= 0) {
          fire = true;
          c.pending = null;
        } else if (c.pending.t <= 0) c.pending = null;
      }
      return { moveX: mx, moveY: my, aimX: ax, aimY: ay, fire, tapped };
    };

    const updateHud = (p: Player | null | undefined, selected?: BulletKind) => {
      if (!p) return;
      const sel = selected ?? p.selected;
      const key = sel + KINDS.map((x) => p.ammo[x]).join(",");
      if (key !== hudKey) {
        hudKey = key;
        setHud({ selected: sel, ammo: { ...p.ammo } });
      }
    };

    const finish = (g: Game, now: number) => {
      overAt ||= now;
      if (now - overAt < 1300) return;
      overAt = 0;
      if (g.mode === "classic") {
        const prev = load<number>("rbm.best", 0);
        const isBest = g.score > prev;
        if (isBest) save("rbm.best", g.score);
        setBest(Math.max(prev, g.score));
        setResult({ score: g.score, wave: Math.max(1, g.wave), kills: g.kills, bestChain: g.bestChain, timeMs: Math.round(g.time * 1000), best: isBest && g.score > 0 });
      } else {
        const standings: Standing[] = g.players.map((p) => ({
          name: p.name,
          color: p.color,
          me: p.id === meRef.current,
          bot: !!p.bot,
          points: p.points,
          kos: p.kos,
          falls: p.falls,
          score: p.score,
          kills: p.kills,
        }));
        if (g.mode === "brawl") standings.sort((a, b) => b.points - a.points || b.kos - a.kos);
        else standings.sort((a, b) => b.score - a.score);
        const w = g.brawl?.winner;
        const winner = w === null || w === undefined ? null : w === -1 ? "DRAW" : (g.players.find((p) => p.id === w)?.name ?? null);
        setMulti({ mode: g.mode, standings, winner, wave: Math.max(1, g.wave), score: g.score });
      }
      setScreen("over");
    };

    const hostSend = (g: Game, now: number) => {
      const ob = outbox.current;
      if (g.fx) ob.fx.push(...g.fx.splice(0));
      ob.sounds.push(...g.sounds);
      if (now - ob.last < SNAP_MS || !guestsRef.current.length) return;
      ob.last = now;
      const msg: HostMsg = { t: "s", s: encodeSnap(g, ob.n++, ob.fx, ob.sounds) };
      ob.fx = [];
      ob.sounds = [];
      for (const gu of guestsRef.current) {
        gu.link.send(msg, true);
        // a friend who's gone quiet for 10 seconds has gone
        if (gu.pid !== null && now - gu.heard > 10_000) gu.link.close();
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      const role = roleRef.current;
      const scr = screenRef.current;
      const playing = scr === "play";
      let g = gameRef.current;
      let mePlayer: Player | null = null;
      let selected: BulletKind | undefined;

      if (role === "guest" && mirrorRef.current && (playing || scr === "over")) {
        const m = mirrorRef.current;
        g = gameRef.current = m.game;
        for (const snd of m.update(now)) play(snd);
        const mine = m.mine;
        const inp = readInput({ ...m.self, cooldown: 0 }, dt);
        if (playing && mine && !mine.down && mine.frozen <= 0 && !g.over) {
          movePlayer(g, m.self, inp.moveX, inp.moveY, dt);
          if (Math.hypot(inp.aimX, inp.aimY) > 0.01) (m.self.aimX = inp.aimX), (m.self.aimY = inp.aimY);
          if (mine) (mine.x = m.self.x), (mine.y = m.self.y), (mine.aimX = m.self.aimX), (mine.aimY = m.self.aimY), (mine.walk = m.self.walk);
        }
        const gc = guestCtl.current;
        if (inp.tapped) gc.shots++;
        const link = linkRef.current;
        if (link && playing && now - gc.lastSend >= INPUT_MS) {
          gc.lastSend = now;
          const sel = gc.selSends > 0 && gc.sel ? KINDS.indexOf(gc.sel) : -1;
          if (gc.selSends > 0) gc.selSends--;
          link.send(
            {
              t: "i",
              mx: Math.round(inp.moveX * 100) / 100,
              my: Math.round(inp.moveY * 100) / 100,
              ax: Math.round(m.self.aimX * 10) / 10,
              ay: Math.round(m.self.aimY * 10) / 10,
              f: inp.fire ? 1 : 0,
              sh: gc.shots,
              sel,
              x: Math.round(m.self.x * 10) / 10,
              y: Math.round(m.self.y * 10) / 10,
              w: Math.round(m.self.walk * 10) / 10,
              tp: m.seenTp,
            } satisfies GuestMsg,
            true,
          );
        }
        mePlayer = m.mine;
        // show our own pick straight away; the host confirms it a moment later
        if (mePlayer && gc.selSends > 0 && gc.sel) selected = gc.sel;
        if (playing) updateHud(mePlayer, selected);
        if (playing && g.over) finish(g, now);
        if (playing && m.lastAt && now - m.lastAt > 8000) toTitle("Lost the connection to the host.");
      } else if (playing && !pausedRef.current && role !== "guest") {
        mePlayer = g.players.find((p) => p.id === meRef.current) ?? null;
        const inputs: Record<number, Input> = {};
        if (mePlayer) inputs[mePlayer.id] = readInput(mePlayer, dt);
        if (role === "host") for (const gu of guestsRef.current) if (gu.pid !== null && gu.input) inputs[gu.pid] = gu.input;
        step(g, inputs, dt);
        for (const snd of g.sounds) play(snd);
        if (role === "host") hostSend(g, now);
        updateHud(mePlayer);
        if (g.over) finish(g, now);
      } else if (role !== "guest" && g.over && scr === "over") {
        // let the last explosion finish behind the results card
        step(g, {}, dt);
        if (role === "host") hostSend(g, now);
        mePlayer = g.players.find((p) => p.id === meRef.current) ?? null;
      } else {
        mePlayer = g.players.find((p) => p.id === meRef.current) ?? null;
      }

      const c = ctl.current;
      const aiming = c.aim.id !== null && Math.hypot(c.aim.x - c.aim.ox, c.aim.y - c.aim.oy) > DEAD;
      const drawMe = mePlayer && selected ? { ...mePlayer, selected } : mePlayer;
      drawGame(cx, canvas, g, {
        font,
        me: drawMe,
        hud: scr === "play" || scr === "over",
        playing,
        aim: { aiming, mouse: c.mouse.active },
        sticks: { move: c.move, aim: c.aim },
        scale: scaleRef.current,
        theme: themeRef.current,
      });
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [setScreen, toTitle]);

  const mine = me();
  const solo = role === "solo";

  return (
    <div className="fixed inset-0 flex select-none flex-col bg-bg" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <header className="flex h-11 shrink-0 items-center justify-between px-3">
        <Link href="/" className="font-pixel text-[9px] text-dim hover:text-ink">
          ◀ HUB
        </Link>
        <div className="font-pixel text-[9px] text-pink neon-soft">RUBBER BULLET MAN</div>
        <div className="flex items-center gap-3">
          <button
            ref={themeBtn}
            onClick={flipTheme}
            aria-label={theme === "dark" ? "Switch to paper (light) mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Paper mode" : "Dark mode"}
            className="relative block h-5 w-5 overflow-hidden rounded-full border-2 border-ink"
          >
            {/* half-filled disc: the side you'd switch to */}
            <span className="absolute inset-y-0 right-0 w-1/2 bg-ink" />
            <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pink" />
          </button>
          <button className="font-pixel text-[9px] text-dim" onClick={() => setMuted(!muted)} aria-label={muted ? "Unmute" : "Mute"}>
            {muted ? "🔇" : "🔊"}
          </button>
          {screen === "play" && solo && (
            <button className="font-pixel text-[9px] text-cyan" onClick={() => setPause(!paused)}>
              {paused ? "▶" : "II"}
            </button>
          )}
          {screen === "play" && !solo && (
            <button className="font-pixel text-[9px] text-dim" onClick={() => (window.confirm(role === "host" ? "End the game for everyone?" : "Leave this game?") ? toTitle() : null)}>
              ✕
            </button>
          )}
        </div>
      </header>

      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center">
        <canvas ref={canvasRef} className="block touch-none" />

        {screen === "title" && (
          <Overlay>
            <Title best={best} onPlay={() => startSolo()} onBots={(n) => startSolo("brawl", n)} onFriends={() => setScreen("friends")} />
          </Overlay>
        )}
        {screen === "friends" && (
          <Overlay>
            <Friends
              code={joinCode}
              setCode={setJoinCode}
              msg={netMsg}
              onHost={() => void hostRoom()}
              onJoin={(c) => void join(c)}
              onBack={() => {
                setNetMsg("");
                setScreen("title");
              }}
            />
          </Overlay>
        )}
        {screen === "connecting" && (
          <Overlay>
            <div className="text-center">
              <div className="font-pixel text-[11px] text-cyan blink">{role === "host" ? "OPENING A ROOM..." : `JOINING ${lobby?.code ?? ""}...`}</div>
              <p className="mt-3 text-[17px] text-dim">{role === "host" ? "Getting you a room code." : "Knocking on your friend's game. This takes a few seconds."}</p>
              <button onClick={() => toTitle()} className="mt-5 block w-full border-2 border-line py-2.5 font-pixel text-[9px] text-dim">
                CANCEL
              </button>
            </div>
          </Overlay>
        )}
        {screen === "lobby" && lobby && (
          <Overlay>
            <Lobby
              view={lobby}
              host={role === "host"}
              bots={bots}
              msg={netMsg}
              onMode={setHostMode}
              onBots={changeBots}
              onStart={startOnline}
              onLeave={() => toTitle()}
            />
          </Overlay>
        )}
        {screen === "play" && paused && solo && (
          <Overlay>
            <div className="text-center">
              <div className="font-pixel text-[18px] text-yellow neon">PAUSED</div>
              <button onClick={() => setPause(false)} className="mt-6 block w-full bg-pink px-6 py-3 font-pixel text-[11px] text-bg">
                ▶ RESUME
              </button>
              <button onClick={() => toTitle()} className="mt-3 block w-full border-2 border-line px-6 py-3 font-pixel text-[10px] text-dim">
                QUIT
              </button>
            </div>
          </Overlay>
        )}
        {screen === "over" && result && gameRef.current.mode === "classic" && (
          <Overlay>
            <GameOver result={result} best={best} onAgain={() => startSolo()} onMenu={() => toTitle()} />
          </Overlay>
        )}
        {screen === "over" && multi && (
          <Overlay>
            <Results
              r={multi}
              role={role}
              onAgain={role === "host" ? startOnline : () => startSolo("brawl", gameRef.current.players.filter((p) => p.bot).length || 1)}
              onLobby={role === "host" ? backToLobby : undefined}
              onMenu={() => toTitle()}
            />
          </Overlay>
        )}
      </div>

      <nav className="grid h-16 shrink-0 grid-cols-7 gap-1 px-2 pb-1" aria-label="Bullets">
        {KINDS.map((k, i) => {
          const n = hud.ammo[k];
          const on = hud.selected === k;
          const info = BULLETS[k];
          return (
            <button
              key={k}
              onPointerDown={(e) => {
                e.preventDefault();
                select(k);
                if (role !== "guest" && mine) setHud({ selected: mine.selected, ammo: { ...mine.ammo } });
              }}
              disabled={n <= 0}
              className="flex touch-none flex-col items-center justify-center border-2 bg-panel transition-opacity disabled:opacity-30"
              style={{ borderColor: on ? info.color : "#2a2350", boxShadow: on ? `0 0 10px ${info.color}` : undefined }}
              title={`${info.name} (${i + 1}): ${info.desc}`}
            >
              <span className="block h-3 w-3 rounded-full" style={{ background: info.color }} />
              <span className="mt-1 font-pixel text-[5.5px] sm:text-[8px]" style={{ color: on ? info.color : "#8f89b8" }}>
                {info.name.toUpperCase()}
              </span>
              <span className="font-pixel text-[7px] text-ink">{n === Infinity ? "∞" : n}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-bg/80 p-4">
      <div className="pixel-corners neon-box my-auto w-full max-w-sm bg-panel/95 p-5" style={{ ["--glow" as string]: "#ff2bd6" }}>
        {children}
      </div>
    </div>
  );
}

function Title({ best, onPlay, onBots, onFriends }: { best: number; onPlay: () => void; onBots: (n: number) => void; onFriends: () => void }) {
  const [tab, setTab] = useState<"how" | "board" | "brawl">("how");
  return (
    <div>
      <div className="text-center">
        <div className="font-pixel text-[20px] leading-snug">
          <span className="text-yellow neon">RUBBER</span>
          <br />
          <span className="text-pink neon">BULLET MAN</span>
        </div>
        <p className="mt-3 text-[19px] text-ink/85">Every bullet bounces. Including back at you.</p>
      </div>
      {best > 0 && <div className="mt-3 text-center font-pixel text-[9px] text-yellow">BEST {best}</div>}
      <button onClick={onPlay} className="mt-4 block w-full bg-pink py-3 font-pixel text-[12px] text-bg active:scale-[0.98]">
        ▶ PLAY SOLO
      </button>
      <button onClick={onFriends} className="mt-2 block w-full bg-cyan py-3 font-pixel text-[11px] text-bg active:scale-[0.98]">
        👥 PLAY WITH FRIENDS
      </button>
      <div className="mt-2 border-2 border-yellow/60 p-2">
        <div className="text-center font-pixel text-[9px] text-yellow">NEW! RUBBER BRAWL VS BOTS</div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[1, 2, 3].map((n) => (
            <button key={n} onClick={() => onBots(n)} className="border-2 border-line py-2 font-pixel text-[8px] text-ink active:scale-[0.97]">
              {n} BOT{n > 1 ? "S" : ""}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1">
        {(
          [
            ["how", "HOW TO"],
            ["brawl", "BRAWL?"],
            ["board", "SCORES"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`border-2 py-1.5 font-pixel text-[8px] ${tab === k ? "border-cyan text-cyan" : "border-line text-dim"}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "board" && <Leaderboard />}
      {tab === "brawl" && <BrawlHelp />}
      {tab === "how" && (
        <>
          <ul className="mt-4 space-y-1.5 text-[17px] leading-tight">
            {KINDS.map((k) => (
              <li key={k} className="flex gap-2">
                <span className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: BULLETS[k].color }} />
                <span>
                  <b className="font-normal" style={{ color: BULLETS[k].color }}>
                    {BULLETS[k].name}:
                  </b>{" "}
                  <span className="text-ink/80">{BULLETS[k].desc}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-line pt-3 text-[16px] leading-snug text-dim">
            <p>
              <b className="font-normal text-cyan">Phone:</b> left thumb moves. Right thumb drags to aim (with a bounce preview) and fires on release. A quick tap
              on the right snaps a shot at the nearest enemy.
            </p>
            <p className="mt-1">
              <b className="font-normal text-cyan">Keyboard:</b> WASD to move, mouse to aim, click to shoot, 1-7 or Q/E to switch bullets.
            </p>
            <p className="mt-1">
              Once your bullet has bounced, it can hit <i>you</i>. Kill several enemies with one bullet for a chain multiplier, and off a wall for a bank-shot
              bonus. Pink bumpers speed your bullets up for free.
            </p>
            <p className="mt-1">
              <b className="font-normal text-cyan">Power-ups:</b>{" "}
              {POWER_KINDS.map((k, i) => (
                <span key={k}>
                  {i > 0 && " "}
                  <span style={{ color: POWERS[k].color }}>{POWERS[k].name}</span>: {POWERS[k].desc}
                </span>
              ))}
            </p>
            <p className="mt-1">
              <b className="font-normal text-cyan">Watch out for:</b> Fuses that light up and blow up next to you, Mirrors that bounce shots off their shield
              (hit them from behind, glue them, or use a Piercer or Bomb), and the Bubble Queen on wave 10.
            </p>
            <p className="mt-1">
              <b className="font-normal text-cyan">With friends:</b> one of you hosts and shares the room code or link, up to 4 players. Team up against the waves
              in Co-op, or fight each other in Rubber Brawl.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function BrawlHelp() {
  return (
    <div className="mt-4 space-y-1.5 text-[16px] leading-snug text-ink/85">
      <p>
        <b className="font-normal text-pink">Rubber Brawl</b> is every man for himself. No monsters: just you, up to three rivals and a lot of rubber.
      </p>
      <p>
        Knock someone out for <b className="font-normal text-yellow">1 point</b>. Do it with a shot that bounced off a wall or bumper first and it&apos;s a{" "}
        <b className="font-normal text-yellow">bank KO worth 2</b>. Get hit by your own rubber and it&apos;s an <b className="font-normal text-red">own goal, -1</b>.
      </p>
      <p>
        First to {BRAWL_TARGET} points wins, or the leader when the 3-minute clock runs out. Bullet drops land every few seconds: Glue sticks a rival in place,
        Seekers hunt them down, and Bombs hurt everybody in the blast.
      </p>
      <p>
        Spraying won&apos;t save you: online and in brawls your Bouncer holds 6 shots (the pips under your man), then you&apos;re stuck reloading. Stop firing and
        it slowly refills. The arena is bigger too, and arrows at the screen edge point at rivals you can&apos;t see.
      </p>
      <p className="text-dim">Your shots wear a ring in your colour, so you can tell whose rubber is whose.</p>
    </div>
  );
}

function Friends({
  code,
  setCode,
  msg,
  onHost,
  onJoin,
  onBack,
}: {
  code: string;
  setCode: (c: string) => void;
  msg: string;
  onHost: () => void;
  onJoin: (code: string) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  useEffect(() => setName(getPlayer().name), []);
  const named = cleanName(name).length >= 2;
  const keep = () => {
    const n = cleanName(name);
    if (n.length >= 2) setPlayerName(n);
    return n.length >= 2;
  };
  return (
    <div>
      <div className="text-center font-pixel text-[14px] text-cyan neon">PLAY WITH FRIENDS</div>
      <p className="mt-2 text-center text-[17px] text-dim">Up to 4 players, on phones or laptops.</p>
      {msg && <div className="mt-3 border-2 border-red/60 p-2 text-[16px] leading-snug text-red">{msg}</div>}
      <label className="mt-4 block font-pixel text-[8px] text-dim">YOUR NAME</label>
      <input
        value={name}
        onChange={(e) => setName(cleanName(e.target.value))}
        placeholder="NAME"
        maxLength={12}
        className="mt-1 w-full border-2 border-line bg-bg px-2 py-2 font-pixel text-[10px] text-ink outline-none focus:border-cyan"
      />
      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length === 4 && keep()) onJoin(code);
        }}
      >
        <label className="block font-pixel text-[8px] text-dim">JOIN A ROOM</label>
        <div className="mt-1 flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(cleanCode(e.target.value))}
            placeholder="CODE"
            inputMode="text"
            autoCapitalize="characters"
            maxLength={4}
            className="min-w-0 flex-1 border-2 border-line bg-bg px-2 py-2 text-center font-pixel text-[14px] tracking-[0.3em] text-yellow outline-none focus:border-cyan"
          />
          <button disabled={code.length !== 4 || !named} className="bg-cyan px-4 font-pixel text-[9px] text-bg disabled:opacity-40">
            JOIN
          </button>
        </div>
      </form>
      <div className="my-4 text-center font-pixel text-[8px] text-dim">OR</div>
      <button
        disabled={!named}
        onClick={() => keep() && onHost()}
        className="block w-full bg-pink py-3 font-pixel text-[11px] text-bg active:scale-[0.98] disabled:opacity-40"
      >
        HOST A ROOM
      </button>
      {!named && <p className="mt-2 text-center text-[15px] text-dim">Type a name first (2+ letters).</p>}
      <button onClick={onBack} className="mt-3 block w-full border-2 border-line py-2.5 font-pixel text-[9px] text-dim">
        BACK
      </button>
    </div>
  );
}

function Lobby({
  view,
  host,
  bots,
  msg,
  onMode,
  onBots,
  onStart,
  onLeave,
}: {
  view: LobbyView;
  host: boolean;
  bots: number;
  msg: string;
  onMode: (m: Mode) => void;
  onBots: (d: number) => void;
  onStart: () => void;
  onLeave: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const humans = view.seats.filter((s) => !s.bot).length;
  const canStart = view.mode === "brawl" ? view.seats.length >= 2 : true;
  const share = async () => {
    const url = `${window.location.origin}/rubber-bullet-man?room=${view.code}`;
    const text = `Come play Rubber Bullet Man with me! Room ${view.code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Rubber Bullet Man", text, url });
        return;
      }
    } catch {
      /* cancelled: fall back to copying */
    }
    try {
      await navigator.clipboard.writeText(`${text}: ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", url);
    }
  };
  return (
    <div>
      <div className="text-center">
        <div className="font-pixel text-[8px] text-dim">ROOM CODE</div>
        <div className="mt-1 font-pixel text-[30px] tracking-[0.25em] text-yellow neon">{view.code}</div>
        {host && (
          <button onClick={() => void share()} className="mt-2 w-full border-2 border-cyan py-2 font-pixel text-[9px] text-cyan active:scale-[0.98]">
            {copied ? "LINK COPIED!" : "📨 SEND INVITE LINK"}
          </button>
        )}
        {host && !view.online && <p className="mt-2 text-[14px] text-dim">Test mode: no database, so only browsers on this server can join.</p>}
      </div>

      <div className="mt-4 font-pixel text-[8px] text-dim">PLAYERS ({humans}/4)</div>
      <ul className="mt-1 space-y-1">
        {view.seats.map((s, i) => (
          <li key={i} className="flex items-center gap-2 border-2 border-line px-2 py-1.5 text-[17px]">
            <span className="block h-3 w-3 rounded-full" style={{ background: PLAYER_COLORS[i % PLAYER_COLORS.length] }} />
            <span className="flex-1 truncate">{s.name}</span>
            <span className="font-pixel text-[7px] text-dim">{i === 0 ? "HOST" : s.bot ? "BOT" : i === view.you ? "YOU" : ""}</span>
          </li>
        ))}
        {view.seats.length < 4 && <li className="border-2 border-dashed border-line px-2 py-1.5 text-[16px] text-dim">Waiting for friends to join…</li>}
      </ul>

      <div className="mt-4 font-pixel text-[8px] text-dim">GAME</div>
      {host ? (
        <div className="mt-1 grid grid-cols-2 gap-2">
          {(
            [
              ["coop", "CO-OP", "Team up vs the waves"],
              ["brawl", "BRAWL", "Everyone vs everyone"],
            ] as const
          ).map(([m, label, sub]) => (
            <button
              key={m}
              onClick={() => onMode(m)}
              className={`border-2 px-1 py-2 text-center ${view.mode === m ? "border-pink bg-pink/10" : "border-line"}`}
            >
              <div className={`font-pixel text-[9px] ${view.mode === m ? "text-pink" : "text-ink"}`}>{label}</div>
              <div className="mt-1 text-[14px] leading-tight text-dim">{sub}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-1 border-2 border-line p-2 text-[17px]">
          <span className="text-pink">{view.mode === "brawl" ? "Rubber Brawl" : "Co-op waves"}</span>
          <span className="text-dim"> (the host picks)</span>
        </div>
      )}
      {host && view.mode === "brawl" && (
        <div className="mt-2 flex items-center justify-between border-2 border-line px-2 py-1.5">
          <span className="text-[17px] text-dim">Bots</span>
          <div className="flex items-center gap-3">
            <button onClick={() => onBots(-1)} disabled={bots <= 0} className="px-2 font-pixel text-[12px] text-cyan disabled:opacity-30">
              −
            </button>
            <span className="font-pixel text-[10px]">{bots}</span>
            <button onClick={() => onBots(1)} disabled={humans + bots >= 4} className="px-2 font-pixel text-[12px] text-cyan disabled:opacity-30">
              +
            </button>
          </div>
        </div>
      )}
      {msg && <div className="mt-2 text-[15px] text-red">{msg}</div>}

      {host ? (
        <>
          <button onClick={onStart} disabled={!canStart} className="mt-4 block w-full bg-pink py-3 font-pixel text-[12px] text-bg active:scale-[0.98] disabled:opacity-40">
            ▶ START
          </button>
          {!canStart && <p className="mt-1 text-center text-[15px] text-dim">A brawl needs a friend or a bot.</p>}
          <p className="mt-2 text-center text-[14px] leading-snug text-dim">Friends can join mid-game too. Keep this screen open on your phone while you play: you&apos;re the host.</p>
        </>
      ) : (
        <div className="mt-4 text-center font-pixel text-[9px] text-cyan blink">WAITING FOR THE HOST TO START</div>
      )}
      <button onClick={onLeave} className="mt-3 block w-full border-2 border-line py-2.5 font-pixel text-[9px] text-dim">
        {host ? "CLOSE ROOM" : "LEAVE"}
      </button>
    </div>
  );
}

function Results({ r, role, onAgain, onLobby, onMenu }: { r: MultiResult; role: Role; onAgain: () => void; onLobby?: () => void; onMenu: () => void }) {
  const brawl = r.mode === "brawl";
  const iWon = brawl && r.standings[0]?.me && r.winner !== "DRAW";
  return (
    <div className="text-center">
      {brawl ? (
        <>
          <div className={`font-pixel text-[18px] neon ${iWon ? "text-green" : "text-yellow"}`}>{r.winner === "DRAW" ? "DRAW!" : iWon ? "YOU WIN!" : `${r.winner ?? "NOBODY"} WINS`}</div>
          <div className="mt-1 text-[16px] text-dim">Rubber Brawl</div>
        </>
      ) : (
        <>
          <div className="font-pixel text-[18px] text-red neon">TEAM WIPED</div>
          <div className="mt-3 font-pixel text-[24px] text-yellow neon">{r.score}</div>
          <div className="mt-1 text-[16px] text-dim">Co-op · reached wave {r.wave}</div>
        </>
      )}
      <table className="mt-4 w-full text-left text-[16px]">
        <thead>
          <tr className="font-pixel text-[7px] text-dim">
            <th className="pb-1">PLAYER</th>
            {brawl ? (
              <>
                <th className="pb-1 text-right">PTS</th>
                <th className="pb-1 text-right">KO</th>
                <th className="pb-1 text-right">FALLS</th>
              </>
            ) : (
              <>
                <th className="pb-1 text-right">SCORE</th>
                <th className="pb-1 text-right">KILLS</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {r.standings.map((s, i) => (
            <tr key={i} className={s.me ? "text-ink" : "text-ink/75"}>
              <td className="py-0.5">
                <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                {s.me ? "YOU" : s.name}
                {s.bot && <span className="text-dim"> (bot)</span>}
              </td>
              {brawl ? (
                <>
                  <td className="text-right text-yellow">{s.points}</td>
                  <td className="text-right">{s.kos}</td>
                  <td className="text-right">{s.falls}</td>
                </>
              ) : (
                <>
                  <td className="text-right text-yellow">{s.score}</td>
                  <td className="text-right">{s.kills}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {role === "guest" ? (
        <div className="mt-5 font-pixel text-[9px] text-cyan blink">WAITING FOR THE HOST…</div>
      ) : (
        <button onClick={onAgain} className="mt-5 block w-full bg-pink py-3 font-pixel text-[12px] text-bg active:scale-[0.98]">
          ▶ PLAY AGAIN
        </button>
      )}
      {onLobby && (
        <button onClick={onLobby} className="mt-2 block w-full border-2 border-cyan py-2.5 font-pixel text-[9px] text-cyan">
          BACK TO LOBBY
        </button>
      )}
      <button onClick={onMenu} className="mt-2 block w-full border-2 border-line py-2.5 font-pixel text-[9px] text-dim">
        {role === "solo" ? "MENU" : "LEAVE"}
      </button>
    </div>
  );
}

function GameOver({ result, best, onAgain, onMenu }: { result: Result; best: number; onAgain: () => void; onMenu: () => void }) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "local" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [rank, setRank] = useState<number | null>(null);
  const [boardKey, setBoardKey] = useState(0);
  const sent = useRef(false);

  const submit = useCallback(
    async (n: string) => {
      if (sent.current || result.score <= 0) return;
      sent.current = true;
      setStatus("saving");
      const player = getPlayer();
      saveLocal({ name: n, score: result.score, wave: result.wave, kills: result.kills });
      try {
        const res = await fetch("/api/rbm/scores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId: player.id, name: n, score: result.score, wave: result.wave, kills: result.kills, bestChain: result.bestChain, timeMs: result.timeMs }),
        });
        const data = (await res.json()) as { online?: boolean; rank?: number; error?: string };
        if (!res.ok) {
          setStatus("error");
          setMsg(data.error ?? "Couldn't save the score.");
        } else if (data.online) {
          setStatus("saved");
          setRank(data.rank ?? null);
        } else setStatus("local");
      } catch {
        setStatus("local");
      }
      setBoardKey((k) => k + 1);
    },
    [result],
  );

  useEffect(() => {
    const n = getPlayer().name;
    setName(n);
    if (n.length >= 2) void submit(n);
  }, [submit]);

  return (
    <div className="text-center">
      <div className="font-pixel text-[18px] text-red neon">GAME OVER</div>
      <div className="mt-4 font-pixel text-[26px] text-yellow neon">{result.score}</div>
      {result.best && <div className="mt-2 font-pixel text-[9px] text-green blink">NEW BEST!</div>}
      <div className="mt-3 grid grid-cols-3 gap-2 text-[17px]">
        <Stat label="WAVE" value={result.wave} />
        <Stat label="KILLS" value={result.kills} />
        <Stat label="CHAIN" value={result.bestChain > 1 ? `x${result.bestChain}` : "-"} />
      </div>
      <div className="mt-2 text-[16px] text-dim">Best: {best}</div>

      {result.score > 0 && status === "idle" && (
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = cleanName(name);
            if (n.length < 2) return;
            setPlayerName(n);
            void submit(n);
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(cleanName(e.target.value))}
            placeholder="YOUR NAME"
            maxLength={12}
            className="min-w-0 flex-1 border-2 border-line bg-bg px-2 py-2 font-pixel text-[10px] text-ink outline-none focus:border-cyan"
          />
          <button className="bg-cyan px-3 font-pixel text-[9px] text-bg">SAVE</button>
        </form>
      )}
      {status === "saving" && <div className="mt-3 text-[16px] text-dim">Saving…</div>}
      {status === "saved" && <div className="mt-3 text-[16px] text-green">Saved{rank ? `: #${rank} today` : ""}!</div>}
      {status === "local" && <div className="mt-3 text-[16px] text-dim">Saved on this device.</div>}
      {status === "error" && <div className="mt-3 text-[16px] text-red">{msg}</div>}

      <Leaderboard key={boardKey} />

      <button onClick={onAgain} className="mt-4 block w-full bg-pink py-3 font-pixel text-[12px] text-bg active:scale-[0.98]">
        ▶ PLAY AGAIN
      </button>
      <button onClick={onMenu} className="mt-2 block w-full border-2 border-line py-2.5 font-pixel text-[9px] text-dim">
        MENU
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-2 border-line py-1.5">
      <div className="font-pixel text-[7px] text-dim">{label}</div>
      <div className="mt-1 font-pixel text-[11px] text-ink">{value}</div>
    </div>
  );
}

function saveLocal(r: Row) {
  const rows = load<Row[]>("rbm.local", []);
  rows.push(r);
  rows.sort((a, b) => b.score - a.score);
  save("rbm.local", rows.slice(0, 10));
}

function Leaderboard() {
  const [period, setPeriod] = useState<"daily" | "all">("daily");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let live = true;
    setRows(null);
    fetch(`/api/rbm/scores?period=${period}`)
      .then((r) => r.json() as Promise<{ online: boolean; rows: Row[] }>)
      .then((d) => {
        if (!live) return;
        setOnline(d.online);
        setRows(d.online ? d.rows : load<Row[]>("rbm.local", []));
      })
      .catch(() => {
        if (!live) return;
        setOnline(false);
        setRows(load<Row[]>("rbm.local", []));
      });
    return () => {
      live = false;
    };
  }, [period]);

  return (
    <div className="mt-4 text-left">
      <div className="flex gap-2">
        {(["daily", "all"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 border-2 py-1.5 font-pixel text-[8px] ${period === p ? "border-cyan text-cyan" : "border-line text-dim"}`}
          >
            {p === "daily" ? "TODAY" : "ALL TIME"}
          </button>
        ))}
      </div>
      {!online && <div className="mt-2 text-[15px] text-dim">Offline board (this device only).</div>}
      <ol className="mt-2 max-h-48 space-y-0.5 overflow-y-auto text-[17px]">
        {rows === null && <li className="text-dim">Loading…</li>}
        {rows?.length === 0 && <li className="text-dim">No scores yet. Be the first!</li>}
        {rows?.map((r, i) => (
          <li key={i} className="flex justify-between gap-2">
            <span className="truncate">
              <span className="text-dim">{String(i + 1).padStart(2, " ")}.</span> {r.name}
            </span>
            <span className="shrink-0 text-yellow">
              {r.score} <span className="text-dim">w{r.wave}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
