export const RACE_ROUNDS = 5;
export const RACE_COUNTDOWN_MS = 4000;
export const RACE_MAX_MS = 10 * 60 * 1000;

export interface RaceWin {
  r: number;
  slot: "host" | "guest" | "cpu" | "you";
  t: number;
}

export interface RaceState {
  code: string;
  seed: number;
  day: string;
  host: string;
  guest: string | null;
  startedAt: number | null;
  serverNow: number;
  wins: RaceWin[];
  you: "host" | "guest" | null;
}
