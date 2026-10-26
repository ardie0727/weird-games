import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { ModeId } from "../game/types.ts";

// A run token proves the server picked the seed and when the run started.
// The secret never leaves the server.

export interface RunClaims {
  m: ModeId;
  s: number;
  d: string;
  iat: number;
  n: string;
}

function secret(): string | null {
  if (process.env.GAME_SECRET) return process.env.GAME_SECRET;
  if (process.env.DATABASE_URL) return createHash("sha256").update("weird-games:qa:" + process.env.DATABASE_URL).digest("hex");
  return null;
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");

export function signRun(claims: Omit<RunClaims, "n" | "iat">): { token: string; claims: RunClaims } | null {
  const key = secret();
  if (!key) return null;
  const full: RunClaims = { ...claims, iat: Date.now(), n: randomBytes(12).toString("base64url") };
  const body = b64(JSON.stringify(full));
  const sig = createHmac("sha256", key).update(body).digest("base64url");
  return { token: `${body}.${sig}`, claims: full };
}

export function verifyRun(token: string): RunClaims | null {
  const key = secret();
  if (!key || typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = createHmac("sha256", key).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString()) as RunClaims;
  } catch {
    return null;
  }
}
