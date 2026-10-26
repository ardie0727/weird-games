import { Rng, hashStr } from "./rng.ts";
import { THEMES, type Theme, themeById } from "./themes.ts";

export type Cell = string | number | null;

export interface TableData {
  name: string;
  columns: { name: string; type: "INTEGER" | "REAL" | "TEXT" }[];
  rows: Cell[][];
}

export interface Dataset {
  day: string;
  theme: Theme;
  tables: TableData[];
  // Facts about the generated data that templates use to phrase questions.
  aValues: string[];
  bValues: string[];
  dates: string[];
  unusedKey: number;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Today's date in India (YYYY-MM-DD). Daily datasets and leaderboards roll over at IST midnight. */
export function istDay(now = Date.now()): string {
  return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Monday of the IST week containing `day`. */
export function istWeekStart(day: string): string {
  const d = new Date(day + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function themeForDay(day: string): Theme {
  const n = Math.floor(Date.parse(day + "T00:00:00Z") / 86400000);
  return THEMES[((n % THEMES.length) + THEMES.length) % THEMES.length];
}

const pad = (n: number) => String(n).padStart(2, "0");

export function buildDataset(day: string, themeId?: string): Dataset {
  const theme = themeId ? themeById(themeId) : themeForDay(day);
  const rng = new Rng(hashStr("dataset:" + day + ":" + theme.id));
  const { fact, dim, gen } = theme;

  // Dimension table: 6 rows, the last one never appears in the fact table
  // (so "who has no orders?" style questions always have an answer).
  const names = rng.sample(gen.names, 6);
  const dimRows: Cell[][] = names.map((name, i): Cell[] => [
    101 + i,
    name,
    rng.pick(gen.attr),
    rng.int(gen.dm[0], gen.dm[1]),
  ]);
  // Make sure at least two different attribute values exist.
  if (new Set(dimRows.map((r) => r[2])).size < 2) dimRows[0][2] = gen.attr.find((x) => x !== dimRows[1][2]) ?? gen.attr[0];
  const usedKeys = dimRows.slice(0, 5).map((r) => r[0] as number);
  const unusedKey = dimRows[5][0] as number;

  const aValues = rng.sample(gen.a, 4);
  const bValues = rng.sample(gen.b, Math.min(3, gen.b.length));
  const year = 2026;
  const month = rng.int(1, 12);
  const startDay = rng.int(1, 18);
  const dates = Array.from({ length: 7 }, (_, i) => `${year}-${pad(month)}-${pad(startDay + i)}`);

  const N = 14;
  const factRows: Cell[][] = [];
  for (let i = 0; i < N; i++) {
    const key = i < usedKeys.length ? usedKeys[i] : rng.pick(usedKeys);
    const a = i < 8 ? aValues[i % 4] : rng.pick(aValues);
    const b = i < bValues.length ? bValues[i] : rng.pick(bValues);
    const [lo, hi, step] = gen.m;
    const m = lo + step * rng.int(0, Math.floor((hi - lo) / step));
    const m2 = rng.int(gen.m2[0], gen.m2[1]);
    const date = rng.pick(dates);
    const nul = rng.chance(gen.nulRate) ? null : rng.pick(gen.nul);
    factRows.push([0, key, a, b, m, m2, date, nul]);
  }
  // Guarantee at least two NULLs and two non-NULLs so NULL questions are meaningful.
  factRows[2][7] = null;
  factRows[9][7] = null;
  if (factRows[4][7] === null) factRows[4][7] = gen.nul[0];
  if (factRows[11][7] === null) factRows[11][7] = gen.nul[1 % gen.nul.length];
  factRows.sort((x, y) => String(x[6]).localeCompare(String(y[6])));
  factRows.forEach((r, i) => (r[0] = i + 1));

  return {
    day,
    theme,
    aValues,
    bValues,
    dates,
    unusedKey,
    tables: [
      {
        name: fact.table,
        columns: [
          { name: fact.id, type: "INTEGER" },
          { name: fact.key, type: "INTEGER" },
          { name: fact.a, type: "TEXT" },
          { name: fact.b, type: "TEXT" },
          { name: fact.m, type: "INTEGER" },
          { name: fact.m2, type: "INTEGER" },
          { name: fact.date, type: "TEXT" },
          { name: fact.nul, type: "TEXT" },
        ],
        rows: factRows,
      },
      {
        name: dim.table,
        columns: [
          { name: dim.key, type: "INTEGER" },
          { name: dim.name, type: "TEXT" },
          { name: dim.attr, type: "TEXT" },
          { name: dim.dm, type: "INTEGER" },
        ],
        rows: dimRows,
      },
    ],
  };
}
