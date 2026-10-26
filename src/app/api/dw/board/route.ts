import { NextResponse } from "next/server";
import { addDays, istDay } from "@/lib/dataset";
import { dailyDb } from "@/lib/server/daily";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Top live streaks (still alive today) and best streaks ever, plus today's player count. */
export async function GET() {
  const sql = await dailyDb().catch(() => null);
  if (!sql) return NextResponse.json({ online: false, live: [], best: [], today: 0 });
  const day = istDay();
  const yesterday = addDays(day, -1);
  const [live, best, count] = await Promise.all([
    sql`SELECT name, streak, best_streak AS best FROM dw_players
        WHERE streak > 0 AND last_correct_day >= ${yesterday} AND name <> 'PLAYER'
        ORDER BY streak DESC, last_correct_day DESC, created_at ASC LIMIT 20`,
    sql`SELECT name, best_streak AS best, wins FROM dw_players
        WHERE best_streak > 0 AND name <> 'PLAYER'
        ORDER BY best_streak DESC, wins DESC, created_at ASC LIMIT 20`,
    sql`SELECT count(*)::int AS n FROM dw_guesses WHERE day = ${day}`,
  ]);
  return NextResponse.json(
    { online: true, live, best, today: (count[0] as { n: number }).n },
    { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" } },
  );
}
