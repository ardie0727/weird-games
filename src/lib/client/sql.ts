"use client";

import type { SqlJsStatic } from "sql.js";

let p: Promise<SqlJsStatic> | null = null;

/** Load SQLite (sql.js, about 650 KB of wasm) once per page. */
export function loadSql(): Promise<SqlJsStatic> {
  if (!p) {
    p = import("sql.js").then((m) => {
      const init = (m as unknown as { default: (cfg: object) => Promise<SqlJsStatic> }).default ?? m;
      return (init as (cfg: object) => Promise<SqlJsStatic>)({ locateFile: () => "/sql-wasm.wasm" });
    });
    p.catch(() => (p = null));
  }
  return p;
}
