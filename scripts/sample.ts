import initSqlJs from "sql.js";
import { prepareRun } from "../src/lib/game/run.ts";
const SQL = await initSqlJs();
for (const mode of ["blitz","bug","detective","duel","predict"] as const) {
  const r = prepareRun(SQL, mode, process.argv[2] ?? "2026-10-26", 5);
  console.log("=====", mode, r.ds.theme.id, r.rounds.length, r.story?.title ?? "");
  for (const x of r.rounds.slice(0, mode==="blitz"?12:8)) {
    const any = x as any;
    console.log(`- [${x.kind}] ${x.title}: ${x.prompt}`);
    if (x.kind==="sql") console.log("   sol:", any.solution.replace(/\n/g," "), "=>", JSON.stringify(any.expected.rows).slice(0,80));
    if (x.kind==="choice") console.log("   opts:", any.options.length, "correct", any.correct);
    if (x.kind==="pyfill") console.log("   ", any.template.replace(/\n/g," "), any.options);
  }
}
