import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { serverName } from "@/lib/server/names";

// Matchmaking for Rubber Bullet Man online. This only swaps WebRTC connection offers between
// a host and the friends joining its room (a few small requests each); the game itself then
// runs browser to browser and never touches the server.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sql = NonNullable<ReturnType<typeof getDb>>;
let ready: Promise<void> | null = null;

function ensureTables(sql: Sql): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS rbm_rooms (
        code text PRIMARY KEY,
        secret text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        seen_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS rbm_peers (
        id bigserial PRIMARY KEY,
        code text NOT NULL,
        name text NOT NULL,
        offer text NOT NULL,
        answer text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS rbm_peers_code ON rbm_peers (code, id)`;
    })();
    ready.catch(() => (ready = null));
  }
  return ready;
}

// Without a database (local dev) rooms live in memory, which works on a single server.
interface MemPeer {
  id: number;
  code: string;
  name: string;
  offer: string;
  answer: string | null;
  at: number;
}
const mem = { rooms: new Map<string, { secret: string; seen: number }>(), peers: [] as MemPeer[], next: 1 };

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const ROOM_TTL_MS = 30 * 60_000; // a room closes half an hour after its host was last seen
const PEER_TTL_MS = 2 * 60_000; // an unanswered join gives up long before this
const MAX_SDP = 16_000;

const randomCode = () => Array.from({ length: 4 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join("");
const randomSecret = () => crypto.randomUUID();
const isCode = (v: unknown): v is string => typeof v === "string" && /^[A-HJ-NP-Z]{4}$/.test(v);
const isSdp = (v: unknown): v is string => typeof v === "string" && v.length > 20 && v.length <= MAX_SDP && v.startsWith("v=0");
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * GET ?code&secret&after  (host) offers from friends joining, newer than `after`
 * GET ?code&peer          (guest) the host's answer to my offer, once there is one
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const code = q.get("code");
  if (!isCode(code)) return bad("No such room.");
  const sql = getDb();
  const secret = q.get("secret");
  if (secret) {
    const after = Number(q.get("after")) || 0;
    if (!sql) {
      const room = mem.rooms.get(code);
      if (!room || room.secret !== secret) return bad("Room closed.", 404);
      room.seen = Date.now();
      const offers = mem.peers.filter((p) => p.code === code && p.id > after && !p.answer).map((p) => ({ peer: p.id, name: p.name, sdp: p.offer }));
      return NextResponse.json({ offers });
    }
    await ensureTables(sql);
    const rooms = await sql`UPDATE rbm_rooms SET seen_at = now() WHERE code = ${code} AND secret = ${secret} RETURNING code`;
    if (!rooms.length) return bad("Room closed.", 404);
    const offers = await sql`SELECT id::int AS peer, name, offer AS sdp FROM rbm_peers
      WHERE code = ${code} AND id > ${after} AND answer IS NULL AND created_at > now() - interval '2 minutes' ORDER BY id LIMIT 8`;
    return NextResponse.json({ offers });
  }
  const peer = Number(q.get("peer"));
  if (!Number.isInteger(peer) || peer <= 0) return bad("Bad request.");
  if (!sql) {
    const p = mem.peers.find((x) => x.id === peer && x.code === code);
    return NextResponse.json({ answer: p?.answer ?? null, open: mem.rooms.has(code) });
  }
  await ensureTables(sql);
  const rows = (await sql`SELECT p.answer, (r.code IS NOT NULL) AS open FROM rbm_peers p LEFT JOIN rbm_rooms r ON r.code = p.code
    WHERE p.id = ${peer} AND p.code = ${code}`) as { answer: string | null; open: boolean }[];
  return NextResponse.json({ answer: rows[0]?.answer ?? null, open: rows[0]?.open ?? false });
}

/**
 * POST {a:"open"}                          -> {code, secret}  a host opens a room
 * POST {a:"join", code, name, sdp}         -> {peer}          a friend offers to connect
 * POST {a:"answer", code, secret, peer, sdp}                  the host answers that offer
 * POST {a:"close", code, secret}                              the host leaves
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return bad("Bad request.");
  const sql = getDb();
  if (sql) await ensureTables(sql);
  const now = Date.now();

  switch (body.a) {
    case "open": {
      const secret = randomSecret();
      if (!sql) {
        for (const [c, r] of mem.rooms) if (now - r.seen > ROOM_TTL_MS) mem.rooms.delete(c);
        mem.peers = mem.peers.filter((p) => now - p.at < PEER_TTL_MS);
        for (let i = 0; i < 20; i++) {
          const code = randomCode();
          if (mem.rooms.has(code)) continue;
          mem.rooms.set(code, { secret, seen: now });
          return NextResponse.json({ code, secret, online: false });
        }
        return bad("Couldn't open a room. Try again.", 503);
      }
      // tidy up old rooms while we're here
      await sql`DELETE FROM rbm_rooms WHERE seen_at < now() - interval '30 minutes'`;
      await sql`DELETE FROM rbm_peers WHERE created_at < now() - interval '10 minutes'`;
      for (let i = 0; i < 20; i++) {
        const code = randomCode();
        const rows = await sql`INSERT INTO rbm_rooms (code, secret) VALUES (${code}, ${secret}) ON CONFLICT (code) DO NOTHING RETURNING code`;
        if (rows.length) return NextResponse.json({ code, secret, online: true });
      }
      return bad("Couldn't open a room. Try again.", 503);
    }
    case "join": {
      const code = body.code;
      const name = serverName(body.name) ?? "PLAYER";
      if (!isCode(code)) return bad("That room code isn't right.");
      if (!isSdp(body.sdp)) return bad("Bad request.");
      if (!sql) {
        const room = mem.rooms.get(code);
        if (!room || now - room.seen > ROOM_TTL_MS) return bad("No room with that code. Check it with your friend.", 404);
        const id = mem.next++;
        mem.peers.push({ id, code, name, offer: body.sdp, answer: null, at: now });
        return NextResponse.json({ peer: id });
      }
      const rooms = await sql`SELECT code FROM rbm_rooms WHERE code = ${code} AND seen_at > now() - interval '30 minutes'`;
      if (!rooms.length) return bad("No room with that code. Check it with your friend.", 404);
      const [{ n }] = (await sql`SELECT count(*)::int AS n FROM rbm_peers WHERE code = ${code} AND created_at > now() - interval '2 minutes'`) as { n: number }[];
      if (n > 12) return bad("Too many people are joining at once. Wait a moment.", 429);
      const [row] = (await sql`INSERT INTO rbm_peers (code, name, offer) VALUES (${code}, ${name}, ${body.sdp}) RETURNING id::int AS id`) as { id: number }[];
      return NextResponse.json({ peer: row.id });
    }
    case "answer": {
      const { code, secret } = body;
      const peer = Number(body.peer);
      if (!isCode(code) || typeof secret !== "string" || !Number.isInteger(peer) || !isSdp(body.sdp)) return bad("Bad request.");
      if (!sql) {
        const room = mem.rooms.get(code);
        const p = mem.peers.find((x) => x.id === peer && x.code === code);
        if (!room || room.secret !== secret || !p) return bad("Room closed.", 404);
        p.answer = body.sdp;
        return NextResponse.json({ ok: true });
      }
      const rows = await sql`UPDATE rbm_peers p SET answer = ${body.sdp} FROM rbm_rooms r
        WHERE p.id = ${peer} AND p.code = ${code} AND r.code = p.code AND r.secret = ${secret} RETURNING p.id`;
      if (!rows.length) return bad("Room closed.", 404);
      return NextResponse.json({ ok: true });
    }
    case "close": {
      const { code, secret } = body;
      if (!isCode(code) || typeof secret !== "string") return bad("Bad request.");
      if (!sql) {
        if (mem.rooms.get(code)?.secret === secret) mem.rooms.delete(code);
        return NextResponse.json({ ok: true });
      }
      await sql`DELETE FROM rbm_rooms WHERE code = ${code} AND secret = ${secret}`;
      await sql`DELETE FROM rbm_peers WHERE code = ${code}`;
      return NextResponse.json({ ok: true });
    }
  }
  return bad("Bad request.");
}
