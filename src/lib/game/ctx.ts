import type { SqlJsStatic } from "sql.js";
import type { Dataset } from "../dataset.ts";
import { Engine, type QueryResult } from "../engine.ts";
import { Rng } from "../rng.ts";
import type { Hint, SqlRound } from "./types.ts";

export interface GenCtx {
  ds: Dataset;
  rng: Rng;
  engine: Engine;
  SQL: SqlJsStatic;
}

export const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

export function must(engine: Engine, sql: string): QueryResult {
  return engine.run(sql);
}

export function sqlHints(expected: QueryResult, line: string, scale = 1, extra?: Hint): Hint[] {
  const hints: Hint[] = [
    { kind: "cols", label: "Columns", cost: Math.round(30 * scale), text: `Return ${expected.columns.length} column${expected.columns.length === 1 ? "" : "s"}: ${expected.columns.join(", ")}` },
    { kind: "rows", label: "Row count", cost: Math.round(30 * scale), text: `The answer has ${expected.rows.length} row${expected.rows.length === 1 ? "" : "s"}.` },
    { kind: "line", label: "One line", cost: Math.round(60 * scale), text: line },
  ];
  if (extra) hints.unshift(extra);
  return hints;
}

export interface SqlSpec {
  title: string;
  prompt: string;
  solution: string;
  starter: string;
  line: string;
  ordered?: boolean;
  tag?: string;
  explain?: string;
  /** Return false to reject this instance (ties, empty answers, etc.). */
  check?: (r: QueryResult) => boolean;
}

export function makeSqlRound(c: GenCtx, spec: SqlSpec, hintScale = 1, extraHint?: Hint): SqlRound | null {
  const expected = c.engine.tryRun(spec.solution);
  if (!expected || expected.rows.length === 0) return null;
  if (spec.check && !spec.check(expected)) return null;
  return {
    kind: "sql",
    title: spec.title,
    prompt: spec.prompt,
    tag: spec.tag,
    explain: spec.explain,
    starter: spec.starter,
    solution: spec.solution,
    expected,
    ordered: !!spec.ordered,
    hints: sqlHints(expected, spec.line, hintScale, extraHint),
  };
}

/** True when the top `n` values of column `col` are strictly separated from the rest (no ties at the cut). */
export function noTieAt(engine: Engine, sql: string, n: number, col = 1): boolean {
  const r = engine.tryRun(sql);
  if (!r) return false;
  if (r.rows.length <= n) return r.rows.length > 0 && (n < 2 || r.rows.slice(0, n).every((row, i, a) => i === 0 || row[col] !== a[i - 1][col]));
  for (let i = 1; i <= n; i++) if (r.rows[i][col] === r.rows[i - 1][col]) return false;
  return true;
}

export function rngFor(seed: number, label: string) {
  return new Rng((seed ^ hashLabel(label)) >>> 0);
}
function hashLabel(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}
