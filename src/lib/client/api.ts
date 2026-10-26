"use client";

import { istDay, istWeekStart } from "../dataset.ts";
import type { GameEvent, ModeId } from "../game/types.ts";
import { localBoard } from "./storage.ts";

export interface RunTicket {
  online: boolean;
  token?: string;
  seed: number;
  day: string;
}

async function post<T>(url: string, body: unknown, timeoutMs = 8000): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Ask the server for a signed run. Falls back to an offline (local-only) run. */
export async function startRun(mode: ModeId): Promise<RunTicket> {
  try {
    const r = await post<{ online: boolean; token?: string; seed?: number; day?: string }>("/api/qa/run/start", { mode }, 5000);
    if (r.online && r.token && typeof r.seed === "number" && r.day) return { online: true, token: r.token, seed: r.seed, day: r.day };
  } catch {
    /* offline */
  }
  return { online: false, seed: Math.floor(Math.random() * 2 ** 31), day: istDay() };
}

export interface SubmitResult {
  online: boolean;
  score?: number;
  rank?: number;
  streak?: number;
  error?: string;
}

export async function submitRun(token: string, events: GameEvent[], name: string, playerId: string): Promise<SubmitResult> {
  try {
    return await post<SubmitResult>("/api/qa/run/submit", { token, events, name, playerId }, 15000);
  } catch (e) {
    return { online: true, error: e instanceof Error ? e.message : "Couldn't reach the server." };
  }
}

export type Period = "daily" | "weekly" | "all";

export interface BoardRow {
  name: string;
  score: number;
  timeMs: number;
  streak: number;
  day: string;
}

export async function fetchBoard(mode: ModeId, period: Period): Promise<{ online: boolean; rows: BoardRow[] }> {
  try {
    const res = await fetch(`/api/qa/leaderboard?mode=${mode}&period=${period}`);
    const json = await res.json();
    if (json.online) return { online: true, rows: json.rows };
  } catch {
    /* offline */
  }
  const today = istDay();
  const from = period === "daily" ? today : period === "weekly" ? istWeekStart(today) : "0000-01-01";
  return { online: false, rows: localBoard(mode, from) };
}
