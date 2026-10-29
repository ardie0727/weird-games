"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { isMuted, onMuteChange, setMuted } from "@/lib/client/sound";
import { load, save } from "@/lib/client/storage";

// Shared chrome for the lab games: a top bar and an overlay card.
// Games still under /lab go back to the lab; graduated ones go back to the hub.

export function LabShell({ title, color, right, children }: { title: string; color: string; right?: React.ReactNode; children: React.ReactNode }) {
  const inLab = usePathname()?.startsWith("/lab");
  const [muted, setMutedState] = useState(false);
  useEffect(() => {
    setMutedState(isMuted());
    const off = onMuteChange(setMutedState);
    return () => void off();
  }, []);
  return (
    <div className="fixed inset-0 flex select-none flex-col bg-bg" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <header className="flex h-11 shrink-0 items-center justify-between gap-2 px-3">
        <Link href={inLab ? "/lab" : "/"} className="font-pixel text-[9px] text-dim hover:text-ink">
          {inLab ? "◀ LAB" : "◀ HUB"}
        </Link>
        <div className="truncate font-pixel text-[9px] neon-soft" style={{ color }}>
          {title}
        </div>
        <div className="flex gap-3">
          <button className="font-pixel text-[9px] text-dim" onClick={() => setMuted(!muted)} aria-label={muted ? "Unmute" : "Mute"}>
            {muted ? "🔇" : "🔊"}
          </button>
          {right}
        </div>
      </header>
      {children}
    </div>
  );
}

export function Overlay({ glow = "#ff2bd6", children }: { glow?: string; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-bg/80 p-4">
      <div className="pixel-corners neon-box my-auto w-full max-w-sm bg-panel/95 p-5" style={{ ["--glow" as string]: glow }}>
        {children}
      </div>
    </div>
  );
}

export function BigButton({ onClick, color = "#ff2bd6", children }: { onClick: () => void; color?: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="mt-4 block w-full py-3 font-pixel text-[12px] text-bg active:scale-[0.98]" style={{ background: color }}>
      {children}
    </button>
  );
}

/** Keeps a W×H logical canvas as large as fits its wrapper, at device pixel ratio. */
export function useFitCanvas(w: number, h: number) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const wrap = wrapRef.current!, canvas = canvasRef.current!;
    const fit = () => {
      const s = Math.min(wrap.clientWidth / w, wrap.clientHeight / h);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.width = `${Math.floor(w * s)}px`;
      canvas.style.height = `${Math.floor(h * s)}px`;
      canvas.width = Math.floor(w * s * dpr);
      canvas.height = Math.floor(h * s * dpr);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [w, h]);
  return { wrapRef, canvasRef };
}

/** Pointer position in the canvas's logical coordinates. */
export function toLogical(e: { clientX: number; clientY: number }, canvas: HTMLCanvasElement, w: number, h: number): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * w, ((e.clientY - r.top) / r.height) * h];
}

/** Starts a 2D context scaled to logical units and returns it. */
export function ctx2d(canvas: HTMLCanvasElement, w: number): CanvasRenderingContext2D {
  const cx = canvas.getContext("2d")!;
  const k = canvas.width / w;
  cx.setTransform(k, 0, 0, k, 0, 0);
  return cx;
}

let pixelFamily = "";
/** Canvas font string for the arcade pixel font (canvas can't read CSS variables, so resolve it once). */
export function PIXEL_FONT(px: number) {
  if (!pixelFamily && typeof document !== "undefined") pixelFamily = getComputedStyle(document.documentElement).getPropertyValue("--font-press").trim();
  return `${px}px ${pixelFamily || "monospace"}`;
}

/** Local best score with a setter that only ever raises it. Returns [best, submit] where submit reports a new best. */
export function useBest(key: string): [number, (score: number) => boolean] {
  const [best, setBest] = useState(0);
  useEffect(() => setBest(load<number>(key, 0)), [key]);
  const submit = useCallback(
    (score: number) => {
      const prev = load<number>(key, 0);
      if (score <= prev) return false;
      save(key, score);
      setBest(score);
      return true;
    },
    [key],
  );
  return [best, submit];
}

export function GameOverCard({ title, score, isBest, best, line, again, color }: { title: string; score: number; isBest: boolean; best: number; line: string; again: () => void; color: string }) {
  return (
    <Overlay glow={color}>
      <div className="text-center font-pixel text-[16px] text-red neon">{title}</div>
      <div className="mt-4 text-center font-pixel text-[28px] neon" style={{ color }}>
        {score}
      </div>
      {isBest && <div className="mt-2 text-center font-pixel text-[9px] text-yellow blink">NEW BEST!</div>}
      <p className="mt-3 text-center text-[19px] text-ink/85">{line}</p>
      <div className="mt-1 text-center font-pixel text-[8px] text-dim">BEST {best}</div>
      <BigButton onClick={again} color={color}>
        ▶ AGAIN
      </BigButton>
    </Overlay>
  );
}

export function TitleCard({ a, b, colorA, colorB, blurb, best, onPlay, play = "▶ PLAY", children }: { a: string; b: string; colorA: string; colorB: string; blurb: string; best: number; onPlay: () => void; play?: string; children?: React.ReactNode }) {
  return (
    <Overlay glow={colorA}>
      <div className="text-center font-pixel text-[18px] leading-snug">
        <span className="neon" style={{ color: colorA }}>
          {a}
        </span>
        <br />
        <span className="neon" style={{ color: colorB }}>
          {b}
        </span>
      </div>
      <p className="mt-3 text-center text-[19px] text-ink/85">{blurb}</p>
      {best > 0 && <div className="mt-3 text-center font-pixel text-[9px] text-yellow">BEST {best}</div>}
      <BigButton onClick={onPlay} color={colorA}>
        {play}
      </BigButton>
      {children && <div className="mt-4 space-y-1 border-t border-line pt-3 text-[16px] leading-snug text-dim">{children}</div>}
    </Overlay>
  );
}

/** requestAnimationFrame loop calling the latest `fn` with a clamped dt in seconds. */
export function useLoop(fn: (dt: number, now: number) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ref.current(dt, now);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
}
