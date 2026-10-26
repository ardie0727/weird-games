import { NextResponse } from "next/server";
import { addDays, istDay } from "@/lib/dataset";
import { dailyDb, revealOf, splitOf, statsOf } from "@/lib/server/daily";
import { isUuid, serverName } from "@/lib/server/names";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lock in today's guess. One guess per player per day: a second guess gets the
 * first one back. Streaks count consecutive days guessed right.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { day?: unknown; pick?: unknown; playerId?: unknown; name?: unknown } | null;
  if (!body || (body.pick !== 0 && body.pick !== 1)) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const day = istDay();
  if (body.day !== day) return NextResponse.json({ error: "A new fact is out. Refresh to see it.", stale: true }, { status: 409 });
  const { answer, reveal } = revealOf(day);
  const pick = body.pick;
  const correct = pick === answer;

  const sql = await dailyDb().catch(() => null);
  if (!sql || !isUuid(body.playerId)) return NextResponse.json({ online: false, result: { pick, correct, answer, reveal } });
  const playerId = body.playerId;
  const name = serverName(body.name) ?? "PLAYER";

  const ins = (await sql`
    INSERT INTO dw_guesses (player_id, day, pick, correct) VALUES (${playerId}, ${day}, ${pick}, ${correct})
    ON CONFLICT (player_id, day) DO NOTHING
    RETURNING pick`) as { pick: number }[];

  if (ins.length) {
    const yesterday = addDays(day, -1);
    const win = correct ? 1 : 0;
    await sql`
      INSERT INTO dw_players (id, name, streak, best_streak, last_day, last_correct_day, played, wins)
      VALUES (${playerId}, ${name}, ${win}, ${win}, ${day}, ${correct ? day : null}, 1, ${win})
      ON CONFLICT (id) DO UPDATE SET
        name = CASE WHEN EXCLUDED.name = 'PLAYER' THEN dw_players.name ELSE EXCLUDED.name END,
        streak = CASE WHEN ${correct}::boolean THEN (CASE WHEN dw_players.last_correct_day = ${yesterday}::date THEN dw_players.streak + 1 ELSE 1 END) ELSE 0 END,
        best_streak = GREATEST(dw_players.best_streak, CASE WHEN ${correct}::boolean THEN (CASE WHEN dw_players.last_correct_day = ${yesterday}::date THEN dw_players.streak + 1 ELSE 1 END) ELSE 0 END),
        last_day = EXCLUDED.last_day,
        last_correct_day = COALESCE(EXCLUDED.last_correct_day, dw_players.last_correct_day),
        played = dw_players.played + 1,
        wins = dw_players.wins + ${win}`;
  }
  const [first] = ins.length ? [{ pick, correct }] : ((await sql`SELECT pick, correct FROM dw_guesses WHERE player_id = ${playerId} AND day = ${day}`) as { pick: number; correct: boolean }[]);
  const [split, stats] = await Promise.all([splitOf(sql, day), statsOf(sql, playerId, day)]);
  return NextResponse.json({ online: true, result: { pick: first.pick, correct: first.correct, answer, reveal, split }, stats });
}
