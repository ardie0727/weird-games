import { NextResponse } from "next/server";
import { istDay } from "@/lib/dataset";
import { isModeId } from "@/lib/game/modes";
import { getDb } from "@/lib/server/db";
import { signRun } from "@/lib/server/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Start a ranked run: the server picks the seed and stamps the start time. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { mode?: string };
  if (!body.mode || !isModeId(body.mode)) return NextResponse.json({ error: "Unknown mode." }, { status: 400 });
  if (!getDb()) return NextResponse.json({ online: false });
  const seed = Math.floor(Math.random() * 2 ** 31);
  const signed = signRun({ m: body.mode, s: seed, d: istDay() });
  if (!signed) return NextResponse.json({ online: false });
  return NextResponse.json({ online: true, token: signed.token, seed, day: signed.claims.d });
}
