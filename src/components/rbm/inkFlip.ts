"use client";

import type { Theme } from "./draw";

// Rubber Bullet Man's theme switch: no fade. A splat of rubber paint bursts out of the toggle
// and spreads down-left across the screen, and wherever it lands the other theme shows through.
// Built on the View Transitions API: the old page is a still picture, the new one is live (so
// the game keeps moving), and the new one is revealed through a growing splat-shaped mask.

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

/** A fresh, random splat as an SVG data URL. Its burst point is the middle of the picture. */
function splat(): string {
  const C = 100;
  const N = 90;
  const dir = (3 * Math.PI) / 4; // down and to the left, on screen
  const waves = Array.from({ length: 5 }, () => ({ f: 2 + Math.floor(Math.random() * 7), a: 0.04 + Math.random() * 0.06, p: Math.random() * 6.3 }));
  const pts: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const lean = Math.max(0, Math.cos(a - dir));
    let r = 34 * (1 + 1.1 * lean * lean);
    for (const w of waves) r *= 1 + w.a * Math.sin(w.f * a + w.p);
    // thin tendrils, mostly on the leading side
    if (Math.random() < 0.12 + 0.25 * lean) r *= 1.25 + Math.random() * (0.35 + 0.5 * lean);
    pts.push([C + Math.cos(a) * r, C + Math.sin(a) * r]);
  }
  // smooth closed curve through the midpoints
  const mid = (i: number) => {
    const [x1, y1] = pts[i % N], [x2, y2] = pts[(i + 1) % N];
    return [(x1 + x2) / 2, (y1 + y2) / 2];
  };
  let d = `M${mid(0).map((v) => v.toFixed(1)).join(" ")}`;
  for (let i = 1; i <= N; i++) {
    const [cx, cy] = pts[i % N];
    const [mx, my] = mid(i);
    d += `Q${cx.toFixed(1)} ${cy.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  // flung droplets
  let drops = "";
  for (let i = 0; i < 26; i++) {
    const a = dir + (Math.random() - 0.5) * 2.6;
    const lean = Math.max(0, Math.cos(a - dir));
    const r = (34 * (1 + 1.1 * lean * lean)) * (1.15 + Math.random() * 0.7);
    drops += `<circle cx="${(C + Math.cos(a) * r).toFixed(1)}" cy="${(C + Math.sin(a) * r).toFixed(1)}" r="${(0.8 + Math.random() * 3.2).toFixed(1)}"/>`;
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">` +
    `<filter id="f"><feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="${Math.floor(Math.random() * 999)}"/>` +
    `<feDisplacementMap in="SourceGraphic" scale="5"/></filter>` +
    `<g fill="#000" filter="url(#f)"><path d="${d}Z"/>${drops}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

type DocVT = Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };

/** Switch theme with the splat, bursting from `from` (the toggle). */
export function inkFlip(next: Theme, from: HTMLElement | null, apply: (t: Theme) => void) {
  const doc = document as DocVT;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const run = () => {
    applyTheme(next);
    apply(next);
  };
  if (!doc.startViewTransition || reduce || !from) return run();
  const r = from.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const root = document.documentElement;
  root.style.setProperty("--rbm-splat", `url("${splat()}")`);
  root.classList.add("rbm-inking");
  let vt;
  try {
    vt = doc.startViewTransition(run);
  } catch {
    root.classList.remove("rbm-inking");
    return run();
  }
  vt.ready
    .then(() => {
      // big enough that the thinnest side of the splat still covers the far corner
      const far = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      const end = far * 3.4;
      root.animate(
        {
          maskSize: ["6px 6px", `${end * 0.18}px ${end * 0.18}px`, `${end}px ${end}px`],
          maskPosition: [`${x - 3}px ${y - 3}px`, `${x - end * 0.09}px ${y - end * 0.09}px`, `${x - end / 2}px ${y - end / 2}px`],
          offset: [0, 0.55, 1],
        } as unknown as Keyframe[],
        { duration: 1400, easing: "cubic-bezier(.4,.1,.45,1)", pseudoElement: "::view-transition-new(root)" },
      );
    })
    .catch(() => {});
  vt.finished.finally(() => root.classList.remove("rbm-inking"));
}
