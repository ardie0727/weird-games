// Generates many runs across days and seeds and checks every round is solvable
// by its own reference answer, and that generation is deterministic.
// Run: npm test
import initSqlJs from "sql.js";
import { addDays } from "../src/lib/dataset.ts";
import { gradeAnswer } from "../src/lib/game/grade.ts";
import { MODE_ORDER, MODES } from "../src/lib/game/modes.ts";
import { prepareRun, verifyRun } from "../src/lib/game/run.ts";
import type { AnswerValue, GameEvent, Round } from "../src/lib/game/types.ts";

const SQL = await initSqlJs();
let fails = 0;
let checked = 0;

function reference(r: Round): AnswerValue {
  switch (r.kind) {
    case "sql":
      return r.solution;
    case "choice":
      return r.correct[0];
    case "order":
      return r.steps.map((s) => s.id);
    case "pyorder":
      return r.tiles.map((t) => t.id);
    case "pyfill": {
      // the option whose result matches; at least one must
      return r.options.findIndex((_, i) => i >= 0);
    }
  }
}

const days = Array.from({ length: Number(process.env.DAYS ?? 24) }, (_, i) => addDays("2026-10-20", i));
for (const day of days) {
  for (const mode of MODE_ORDER) {
    for (const seed of [1, 77, 4242]) {
      let run;
      try {
        run = prepareRun(SQL, mode, day, seed);
      } catch (e) {
        fails++;
        console.log(`GEN FAIL ${mode} ${day} ${seed}:`, (e as Error).message);
        continue;
      }
      const want = mode === "blitz" ? 20 : MODES[mode].rounds;
      if (run.rounds.length < want) {
        fails++;
        console.log(`TOO FEW ${mode} ${day} ${seed}: ${run.rounds.length}`);
      }
      const again = prepareRun(SQL, mode, day, seed);
      if (JSON.stringify(again.rounds) !== JSON.stringify(run.rounds)) {
        fails++;
        console.log(`NONDETERMINISTIC ${mode} ${day} ${seed}`);
      }
      const events: GameEvent[] = [];
      let t = 0;
      run.rounds.forEach((r, i) => {
        checked++;
        let v = reference(r);
        if (r.kind === "pyfill") {
          v = r.options.findIndex((_, k) => gradeAnswer(run.engine, r, k).ok);
          if (v < 0) {
            fails++;
            console.log(`PYFILL UNSOLVABLE ${mode} ${day} ${r.title}\n${r.template}\n${r.options}`);
            return;
          }
        }
        const g = gradeAnswer(run.engine, r, v);
        if (!g.ok) {
          fails++;
          console.log(`REF FAIL ${mode} ${day} ${seed} [${r.kind}] ${r.title}: ${g.reason}`, r.kind === "sql" ? r.solution : "");
        }
        t += 5000;
        events.push({ k: "a", r: i, v, t });
      });
      if (mode !== "blitz") {
        const s = verifyRun(run, events);
        if (s.invalid || s.correct !== run.rounds.length) {
          fails++;
          console.log(`REPLAY FAIL ${mode} ${day}: ${s.invalid} correct=${s.correct}`);
        }
      }
      run.engine.close();
    }
  }
}
console.log(`${checked} rounds checked, ${fails} problems`);
process.exit(fails ? 1 : 0);
