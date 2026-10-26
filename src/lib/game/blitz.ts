import { type GenCtx, makeSqlRound, noTieAt, q, type SqlSpec } from "./ctx.ts";
import type { SqlRound } from "./types.ts";

type Tpl = (c: GenCtx) => SqlSpec;

const base = (c: GenCtx) => {
  const { fact: f, dim: d, label: L } = c.ds.theme;
  return { f, d, L, T: f.table, D: d.table };
};

// Level 1: one table, one clause.
const L1: Tpl[] = [
  (c) => {
    const { f, L, T } = base(c);
    const x = c.rng.pick(c.ds.aValues);
    return {
      title: "Count",
      prompt: `How many ${L.rows} are from ${L.a} '${x}'?`,
      solution: `SELECT COUNT(*) FROM ${T} WHERE ${f.a} = ${q(x)}`,
      starter: `SELECT COUNT(*)\nFROM ${T}\nWHERE `,
      line: `WHERE ${f.a} = ${q(x)}`,
      tag: "WHERE",
    };
  },
  (c) => {
    const { f, L, T } = base(c);
    const y = c.rng.pick(c.ds.bValues);
    return {
      title: "Sum",
      prompt: `What is the total ${L.m} for ${L.b} '${y}'?`,
      solution: `SELECT SUM(${f.m}) FROM ${T} WHERE ${f.b} = ${q(y)}`,
      starter: `SELECT \nFROM ${T}\nWHERE `,
      line: `SELECT SUM(${f.m})`,
      tag: "SUM",
    };
  },
  (c) => {
    const { f, L, T } = base(c);
    const fn = c.rng.pick(["MAX", "MIN"] as const);
    return {
      title: fn === "MAX" ? "Highest" : "Lowest",
      prompt: `What is the ${fn === "MAX" ? "highest" : "lowest"} ${L.m2} in ${T}?`,
      solution: `SELECT ${fn}(${f.m2}) FROM ${T}`,
      starter: `SELECT \nFROM ${T}`,
      line: `SELECT ${fn}(${f.m2})`,
      tag: fn,
    };
  },
  (c) => {
    const { f, L, T } = base(c);
    const vals = c.engine.run(`SELECT ${f.m} FROM ${T} ORDER BY ${f.m}`).rows.map((r) => r[0] as number);
    const t = vals[c.rng.int(4, 9)];
    return {
      title: "Filter",
      prompt: `How many ${L.rows} have ${L.m} greater than ${t}?`,
      solution: `SELECT COUNT(*) FROM ${T} WHERE ${f.m} > ${t}`,
      starter: `SELECT COUNT(*)\nFROM ${T}\nWHERE `,
      line: `WHERE ${f.m} > ${t}`,
      tag: "WHERE",
    };
  },
  (c) => {
    const { f, L, T } = base(c);
    return {
      title: "NULLs",
      prompt: `How many ${L.rows} have ${L.nulMissing}? (${f.nul} is NULL)`,
      solution: `SELECT COUNT(*) FROM ${T} WHERE ${f.nul} IS NULL`,
      starter: `SELECT COUNT(*)\nFROM ${T}\nWHERE `,
      line: `WHERE ${f.nul} IS NULL`,
      tag: "NULL",
    };
  },
  (c) => {
    const { f, L, T } = base(c);
    return {
      title: "Distinct",
      prompt: `How many different ${L.a} values appear in ${T}?`,
      solution: `SELECT COUNT(DISTINCT ${f.a}) FROM ${T}`,
      starter: `SELECT \nFROM ${T}`,
      line: `SELECT COUNT(DISTINCT ${f.a})`,
      tag: "DISTINCT",
    };
  },
  (c) => {
    const { f, L, T } = base(c);
    const day = c.rng.pick(c.engine.run(`SELECT DISTINCT ${f.date} FROM ${T}`).rows.map((r) => r[0] as string));
    return {
      title: "Dates",
      prompt: `How many ${L.rows} happened on ${day}?`,
      solution: `SELECT COUNT(*) FROM ${T} WHERE ${f.date} = ${q(day)}`,
      starter: `SELECT COUNT(*)\nFROM ${T}\nWHERE `,
      line: `WHERE ${f.date} = ${q(day)}`,
      tag: "DATE",
    };
  },
];

// Level 2: GROUP BY, ORDER BY, AVG.
const L2: Tpl[] = [
  (c) => {
    const { f, L, T } = base(c);
    return {
      title: "Group",
      prompt: `Show each ${L.a} with its total ${L.m}.`,
      solution: `SELECT ${f.a}, SUM(${f.m}) FROM ${T} GROUP BY ${f.a}`,
      starter: `SELECT ${f.a}, \nFROM ${T}\n`,
      line: `GROUP BY ${f.a}`,
      tag: "GROUP BY",
    };
  },
  (c) => {
    const { f, L, T } = base(c);
    return {
      title: "Group",
      prompt: `Count the ${L.rows} for each ${L.b}.`,
      solution: `SELECT ${f.b}, COUNT(*) FROM ${T} GROUP BY ${f.b}`,
      starter: `SELECT \nFROM ${T}\n`,
      line: `GROUP BY ${f.b}`,
      tag: "GROUP BY",
    };
  },
  (c) => {
    const { f, L, T } = base(c);
    const sql = `SELECT ${f.a}, SUM(${f.m}) AS total FROM ${T} GROUP BY ${f.a} ORDER BY total DESC`;
    return {
      title: "Top 1",
      prompt: `Which ${L.a} has the highest total ${L.m}? Return only the ${L.a}.`,
      solution: `SELECT ${f.a} FROM ${T} GROUP BY ${f.a} ORDER BY SUM(${f.m}) DESC LIMIT 1`,
      starter: `SELECT ${f.a}\nFROM ${T}\n`,
      line: `ORDER BY SUM(${f.m}) DESC LIMIT 1`,
      tag: "ORDER BY",
      check: () => noTieAt(c.engine, sql, 1),
    };
  },
  (c) => {
    const { f, L, T } = base(c);
    const x = c.rng.pick(c.ds.aValues);
    return {
      title: "Average",
      prompt: `What is the average ${L.m2} for ${L.a} '${x}', rounded to 1 decimal?`,
      solution: `SELECT ROUND(AVG(${f.m2}), 1) FROM ${T} WHERE ${f.a} = ${q(x)}`,
      starter: `SELECT \nFROM ${T}\nWHERE `,
      line: `SELECT ROUND(AVG(${f.m2}), 1)`,
      tag: "AVG",
    };
  },
  (c) => {
    const { f, L, T } = base(c);
    const days = c.engine.run(`SELECT DISTINCT ${f.date} FROM ${T} ORDER BY 1`).rows.map((r) => r[0] as string);
    const i = c.rng.int(0, Math.max(0, days.length - 3));
    const d1 = days[i];
    const d2 = days[Math.min(days.length - 1, i + 2)];
    return {
      title: "Date range",
      prompt: `What is the total ${L.m} from ${d1} to ${d2} (both days included)?`,
      solution: `SELECT SUM(${f.m}) FROM ${T} WHERE ${f.date} BETWEEN ${q(d1)} AND ${q(d2)}`,
      starter: `SELECT \nFROM ${T}\nWHERE `,
      line: `WHERE ${f.date} BETWEEN ${q(d1)} AND ${q(d2)}`,
      tag: "DATE",
    };
  },
  (c) => {
    const { f, L, T } = base(c);
    const x = c.rng.pick(c.ds.aValues);
    return {
      title: "Distinct list",
      prompt: `List the different ${L.b} values seen in ${L.a} '${x}'.`,
      solution: `SELECT DISTINCT ${f.b} FROM ${T} WHERE ${f.a} = ${q(x)}`,
      starter: `SELECT \nFROM ${T}\nWHERE `,
      line: `SELECT DISTINCT ${f.b}`,
      tag: "DISTINCT",
    };
  },
  (c) => {
    const { f, L, T } = base(c);
    return {
      title: "COALESCE",
      prompt: `Count ${L.rows} per ${L.nul}, showing NULL as 'none'.`,
      solution: `SELECT COALESCE(${f.nul}, 'none'), COUNT(*) FROM ${T} GROUP BY COALESCE(${f.nul}, 'none')`,
      starter: `SELECT \nFROM ${T}\n`,
      line: `COALESCE(${f.nul}, 'none')`,
      tag: "NULL",
    };
  },
];

// Level 3: HAVING, JOINs, top-N.
const L3: Tpl[] = [
  (c) => {
    const { f, L, T } = base(c);
    const counts = c.engine.run(`SELECT COUNT(*) FROM ${T} GROUP BY ${f.a} ORDER BY 1`).rows.map((r) => r[0] as number);
    const k = counts[Math.floor(counts.length / 2) - 1] ?? 2;
    return {
      title: "HAVING",
      prompt: `Which ${L.a} values have more than ${k} ${L.rows}? Return just the ${L.a}.`,
      solution: `SELECT ${f.a} FROM ${T} GROUP BY ${f.a} HAVING COUNT(*) > ${k}`,
      starter: `SELECT ${f.a}\nFROM ${T}\n`,
      line: `HAVING COUNT(*) > ${k}`,
      tag: "HAVING",
    };
  },
  (c) => {
    const { f, d, L, T, D } = base(c);
    return {
      title: "JOIN",
      prompt: `Join ${D} and show the total ${L.m} for each ${d.attr}.`,
      solution: `SELECT d.${d.attr}, SUM(f.${f.m}) FROM ${T} f JOIN ${D} d ON f.${f.key} = d.${d.key} GROUP BY d.${d.attr}`,
      starter: `SELECT \nFROM ${T} f\nJOIN ${D} d ON f.${f.key} = d.${d.key}\n`,
      line: `GROUP BY d.${d.attr}`,
      tag: "JOIN",
    };
  },
  (c) => {
    const { f, d, L, T, D } = base(c);
    const sql = `SELECT d.${d.name}, SUM(f.${f.m}) AS t FROM ${T} f JOIN ${D} d ON f.${f.key} = d.${d.key} GROUP BY d.${d.name} ORDER BY t DESC`;
    return {
      title: "JOIN + Top",
      prompt: `Which ${L.dimRow} has the highest total ${L.m}? Return their ${d.name}.`,
      solution: `SELECT d.${d.name} FROM ${T} f JOIN ${D} d ON f.${f.key} = d.${d.key} GROUP BY d.${d.name} ORDER BY SUM(f.${f.m}) DESC LIMIT 1`,
      starter: `SELECT \nFROM ${T} f\nJOIN ${D} d ON `,
      line: `ORDER BY SUM(f.${f.m}) DESC LIMIT 1`,
      tag: "JOIN",
      check: () => noTieAt(c.engine, sql, 1),
    };
  },
  (c) => {
    const { f, d, L, T, D } = base(c);
    return {
      title: "Anti-join",
      prompt: `Which ${L.dimRow} has no ${L.rows} at all? Return the ${d.name}.`,
      solution: `SELECT ${d.name} FROM ${D} WHERE ${d.key} NOT IN (SELECT ${f.key} FROM ${T})`,
      starter: `SELECT ${d.name}\nFROM ${D}\n`,
      line: `LEFT JOIN ${T} f ON ... WHERE f.${f.id} IS NULL`,
      tag: "JOIN",
    };
  },
  (c) => {
    const { f, L, T } = base(c);
    const sql = `SELECT ${f.a}, SUM(${f.m}) AS total FROM ${T} GROUP BY ${f.a} ORDER BY total DESC`;
    return {
      title: "Top 2",
      prompt: `Show the top 2 ${L.a} values by total ${L.m}, highest first, with the total.`,
      solution: `SELECT ${f.a}, SUM(${f.m}) AS total FROM ${T} GROUP BY ${f.a} ORDER BY total DESC LIMIT 2`,
      starter: `SELECT ${f.a}, \nFROM ${T}\n`,
      line: `ORDER BY total DESC LIMIT 2`,
      ordered: true,
      tag: "ORDER BY",
      check: () => noTieAt(c.engine, sql, 2),
    };
  },
  (c) => {
    const { f, d, L, T, D } = base(c);
    return {
      title: "COUNT DISTINCT",
      prompt: `How many different ${L.dimRows} have at least one ${L.row}?`,
      solution: `SELECT COUNT(DISTINCT ${f.key}) FROM ${T}`,
      starter: `SELECT \nFROM ${T}`,
      line: `COUNT(DISTINCT ${f.key})`,
      tag: "DISTINCT",
    };
  },
];

export function buildFromTemplates(c: GenCtx, pools: Tpl[][], count: number, hintScale = 1): SqlRound[] {
  const rounds: SqlRound[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (rounds.length < count && guard++ < count * 6) {
    // Difficulty climbs: L1 for the first 4, then L2, then a mix with L3.
    const n = rounds.length;
    const pool = n < 4 ? pools[0] : n < 9 ? pools[1] : pools[Math.min(pools.length - 1, 1 + (n % 2))];
    const tpl = c.rng.pick(pool);
    const r = makeSqlRound(c, tpl(c), hintScale);
    // No repeats until the run is long enough to have used up the pool.
    if (!r || (seen.has(r.prompt) && guard < count * 4)) continue;
    seen.add(r.prompt);
    rounds.push(r);
  }
  return rounds;
}

export function generateBlitz(c: GenCtx, count: number): SqlRound[] {
  return buildFromTemplates(c, [L1, L2, L3], count);
}

export const BLITZ_POOLS = { L1, L2, L3 };
