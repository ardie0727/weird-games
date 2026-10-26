"use client";

import { isMuted } from "../client/sound.ts";
import type { Sound } from "./engine.ts";

// Boingy WebAudio blips for Rubber Bullet Man. Shares the site's mute setting.

let ctx: AudioContext | null = null;
const last: Partial<Record<Sound, number>> = {};

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

function tone(freq: number, start: number, dur: number, type: OscillatorType = "square", vol = 0.05, slideTo?: number) {
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

export function play(s: Sound) {
  if (isMuted()) return;
  // don't stack the same blip many times in one burst
  const now = performance.now();
  if (now - (last[s] ?? 0) < 45) return;
  last[s] = now;
  try {
    switch (s) {
      case "shoot":
        tone(520, 0, 0.07, "square", 0.03, 260);
        break;
      case "bounce":
        tone(300, 0, 0.09, "sine", 0.08, 700);
        break;
      case "hit":
        tone(180, 0, 0.05, "square", 0.04);
        break;
      case "kill":
        tone(660, 0, 0.06, "square", 0.04);
        tone(990, 0.05, 0.08, "square", 0.04);
        break;
      case "chain":
        [880, 1175, 1568].forEach((f, i) => tone(f, i * 0.05, 0.08, "square", 0.04));
        break;
      case "hurt":
        tone(220, 0, 0.3, "sawtooth", 0.07, 70);
        break;
      case "pickup":
        tone(784, 0, 0.06, "triangle", 0.08);
        tone(1319, 0.06, 0.1, "triangle", 0.08);
        break;
      case "catch":
        tone(1046, 0, 0.08, "triangle", 0.08, 1568);
        break;
      case "freeze":
        tone(1400, 0, 0.25, "sine", 0.05, 500);
        break;
      case "wave":
        [392, 523, 659].forEach((f, i) => tone(f, i * 0.08, 0.12, "square", 0.045));
        break;
      case "over":
        [440, 349, 262, 175].forEach((f, i) => tone(f, i * 0.18, 0.22, "square", 0.06));
        break;
    }
  } catch {
    /* audio is optional */
  }
}

export function unlock() {
  ac();
}
