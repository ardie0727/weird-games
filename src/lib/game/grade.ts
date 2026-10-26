import { compareResults, Engine, type QueryResult, SqlError } from "../engine.ts";
import { PyError, pysparkToSql } from "../pyspark.ts";
import type { AnswerValue, Round, Verdict } from "./types.ts";

export function assemblePyOrder(head: string, tiles: { id: string; code: string }[], order: string[]): string {
  const byId = new Map(tiles.map((t) => [t.id, t.code]));
  return [head, ...order.map((id) => byId.get(id) ?? "")].join("\n    ");
}

function gradePy(engine: Engine, code: string, expected: QueryResult, ordered: boolean): Verdict {
  let sql: string;
  try {
    sql = pysparkToSql(code, engine.tables.map((t) => t.name));
  } catch (e) {
    return { ok: false, reason: e instanceof PyError ? e.message : "That PySpark doesn't translate." };
  }
  try {
    const result = engine.run(sql);
    const v = compareResults(expected, result, ordered);
    return { ok: v.ok, reason: v.reason, result, sql };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Couldn't run.", sql };
  }
}

/** Grade one answer. Shared by the browser (instant feedback) and the server (score verification). */
export function gradeAnswer(engine: Engine, round: Round, v: AnswerValue): Verdict {
  switch (round.kind) {
    case "sql": {
      if (typeof v !== "string") return { ok: false, error: true, reason: "Type a query." };
      try {
        const result = engine.run(v);
        const c = compareResults(round.expected, result, round.ordered);
        return { ok: c.ok, reason: c.reason, result };
      } catch (e) {
        return { ok: false, error: true, reason: e instanceof SqlError ? e.message : "Query failed." };
      }
    }
    case "choice": {
      const i = Number(v);
      if (!Number.isInteger(i) || i < 0 || i >= round.options.length) return { ok: false, error: true, reason: "Pick an option." };
      return round.correct.includes(i) ? { ok: true, reason: "Correct prediction." } : { ok: false, reason: "Not this one." };
    }
    case "order": {
      if (!Array.isArray(v) || v.length !== round.steps.length) return { ok: false, error: true, reason: "Place every step." };
      const rank = new Map(round.steps.map((s) => [s.id, s.rank]));
      if (new Set(v).size !== v.length || v.some((id) => !rank.has(id))) return { ok: false, error: true, reason: "Unknown steps." };
      const ranks = v.map((id) => rank.get(id)!);
      const ok = ranks.every((r, i) => i === 0 || r >= ranks[i - 1]);
      if (ok) return { ok: true, reason: "Pipeline runs clean." };
      const sorted = ranks.slice().sort((a, b) => a - b);
      const inPlace = ranks.filter((r, i) => r === sorted[i]).length;
      return { ok: false, reason: `${inPlace} of ${ranks.length} steps are in the right spot.` };
    }
    case "pyorder": {
      if (!Array.isArray(v) || v.length !== round.tiles.length || new Set(v).size !== v.length) return { ok: false, error: true, reason: "Use every tile once." };
      return gradePy(engine, assemblePyOrder(round.head, round.tiles, v), round.expected, round.ordered);
    }
    case "pyfill": {
      const i = Number(v);
      if (!Number.isInteger(i) || i < 0 || i >= round.options.length) return { ok: false, error: true, reason: "Pick a tile." };
      return gradePy(engine, round.template.replace("___", round.options[i]), round.expected, round.ordered);
    }
  }
}
