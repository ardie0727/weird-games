import { NextResponse } from "next/server";
import { istDay } from "@/lib/dataset";
import { MODES } from "@/lib/game/modes";
import { deadline } from "@/lib/game/reducer";
import { prepareRun, verifyRun as replayRun } from "@/lib/game/run";
import type { AnswerValue, GameEvent } from "@/lib/game/types";
import { ensureSchema, getDb } from "@/lib/server/db";
import { isUuid, serverName } from "@/lib/server/names";
import { getServerSql } from "@/lib/server/sql";
import { verifyRun } from "@/lib/server/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RUN_AGE_MS = 20 * 60 * 1000;
const CLOCK_SLACK_MS = 3000;

function cleanEvents(raw: unknown): GameEvent[] | null {
  if (!Array.isArray(raw) || raw.length > 400) return null;
  const out: GameEvent[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") return null;
    const { k, r, t } = e as Record<string, unknown>;
    if (typeof r !== "number" || typeof t !== "number" || !Number.isFinite(t)) return null;
    if (k === "a") {
      const v = (e as { v: unknown }).v;
      const okV = typeof v === "string" ? v.length <= 1200 : typeof v === "number" || (Array.isArray(v) && v.length <= 20 && v.every((x) => typeof x === "string"));
      if (!okV) return null;
      out.push({ k, r, t, v: v as AnswerValue });
    } else if (k === "h") {
      const h = (e as { h: unknown }).h;
      if (typeof h !== "number") return null;
      out.push({ k, r, t, h });
    } else if (k === "s") out.push({ k, r, t });
    else return null;
  }
  return out;
}

/**
 * Verify a finished run and save it. The browser's score is ignored: the server
 * rebuilds the same questions from the signed seed, re-runs every answer and
 * recomputes the score with the same rules.
 */
export async function POST(req: Request) {
  const sql = getDb();
  if (!sql) return NextResponse.json({ online: false });
  const body = (await req.json().catch(() => null)) as { token?: string; events?: unknown; name?: unknown; playerId?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const claims = verifyRun(body.token ?? "");
  if (!claims) return NextResponse.json({ error: "This run wasn't started by the server." }, { status: 400 });
  const name = serverName(body.name);
  if (!name) return NextResponse.json({ error: "Pick a different name (2 to 12 letters or digits)." }, { status: 400 });
  if (!isUuid(body.playerId)) return NextResponse.json({ error: "Bad player id." }, { status: 400 });
  const events = cleanEvents(body.events);
  if (!events) return NextResponse.json({ error: "Bad answer log." }, { status: 400 });

  const elapsed = Date.now() - claims.iat;
  if (elapsed > MAX_RUN_AGE_MS) return NextResponse.json({ error: "This run is too old to submit." }, { status: 400 });
  const lastT = events.length ? events[events.length - 1].t : 0;
  if (lastT > elapsed + CLOCK_SLACK_MS) return NextResponse.json({ error: "Answers claim more time than has passed." }, { status: 400 });

  const SQL = await getServerSql();
  const run = prepareRun(SQL, claims.m, claims.d, claims.s);
  let state;
  try {
    state = replayRun(run, events);
  } finally {
    run.engine.close();
  }
  if (state.invalid) return NextResponse.json({ error: `Run rejected: ${state.invalid}` }, { status: 400 });
  const timeMs = Math.round(Math.min(lastT, deadline(MODES[claims.m], state)));

  await ensureSchema(sql);
  const today = istDay();
  const ins = await sql`
    INSERT INTO qa_scores (run_nonce, player_id, player_name, mode, score, time_ms, correct, streak, day, dataset)
    VALUES (${claims.n}, ${body.playerId}, ${name}, ${claims.m}, ${state.score}, ${timeMs}, ${state.correct}, 0, ${today}, ${run.ds.theme.id})
    ON CONFLICT (run_nonce) DO NOTHING
    RETURNING id`;
  if (!ins.length) return NextResponse.json({ error: "This run was already submitted." }, { status: 409 });

  const p = await sql`
    INSERT INTO qa_players (id, name, last_day, streak, best_streak) VALUES (${body.playerId}, ${name}, ${today}, 1, 1)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      streak = CASE WHEN qa_players.last_day = EXCLUDED.last_day THEN qa_players.streak
                    WHEN qa_players.last_day = EXCLUDED.last_day - 1 THEN qa_players.streak + 1
                    ELSE 1 END,
      best_streak = GREATEST(qa_players.best_streak,
                    CASE WHEN qa_players.last_day = EXCLUDED.last_day THEN qa_players.streak
                         WHEN qa_players.last_day = EXCLUDED.last_day - 1 THEN qa_players.streak + 1
                         ELSE 1 END),
      last_day = EXCLUDED.last_day
    RETURNING streak`;
  const streak = Number(p[0]?.streak ?? 1);
  await sql`UPDATE qa_scores SET streak = ${streak} WHERE id = ${ins[0].id}`;

  const better = await sql`
    SELECT COUNT(*)::int AS n FROM (
      SELECT player_id, MAX(score) AS best FROM qa_scores
      WHERE mode = ${claims.m} AND day = ${today} AND player_id <> ${body.playerId}
      GROUP BY player_id) t
    WHERE best > ${state.score}`;
  return NextResponse.json({ online: true, score: state.score, correct: state.correct, streak, rank: Number(better[0].n) + 1 });
}
