"use client";

import { useEffect, useState } from "react";

// Arcade power-on sequence shown once per browser session on first open.
// The server renders it so there is no flash of the page underneath; an inline
// script in <head> hides it before paint when this session has already seen it.

const KEY = "wg-booted";
const LINES = ["WEIRD-OS v1.0  (C) 2026", "ROM CHECK .......... OK", "RAM CHECK .......... OK", "SOUND CHIP ......... OK", "LOADING GAMES ......"];
const TOTAL_MS = 3200;

export function BootScreen() {
  const [gone, setGone] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (document.documentElement.classList.contains("booted")) {
      setGone(true);
      return;
    }
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {}
    const fast = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const total = fast ? 700 : TOTAL_MS;
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (performance.now() - start) / Math.max(200, total - 900));
      setPct(Math.floor(k * 100));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const t1 = setTimeout(() => setLeaving(true), total - 350);
    const t2 = setTimeout(() => setGone(true), total);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (gone) return null;
  const skip = () => {
    setLeaving(true);
    setTimeout(() => setGone(true), 300);
  };

  return (
    <div className={`boot ${leaving ? "boot-out" : ""}`} onClick={skip} role="status" aria-label="Loading Weird Games">
      <div className="boot-screen">
        <div className="boot-lines font-mono text-[12px] leading-[1.7] text-green sm:text-[13px]">
          {LINES.map((l, i) => (
            <div key={i} className="boot-line" style={{ animationDelay: `${0.35 + i * 0.22}s` }}>
              {l}
            </div>
          ))}
        </div>
        <div className="boot-title mt-8 text-center font-pixel text-[30px] leading-tight sm:text-[44px]">
          <span className="text-yellow neon">WEIRD</span> <span className="text-pink neon">GAMES</span>
        </div>
        <div className="boot-bar mx-auto mt-8 w-full max-w-[280px]">
          <div className="flex gap-[3px] border-2 border-cyan p-[3px]">
            {Array.from({ length: 16 }, (_, i) => (
              <div key={i} className="h-3 flex-1" style={{ background: i < Math.round(pct / 6.25) ? "#22f3ff" : "transparent" }} />
            ))}
          </div>
          <div className="mt-2 flex justify-between font-pixel text-[8px] text-dim">
            <span>LOADING</span>
            <span className="tabular-nums text-cyan">{String(pct).padStart(3, "0")}%</span>
          </div>
        </div>
        <div className="boot-start mt-8 text-center font-pixel text-[11px] text-yellow">
          {pct >= 100 ? <span className="blink">PRESS START</span> : <span className="text-dim">CREDIT 00</span>}
        </div>
      </div>
      <div className="boot-skip font-pixel text-[7px] text-dim">TAP TO SKIP</div>
    </div>
  );
}
