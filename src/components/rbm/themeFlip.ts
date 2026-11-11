"use client";

import { isMuted } from "@/lib/client/sound";
import type { Theme } from "./draw";

// Rubber Bullet Man's theme switch: an arcade-style pixel wipe drawn live on a canvas.
// Chunky blocks pop in from the toggle in a wave (flashing through the arcade colours),
// the theme flips while the screen is covered, then the blocks blink out in the same
// wave order so the new look is revealed from the toggle outward. Scanlines run over it
// and a little 8-bit arpeggio plays along.

const KEY = "rbm.theme";

export function savedTheme(): Theme {
  try {
    return window.localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(t: Theme) {
  document.documentElement.dataset.rbmTheme = t;
  try {
    window.localStorage.setItem(KEY, t);
  } catch {
    /* private mode */
  }
}

const ARCADE = ["#ff2bd6", "#22f3ff", "#ffe14d", "#39ff88", "#ff8a3d"];
const BG: Record<Theme, string> = { dark: "#05040b", light: "#efe6d3" };
const EDGE: Record<Theme, string> = { dark: "#2a2350", light: "#d6c7aa" };

const WAVE = 430; // ms for the wave to cross the screen
const POP = 150; // ms for one block to pop in or out
const HOLD = 70; // ms fully covered

let busy = false;

function bleep(up: boolean) {
  if (isMuted()) return;
  const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return;
  const a = new C();
  const notes = up ? [262, 330, 392, 523, 659, 784] : [784, 659, 523, 392, 330, 262];
  notes.forEach((f, i) => {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = "square";
    o.frequency.value = f;
    const t = a.currentTime + i * 0.06;
    g.gain.setValueAtTime(0.035, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + 0.08);
  });
  setTimeout(() => void a.close(), 900);
}

/** Switch theme with the pixel wipe, starting from `from` (the toggle). */
export function pixelFlip(next: Theme, from: HTMLElement | null, apply: (t: Theme) => void) {
  const run = () => {
    applyTheme(next);
    apply(next);
  };
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !from) return run();
  if (busy) return;
  busy = true;

  const vw = window.innerWidth, vh = window.innerHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(vw * dpr);
  canvas.height = Math.ceil(vh * dpr);
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: `${vw}px`, height: `${vh}px`, zIndex: "100", pointerEvents: "none" });
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  const cx = canvas.getContext("2d")!;
  cx.scale(dpr, dpr);

  const r = from.getBoundingClientRect();
  const ox = r.left + r.width / 2, oy = r.top + r.height / 2;
  const size = Math.max(16, Math.round(Math.min(vw, vh) / 18));
  const cols = Math.ceil(vw / size), rows = Math.ceil(vh / size);
  const far = Math.max(Math.hypot(ox, oy), Math.hypot(vw - ox, oy), Math.hypot(ox, vh - oy), Math.hypot(vw - ox, vh - oy));
  // each block's start time: its (blocky, stepped) distance from the toggle, plus a little jitter
  const cells: { x: number; y: number; at: number; c: string }[] = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x = i * size, y = j * size;
      const d = Math.hypot(x + size / 2 - ox, y + size / 2 - oy) / far;
      const ring = Math.floor(d * 14) / 14; // stepped rings feel more 8-bit than a smooth circle
      cells.push({ x, y, at: ring * WAVE + Math.random() * 60, c: ARCADE[(i + j + Math.floor(Math.random() * 2)) % ARCADE.length] });
    }
  const coverEnd = WAVE + 60 + POP;
  const revealStart = coverEnd + HOLD;
  const total = revealStart + WAVE + 60 + POP;
  const old = (document.documentElement.dataset.rbmTheme as Theme) ?? "dark";
  let flipped = false;
  const t0 = performance.now();
  bleep(next === "light");

  const frame = (now: number) => {
    const t = now - t0;
    if (!flipped && t >= coverEnd) {
      flipped = true;
      run();
    }
    cx.clearRect(0, 0, vw, vh);
    const fill = flipped ? next : old;
    for (const c of cells) {
      // covering: grow in, flashing an arcade colour first. revealing: shrink away.
      let k: number;
      let col: string;
      if (!flipped || t < revealStart) {
        k = Math.max(0, Math.min(1, (t - c.at) / POP));
        col = k < 0.75 ? c.c : BG[next];
      } else {
        const kk = Math.max(0, Math.min(1, (t - revealStart - c.at) / POP));
        k = 1 - kk;
        col = kk > 0.25 ? c.c : BG[next];
      }
      if (k <= 0) continue;
      const s = Math.ceil(size * k);
      const off = (size - s) / 2;
      cx.fillStyle = col;
      cx.fillRect(Math.floor(c.x + off), Math.floor(c.y + off), s, s);
      if (k === 1 && col === BG[next]) {
        // a pixel bevel so the full blocks still read as a grid
        cx.fillStyle = EDGE[fill === next ? next : old];
        cx.fillRect(c.x, c.y + size - 2, size, 2);
        cx.fillRect(c.x + size - 2, c.y, 2, size);
      }
    }
    // CRT scanlines over the effect
    cx.fillStyle = "rgba(0,0,0,0.12)";
    for (let y = 0; y < vh; y += 3) cx.fillRect(0, y, vw, 1);
    if (t < total) requestAnimationFrame(frame);
    else {
      canvas.remove();
      busy = false;
    }
  };
  requestAnimationFrame(frame);
}
