import type { GenCtx } from "./ctx.ts";
import type { OrderRound } from "./types.ts";

interface Puzzle {
  title: string;
  prompt: string;
  explain: string;
  // Steps listed in a correct order. Steps sharing a rank may be swapped.
  steps: { text: string; detail?: string; rank?: number }[];
}

function puzzles(c: GenCtx): Puzzle[] {
  const { fact: f, dim: d, label: L } = c.ds.theme;
  const T = f.table;
  return [
    {
      title: "Medallion: raw to Gold",
      prompt: `Turn raw ${L.rows} files into a Gold table of ${L.m} per ${L.a}.`,
      explain: "Bronze lands raw data untouched. Silver cleans it: duplicates out, dates fixed, keys valid. Gold aggregates for the business.",
      steps: [
        { text: `Land raw ${T}.csv in Bronze`, detail: "as-is, plus load time", rank: 1 },
        { text: "Drop duplicate rows", detail: `on ${f.id}`, rank: 2 },
        { text: "Fix date formats", detail: `parse ${f.date} to DATE`, rank: 2 },
        { text: "Drop rows with missing keys", detail: `${f.key} IS NULL`, rank: 2 },
        { text: `Save Silver ${T}`, rank: 3 },
        { text: `Gold: SUM(${f.m}) by ${f.a}`, rank: 4 },
        { text: "Publish to the dashboard", rank: 5 },
      ],
    },
    {
      title: "SQL execution order",
      prompt: "The engine doesn't run a SELECT top to bottom. Put the clauses in the order they actually execute.",
      explain: "FROM/JOIN build the rows, WHERE filters rows, GROUP BY and HAVING work on groups, SELECT computes columns, then ORDER BY and LIMIT. That's why WHERE can't use a SELECT alias in most engines.",
      steps: [
        { text: "FROM", detail: T },
        { text: "JOIN", detail: `${d.table} ON ${f.key}` },
        { text: "WHERE", detail: "filter rows" },
        { text: "GROUP BY", detail: f.a },
        { text: "HAVING", detail: "filter groups" },
        { text: "SELECT", detail: "compute columns" },
        { text: "ORDER BY", detail: "sort" },
        { text: "LIMIT", detail: "top N" },
      ],
    },
    {
      title: "PySpark job",
      prompt: `Order the steps of a PySpark job that writes daily ${L.m} totals.`,
      explain: "Read, clean, transform, aggregate, write. Spark is lazy: nothing runs until the write (an action) is called.",
      steps: [
        { text: "spark.read.csv(...)", detail: "read raw files" },
        { text: ".dropDuplicates()", detail: "remove repeats", rank: 2 },
        { text: ".withColumn(to_date(...))", detail: "fix dates", rank: 2 },
        { text: `.filter(col("${f.m}") > 0)`, detail: "drop bad rows", rank: 2 },
        { text: `.groupBy("${f.date}")`, detail: "group per day", rank: 3 },
        { text: `.agg(sum("${f.m}"))`, detail: "total", rank: 4 },
        { text: ".write.parquet(...)", detail: "action: the job runs now", rank: 5 },
      ],
    },
    {
      title: "Incremental load",
      prompt: `Load only new ${L.rows} each night without double counting.`,
      explain: "Read the watermark, pull only newer rows, dedupe, MERGE (upsert) into the target, then move the watermark. Moving the watermark last means a failed run can safely retry.",
      steps: [
        { text: "Read last watermark", detail: `max ${f.date} loaded` },
        { text: "Extract rows newer than watermark" },
        { text: "Deduplicate the batch", detail: `on ${f.id}` },
        { text: "MERGE into target", detail: "update or insert" },
        { text: "Update watermark", detail: "only after success" },
      ],
    },
    {
      title: "Latest row per key",
      prompt: `Keep only the latest ${L.row} for each ${L.dimRow} using a window function.`,
      explain: "Partition by the key, order newest first, number the rows, keep row 1.",
      steps: [
        { text: `PARTITION BY ${f.key}` },
        { text: `ORDER BY ${f.date} DESC` },
        { text: "ROW_NUMBER() AS rn" },
        { text: "WHERE rn = 1", detail: "in an outer query" },
      ],
    },
    {
      title: "SCD Type 2",
      prompt: `A ${L.dimRow}'s ${d.attr} changed. Keep history the SCD Type 2 way.`,
      explain: "Detect the change, close the current row, insert the new version as current. History is never overwritten.",
      steps: [
        { text: "Compare incoming vs current rows", detail: `on ${d.key}` },
        { text: "Find changed rows", detail: `${d.attr} differs` },
        { text: "Expire old row", detail: "set end_date, is_current = false" },
        { text: "Insert new version", detail: "start_date = today, is_current = true" },
      ],
    },
    {
      title: "Data quality gate",
      prompt: "Order the checks before data reaches the Gold layer.",
      explain: "Cheap structural checks first, then content checks, then business rules. Fail fast and quarantine bad rows instead of silently dropping them.",
      steps: [
        { text: "Check the file arrived", detail: "not empty" },
        { text: "Validate the schema", detail: "columns and types" },
        { text: "Null checks on keys", rank: 3 },
        { text: "Uniqueness check", detail: f.id, rank: 3 },
        { text: "Business rules", detail: `${f.m} >= 0`, rank: 4 },
        { text: "Quarantine failures, load the rest", rank: 5 },
      ],
    },
    {
      title: "Star schema build",
      prompt: "Build a tiny star schema for reporting.",
      explain: "Dimensions load before facts, so facts can look up surrogate keys. Then build aggregates.",
      steps: [
        { text: "Stage source extracts" },
        { text: `Load dimension ${d.table}`, rank: 2 },
        { text: "Load dimension date", rank: 2 },
        { text: `Load fact ${T} with key lookups`, rank: 3 },
        { text: "Build aggregate tables", rank: 4 },
      ],
    },
  ];
}

export function generatePipeline(c: GenCtx, count: number): OrderRound[] {
  const all = puzzles(c);
  // The medallion puzzle always comes first: it is the heart of the mode.
  const picks = [all[0], ...c.rng.sample(all.slice(1), count - 1)];
  return picks.map((p, pi) => {
    let rank = 0;
    const steps = p.steps.map((s, i) => {
      rank = s.rank ?? rank + 1;
      return { id: `p${pi}s${i}`, text: s.text, detail: s.detail, rank };
    });
    let start = c.rng.shuffle(steps.map((s) => s.id));
    // Never hand out an already-solved order.
    for (let k = 0; k < 10; k++) {
      const ranks = start.map((id) => steps.find((s) => s.id === id)!.rank);
      if (!ranks.every((r, i) => i === 0 || r >= ranks[i - 1])) break;
      start = c.rng.shuffle(start);
    }
    return {
      kind: "order",
      title: p.title,
      prompt: p.prompt,
      explain: p.explain,
      steps,
      start,
      hints: [
        { kind: "line", label: "First step", cost: 50, text: `Starts with: ${steps[0].text}` },
        { kind: "line", label: "Last step", cost: 50, text: `Ends with: ${steps[steps.length - 1].text}` },
      ],
    } satisfies OrderRound;
  });
}
