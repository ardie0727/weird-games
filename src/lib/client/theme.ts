import { isMuted } from "./sound";

// Site-wide light/dark theme ("paper" and "neon") with an arcade pixel flip.
//
// The flip changes the real page block by block: the browser takes a still picture of the
// page in the old theme, switches the theme, and then the new, live page shows through a
// grid mask that turns on cell by cell in a wave from the toggle. Each block that flips
// gets a quick arcade-coloured flash on its edge, so you can watch the screen change pixel
// by pixel. Nothing covers the page at any point.

export type Theme = "dark" | "light";

const KEY = "wg.theme";
const EVENT = "wg-theme";

export function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** Runs before first paint (inlined in the layout) so a paper-mode page never flashes dark. */
export const THEME_BOOT = `try{var t=localStorage.getItem("${KEY}")||localStorage.getItem("rbm.theme");if(t==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try {
    window.localStorage.setItem(KEY, t);
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: t }));
}

export function onThemeChange(fn: (t: Theme) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<Theme>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

const ARCADE = ["#ff2bd6", "#22f3ff", "#ffe14d", "#39ff88", "#ff8a3d"];
const WAVE = 650; // ms for the wave to cross the screen
const FLASH = 220; // ms a flipped block's edge glows
let busy = false;

function jingle(up: boolean) {
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
    const t = a.currentTime + i * 0.09;
    g.gain.setValueAtTime(0.03, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + 0.09);
  });
  setTimeout(() => void a.close(), 1200);
}

type VT = { ready: Promise<void>; finished: Promise<void> };
type DocVT = Document & { startViewTransition?: (cb: () => void) => VT };

/** Flip to the other theme, starting from the element that was tapped. */
export function flipTheme(from: HTMLElement | null) {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  const doc = document as DocVT;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (busy) return;
  if (!doc.startViewTransition || reduce || !from) return setTheme(next);
  busy = true;

  const vw = window.innerWidth, vh = window.innerHeight;
  const r = from.getBoundingClientRect();
  const ox = r.left + r.width / 2, oy = r.top + r.height / 2;
  const size = Math.max(18, Math.round(Math.min(vw, vh) / 16));
  const cols = Math.ceil(vw / size), rows = Math.ceil(vh / size);
  const far = Math.max(Math.hypot(ox, oy), Math.hypot(vw - ox, oy), Math.hypot(ox, vh - oy), Math.hypot(vw - ox, vh - oy));
  // when each block flips: stepped rings out from the toggle, with a little jitter
  const at = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const d = Math.hypot((i + 0.5) * size - ox, (j + 0.5) * size - oy) / far;
      at[j * cols + i] = (Math.floor(d * 16) / 16) * WAVE + Math.random() * 90;
    }
  const total = WAVE + 90 + FLASH;

  // the grid mask: which blocks of the new page are showing
  const root = document.documentElement;
  const maskAt = (t: number) => {
    let d = "";
    for (let j = 0; j < rows; j++) {
      let run = -1;
      for (let i = 0; i <= cols; i++) {
        const on = i < cols && at[j * cols + i] <= t;
        if (on && run < 0) run = i;
        if (!on && run >= 0) {
          d += `M${run} ${j}h${i - run}v1h${run - i}z`;
          run = -1;
        }
      }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols} ${rows}" preserveAspectRatio="none" shape-rendering="crispEdges"><path d="${d || "M0 0"}"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  };
  root.style.setProperty("--px-mask", maskAt(-1));
  root.style.setProperty("--px-w", `${cols * size}px`);
  root.style.setProperty("--px-h", `${rows * size}px`);
  root.style.setProperty("--px-time", `${total}ms`);
  root.classList.add("px-flipping");

  // edge flashes for blocks as they flip, drawn on a see-through canvas
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const fx = document.createElement("canvas");
  fx.width = Math.ceil(vw * dpr);
  fx.height = Math.ceil(vh * dpr);
  Object.assign(fx.style, { position: "fixed", inset: "0", width: `${vw}px`, height: `${vh}px`, zIndex: "2147483647", pointerEvents: "none" });
  fx.setAttribute("aria-hidden", "true");
  const cx = fx.getContext("2d")!;
  cx.scale(dpr, dpr);

  let vt: VT;
  try {
    vt = doc.startViewTransition(() => setTheme(next));
  } catch {
    root.classList.remove("px-flipping");
    busy = false;
    return setTheme(next);
  }
  jingle(next === "light");
  let t0 = 0;
  let raf = 0;
  const frame = (now: number) => {
    if (!t0) t0 = now;
    const t = now - t0;
    root.style.setProperty("--px-mask", maskAt(t));
    cx.clearRect(0, 0, vw, vh);
    for (let k = 0; k < at.length; k++) {
      const age = t - at[k];
      if (age < 0 || age > FLASH) continue;
      const i = k % cols, j = (k / cols) | 0;
      const a = 1 - age / FLASH;
      cx.globalAlpha = a;
      cx.strokeStyle = ARCADE[(i * 7 + j * 3) % ARCADE.length];
      cx.lineWidth = 2;
      cx.strokeRect(i * size + 1, j * size + 1, size - 2, size - 2);
      if (age < 60) {
        // the instant a block flips it lights up, like a pixel being redrawn
        cx.globalAlpha = 0.35 * (1 - age / 60);
        cx.fillStyle = cx.strokeStyle;
        cx.fillRect(i * size, j * size, size, size);
      }
    }
    cx.globalAlpha = 1;
    if (t < total) raf = requestAnimationFrame(frame);
  };
  vt.ready
    .then(() => {
      document.body.appendChild(fx);
      raf = requestAnimationFrame(frame);
    })
    .catch(() => {});
  vt.finished.finally(() => {
    cancelAnimationFrame(raf);
    fx.remove();
    root.classList.remove("px-flipping");
    root.style.removeProperty("--px-mask");
    busy = false;
  });
}
