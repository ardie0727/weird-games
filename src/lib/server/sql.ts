import path from "node:path";
import initSqlJs, { type SqlJsStatic } from "sql.js";

let p: Promise<SqlJsStatic> | null = null;

/** sql.js on the server, so every submitted answer is re-run before a score is saved. */
export function getServerSql(): Promise<SqlJsStatic> {
  if (!p) {
    const dir = path.join(process.cwd(), "node_modules", "sql.js", "dist");
    p = initSqlJs({ locateFile: (f: string) => path.join(dir, f) });
    p.catch(() => (p = null));
  }
  return p;
}
