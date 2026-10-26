// Keep the browser copy of the SQLite wasm in sync with the installed sql.js version.
import { copyFileSync, existsSync } from "node:fs";
const src = "node_modules/sql.js/dist/sql-wasm.wasm";
if (existsSync(src)) copyFileSync(src, "public/sql-wasm.wasm");
