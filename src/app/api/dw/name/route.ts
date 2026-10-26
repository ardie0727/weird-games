import { NextResponse } from "next/server";
import { dailyDb } from "@/lib/server/daily";
import { isUuid, serverName } from "@/lib/server/names";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Set the name shown on the streak board. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { playerId?: unknown; name?: unknown } | null;
  const name = serverName(body?.name);
  if (!name) return NextResponse.json({ error: "Pick a different name (2 to 12 letters or digits)." }, { status: 400 });
  if (!isUuid(body?.playerId)) return NextResponse.json({ error: "Bad player id." }, { status: 400 });
  const sql = await dailyDb().catch(() => null);
  if (!sql) return NextResponse.json({ online: false });
  await sql`UPDATE dw_players SET name = ${name} WHERE id = ${body.playerId}`;
  return NextResponse.json({ online: true, name });
}
