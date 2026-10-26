"use client";

import { addDays, istDay } from "../dataset.ts";
import { load, save } from "./storage.ts";

export interface PublicFact {
  day: string;
  number: number;
  emoji: string;
  prompt: string;
  options: [string, string];
}

export interface GuessResult {
  pick: number;
  correct: boolean;
  answer: number;
  reveal: string;
  split?: [number, number];
}

export interface Stats {
  streak: number;
  best: number;
  played: number;
  wins: number;
}

export interface Today {
  online: boolean;
  fact: PublicFact;
  stats?: Stats;
  result?: GuessResult;
}

export interface BoardRow {
  name: string;
  streak?: number;
  best: number;
  wins?: number;
}

export interface Board {
  online: boolean;
  live: BoardRow[];
  best: BoardRow[];
  today: number;
}

// ---------- local history (works offline, and shows today's result instantly) ----------

type History = Record<string, GuessResult & { prompt: string; emoji: string }>;

export const history = (): History => load<History>("dw.history", {});

export function remember(fact: PublicFact, r: GuessResult) {
  const h = history();
  h[fact.day] = { ...r, prompt: fact.prompt, emoji: fact.emoji };
  // Keep about a year of days.
  const keep = Object.keys(h).sort().slice(-370);
  save("dw.history", Object.fromEntries(keep.map((d) => [d, h[d]])));
}

/** Streak and totals from this device's history: consecutive correct days up to today or yesterday. */
export function localStats(today = istDay()): Stats {
  const h = history();
  const days = Object.keys(h);
  let d = h[today] ? today : addDays(today, -1);
  let streak = 0;
  while (h[d]?.correct) {
    streak++;
    d = addDays(d, -1);
  }
  let best = 0;
  let run = 0;
  let prev = "";
  for (const day of days.sort()) {
    if (h[day].correct) {
      run = prev && addDays(prev, 1) === day ? run + 1 : 1;
      prev = day;
    } else {
      run = 0;
      prev = "";
    }
    best = Math.max(best, run);
  }
  return { streak, best, played: days.length, wins: days.filter((x) => h[x].correct).length };
}

// ---------- server ----------

async function call<T>(url: string, body?: unknown): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(url, body === undefined ? { signal: ctl.signal, cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
    const json = await res.json();
    if (!res.ok) throw Object.assign(new Error(json.error ?? `HTTP ${res.status}`), { stale: !!json.stale });
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

export const fetchToday = (playerId: string) => call<Today>(`/api/dw/today?player=${encodeURIComponent(playerId)}`);
export const sendGuess = (body: { day: string; pick: number; playerId: string; name: string }) => call<{ online: boolean; result: GuessResult; stats?: Stats }>("/api/dw/guess", body);
export const sendName = (playerId: string, name: string) => call<{ online: boolean }>("/api/dw/name", { playerId, name });
export const fetchBoard = () => call<Board>("/api/dw/board");

/** Milliseconds until the next fact (midnight IST). */
export function msToNext(now = Date.now()): number {
  const next = Date.parse(addDays(istDay(now), 1) + "T00:00:00+05:30");
  return Math.max(0, next - now);
}
