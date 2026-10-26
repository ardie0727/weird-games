import { NextResponse } from "next/server";
import { istDay } from "@/lib/dataset";
import { getDb } from "@/lib/server/db";
import { isUuid, serverName } from "@/lib/server/names";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sql = NonNullable<ReturnType<typeof getDb>>;
let ready: Promise<void> | null = null;

function ensureTable(sql: Sql): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS rbm_scores (
        id bigserial PRIMARY KEY,
        player_id uuid NOT NULL,
        player_name text NOT NULL,
        score int NOT NULL CHECK (score >= 0),
        wave int NOT NULL,
        kills int NOT NULL,
        best_chain int NOT NULL DEFAULT 0,
        time_ms int NOT NULL,
        day date NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS rbm_scores_day_score ON rbm_scores (day, score DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS rbm_scores_score ON rbm_scores (score DESC)`;
    })();
    ready.catch(() => (ready = null));
  }
  return ready;
}

/** Best score per player, today (IST) or all time. */
export async function GET(req: Request) {
  const period = new URL(req.url).searchParams.get("period") === "all" ? "all" : "daily";
  const sql = getDb();
  if (!sql) return NextResponse.json({ online: false, rows: [] });
  await ensureTable(sql);
  const from = period === "daily" ? istDay() : "2000-01-01";
  const rows = await sql`
    SELECT player_name AS name, score, wave, kills FROM (
      SELECT DISTINCT ON (player_id) player_id, player_name, score, wave, kills, time_ms
      FROM rbm_scores
      WHERE day >= ${from}
      ORDER BY player_id, score DESC, time_ms ASC
    ) best
    ORDER BY score DESC, time_ms ASC
    LIMIT 20`;
  return NextResponse.json({ online: true, rows }, { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" } });
}

const int = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null);

/**
 * Save a finished run. This is an action game played entirely in the browser, so the score
 * can't be replayed on the server like Query Arcade's; it is only checked for plausibility.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const name = serverName(body.name);
  const score = int(body.score, 0, 5_000_000);
  const wave = int(body.wave, 1, 500);
  const kills = int(body.kills, 0, 50_000);
  const chain = int(body.bestChain, 0, 1000) ?? 0;
  const timeMs = int(body.timeMs, 0, 6 * 3600_000);
  if (!isUuid(body.playerId) || !name || score === null || wave === null || kills === null || timeMs === null)
    return NextResponse.json({ error: "Bad score." }, { status: 400 });
  // Rough ceilings: every wave takes a few seconds, and no kill is worth more than a chained boss.
  if (timeMs < (wave - 1) * 4000 || score > kills * 24_000 + wave * wave * 150 + wave * 1000)
    return NextResponse.json({ error: "That score doesn't look right." }, { status: 400 });
  const sql = getDb();
  if (!sql) return NextResponse.json({ online: false });
  await ensureTable(sql);
  const day = istDay();
  await sql`INSERT INTO rbm_scores (player_id, player_name, score, wave, kills, best_chain, time_ms, day)
    VALUES (${body.playerId as string}, ${name}, ${score}, ${wave}, ${kills}, ${chain}, ${timeMs}, ${day})`;
  const [{ rank }] = (await sql`
    SELECT count(*)::int + 1 AS rank FROM (
      SELECT player_id, max(score) AS best FROM rbm_scores WHERE day = ${day} GROUP BY player_id
    ) b WHERE best > ${score}`) as { rank: number }[];
  return NextResponse.json({ online: true, rank });
}
