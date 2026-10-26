"use client";

import { isMuted } from "../client/sound.ts";

// Tiny WebAudio blips shared by the lab games. Uses the site's mute setting.

let ctx: AudioContext | null = null;
const last = new Map<string, number>();

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function unlock() {
  ac();
}

export function tone(freq: number, start = 0, dur = 0.1, type: OscillatorType = "square", vol = 0.04, slideTo?: number) {
  if (isMuted()) return;
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

/** Plays a named sequence, skipping repeats of the same name within 45ms. */
export function blip(name: string, notes: [freq: number, start: number, dur: number, type?: OscillatorType, vol?: number, slideTo?: number][]) {
  const now = performance.now();
  if (now - (last.get(name) ?? 0) < 45) return;
  last.set(name, now);
  for (const n of notes) tone(...n);
}
