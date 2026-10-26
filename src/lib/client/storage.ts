"use client";

import { addDays, istDay } from "../dataset.ts";
import type { ModeId } from "../game/types.ts";

// Browser storage can be missing or throw (private mode, blocked cookies).
// Everything here degrades to in-memory defaults.

const mem = new Map<string, string>();

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key) ?? mem.get(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    const raw = mem.get(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  }
}

export function save(key: string, value: unknown) {
  const raw = JSON.stringify(value);
  mem.set(key, raw);
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    /* ignore */
  }
}

// ---------- player ----------

export interface Player {
  id: string;
  name: string;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function getPlayer(): Player {
  const p = load<Player | null>("qa.player", null);
  if (p?.id) return p;
  const fresh = { id: uuid(), name: "" };
  save("qa.player", fresh);
  return fresh;
}

export function cleanName(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9_ ]/g, "")
    .trim()
    .slice(0, 12);
}

export function setPlayerName(name: string) {
  save("qa.player", { ...getPlayer(), name: cleanName(name) });
}

// ---------- progression ----------

export interface Progress {
  xp: number;
  runs: number;
  totalCorrect: number;
  days: string[];
  badges: string[];
  bests: Partial<Record<ModeId | "race", number>>;
  raceWins: number;
}

const emptyProgress: Progress = { xp: 0, runs: 0, totalCorrect: 0, days: [], badges: [], bests: {}, raceWins: 0 };

export function getProgress(): Progress {
  return { ...emptyProgress, ...load<Partial<Progress>>("qa.progress", {}) };
}

export function saveProgress(p: Progress) {
  save("qa.progress", p);
}

/** Consecutive days played, counting back from today (or yesterday, so a streak isn't lost before you play today). */
export function streakOf(days: string[], today = istDay()): number {
  const set = new Set(days);
  let d = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export const LEVELS = [
  { name: "Bronze", min: 0, color: "#d08a4a" },
  { name: "Silver", min: 2000, color: "#c9d3e6" },
  { name: "Gold", min: 8000, color: "#ffe14d" },
  { name: "Platinum", min: 20000, color: "#9ff7ff" },
] as const;

export function levelOf(xp: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].min) i++;
  const cur = LEVELS[i];
  const next = LEVELS[i + 1];
  const pct = next ? (xp - cur.min) / (next.min - cur.min) : 1;
  return { ...cur, index: i, next, pct };
}

// ---------- badges ----------

export interface RunSummary {
  mode: ModeId | "race";
  score: number;
  correct: number;
  rounds: number;
  hints: number;
  maxCombo: number;
  firstTries: number;
  skipped: number;
  won?: boolean;
}

interface BadgeDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  test: (p: Progress, r: RunSummary, streak: number) => boolean;
}

export const BADGES: BadgeDef[] = [
  { id: "first_run", name: "Coin-Op", icon: "🪙", desc: "Finish your first run.", test: (p) => p.runs >= 1 },
  { id: "combo5", name: "Combo King", icon: "👑", desc: "Hit the x5 multiplier.", test: (_p, r) => r.maxCombo >= 8 },
  { id: "pure", name: "Pure Query", icon: "💎", desc: "5+ correct in a run with no hints.", test: (_p, r) => r.correct >= 5 && r.hints === 0 },
  { id: "speed", name: "Speed Demon", icon: "⚡", desc: "10 correct in one Blitz.", test: (_p, r) => r.mode === "blitz" && r.correct >= 10 },
  { id: "bugs", name: "Exterminator", icon: "🐞", desc: "Fix every bug in a run.", test: (_p, r) => r.mode === "bug" && r.correct === r.rounds && r.rounds > 0 },
  { id: "oracle", name: "Oracle", icon: "🔮", desc: "A perfect Predict run.", test: (_p, r) => r.mode === "predict" && r.correct === r.rounds && r.rounds > 0 },
  { id: "architect", name: "Architect", icon: "🏗️", desc: "Every pipeline right on the first try.", test: (_p, r) => r.mode === "pipeline" && r.firstTries === r.rounds && r.rounds > 0 },
  { id: "sherlock", name: "Sherlock", icon: "🕵️", desc: "Close a case without reveals.", test: (_p, r) => r.mode === "detective" && r.correct === r.rounds && r.skipped === 0 },
  { id: "bilingual", name: "Bilingual", icon: "🐍", desc: "5+ correct in a SQL vs PySpark duel.", test: (_p, r) => r.mode === "duel" && r.correct >= 5 },
  { id: "racer", name: "Road Runner", icon: "🏁", desc: "Win a 1v1 race.", test: (p) => p.raceWins >= 1 },
  { id: "streak3", name: "On Fire", icon: "🔥", desc: "Play 3 days in a row.", test: (_p, _r, s) => s >= 3 },
  { id: "streak7", name: "Week Warrior", icon: "📅", desc: "Play 7 days in a row.", test: (_p, _r, s) => s >= 7 },
  { id: "century", name: "Century", icon: "💯", desc: "100 correct answers in total.", test: (p) => p.totalCorrect >= 100 },
  { id: "silver", name: "Silver", icon: "🥈", desc: "Reach Silver level.", test: (p) => p.xp >= LEVELS[1].min },
  { id: "gold", name: "Gold", icon: "🥇", desc: "Reach Gold level.", test: (p) => p.xp >= LEVELS[2].min },
  { id: "platinum", name: "Platinum", icon: "💠", desc: "Reach Platinum level.", test: (p) => p.xp >= LEVELS[3].min },
];

export function xpFor(r: RunSummary): number {
  return Math.round(r.score / 5) + r.correct * 5 + 20;
}

/** Record a finished run: XP, streak days, bests and newly earned badges. */
export function recordRun(r: RunSummary) {
  const p = getProgress();
  const before = levelOf(p.xp);
  const gained = xpFor(r);
  const today = istDay();
  p.xp += gained;
  p.runs += 1;
  p.totalCorrect += r.correct;
  if (!p.days.includes(today)) p.days = [...p.days, today].slice(-90);
  if (r.mode === "race" && r.won) p.raceWins += 1;
  const prevBest = p.bests[r.mode] ?? 0;
  const newBest = r.score > prevBest;
  if (newBest) p.bests[r.mode] = r.score;
  const streak = streakOf(p.days, today);
  const earned = BADGES.filter((b) => !p.badges.includes(b.id) && b.test(p, r, streak)).map((b) => b.id);
  p.badges = [...p.badges, ...earned];
  saveProgress(p);
  const after = levelOf(p.xp);
  return { gained, earned, streak, newBest, levelUp: after.index > before.index ? after.name : null, progress: p };
}

// ---------- local leaderboard (used when the global one is offline) ----------

export interface LocalScore {
  name: string;
  mode: string;
  score: number;
  timeMs: number;
  day: string;
  streak: number;
}

export function addLocalScore(s: LocalScore) {
  const all = load<LocalScore[]>("qa.localScores", []);
  all.push(s);
  all.sort((a, b) => b.score - a.score);
  save("qa.localScores", all.slice(0, 300));
}

export function localBoard(mode: string, fromDay: string): LocalScore[] {
  return load<LocalScore[]>("qa.localScores", [])
    .filter((s) => s.mode === mode && s.day >= fromDay)
    .sort((a, b) => b.score - a.score || a.timeMs - b.timeMs)
    .slice(0, 20);
}
