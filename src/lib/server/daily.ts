import { addDays } from "@/lib/dataset";
import { factFor, puzzleNumber } from "@/lib/daily/facts";
import { ensureDailySchema, getDb } from "@/lib/server/db";

type Sql = NonNullable<ReturnType<typeof getDb>>;

export interface PlayerStats {
  streak: number;
  best: number;
  played: number;
  wins: number;
}

/** The public half of a day's fact: no answer, no reveal. */
export function publicFact(day: string) {
  const f = factFor(day);
  return { day, number: puzzleNumber(day), emoji: f.emoji, prompt: f.prompt, options: f.options };
}

export function revealOf(day: string) {
  const f = factFor(day);
  return { answer: f.answer, reveal: f.reveal };
}

/** How many players picked each option today. */
export async function splitOf(sql: Sql, day: string): Promise<[number, number]> {
  const rows = (await sql`SELECT pick, count(*)::int AS n FROM dw_guesses WHERE day = ${day} GROUP BY pick`) as { pick: number; n: number }[];
  const out: [number, number] = [0, 0];
  for (const r of rows) if (r.pick === 0 || r.pick === 1) out[r.pick] = r.n;
  return out;
}

/** A player's stats as of `day`. A streak whose last win is older than yesterday has lapsed. */
export async function statsOf(sql: Sql, playerId: string, day: string): Promise<PlayerStats | null> {
  const rows = (await sql`
    SELECT streak, best_streak AS best, played, wins, to_char(last_correct_day, 'YYYY-MM-DD') AS "lastWin"
    FROM dw_players WHERE id = ${playerId}`) as (PlayerStats & { lastWin: string | null })[];
  const r = rows[0];
  if (!r) return null;
  const alive = r.lastWin !== null && r.lastWin >= addDays(day, -1);
  return { streak: alive ? r.streak : 0, best: r.best, played: r.played, wins: r.wins };
}

export async function dailyDb(): Promise<Sql | null> {
  const sql = getDb();
  if (!sql) return null;
  await ensureDailySchema(sql);
  return sql;
}
