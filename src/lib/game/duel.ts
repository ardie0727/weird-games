import { compareResults, type QueryResult } from "../engine.ts";
import { pysparkToSql } from "../pyspark.ts";
import { type GenCtx, noTieAt, q, sqlHints } from "./ctx.ts";
import type { ChoiceRound, PyFillRound, PyOrderRound, Round, SqlRound } from "./types.ts";

interface DuelTpl {
  id: string;
  title: string;
  task: string;
  sql: string;
  head: string;
  tiles: string[];
  ordered?: boolean;
  fills: { find: string; options: string[] }[];
  check?: () => boolean;
}

export function pyCode(head: string, tiles: string[]): string {
  return `result = (\n  ${head}\n    ${tiles.join("\n    ")}\n)`;
}

function templates(c: GenCtx): DuelTpl[] {
  const { fact: f, dim: d, label: L } = c.ds.theme;
  const T = f.table;
  const D = d.table;
  const x = c.rng.pick(c.ds.aValues);
  const y = c.rng.pick(c.ds.bValues);
  const ms = c.engine.run(`SELECT ${f.m} FROM ${T} ORDER BY 1`).rows.map((r) => r[0] as number);
  const t = ms[c.rng.int(7, 10)];
  return [
    {
      id: "filter_count",
      title: "Filter + count",
      task: `Count ${L.rows} where ${L.a} is '${x}'.`,
      sql: `SELECT COUNT(*)\nFROM ${T}\nWHERE ${f.a} = ${q(x)}`,
      head: T,
      tiles: [`.filter(F.col("${f.a}") == "${x}")`, `.count()`],
      fills: [{ find: ".filter(", options: ["filter", "where", "select", "groupBy"] }],
    },
    {
      id: "group_sum",
      title: "Group + sum",
      task: `Total ${L.m} per ${L.a}.`,
      sql: `SELECT ${f.a}, SUM(${f.m}) AS total\nFROM ${T}\nGROUP BY ${f.a}`,
      head: T,
      tiles: [`.groupBy("${f.a}")`, `.agg(F.sum("${f.m}").alias("total"))`],
      fills: [
        { find: "F.sum", options: ["F.sum", "F.count", "F.max", "F.avg"] },
        { find: ".groupBy(", options: ["groupBy", "orderBy", "select", "filter"] },
      ],
    },
    {
      id: "topn",
      title: "Top N",
      task: `Top 2 ${L.a} values by total ${L.m}, highest first.`,
      sql: `SELECT ${f.a}, SUM(${f.m}) AS total\nFROM ${T}\nGROUP BY ${f.a}\nORDER BY total DESC\nLIMIT 2`,
      head: T,
      tiles: [`.groupBy("${f.a}")`, `.agg(F.sum("${f.m}").alias("total"))`, `.orderBy(F.desc("total"))`, `.limit(2)`],
      ordered: true,
      fills: [{ find: "F.desc", options: ["F.desc", "F.asc", "F.col", "F.lit"] }],
      check: () => noTieAt(c.engine, `SELECT ${f.a}, SUM(${f.m}) AS total FROM ${T} GROUP BY ${f.a} ORDER BY total DESC`, 2),
    },
    {
      id: "filter_select",
      title: "Filter + select",
      task: `${f.id} and ${f.m} for ${L.rows} with ${L.m} above ${t}.`,
      sql: `SELECT ${f.id}, ${f.m}\nFROM ${T}\nWHERE ${f.m} > ${t}`,
      head: T,
      tiles: [`.filter(F.col("${f.m}") > ${t})`, `.select("${f.id}", "${f.m}")`],
      fills: [{ find: ` > ${t}`, options: [" > " + t, " < " + t, " == " + t, " >= " + t] }],
    },
    {
      id: "join_group",
      title: "Join + group",
      task: `Number of ${L.rows} per ${d.attr} (join ${D}).`,
      sql: `SELECT d.${d.attr}, COUNT(*) AS n\nFROM ${T} f\nJOIN ${D} d ON f.${f.key} = d.${d.key}\nGROUP BY d.${d.attr}`,
      head: T,
      tiles: [`.join(${D}, on="${f.key}", how="inner")`, `.groupBy("${d.attr}")`, `.agg(F.count("*").alias("n"))`],
      fills: [{ find: `how="inner"`, options: [`how="inner"`, `how="left_anti"`, `how="left"`, `how="left_semi"`] }],
    },
    {
      id: "null_count",
      title: "NULL filter",
      task: `Count ${L.rows} with ${L.nulMissing}.`,
      sql: `SELECT COUNT(*)\nFROM ${T}\nWHERE ${f.nul} IS NULL`,
      head: T,
      tiles: [`.filter(F.col("${f.nul}").isNull())`, `.count()`],
      fills: [{ find: ".isNull()", options: [".isNull()", ".isNotNull()", " == None", ".asc()"] }],
    },
    {
      id: "distinct",
      title: "Distinct values",
      task: `Every different ${L.b} value.`,
      sql: `SELECT DISTINCT ${f.b}\nFROM ${T}`,
      head: T,
      tiles: [`.select("${f.b}")`, `.distinct()`],
      fills: [{ find: ".distinct()", options: [".distinct()", ".dropDuplicates()", ".count()", ".limit(1)"] }],
    },
    {
      id: "anti",
      title: "Anti join",
      task: `${L.dimRows} with no ${L.rows} at all.`,
      sql: `SELECT ${d.name}\nFROM ${D}\nWHERE ${d.key} NOT IN (SELECT ${f.key} FROM ${T})`,
      head: D,
      tiles: [`.join(${T}, on="${f.key}", how="left_anti")`, `.select("${d.name}")`],
      fills: [{ find: `how="left_anti"`, options: [`how="left_anti"`, `how="inner"`, `how="left_semi"`, `how="left"`] }],
    },
    {
      id: "filter_group_avg",
      title: "Filter, group, average",
      task: `Average ${L.m2} per ${L.a} for ${L.b} '${y}', rounded to 1 decimal.`,
      sql: `SELECT ${f.a}, ROUND(AVG(${f.m2}), 1) AS avg_val\nFROM ${T}\nWHERE ${f.b} = ${q(y)}\nGROUP BY ${f.a}`,
      head: T,
      tiles: [`.filter(F.col("${f.b}") == "${y}")`, `.groupBy("${f.a}")`, `.agg(F.round(F.avg("${f.m2}"), 1).alias("avg_val"))`],
      fills: [{ find: "F.avg", options: ["F.avg", "F.sum", "F.max", "F.count"] }],
    },
  ];
}

function runPy(c: GenCtx, code: string): QueryResult | null {
  try {
    return c.engine.run(pysparkToSql(code, c.engine.tables.map((t) => t.name)));
  } catch {
    return null;
  }
}

function mutations(c: GenCtx, tp: DuelTpl): string[][] {
  const { fact: f } = c.ds.theme;
  const tiles = tp.tiles;
  const out: string[][] = [];
  const sub = (from: RegExp, to: string) => tiles.map((s) => s.replace(from, to));
  out.push(sub(/F\.sum|F\.avg/, "F.max"));
  out.push(sub(/F\.count\("\*"\)/, `F.max("${f.m}")`));
  out.push(sub(/F\.desc/, "F.asc"));
  out.push(sub(/==/, "!="));
  out.push(sub(/ > /, " < "));
  out.push(sub(/how="inner"/, 'how="left_anti"'));
  out.push(sub(/how="left_anti"/, 'how="left_semi"'));
  out.push(sub(/\.isNull\(\)/, ".isNotNull()"));
  if (tiles.length > 2) out.push(tiles.filter((_, i) => i !== 0));
  out.push(sub(new RegExp(`groupBy\\("${f.a}"\\)`), `groupBy("${f.b}")`));
  out.push(sub(new RegExp(`select\\("${f.b}"\\)`), `select("${f.a}")`));
  const other = c.ds.aValues.find((v) => !tiles.join("").includes(`"${v}"`));
  if (other) out.push(tiles.map((s) => s.replace(new RegExp(`== "(${c.ds.aValues.join("|")})"`), `== "${other}"`)));
  out.push([...tiles.slice(0, 1), ...tiles.slice(1).map((s) => s.replace(/\.count\(\)/, ".limit(1).count()"))]);
  out.push(sub(/\.distinct\(\)/, ".limit(2)"));
  out.push(sub(/\.limit\(2\)/, ".limit(3)"));
  return out.filter((m) => m.join() !== tiles.join());
}

export function generateDuel(c: GenCtx, count: number): Round[] {
  const all = templates(c).filter((tp) => !tp.check || tp.check());
  const valid = all.filter((tp) => {
    const sqlRes = c.engine.tryRun(tp.sql);
    const pyRes = runPy(c, `${tp.head}${tp.tiles.join("")}`);
    return sqlRes && pyRes && sqlRes.rows.length > 0 && compareResults(sqlRes, pyRes, !!tp.ordered).ok;
  });
  const orderable = c.rng.shuffle(valid.filter((tp) => tp.tiles.length >= 3));
  const rest = c.rng.shuffle(valid.filter((tp) => tp.tiles.length < 3));
  const kinds: ("fill" | "order" | "sql" | "choice")[] = ["fill", "order", "sql", "choice", "order", "fill"];
  const used = new Set<string>();
  const take = (pool: DuelTpl[], fallback: DuelTpl[]) => {
    const tp = pool.find((p) => !used.has(p.id)) ?? fallback.find((p) => !used.has(p.id)) ?? pool[0] ?? fallback[0];
    used.add(tp.id);
    return tp;
  };
  const rounds: Round[] = [];
  for (const kind of kinds.slice(0, count)) {
    const tp = kind === "order" ? take(orderable, rest) : take(rest, orderable);
    const expected = c.engine.run(tp.sql);
    const ordered = !!tp.ordered;
    const code = pyCode(tp.head, tp.tiles);
    if (kind === "order" && tp.tiles.length >= 2) {
      const tiles = tp.tiles.map((code, i) => ({ id: `t${i}`, code }));
      let start = c.rng.shuffle(tiles.map((t) => t.id));
      for (let k = 0; k < 8 && start.join() === tiles.map((t) => t.id).join(); k++) start = c.rng.shuffle(start);
      rounds.push({
        kind: "pyorder",
        title: `SQL → PySpark: ${tp.title}`,
        prompt: `${tp.task} Put the PySpark tiles in order so they match the SQL.`,
        sql: tp.sql,
        head: tp.head,
        tiles,
        start,
        expected,
        ordered,
        explain: `Any order that gives the same result passes. Reference:\n${code}`,
        hints: [{ kind: "line", label: "First tile", cost: 50, text: `First comes: ${tp.tiles[0]}` }],
      } satisfies PyOrderRound);
    } else if (kind === "fill") {
      const fill = c.rng.pick(tp.fills);
      const template = code.replace(fill.find, fill.find.startsWith(".") && fill.find.endsWith("(") ? ".___(" : "___");
      const options = c.rng.shuffle(fill.options);
      rounds.push({
        kind: "pyfill",
        title: `Fill the blank: ${tp.title}`,
        prompt: `${tp.task} Pick the tile that makes the PySpark match the SQL.`,
        sql: tp.sql,
        template,
        options,
        expected,
        ordered,
        explain: "Checked by result. If two tiles give the same rows, both count.",
        hints: [{ kind: "rows", label: "Row count", cost: 30, text: `The answer has ${expected.rows.length} row${expected.rows.length === 1 ? "" : "s"}.` }],
      } satisfies PyFillRound);
    } else if (kind === "sql") {
      rounds.push({
        kind: "sql",
        title: `PySpark → SQL: ${tp.title}`,
        prompt: "Write the SQL that returns the same result as this PySpark.",
        code: { lang: "python", text: code },
        starter: `SELECT \nFROM ${tp.head}\n`,
        solution: tp.sql,
        expected,
        ordered,
        explain: `One answer:\n${tp.sql}`,
        hints: sqlHints(expected, tp.sql.split("\n").slice(-1)[0]),
      } satisfies SqlRound);
    } else {
      const seen = new Set<string>();
      const opts: string[][] = [];
      const add = (tiles: string[]) => {
        const r = runPy(c, `${tp.head}${tiles.join("")}`);
        if (!r) return;
        const ok = compareResults(expected, r, ordered).ok;
        const key = ok ? "OK" : JSON.stringify(r.rows);
        if (seen.has(key)) return;
        seen.add(key);
        opts.push(tiles);
      };
      add(tp.tiles);
      for (const m of c.rng.shuffle(mutations(c, tp))) if (opts.length < 4) add(m);
      const shuffled = c.rng.shuffle(opts.map((_, i) => i));
      const options = shuffled.map((i) => ({ code: { lang: "python" as const, text: pyCode(tp.head, opts[i]) } }));
      rounds.push({
        kind: "choice",
        title: `Which PySpark? ${tp.title}`,
        prompt: "Which PySpark returns the same result as this SQL?",
        code: { lang: "sql", text: tp.sql },
        options,
        correct: [shuffled.indexOf(0)],
        explain: "Read each chain step by step: filter, group, aggregate, order, limit.",
        hints: opts.length > 2 ? [{ kind: "elim", label: "Remove one", cost: 40, text: "One wrong answer is crossed out.", elim: shuffled.findIndex((i) => i !== 0) }] : [],
      } satisfies ChoiceRound);
    }
  }
  return rounds;
}
