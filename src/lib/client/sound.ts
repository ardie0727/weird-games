"use client";

import { load, save } from "./storage.ts";

// Tiny chiptune effects synthesized with WebAudio. No audio files to download.

type Sfx = "coin" | "start" | "ok" | "bad" | "tick" | "combo" | "over" | "click" | "hint" | "win";

let ctx: AudioContext | null = null;
let muted: boolean | null = null;
const listeners = new Set<(m: boolean) => void>();

export function isMuted(): boolean {
  if (muted === null) muted = load<boolean>("qa.muted", false);
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  save("qa.muted", m);
  listeners.forEach((fn) => fn(m));
}

export function onMuteChange(fn: (m: boolean) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

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

function tone(freq: number, start: number, dur: number, type: OscillatorType = "square", vol = 0.06, slideTo?: number) {
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

export function sfx(name: Sfx) {
  if (isMuted()) return;
  try {
    switch (name) {
      case "coin":
        tone(988, 0, 0.08);
        tone(1319, 0.08, 0.35);
        break;
      case "start":
        [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.12));
        break;
      case "ok":
        tone(784, 0, 0.07);
        tone(1175, 0.07, 0.16);
        break;
      case "combo":
        [880, 1109, 1319, 1760].forEach((f, i) => tone(f, i * 0.05, 0.09, "square", 0.05));
        break;
      case "bad":
        tone(196, 0, 0.25, "sawtooth", 0.07, 98);
        break;
      case "tick":
        tone(1500, 0, 0.03, "square", 0.025);
        break;
      case "hint":
        tone(660, 0, 0.06, "triangle", 0.08);
        tone(440, 0.06, 0.1, "triangle", 0.08);
        break;
      case "click":
        tone(1200, 0, 0.025, "square", 0.03);
        break;
      case "over":
        [523, 415, 330, 262].forEach((f, i) => tone(f, i * 0.16, 0.2, "square", 0.06));
        break;
      case "win":
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.14));
        break;
    }
  } catch {
    /* audio is optional */
  }
}

/** Call from a user gesture so iOS unlocks audio. */
export function unlockAudio() {
  ac();
}
