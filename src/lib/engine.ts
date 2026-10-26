import type { Database, SqlJsStatic } from "sql.js";
import type { Cell, TableData } from "./dataset.ts";

export interface QueryResult {
  columns: string[];
  rows: Cell[][];
}

export class SqlError extends Error {}

const MAX_SQL = 1200;
const MAX_ROWS = 300;

/** Strip comments and a trailing semicolon, and refuse anything that is not one read-only query. */
export function cleanSql(raw: string): string {
  if (raw.length > MAX_SQL) throw new SqlError("Query is too long for this round.");
  let sql = raw.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").trim();
  sql = sql.replace(/;\s*$/, "").trim();
  if (!sql) throw new SqlError("Type a query first.");
  // A semicolon outside a string literal means a second statement.
  let inStr = false;
  for (const ch of sql) {
    if (ch === "'") inStr = !inStr;
    else if (ch === ";" && !inStr) throw new SqlError("One query at a time, please.");
  }
  if (!/^\s*(select|with)\b/i.test(sql)) throw new SqlError("Only SELECT queries are allowed in the arcade.");
  if (/\brecursive\b/i.test(sql)) throw new SqlError("Recursive queries are switched off here.");
  if (/\b(attach|pragma|insert|update|delete|drop|create|alter|replace|vacuum)\b/i.test(sql.replace(/'[^']*'/g, "''")))
    throw new SqlError("Read-only arcade: no changing the tables.");
  return sql;
}

export class Engine {
  db: Database;
  tables: TableData[];
  constructor(db: Database, tables: TableData[]) {
    this.db = db;
    this.tables = tables;
  }

  static create(SQL: SqlJsStatic, tables: TableData[]): Engine {
    const db = new SQL.Database();
    for (const t of tables) {
      db.run(`CREATE TABLE ${t.name} (${t.columns.map((c) => `${c.name} ${c.type}`).join(", ")})`);
      const stmt = db.prepare(`INSERT INTO ${t.name} VALUES (${t.columns.map(() => "?").join(",")})`);
      for (const r of t.rows) stmt.run(r as (string | number | null)[]);
      stmt.free();
    }
    db.run("PRAGMA query_only = ON");
    return new Engine(db, tables);
  }

  /** Run a player's query. Throws SqlError with a friendly message on any problem. */
  run(raw: string): QueryResult {
    const sql = cleanSql(raw);
    const tableRefs = sql.match(new RegExp(`\\b(${this.tables.map((t) => t.name).join("|")})\\b`, "gi"))?.length ?? 0;
    if (tableRefs > 6) throw new SqlError("Too many table references for a tiny arcade table.");
    let stmt;
    try {
      stmt = this.db.prepare(sql);
    } catch (e) {
      throw new SqlError(prettyError(e));
    }
    try {
      const columns = stmt.getColumnNames();
      const rows: Cell[][] = [];
      while (stmt.step()) {
        rows.push(stmt.get() as Cell[]);
        if (rows.length >= MAX_ROWS) break;
      }
      return { columns, rows };
    } catch (e) {
      throw new SqlError(prettyError(e));
    } finally {
      stmt.free();
    }
  }

  /** Run a query and return null instead of throwing. */
  tryRun(sql: string): QueryResult | null {
    try {
      return this.run(sql);
    } catch {
      return null;
    }
  }

  close() {
    this.db.close();
  }
}

function prettyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/^SQLITE_ERROR:\s*/i, "").replace(/^Error:\s*/, "");
}

const TOL = 0.051; // lets "rounded to 1 decimal" and exact answers both pass

function cellEq(x: Cell, y: Cell): boolean {
  if (x === null || y === null) return x === y;
  if (typeof x === "number" && typeof y === "number") return Math.abs(x - y) <= TOL;
  const nx = typeof x === "number" ? x : Number(x);
  const ny = typeof y === "number" ? y : Number(y);
  if ((typeof x === "number" || typeof y === "number") && !Number.isNaN(nx) && !Number.isNaN(ny) && String(x).trim() !== "" && String(y).trim() !== "")
    return Math.abs(nx - ny) <= TOL;
  return String(x).trim().toLowerCase() === String(y).trim().toLowerCase();
}

function rowEq(a: Cell[], b: Cell[]): boolean {
  return a.length === b.length && a.every((c, i) => cellEq(c, b[i]));
}

function permutations(n: number): number[][] {
  if (n <= 1) return [[0].slice(0, n)];
  const out: number[][] = [];
  for (const p of permutations(n - 1)) for (let i = 0; i <= p.length; i++) out.push([...p.slice(0, i), n - 1, ...p.slice(i)]);
  return out;
}

function rowsMatch(exp: Cell[][], act: Cell[][], ordered: boolean): boolean {
  if (exp.length !== act.length) return false;
  if (ordered) return exp.every((r, i) => rowEq(r, act[i]));
  const used = new Array(act.length).fill(false);
  for (const r of exp) {
    const j = act.findIndex((a, k) => !used[k] && rowEq(r, a));
    if (j < 0) return false;
    used[j] = true;
  }
  return true;
}

export interface Verdict {
  ok: boolean;
  reason: string;
}

/**
 * Compare results, not query text. Column names and (for up to 4 columns) column
 * order are ignored; row order only matters when the question asks for it.
 */
export function compareResults(expected: QueryResult, actual: QueryResult, ordered = false): Verdict {
  const ec = expected.columns.length;
  const ac = actual.columns.length;
  if (ec !== ac) return { ok: false, reason: `Expected ${ec} column${ec === 1 ? "" : "s"}, you returned ${ac}.` };
  if (expected.rows.length !== actual.rows.length)
    return { ok: false, reason: `Expected ${expected.rows.length} row${expected.rows.length === 1 ? "" : "s"}, you returned ${actual.rows.length}.` };
  const perms = ec <= 4 ? permutations(ec) : [Array.from({ length: ec }, (_, i) => i)];
  for (const p of perms) {
    const permuted = actual.rows.map((r) => p.map((i) => r[i]));
    if (rowsMatch(expected.rows, permuted, ordered)) return { ok: true, reason: "Result matches." };
  }
  if (ordered) {
    for (const p of perms) {
      const permuted = actual.rows.map((r) => p.map((i) => r[i]));
      if (rowsMatch(expected.rows, permuted, false)) return { ok: false, reason: "Right rows, wrong order. Check your ORDER BY." };
    }
  }
  return { ok: false, reason: "Same shape, but the values are different." };
}

export function resultKey(r: QueryResult): string {
  return JSON.stringify(r.rows.map((row) => row.map((c) => (typeof c === "number" ? Math.round(c * 10) / 10 : c))));
}
