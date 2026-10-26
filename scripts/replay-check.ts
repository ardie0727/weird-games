// Replays a browser event log on the "server" side and compares scores.
import initSqlJs from "sql.js";
import { readFileSync } from "node:fs";
import { prepareRun, verifyRun } from "../src/lib/game/run.ts";
const SQL = await initSqlJs();
for (const f of process.argv.slice(2)) {
  const d = JSON.parse(readFileSync(f, "utf8"));
  const run = prepareRun(SQL, d.mode, d.day, d.seed);
  const s = verifyRun(run, d.events);
  console.log(d.mode, "browser", d.score, "server", s.score, s.invalid ?? "", s.score === d.score ? "MATCH" : "MISMATCH");
}
