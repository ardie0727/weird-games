import { compareResults } from "../engine.ts";
import { type GenCtx, makeSqlRound, noTieAt, q } from "./ctx.ts";
import type { SqlRound } from "./types.ts";

interface BugSpec {
  type: string;
  title: string;
  task: string;
  buggy: string;
  fixed: string;
  line: string;
  explain: string;
  ordered?: boolean;
  check?: () => boolean;
}

type BugTpl = (c: GenCtx) => BugSpec;

const parts = (c: GenCtx) => {
  const { fact: f, dim: d, label: L } = c.ds.theme;
  return { f, d, L, T: f.table, D: d.table };
};

const BUGS: BugTpl[] = [
  (c) => {
    const { f, L, T } = parts(c);
    return {
      type: "GROUP BY",
      title: "Half-grouped",
      task: `Total ${L.m} for every ${L.a} and ${L.b} pair.`,
      buggy: `SELECT ${f.a}, ${f.b}, SUM(${f.m}) AS total\nFROM ${T}\nGROUP BY ${f.a}`,
      fixed: `SELECT ${f.a}, ${f.b}, SUM(${f.m}) AS total FROM ${T} GROUP BY ${f.a}, ${f.b}`,
      line: `GROUP BY ${f.a}, ${f.b}`,
      explain: `Every column you select without an aggregate must be in GROUP BY. SQLite quietly picks a random ${f.b}. Postgres and Spark would throw an error.`,
    };
  },
  (c) => {
    const { f, L, T } = parts(c);
    return {
      type: "GROUP BY",
      title: "Aggregate in WHERE",
      task: `${L.a} values with at least 3 ${L.rows}, with their count.`,
      buggy: `SELECT ${f.a}, COUNT(*) AS n\nFROM ${T}\nWHERE COUNT(*) >= 3\nGROUP BY ${f.a}`,
      fixed: `SELECT ${f.a}, COUNT(*) AS n FROM ${T} GROUP BY ${f.a} HAVING COUNT(*) >= 3`,
      line: `HAVING COUNT(*) >= 3`,
      explain: "WHERE filters rows before grouping, so it can't see COUNT(*). Filter groups with HAVING.",
    };
  },
  (c) => {
    const { f, d, L, T, D } = parts(c);
    return {
      type: "JOIN duplicates",
      title: "Inflated count",
      task: `How many ${L.dimRows} have at least one ${L.row}?`,
      buggy: `SELECT COUNT(*)\nFROM ${D} d\nJOIN ${T} f ON f.${f.key} = d.${d.key}`,
      fixed: `SELECT COUNT(DISTINCT d.${d.key}) FROM ${D} d JOIN ${T} f ON f.${f.key} = d.${d.key}`,
      line: `SELECT COUNT(DISTINCT d.${d.key})`,
      explain: `The join makes one row per ${L.row}, so each ${L.dimRow} is counted many times. Count DISTINCT keys.`,
    };
  },
  (c) => {
    const { f, d, L, T, D } = parts(c);
    return {
      type: "JOIN duplicates",
      title: "Summed twice",
      task: `Total ${L.dm} across the ${L.dimRows} who have at least one ${L.row} (count each ${L.dimRow} once).`,
      buggy: `SELECT SUM(d.${d.dm})\nFROM ${D} d\nJOIN ${T} f ON f.${f.key} = d.${d.key}`,
      fixed: `SELECT SUM(${d.dm}) FROM ${D} WHERE ${d.key} IN (SELECT ${f.key} FROM ${T})`,
      line: `WHERE d.${d.key} IN (SELECT ${f.key} FROM ${T})`,
      explain: "Joining to a one-to-many table repeats the parent row. Summing a parent column after the join double counts. Filter with IN or EXISTS instead.",
    };
  },
  (c) => {
    const { f, d, L, T, D } = parts(c);
    return {
      type: "JOIN",
      title: "Phantom one",
      task: `Every ${L.dimRow} with their number of ${L.rows}, showing 0 when they have none.`,
      buggy: `SELECT d.${d.name}, COUNT(*) AS n\nFROM ${D} d\nLEFT JOIN ${T} f ON f.${f.key} = d.${d.key}\nGROUP BY d.${d.name}`,
      fixed: `SELECT d.${d.name}, COUNT(f.${f.id}) AS n FROM ${D} d LEFT JOIN ${T} f ON f.${f.key} = d.${d.key} GROUP BY d.${d.name}`,
      line: `COUNT(f.${f.id})`,
      explain: "With a LEFT JOIN, a parent with no matches still produces one row of NULLs. COUNT(*) counts that row; COUNT(f.id) skips NULLs.",
    };
  },
  (c) => {
    const { f, d, L, T, D } = parts(c);
    return {
      type: "JOIN",
      title: "Missing ON",
      task: `Total ${L.m} for each ${d.attr}.`,
      buggy: `SELECT d.${d.attr}, SUM(f.${f.m}) AS total\nFROM ${T} f\nJOIN ${D} d\nGROUP BY d.${d.attr}`,
      fixed: `SELECT d.${d.attr}, SUM(f.${f.m}) AS total FROM ${T} f JOIN ${D} d ON f.${f.key} = d.${d.key} GROUP BY d.${d.attr}`,
      line: `JOIN ${D} d ON f.${f.key} = d.${d.key}`,
      explain: "A JOIN without ON pairs every row with every row (a cross join), so totals explode.",
    };
  },
  (c) => {
    const { f, L, T } = parts(c);
    const day = c.rng.pick(c.engine.run(`SELECT DISTINCT ${f.date} FROM ${T}`).rows.map((r) => r[0] as string));
    const [y, m, dd] = day.split("-");
    return {
      type: "Dates",
      title: "Wrong date format",
      task: `How many ${L.rows} happened on ${Number(dd)}/${Number(m)}/${y}?`,
      buggy: `SELECT COUNT(*)\nFROM ${T}\nWHERE ${f.date} = '${dd}/${m}/${y}'`,
      fixed: `SELECT COUNT(*) FROM ${T} WHERE ${f.date} = ${q(day)}`,
      line: `WHERE ${f.date} = ${q(day)}`,
      explain: "Dates here are stored as ISO text: YYYY-MM-DD. A DD/MM/YYYY string never matches. Always compare in the stored format.",
    };
  },
  (c) => {
    const { f, L, T } = parts(c);
    const days = c.engine.run(`SELECT DISTINCT ${f.date} FROM ${T} ORDER BY 1`).rows.map((r) => r[0] as string);
    const day = days[Math.floor(days.length / 2)];
    const [y, m, dd] = day.split("-");
    return {
      type: "Dates",
      title: "Unpadded date",
      task: `How many ${L.rows} happened on or after ${day}?`,
      buggy: `SELECT COUNT(*)\nFROM ${T}\nWHERE ${f.date} >= '${y}-${Number(m)}-${Number(dd)}'`,
      fixed: `SELECT COUNT(*) FROM ${T} WHERE ${f.date} >= ${q(day)}`,
      line: `WHERE ${f.date} >= ${q(day)}`,
      explain: "Text dates compare character by character. '2026-3-5' sorts after '2026-03-31' because '3' > '0'. Keep leading zeros, or use real DATE types.",
    };
  },
  (c) => {
    const { f, L, T } = parts(c);
    return {
      type: "NULLs",
      title: "Equals NULL",
      task: `How many ${L.rows} have ${L.nulMissing}?`,
      buggy: `SELECT COUNT(*)\nFROM ${T}\nWHERE ${f.nul} = NULL`,
      fixed: `SELECT COUNT(*) FROM ${T} WHERE ${f.nul} IS NULL`,
      line: `WHERE ${f.nul} IS NULL`,
      explain: "NULL = NULL is not true. It is unknown, so the row is dropped. Use IS NULL.",
    };
  },
  (c) => {
    const { f, L, T } = parts(c);
    const present = c.engine.run(`SELECT DISTINCT ${f.nul} FROM ${T} WHERE ${f.nul} IS NOT NULL ORDER BY 1`).rows.map((r) => r[0] as string);
    const x = c.rng.pick(present);
    return {
      type: "NULLs",
      title: "Vanishing NULLs",
      task: `How many ${L.rows} did NOT use ${L.nul} '${x}'? Rows with ${L.nulMissing} count too.`,
      buggy: `SELECT COUNT(*)\nFROM ${T}\nWHERE ${f.nul} <> '${x}'`,
      fixed: `SELECT COUNT(*) FROM ${T} WHERE ${f.nul} IS NULL OR ${f.nul} <> ${q(x)}`,
      line: `WHERE ${f.nul} IS NULL OR ${f.nul} <> '${x}'`,
      explain: "NULL <> 'x' is unknown, not true, so NULL rows silently disappear. Handle them explicitly, or use COALESCE.",
    };
  },
  (c) => {
    const { f, L, T } = parts(c);
    return {
      type: "NULLs",
      title: "Undercount",
      task: `How many ${L.rows} are there in total?`,
      buggy: `SELECT COUNT(${f.nul})\nFROM ${T}`,
      fixed: `SELECT COUNT(*) FROM ${T}`,
      line: `SELECT COUNT(*)`,
      explain: "COUNT(column) skips NULLs. COUNT(*) counts rows.",
    };
  },
  (c) => {
    const { f, L, T } = parts(c);
    return {
      type: "Aggregates",
      title: "Integer division",
      task: `Average ${L.m2} per ${L.row}, rounded to 1 decimal.`,
      buggy: `SELECT SUM(${f.m2}) / COUNT(*)\nFROM ${T}`,
      fixed: `SELECT ROUND(AVG(${f.m2}), 1) FROM ${T}`,
      line: `SELECT ROUND(AVG(${f.m2}), 1)`,
      explain: "Integer divided by integer drops the decimals in SQLite and many engines. Use AVG(), or multiply by 1.0 first.",
    };
  },
  (c) => {
    const { f, L, T } = parts(c);
    return {
      type: "ORDER BY",
      title: "Upside-down top 3",
      task: `The 3 ${L.rows} with the highest ${L.m}, highest first: ${f.id} and ${f.m}.`,
      buggy: `SELECT ${f.id}, ${f.m}\nFROM ${T}\nORDER BY ${f.m}\nLIMIT 3`,
      fixed: `SELECT ${f.id}, ${f.m} FROM ${T} ORDER BY ${f.m} DESC LIMIT 3`,
      line: `ORDER BY ${f.m} DESC`,
      ordered: true,
      explain: "ORDER BY is ascending by default. Top-N needs DESC.",
      check: () => noTieAt(c.engine, `SELECT ${f.id}, ${f.m} FROM ${T} ORDER BY ${f.m} DESC`, 3),
    };
  },
];

export function generateBugs(c: GenCtx, count: number): SqlRound[] {
  const order = c.rng.shuffle(BUGS.map((_, i) => i));
  const out: SqlRound[] = [];
  const types = new Map<string, number>();
  for (const i of order) {
    if (out.length >= count) break;
    const b = BUGS[i](c);
    if ((types.get(b.type) ?? 0) >= 2) continue; // keep the mix varied
    if (b.check && !b.check()) continue;
    const r = makeSqlRound(
      c,
      { title: b.title, prompt: b.task, solution: b.fixed, starter: b.buggy, line: b.line, ordered: b.ordered, tag: b.type, explain: b.explain },
      1.5,
      { kind: "type", label: "Bug type", cost: 20, text: `Bug category: ${b.type}.` },
    );
    if (!r) continue;
    // The broken query must really be broken.
    const buggy = c.engine.tryRun(b.buggy);
    if (buggy && compareResults(r.expected, buggy, r.ordered).ok) continue;
    types.set(b.type, (types.get(b.type) ?? 0) + 1);
    out.push(r);
  }
  return out;
}
