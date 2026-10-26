const BLOCK = ["FUCK", "SHIT", "CUNT", "BITCH", "NIGG", "FAG", "RAPE", "SLUT", "WHORE", "CHUTIYA", "MADARCHOD", "BHENCHOD", "BSDK", "GAND", "LODA", "LUND"];

export function serverName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.toUpperCase().replace(/[^A-Z0-9_ ]/g, "").trim().slice(0, 12);
  if (name.length < 2) return null;
  const squashed = name.replace(/[^A-Z]/g, "");
  if (BLOCK.some((b) => squashed.includes(b))) return null;
  return name;
}

export const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
