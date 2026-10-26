import type { Cell, TableData } from "../dataset.ts";
import { Engine, type QueryResult, resultKey } from "../engine.ts";
import { type GenCtx, q } from "./ctx.ts";
import type { ChoiceRound } from "./types.ts";

type Col = "id" | "key" | "a" | "m" | "m2" | "nul";

interface PSpec {
  title: string;
  cols: Col[];
  nullM2?: boolean;
  join?: boolean;
  query: string;
  wrong: string[];
  ordered?: boolean;
  explain: string;
}

function canonical(r: QueryResult, ordered: boolean) {
  if (ordered) return resultKey(r);
  return JSON.stringify(JSON.parse(resultKey(r)).map((x: unknown) => JSON.stringify(x)).sort());
}

/** Pick 5 fact rows with a repeated category and a mix of NULL and non-NULL values. */
function pickRows(c: GenCtx): Cell[][] {
  const rows = c.ds.tables[0].rows;
  for (let tries = 0; tries < 60; tries++) {
    const s = c.rng.sample(rows, 5).sort((x, y) => (x[0] as number) - (y[0] as number));
    const as = s.map((r) => r[2]);
    const nul = s.filter((r) => r[7] === null).length;
    const ms = new Set(s.map((r) => r[4]));
    if (new Set(as).size < 5 && new Set(as).size > 1 && nul >= 1 && nul <= 3 && ms.size === 5) return s;
  }
  return rows.slice(0, 5);
}

const IDX: Record<Col, number> = { id: 0, key: 1, a: 2, m: 4, m2: 5, nul: 7 };

export function generatePredict(c: GenCtx, count: number): ChoiceRound[] {
  const th = c.ds.theme;
  const f = th.fact;
  const T = f.table;
  const specs: ((rows: Cell[][]) => PSpec)[] = [
    () => ({
      title: "COUNT(*) vs COUNT(col)",
      cols: ["id", "a", "nul"],
      query: `SELECT COUNT(*), COUNT(${f.nul})\nFROM ${T}`,
      wrong: [`SELECT COUNT(*), COUNT(*) FROM ${T}`, `SELECT COUNT(${f.nul}), COUNT(${f.nul}) FROM ${T}`, `SELECT COUNT(*), COUNT(*) - COUNT(${f.nul}) FROM ${T}`],
      explain: `COUNT(*) counts every row. COUNT(${f.nul}) skips NULLs.`,
    }),
    (rows) => {
      const x = rows.find((r) => r[7] !== null)![7] as string;
      return {
        title: "The NULL trap",
        cols: ["id", "a", "nul"],
        query: `SELECT ${f.id}\nFROM ${T}\nWHERE ${f.nul} <> ${q(x)}`,
        wrong: [
          `SELECT ${f.id} FROM ${T} WHERE ${f.nul} IS NULL OR ${f.nul} <> ${q(x)}`,
          `SELECT ${f.id} FROM ${T} WHERE ${f.nul} = ${q(x)}`,
          `SELECT ${f.id} FROM ${T} WHERE ${f.nul} IS NULL`,
        ],
        explain: `NULL <> '${x}' is unknown, not true, so NULL rows are filtered out too.`,
      };
    },
    () => ({
      title: "GROUP BY",
      cols: ["id", "a", "m"],
      query: `SELECT ${f.a}, SUM(${f.m})\nFROM ${T}\nGROUP BY ${f.a}`,
      wrong: [`SELECT ${f.a}, MAX(${f.m}) FROM ${T} GROUP BY ${f.a}`, `SELECT ${f.a}, COUNT(*) FROM ${T} GROUP BY ${f.a}`, `SELECT ${f.a}, ${f.m} FROM ${T}`],
      explain: "GROUP BY collapses each category into one row, and SUM adds up its values.",
    }),
    () => ({
      title: "ORDER + LIMIT",
      cols: ["id", "a", "m"],
      query: `SELECT ${f.id}, ${f.m}\nFROM ${T}\nORDER BY ${f.m} DESC\nLIMIT 2`,
      wrong: [`SELECT ${f.id}, ${f.m} FROM ${T} ORDER BY ${f.m} LIMIT 2`, `SELECT ${f.id}, ${f.m} FROM ${T} ORDER BY ${f.m} DESC LIMIT 3`, `SELECT ${f.id}, ${f.m} FROM ${T} ORDER BY ${f.id} DESC LIMIT 2`],
      ordered: true,
      explain: "Sort first, then LIMIT keeps the first rows.",
    }),
    () => ({
      title: "AVG and NULL",
      cols: ["id", "m2"],
      nullM2: true,
      query: `SELECT ROUND(AVG(${f.m2}), 1)\nFROM ${T}`,
      wrong: [`SELECT ROUND(SUM(${f.m2}) * 1.0 / COUNT(*), 1) FROM ${T}`, `SELECT ROUND(MAX(${f.m2}) * 1.0, 1) FROM ${T}`, `SELECT ROUND(SUM(${f.m2}) * 1.0 / 5 + 1, 1) FROM ${T}`],
      explain: "AVG ignores NULLs: it divides by the number of non-NULL values, not by the row count.",
    }),
    () => ({
      title: "LEFT JOIN count",
      cols: ["id", "key"],
      join: true,
      query: `SELECT d.${th.dim.name}, COUNT(f.${f.id})\nFROM ${th.dim.table} d\nLEFT JOIN ${T} f ON f.${f.key} = d.${th.dim.key}\nGROUP BY d.${th.dim.name}`,
      wrong: [
        `SELECT d.${th.dim.name}, COUNT(*) FROM ${th.dim.table} d LEFT JOIN ${T} f ON f.${f.key} = d.${th.dim.key} GROUP BY d.${th.dim.name}`,
        `SELECT d.${th.dim.name}, COUNT(f.${f.id}) FROM ${th.dim.table} d JOIN ${T} f ON f.${f.key} = d.${th.dim.key} GROUP BY d.${th.dim.name}`,
        `SELECT d.${th.dim.name}, 1 FROM ${th.dim.table} d`,
      ],
      explain: "LEFT JOIN keeps every row on the left. COUNT(f.id) gives 0 where nothing matched, while COUNT(*) would give 1.",
    }),
    () => ({
      title: "DISTINCT",
      cols: ["id", "a"],
      query: `SELECT DISTINCT ${f.a}\nFROM ${T}`,
      wrong: [`SELECT ${f.a} FROM ${T}`, `SELECT ${f.a} FROM ${T} GROUP BY ${f.a} HAVING COUNT(*) > 1`, `SELECT ${f.a} FROM ${T} GROUP BY ${f.a} HAVING COUNT(*) = 1`],
      explain: "DISTINCT removes duplicate rows. Each value appears once.",
    }),
    () => ({
      title: "HAVING",
      cols: ["id", "a"],
      query: `SELECT ${f.a}, COUNT(*)\nFROM ${T}\nGROUP BY ${f.a}\nHAVING COUNT(*) > 1`,
      wrong: [`SELECT ${f.a}, COUNT(*) FROM ${T} GROUP BY ${f.a}`, `SELECT ${f.a}, COUNT(*) FROM ${T} GROUP BY ${f.a} HAVING COUNT(*) = 1`, `SELECT ${f.a}, 2 FROM ${T} GROUP BY ${f.a}`],
      explain: "HAVING filters whole groups after they are counted.",
    }),
    (rows) => {
      const ms = rows.map((r) => r[4] as number).sort((x, y) => x - y);
      const t = ms[2];
      return {
        title: "CASE WHEN",
        cols: ["id", "m"],
        query: `SELECT ${f.id},\n  CASE WHEN ${f.m} > ${t} THEN 'high' ELSE 'low' END AS band\nFROM ${T}`,
        wrong: [
          `SELECT ${f.id}, CASE WHEN ${f.m} >= ${t} THEN 'high' ELSE 'low' END FROM ${T}`,
          `SELECT ${f.id}, CASE WHEN ${f.m} < ${t} THEN 'high' ELSE 'low' END FROM ${T}`,
          `SELECT ${f.id}, CASE WHEN ${f.m} > ${t} THEN 'low' ELSE 'high' END FROM ${T}`,
        ],
        explain: `Strictly greater than ${t}: the row equal to ${t} is 'low'.`,
      };
    },
    () => ({
      title: "COALESCE",
      cols: ["id", "nul"],
      query: `SELECT COALESCE(${f.nul}, 'none') AS v, COUNT(*)\nFROM ${T}\nGROUP BY v`,
      wrong: [`SELECT ${f.nul}, COUNT(${f.nul}) FROM ${T} GROUP BY ${f.nul}`, `SELECT COALESCE(${f.nul}, 'none'), 1 FROM ${T} GROUP BY ${f.nul}`, `SELECT ${f.nul}, COUNT(*) FROM ${T} WHERE ${f.nul} IS NOT NULL GROUP BY ${f.nul}`],
      explain: "COALESCE swaps NULL for a fallback value, so the NULLs form their own 'none' group.",
    }),
  ];

  const order = c.rng.shuffle(specs.map((_, i) => i));
  const out: ChoiceRound[] = [];
  for (const i of order) {
    if (out.length >= count) break;
    const rows = pickRows(c);
    const spec = specs[i](rows);
    const tables: TableData[] = [];
    const factCols = spec.cols;
    let factRows = rows.map((r) => factCols.map((k) => r[IDX[k]]));
    if (spec.nullM2) {
      const j = factCols.indexOf("m2");
      factRows[1][j] = null;
    }
    if (spec.join) {
      // 3 dimension rows; only 2 of them have matches.
      const dimSrc = c.ds.tables[1].rows.slice(0, 3);
      const keys = dimSrc.map((r) => r[0] as number);
      factRows = rows.slice(0, 4).map((r, k) => [r[0], keys[k % 2 === 0 ? 0 : 1]]);
      tables.push({
        name: th.dim.table,
        columns: [
          { name: th.dim.key, type: "INTEGER" },
          { name: th.dim.name, type: "TEXT" },
        ],
        rows: dimSrc.map((r) => [r[0], r[1]]),
      });
    }
    const full = c.ds.tables[0].columns;
    tables.unshift({ name: T, columns: factCols.map((k) => full[IDX[k]]), rows: factRows });

    const eng = Engine.create(c.SQL, tables);
    const right = eng.tryRun(spec.query);
    if (!right) {
      eng.close();
      continue;
    }
    const seen = new Set([canonical(right, !!spec.ordered)]);
    const opts: QueryResult[] = [right];
    for (const w of spec.wrong) {
      const r = eng.tryRun(w);
      if (!r) continue;
      const k = canonical(r, !!spec.ordered);
      if (seen.has(k)) continue;
      seen.add(k);
      // Show distractors with the same column names as the real query.
      opts.push({ columns: right.columns.length === r.columns.length ? right.columns : r.columns, rows: r.rows });
    }
    eng.close();
    if (opts.length < 3) continue;
    const shuffled = c.rng.shuffle(opts.map((_, k) => k));
    const options = shuffled.map((k) => ({ result: opts[k] }));
    const correct = [shuffled.indexOf(0)];
    const wrongIdx = shuffled.map((_, k) => k).filter((k) => k !== correct[0]);
    out.push({
      kind: "choice",
      title: spec.title,
      prompt: "What does this query return?",
      code: { lang: "sql", text: spec.query },
      mini: tables,
      options,
      correct,
      explain: spec.explain,
      hints: [{ kind: "elim", label: "Remove one", cost: 40, text: "One wrong answer is crossed out.", elim: c.rng.pick(wrongIdx) }],
    });
  }
  return out;
}
