import type { GameEvent, ModeConfig, Round, Verdict } from "./types.ts";

// One pure state machine scores every mode. The browser runs it live; the
// server replays the same event log with its own grading to verify a score.

export interface Feedback {
  ok: boolean;
  error?: boolean;
  reason: string;
  points?: number;
  mult?: number;
  bonusMs?: number;
  round: number;
  t: number;
  sql?: string;
}

export interface GameState {
  i: number; // current round
  roundStart: number;
  score: number;
  combo: number;
  maxCombo: number;
  lives: number;
  correct: number;
  wrong: number;
  skipped: number;
  firstTries: number;
  hintsUsed: number;
  roundHints: number[];
  firstTry: boolean;
  bonusMs: number;
  over: boolean;
  overReason: "" | "time" | "lives" | "done" | "quit";
  lastT: number;
  outcomes: ("ok" | "skip" | "miss")[];
  feedback: Feedback | null;
  invalid: string | null;
}

export function initState(cfg: ModeConfig): GameState {
  return {
    i: 0,
    roundStart: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    lives: cfg.lives,
    correct: 0,
    wrong: 0,
    skipped: 0,
    firstTries: 0,
    hintsUsed: 0,
    roundHints: [],
    firstTry: true,
    bonusMs: 0,
    over: false,
    overReason: "",
    lastT: 0,
    outcomes: [],
    feedback: null,
    invalid: null,
  };
}

export function comboMult(combo: number): number {
  return 1 + Math.min(4, Math.floor(combo / 2));
}

export function deadline(cfg: ModeConfig, s: GameState): number {
  return cfg.timeLimitMs + s.bonusMs;
}

function advance(s: GameState, rounds: Round[], t: number) {
  s.i += 1;
  s.roundStart = t;
  s.firstTry = true;
  s.roundHints = [];
  if (s.i >= rounds.length) {
    s.over = true;
    s.overReason = "done";
  }
}

export type Grader = (round: Round, value: GameEvent & { k: "a" }) => Verdict;

export function applyEvent(cfg: ModeConfig, rounds: Round[], prev: GameState, ev: GameEvent, grade: Grader): GameState {
  if (prev.over || prev.invalid) return prev;
  const s: GameState = { ...prev, roundHints: prev.roundHints.slice(), outcomes: prev.outcomes.slice(), feedback: null };
  const bad = (why: string) => ({ ...s, invalid: why, over: true });

  if (!Number.isFinite(ev.t) || ev.t < s.lastT) return bad("Events out of order.");
  if (ev.r !== s.i) return bad("Answer for the wrong round.");
  if (ev.t > deadline(cfg, s)) {
    s.over = true;
    s.overReason = "time";
    return s;
  }
  s.lastT = ev.t;
  const round = rounds[s.i];

  if (ev.k === "h") {
    const hint = round.hints[ev.h];
    if (!hint || s.roundHints.includes(ev.h)) return s;
    s.roundHints.push(ev.h);
    s.hintsUsed += 1;
    s.score = Math.max(0, s.score - hint.cost);
    s.combo = 0;
    s.firstTry = false;
    return s;
  }

  if (ev.k === "s") {
    s.combo = 0;
    s.skipped += 1;
    s.outcomes.push("skip");
    s.feedback = { ok: false, reason: "Skipped.", round: s.i, t: ev.t };
    advance(s, rounds, ev.t);
    return s;
  }

  const v = grade(round, ev);
  if (v.error) {
    s.feedback = { ok: false, error: true, reason: v.reason, round: s.i, t: ev.t, sql: v.sql };
    return s;
  }
  if (v.ok) {
    if (ev.t - s.roundStart < cfg.minAnswerMs) return bad("Answer arrived faster than humanly possible.");
    const dt = ev.t - s.roundStart;
    const speed = Math.round(cfg.speedPts * Math.max(0, 1 - dt / cfg.speedMs));
    const mult = comboMult(s.combo);
    const first = s.firstTry ? cfg.firstTryPts : 0;
    const points = (cfg.base + speed + first) * mult;
    s.score += points;
    s.combo += 1;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    s.correct += 1;
    let bonusMs = 0;
    if (s.firstTry) {
      s.firstTries += 1;
      if (cfg.firstTryTimeMs && s.bonusMs + cfg.firstTryTimeMs <= cfg.maxBonusMs) {
        bonusMs = cfg.firstTryTimeMs;
        s.bonusMs += bonusMs;
      }
    }
    s.outcomes.push("ok");
    s.feedback = { ok: true, reason: v.reason, points, mult, bonusMs, round: s.i, t: ev.t, sql: v.sql };
    advance(s, rounds, ev.t);
    return s;
  }

  // Wrong answer.
  s.wrong += 1;
  s.combo = 0;
  s.firstTry = false;
  s.score = Math.max(0, s.score - cfg.wrongPenalty);
  s.feedback = { ok: false, reason: v.reason, round: s.i, t: ev.t, sql: v.sql };
  if (cfg.lives) {
    s.lives -= 1;
    if (s.lives <= 0) {
      s.outcomes.push("miss");
      s.over = true;
      s.overReason = "lives";
      return s;
    }
  }
  // One guess only on multiple-choice rounds.
  if (round.kind === "choice") {
    s.outcomes.push("miss");
    advance(s, rounds, ev.t);
  }
  return s;
}

export function replay(cfg: ModeConfig, rounds: Round[], events: GameEvent[], grade: Grader): GameState {
  let s = initState(cfg);
  for (const ev of events) {
    s = applyEvent(cfg, rounds, s, ev, grade);
    if (s.over) break;
  }
  return s;
}
