"use client";

import { isMuted } from "../client/sound.ts";

// Soft, plucky WebAudio effects for Down the Couch. Shares the site's mute setting.

export type DtcSound = "card" | "hit" | "crit" | "block" | "hurt" | "heal" | "buy" | "coin" | "die" | "win" | "lose" | "click" | "level" | "turn" | "debuff" | "boss";

let ctx: AudioContext | null = null;
const last: Partial<Record<DtcSound, number>> = {};

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

function tone(freq: number, start: number, dur: number, type: OscillatorType = "triangle", vol = 0.07, slideTo?: number) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(start: number, dur: number, vol = 0.08, freq = 1200) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + start;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t0);
}

export function unlockAudio() {
  ac();
}

export function sfx(s: DtcSound) {
  if (isMuted()) return;
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  if (now - (last[s] ?? -1000) < 45) return;
  last[s] = now;
  try {
    switch (s) {
      case "card":
        tone(520, 0, 0.08, "triangle", 0.05, 780);
        break;
      case "hit":
        noise(0, 0.09, 0.12, 1800);
        tone(180, 0, 0.1, "square", 0.04, 90);
        break;
      case "crit":
        noise(0, 0.12, 0.14, 2600);
        tone(880, 0, 0.12, "square", 0.05, 1320);
        tone(1320, 0.06, 0.14, "triangle", 0.05);
        break;
      case "block":
        tone(300, 0, 0.12, "sine", 0.08, 260);
        tone(600, 0.02, 0.08, "triangle", 0.03);
        break;
      case "hurt":
        noise(0, 0.15, 0.14, 900);
        tone(140, 0, 0.18, "sawtooth", 0.05, 70);
        break;
      case "heal":
        tone(523, 0, 0.12, "sine", 0.06);
        tone(784, 0.08, 0.16, "sine", 0.06);
        break;
      case "buy":
      case "coin":
        tone(988, 0, 0.07, "square", 0.04);
        tone(1319, 0.06, 0.12, "square", 0.04);
        break;
      case "die":
        tone(400, 0, 0.25, "triangle", 0.06, 80);
        noise(0.05, 0.2, 0.06, 600);
        break;
      case "win":
        [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, "triangle", 0.06));
        break;
      case "lose":
        [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.16, 0.3, "triangle", 0.06));
        break;
      case "click":
        tone(700, 0, 0.04, "triangle", 0.03);
        break;
      case "level":
        [523, 784, 1047, 1568].forEach((f, i) => tone(f, i * 0.07, 0.2, "square", 0.035));
        break;
      case "turn":
        tone(440, 0, 0.1, "sine", 0.05, 660);
        break;
      case "debuff":
        tone(330, 0, 0.18, "sawtooth", 0.03, 220);
        break;
      case "boss":
        tone(110, 0, 0.6, "sawtooth", 0.05, 82);
        tone(165, 0.1, 0.6, "square", 0.03, 123);
        break;
    }
  } catch {
    /* audio unavailable */
  }
}
