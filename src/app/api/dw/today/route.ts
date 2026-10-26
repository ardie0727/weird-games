import { NextResponse } from "next/server";
import { istDay } from "@/lib/dataset";
import { dailyDb, publicFact, revealOf, splitOf, statsOf } from "@/lib/server/daily";
import { isUuid } from "@/lib/server/names";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Today's fact. If this player already guessed today, also the answer, the split and their stats. */
export async function GET(req: Request) {
  const day = istDay();
  const fact = publicFact(day);
  const playerId = new URL(req.url).searchParams.get("player");
  const sql = await dailyDb().catch(() => null);
  if (!sql) return NextResponse.json({ online: false, fact });
  if (!isUuid(playerId)) return NextResponse.json({ online: true, fact });
  const [guess] = (await sql`SELECT pick, correct FROM dw_guesses WHERE player_id = ${playerId} AND day = ${day}`) as { pick: number; correct: boolean }[];
  const stats = await statsOf(sql, playerId, day);
  if (!guess) return NextResponse.json({ online: true, fact, stats });
  return NextResponse.json({ online: true, fact, stats, result: { pick: guess.pick, correct: guess.correct, ...revealOf(day), split: await splitOf(sql, day) } });
}
