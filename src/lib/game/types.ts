import type { TableData } from "../dataset.ts";
import type { QueryResult } from "../engine.ts";

export type ModeId = "blitz" | "bug" | "predict" | "pipeline" | "detective" | "duel";

export interface Hint {
  kind: "cols" | "rows" | "line" | "type" | "elim";
  label: string;
  cost: number;
  text: string;
  elim?: number; // option index removed by an "elim" hint
}

export interface CodeBlock {
  lang: "sql" | "python";
  text: string;
}

interface RoundBase {
  title: string;
  prompt: string;
  tag?: string;
  hints: Hint[];
  explain?: string;
  /** Detective: story text shown when the round opens. */
  clue?: string;
}

export interface SqlRound extends RoundBase {
  kind: "sql";
  starter: string;
  solution: string;
  expected: QueryResult;
  ordered: boolean;
  code?: CodeBlock; // shown above the editor (e.g. PySpark to translate)
  /** Detective: text revealed on solve; {answer} is replaced with the first cell. */
  reveal?: string;
}

export interface ChoiceRound extends RoundBase {
  kind: "choice";
  code?: CodeBlock;
  mini?: TableData[];
  options: { result?: QueryResult; code?: CodeBlock }[];
  correct: number[];
}

export interface OrderRound extends RoundBase {
  kind: "order";
  steps: { id: string; text: string; detail?: string; rank: number }[];
  start: string[]; // shuffled ids
}

export interface PyOrderRound extends RoundBase {
  kind: "pyorder";
  sql: string;
  head: string;
  tiles: { id: string; code: string }[];
  start: string[];
  expected: QueryResult;
  ordered: boolean;
}

export interface PyFillRound extends RoundBase {
  kind: "pyfill";
  sql: string;
  template: string; // contains ___
  options: string[];
  expected: QueryResult;
  ordered: boolean;
}

export type Round = SqlRound | ChoiceRound | OrderRound | PyOrderRound | PyFillRound;

/** What a player submits for a round. */
export type AnswerValue = string | number | string[];

export type GameEvent =
  | { k: "a"; r: number; v: AnswerValue; t: number }
  | { k: "h"; r: number; h: number; t: number }
  | { k: "s"; r: number; t: number };

export interface ModeConfig {
  id: ModeId;
  name: string;
  short: string;
  blurb: string;
  rules: string[];
  color: string;
  timeLimitMs: number;
  lives: number; // 0 = unlimited
  base: number;
  speedPts: number;
  speedMs: number;
  firstTryPts: number;
  firstTryTimeMs: number; // seconds added to the clock for a first-try answer
  maxBonusMs: number;
  wrongPenalty: number;
  rounds: number;
  skipLabel: string;
  minAnswerMs: number; // anti-bot: fastest plausible answer
}

export interface Verdict {
  ok: boolean;
  /** A query that failed to run. Free retry: does not cost a life or the first-try bonus. */
  error?: boolean;
  reason: string;
  result?: QueryResult;
  sql?: string; // SQL the PySpark translator produced
}
