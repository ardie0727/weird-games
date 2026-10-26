import { NextResponse } from "next/server";
import { istDay, istWeekStart } from "@/lib/dataset";
import { isModeId } from "@/lib/game/modes";
import { ensureSchema, getDb } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Best score per player for a mode, for today, this week (IST, from Monday) or all time. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "blitz";
  const period = url.searchParams.get("period") ?? "daily";
  if (!isModeId(mode)) return NextResponse.json({ error: "Unknown mode." }, { status: 400 });
  const sql = getDb();
  if (!sql) return NextResponse.json({ online: false, rows: [] });
  await ensureSchema(sql);
  const today = istDay();
  const from = period === "daily" ? today : period === "weekly" ? istWeekStart(today) : "2000-01-01";
  const rows = await sql`
    SELECT player_name AS name, score, time_ms AS "timeMs", streak, to_char(day, 'YYYY-MM-DD') AS day FROM (
      SELECT DISTINCT ON (player_id) player_id, player_name, score, time_ms, streak, day
      FROM qa_scores
      WHERE mode = ${mode} AND day >= ${from}
      ORDER BY player_id, score DESC, time_ms ASC
    ) best
    ORDER BY score DESC, time_ms ASC
    LIMIT 20`;
  return NextResponse.json({ online: true, rows }, { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" } });
}
