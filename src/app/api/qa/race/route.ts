import { NextResponse } from "next/server";
import { istDay } from "@/lib/dataset";
import { compareResults, SqlError } from "@/lib/engine";
import { RACE_COUNTDOWN_MS, RACE_MAX_MS, RACE_ROUNDS, type RaceState, type RaceWin } from "@/lib/game/race";
import { prepareRun } from "@/lib/game/run";
import type { SqlRound } from "@/lib/game/types";
import { ensureSchema, getDb } from "@/lib/server/db";
import { isUuid, serverName } from "@/lib/server/names";
import { getServerSql } from "@/lib/server/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const err = (error: string, status = 400) => NextResponse.json({ error }, { status });

interface Row {
  code: string;
  seed: number;
  day: string;
  host_id: string;
  host_name: string;
  guest_id: string | null;
  guest_name: string | null;
  started_at: string | Date | null;
  wins: RaceWin[];
}

function toState(row: Row, playerId: string | null): RaceState {
  return {
    code: row.code,
    seed: row.seed,
    day: row.day,
    host: row.host_name,
    guest: row.guest_name,
    startedAt: row.started_at ? new Date(row.started_at).getTime() : null,
    serverNow: Date.now(),
    wins: row.wins,
    you: playerId === row.host_id ? "host" : playerId && playerId === row.guest_id ? "guest" : null,
  };
}

async function getRoom(sql: NonNullable<ReturnType<typeof getDb>>, code: string): Promise<Row | null> {
  const rows = (await sql`
    SELECT code, seed, to_char(day, 'YYYY-MM-DD') AS day, host_id, host_name, guest_id, guest_name, started_at, wins
    FROM qa_rooms WHERE code = ${code} AND created_at > now() - interval '2 hours'`) as Row[];
  return rows[0] ?? null;
}

export async function GET(req: Request) {
  const sql = getDb();
  if (!sql) return NextResponse.json({ online: false });
  const url = new URL(req.url);
  const code = (url.searchParams.get("code") ?? "").toUpperCase();
  const playerId = url.searchParams.get("playerId");
  await ensureSchema(sql);
  const row = await getRoom(sql, code);
  if (!row) return err("Room not found or expired.", 404);
  return NextResponse.json({ online: true, state: toState(row, playerId) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const sql = getDb();
  if (!sql) return NextResponse.json({ online: false });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return err("Bad request.");
  const { action, playerId } = body;
  if (!isUuid(playerId)) return err("Bad player id.");
  await ensureSchema(sql);

  if (action === "create") {
    const name = serverName(body.name);
    if (!name) return err("Pick a name first (2 to 12 letters or digits).");
    await sql`DELETE FROM qa_rooms WHERE created_at < now() - interval '1 day'`;
    for (let i = 0; i < 5; i++) {
      const code = Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
      const seed = Math.floor(Math.random() * 2 ** 31);
      const rows = await sql`
        INSERT INTO qa_rooms (code, seed, day, host_id, host_name) VALUES (${code}, ${seed}, ${istDay()}, ${playerId}, ${name})
        ON CONFLICT (code) DO NOTHING RETURNING code`;
      if (rows.length) {
        const row = await getRoom(sql, code);
        return NextResponse.json({ online: true, state: toState(row!, playerId) });
      }
    }
    return err("Couldn't make a room. Try again.", 500);
  }

  const code = String(body.code ?? "").toUpperCase();
  const row = await getRoom(sql, code);
  if (!row) return err("Room not found or expired.", 404);

  if (action === "join") {
    const name = serverName(body.name);
    if (!name) return err("Pick a name first (2 to 12 letters or digits).");
    if (row.host_id === playerId || row.guest_id === playerId) return NextResponse.json({ online: true, state: toState(row, playerId) });
    if (row.guest_id) return err("That room is full.", 409);
    const start = new Date(Date.now() + RACE_COUNTDOWN_MS).toISOString();
    const upd = await sql`
      UPDATE qa_rooms SET guest_id = ${playerId}, guest_name = ${name}, started_at = ${start}
      WHERE code = ${code} AND guest_id IS NULL RETURNING code`;
    if (!upd.length) return err("That room is full.", 409);
    return NextResponse.json({ online: true, state: toState((await getRoom(sql, code))!, playerId) });
  }

  if (action === "answer") {
    const slot = playerId === row.host_id ? "host" : playerId === row.guest_id ? "guest" : null;
    if (!slot) return err("You're not in this race.", 403);
    const startedAt = row.started_at ? new Date(row.started_at).getTime() : null;
    const now = Date.now();
    if (!startedAt || now < startedAt) return err("The race hasn't started.");
    if (now - startedAt > RACE_MAX_MS) return err("This race has timed out.");
    const round = Number(body.round);
    if (round !== row.wins.length || round >= RACE_ROUNDS) return NextResponse.json({ online: true, ok: false, won: false, stale: true, state: toState(row, playerId) });
    const text = typeof body.sql === "string" ? body.sql : "";

    const SQL = await getServerSql();
    const run = prepareRun(SQL, "blitz", row.day, row.seed);
    let ok = false;
    let reason = "";
    try {
      const r = run.rounds[round] as SqlRound;
      const result = run.engine.run(text);
      const v = compareResults(r.expected, result, r.ordered);
      ok = v.ok;
      reason = v.reason;
    } catch (e) {
      reason = e instanceof SqlError ? e.message : "Query failed.";
    } finally {
      run.engine.close();
    }
    if (!ok) return NextResponse.json({ online: true, ok: false, won: false, reason, state: toState(row, playerId) });
    const win = JSON.stringify([{ r: round, slot, t: now - startedAt }]);
    // Only the first correct answer for this round lands: the length check makes it atomic.
    const upd = await sql`
      UPDATE qa_rooms SET wins = wins || ${win}::jsonb
      WHERE code = ${code} AND jsonb_array_length(wins) = ${round} RETURNING code`;
    const fresh = (await getRoom(sql, code))!;
    return NextResponse.json({ online: true, ok: true, won: upd.length > 0, reason, state: toState(fresh, playerId) });
  }

  return err("Unknown action.");
}
