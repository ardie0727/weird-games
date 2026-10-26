import type { SqlJsStatic } from "sql.js";
import { buildDataset, type Dataset, type TableData } from "../dataset.ts";
import { Engine } from "../engine.ts";
import { Rng, hashStr } from "../rng.ts";
import { generateBlitz } from "./blitz.ts";
import { generateBugs } from "./bug.ts";
import { generateDetective } from "./detective.ts";
import { generateDuel } from "./duel.ts";
import { gradeAnswer } from "./grade.ts";
import { MODES } from "./modes.ts";
import { generatePipeline } from "./pipeline.ts";
import { generatePredict } from "./predict.ts";
import { replay } from "./reducer.ts";
import type { GameEvent, ModeId, Round } from "./types.ts";

export interface PreparedRun {
  mode: ModeId;
  day: string;
  seed: number;
  ds: Dataset;
  engine: Engine;
  rounds: Round[];
  story?: { title: string; intro: string; outro: string };
}

/** Build the dataset, engine and rounds for a run. Same inputs always give the same run. */
export function prepareRun(SQL: SqlJsStatic, mode: ModeId, day: string, seed: number): PreparedRun {
  const ds = buildDataset(day);
  const rng = new Rng(hashStr(`${mode}:${day}:${seed}`));
  let tables: TableData[] = ds.tables;
  let story: PreparedRun["story"];
  let kase: ReturnType<typeof generateDetective.plant>["kase"] | undefined;
  if (mode === "detective") {
    const c = generateDetective.plant(ds, rng);
    tables = c.tables;
    story = c.story;
    kase = c.kase;
  }
  const engine = Engine.create(SQL, tables);
  const ctx = { ds, rng, engine, SQL };
  const n = MODES[mode].rounds;
  let rounds: Round[];
  switch (mode) {
    case "blitz":
      rounds = generateBlitz(ctx, n);
      break;
    case "bug":
      rounds = generateBugs(ctx, n);
      break;
    case "predict":
      rounds = generatePredict(ctx, n);
      break;
    case "pipeline":
      rounds = generatePipeline(ctx, n);
      break;
    case "detective":
      rounds = generateDetective.rounds(ctx, kase!);
      break;
    case "duel":
      rounds = generateDuel(ctx, n);
      break;
  }
  return { mode, day, seed, ds, engine, rounds, story };
}

/** Server-side: replay a submitted event log with fresh grading and return the verified state. */
export function verifyRun(run: PreparedRun, events: GameEvent[]) {
  const cfg = MODES[run.mode];
  return replay(cfg, run.rounds, events, (round, ev) => gradeAnswer(run.engine, round, ev.v));
}
