"use client";

import { useCallback, useRef, useState } from "react";
import { blip, unlock } from "@/lib/lab/sound";
import { GameOverCard, LabShell, PIXEL_FONT, TitleCard, ctx2d, toLogical, useBest, useFitCanvas, useLoop } from "./LabShell";

// Lost Slipper: every morning one slipper has vanished into the mess. Tap junk
// to toss it aside and dig for the slipper before the clock says you're late.
// Each day the house is messier, with bigger piles and other footwear to fool
// you. The dog sometimes sniffs near the right spot.

const W = 360;
const H = 600;
const FLOOR = { x: 10, y: 10, w: 340, h: 520 };
const LIVES = 3;
const DAY_SECONDS = 30;

const JUNK = ["👕", "👖", "🧦", "📰", "📚", "🧸", "🎒", "🧺", "🪀", "🥤", "🍕", "🧥", "📦", "🎮", "🛍️", "🧣", "☂️", "🪣"];
const DECOYS = ["👟", "👞", "🥿", "👠", "🥾"];
const BIG = new Set(["🧺", "📦", "🧥", "🛍️", "📰"]);

interface Item {
  x: number;
  y: number;
  emoji: string;
  size: number;
  rot: number;
  fly: number; // >0 while being tossed
  vx: number;
  vy: number;
  decoy: boolean;
}

interface Game {
  day: number;
  items: Item[]; // drawn in order, last on top
  slipper: { x: number; y: number; rot: number };
  time: number;
  lives: number;
  score: number;
  found: number;
  tosses: number;
  dog: { x: number; y: number; tx: number; ty: number; sniff: number; next: number };
  phase: "intro" | "play" | "found" | "late";
  phaseT: number;
  pops: { x: number; y: number; text: string; color: string; t: number }[];
  over: boolean;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function buildDay(g: Game) {
  const sx = rnd(50, FLOOR.w - 40), sy = rnd(60, FLOOR.h - 40);
  g.slipper = { x: sx, y: sy, rot: rnd(-0.6, 0.6) };
  const n = Math.min(70, 16 + g.day * 7);
  const items: Item[] = [];
  const decoys = Math.min(6, Math.max(0, g.day - 1));
  for (let i = 0; i < n; i++) {
    const emoji = JUNK[Math.floor(Math.random() * JUNK.length)];
    // bias the mess toward a few piles
    const pile = i % 4;
    const px = [90, 260, 120, 250][pile], py = [140, 180, 380, 420][pile];
    const near = Math.random() < 0.55;
    items.push({
      x: near ? px + rnd(-80, 80) : rnd(30, FLOOR.w - 20),
      y: near ? py + rnd(-80, 80) : rnd(30, FLOOR.h - 20),
      emoji,
      size: BIG.has(emoji) ? rnd(56, 70) : rnd(38, 50),
      rot: rnd(-0.7, 0.7),
      fly: 0,
      vx: 0,
      vy: 0,
      decoy: false,
    });
  }
  for (let i = 0; i < decoys; i++) {
    const at = Math.floor(Math.random() * items.length);
    items.splice(at, 0, { x: rnd(40, FLOOR.w - 30), y: rnd(50, FLOOR.h - 30), emoji: DECOYS[i % DECOYS.length], size: 40, rot: rnd(-0.6, 0.6), fly: 0, vx: 0, vy: 0, decoy: true });
  }
  // make sure the slipper is properly buried, more deeply each day
  for (let i = 0; i < Math.min(5, 1 + Math.floor(g.day / 2)); i++) {
    const emoji = JUNK[Math.floor(Math.random() * JUNK.length)];
    items.splice(Math.floor(Math.random() * (items.length + 1)), 0, { x: sx + rnd(-10, 10), y: sy + rnd(-10, 10), emoji, size: rnd(48, 62), rot: rnd(-0.7, 0.7), fly: 0, vx: 0, vy: 0, decoy: false });
  }
  for (const it of items) {
    it.x = Math.max(FLOOR.x + 20, Math.min(FLOOR.x + FLOOR.w - 20, it.x));
    it.y = Math.max(FLOOR.y + 20, Math.min(FLOOR.y + FLOOR.h - 20, it.y));
  }
  g.items = items;
  g.time = DAY_SECONDS;
  g.dog = { x: -40, y: FLOOR.h - 30, tx: -40, ty: FLOOR.h - 30, sniff: 2, next: 6 };
  g.phase = "intro";
  g.phaseT = 1.3;
}

function newGame(): Game {
  const g = { day: 1, items: [], slipper: { x: 0, y: 0, rot: 0 }, time: 0, lives: LIVES, score: 0, found: 0, tosses: 0, dog: { x: 0, y: 0, tx: 0, ty: 0, sniff: 0, next: 0 }, phase: "intro", phaseT: 0, pops: [], over: false } as Game;
  buildDay(g);
  return g;
}

const covers = (it: Item, x: number, y: number, slack = 0.42) => it.fly === 0 && Math.hypot(it.x - x, it.y - y) < it.size * slack;

function step(g: Game, dt: number) {
  for (const p of g.pops) p.t += dt;
  g.pops = g.pops.filter((p) => p.t < 1.2);
  for (const it of g.items)
    if (it.fly > 0) {
      it.fly += dt;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.rot += dt * 8;
    }
  g.items = g.items.filter((it) => it.fly < 0.6);
  if (g.phase !== "play") {
    g.phaseT -= dt;
    if (g.phaseT > 0) return;
    if (g.phase === "intro") g.phase = "play";
    else if (g.lives <= 0) g.over = true;
    else {
      if (g.phase === "found") g.day++;
      buildDay(g);
    }
    return;
  }
  g.time -= dt;
  if (g.time <= 0) {
    g.time = 0;
    g.lives--;
    g.phase = "late";
    g.phaseT = 2;
    blip("late", [
      [880, 0, 0.12, "square", 0.05],
      [880, 0.2, 0.12, "square", 0.05],
      [880, 0.4, 0.12, "square", 0.05],
    ]);
    return;
  }
  // the dog trots in now and then and sniffs near the slipper
  const d = g.dog;
  d.next -= dt;
  if (d.next <= 0) {
    d.next = 9;
    d.tx = g.slipper.x + rnd(-55, 55);
    d.ty = g.slipper.y + rnd(-55, 55);
    d.sniff = 0;
  }
  const dist = Math.hypot(d.tx - d.x, d.ty - d.y);
  if (dist > 3) {
    d.x += ((d.tx - d.x) / dist) * Math.min(dist, 160 * dt);
    d.y += ((d.ty - d.y) / dist) * Math.min(dist, 160 * dt);
  } else if (d.sniff < 2) {
    d.sniff += dt;
    if (d.sniff >= 2) {
      d.tx = FLOOR.w + 50;
      d.ty = d.y;
    }
  }
}

function tap(g: Game, x: number, y: number) {
  if (g.phase !== "play") return;
  // topmost item under the finger
  for (let i = g.items.length - 1; i >= 0; i--) {
    const it = g.items[i];
    if (!covers(it, x, y, 0.5)) continue;
    if (it.decoy) {
      g.time = Math.max(0.1, g.time - 3);
      g.pops.push({ x: it.x, y: it.y, text: "NOT IT! -3", color: "#ff4d6d", t: 0 });
      blip("decoy", [[200, 0, 0.15, "square", 0.05]]);
    } else blip("toss", [[300 + Math.random() * 200, 0, 0.06, "triangle", 0.03, 700]]);
    const a = Math.atan2(it.y - y, it.x - x) + rnd(-0.5, 0.5);
    it.fly = 0.001;
    it.vx = Math.cos(a) * 500;
    it.vy = Math.sin(a) * 500;
    g.tosses++;
    return;
  }
  // nothing on top here: is it the slipper?
  const s = g.slipper;
  if (Math.hypot(s.x - x, s.y - y) < 30 && !g.items.some((it) => covers(it, s.x, s.y))) {
    const pts = 100 * g.day + Math.ceil(g.time) * 10;
    g.score += pts;
    g.found++;
    g.phase = "found";
    g.phaseT = 1.6;
    g.pops.push({ x: s.x, y: s.y, text: `FOUND IT! +${pts}`, color: "#39ff88", t: 0 });
    blip("found", [
      [523, 0, 0.1, "square", 0.04],
      [659, 0.1, 0.1, "square", 0.04],
      [784, 0.2, 0.25, "square", 0.04],
    ]);
  }
}

export function LostSlipper() {
  const [screen, setScreen] = useState<"title" | "play" | "over">("title");
  const [best, submitBest] = useBest("lab.slipper.best");
  const [hud, setHud] = useState({ score: 0, lives: LIVES, day: 1, time: DAY_SECONDS });
  const [result, setResult] = useState<{ score: number; found: number; tosses: number; best: boolean } | null>(null);
  const { wrapRef, canvasRef } = useFitCanvas(W, H);
  const gameRef = useRef<Game>(newGame());
  const playing = useRef(false);
  const hudAt = useRef(0);

  const start = useCallback(() => {
    unlock();
    gameRef.current = newGame();
    playing.current = true;
    setScreen("play");
  }, []);

  useLoop((dt, now) => {
    const g = gameRef.current;
    if (playing.current) {
      step(g, dt);
      if (g.over) {
        playing.current = false;
        setResult({ score: g.score, found: g.found, tosses: g.tosses, best: submitBest(g.score) });
        setScreen("over");
      }
    }
    if (now - hudAt.current > 100) {
      hudAt.current = now;
      setHud({ score: g.score, lives: g.lives, day: g.day, time: g.time });
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = ctx2d(canvas, W);
    const t = now / 1000;

    cx.fillStyle = "#05040b";
    cx.fillRect(0, 0, W, H);
    // floor tiles
    for (let r = 0; r * 40 < FLOOR.h; r++)
      for (let c = 0; c * 40 < FLOOR.w; c++) {
        cx.fillStyle = (r + c) % 2 ? "#2a2147" : "#241c3f";
        cx.fillRect(FLOOR.x + c * 40, FLOOR.y + r * 40, Math.min(40, FLOOR.w - c * 40), Math.min(40, FLOOR.h - r * 40));
      }
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    const s = g.slipper;
    const draw = (x: number, y: number, rot: number, size: number, emoji: string, alpha = 1) => {
      cx.save();
      cx.globalAlpha = alpha;
      cx.translate(FLOOR.x + x, FLOOR.y + y);
      cx.rotate(rot);
      cx.font = `${Math.round(size)}px sans-serif`;
      cx.fillText(emoji, 0, 0);
      cx.restore();
    };
    draw(s.x, s.y, s.rot, 40, "🩴");
    for (const it of g.items) draw(it.x, it.y, it.rot, it.size, it.emoji, it.fly ? 1 - it.fly / 0.6 : 1);
    // dog
    const d = g.dog;
    draw(d.x, d.y, 0, 34, "🐕");
    if (d.sniff > 0 && d.sniff < 2) {
      cx.font = PIXEL_FONT(7);
      cx.fillStyle = "#ffe14d";
      cx.fillText("SNIFF SNIFF", FLOOR.x + d.x, FLOOR.y + d.y - 26 + Math.sin(t * 10) * 2);
    }

    // you're holding the other slipper
    cx.fillStyle = "#1d1838";
    cx.fillRect(0, 538, W, 62);
    cx.font = "30px sans-serif";
    cx.fillText("🩴", 40, 568);
    cx.font = PIXEL_FONT(7);
    cx.fillStyle = "#8f89b8";
    cx.textAlign = "left";
    cx.fillText("FIND ITS PAIR", 66, 560);
    cx.fillText("TAP JUNK TO TOSS IT", 66, 576);
    // the clock
    const mins = Math.floor(((DAY_SECONDS - g.time) / DAY_SECONDS) * 30);
    cx.textAlign = "right";
    cx.font = PIXEL_FONT(14);
    cx.fillStyle = g.time < 8 ? (Math.sin(t * 12) > 0 ? "#ff4d6d" : "#ffe14d") : "#ffe14d";
    cx.fillText(`7:${String(mins).padStart(2, "0")}`, W - 14, 568);
    cx.textAlign = "center";

    cx.font = PIXEL_FONT(10);
    for (const p of g.pops) {
      cx.globalAlpha = Math.max(0, 1 - p.t / 1.2);
      cx.fillStyle = "#05040b";
      cx.fillText(p.text, FLOOR.x + p.x + 1, FLOOR.y + p.y - 30 - p.t * 22 + 1);
      cx.fillStyle = p.color;
      cx.fillText(p.text, FLOOR.x + p.x, FLOOR.y + p.y - 30 - p.t * 22);
    }
    cx.globalAlpha = 1;
    const banner = (a: string, b: string, col: string) => {
      cx.fillStyle = "rgba(5,4,11,0.8)";
      cx.fillRect(0, 230, W, 76);
      cx.font = PIXEL_FONT(15);
      cx.fillStyle = col;
      cx.fillText(a, W / 2, 258);
      cx.font = PIXEL_FONT(8);
      cx.fillStyle = "#ece9ff";
      cx.fillText(b, W / 2, 284);
    };
    if (playing.current && g.phase === "intro") banner(`DAY ${g.day}`, "LEAVE BY 7:30", "#ffe14d");
    if (g.phase === "late") banner("LATE AGAIN", g.lives > 0 ? "WENT IN ONE SLIPPER. -1 ♥" : "YOU'RE FIRED", "#ff4d6d");
  });

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!playing.current) return;
    e.preventDefault();
    const [x, y] = toLogical(e, e.currentTarget, W, H);
    tap(gameRef.current, x - FLOOR.x, y - FLOOR.y);
  };

  return (
    <LabShell title="LOST SLIPPER" color="#ff8a3d">
      <div className="flex h-9 shrink-0 items-center justify-between px-3 font-pixel text-[8px]">
        <span className="text-[11px]">
          {Array.from({ length: LIVES }, (_, i) => (
            <span key={i} className={i < hud.lives ? "text-red" : "text-line"}>
              ♥
            </span>
          ))}
        </span>
        <span className="text-dim">
          DAY <span className="text-ink">{hud.day}</span>
        </span>
        <span className="text-orange">{hud.score}</span>
      </div>
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        <canvas ref={canvasRef} className="block touch-none" onPointerDown={onDown} />
        {screen === "title" && (
          <TitleCard a="LOST" b="SLIPPER" colorA="#ff8a3d" colorB="#ffe14d" blurb="Every morning, one slipper disappears. Find it before 7:30 or go to work in one." best={best} onPlay={start}>
            <p>Tap things to toss them aside and dig through the mess. When you uncover the 🩴, tap it.</p>
            <p>The house gets messier every day, and from day 2 other shoes are mixed in. Tapping one of those wastes 3 minutes.</p>
            <p>The 🐕 dog sometimes trots over and sniffs near the right spot. Being late costs a ♥.</p>
          </TitleCard>
        )}
        {screen === "over" && result && (
          <GameOverCard title="ONE SLIPPER" score={result.score} isBest={result.best} best={best} color="#ff8a3d" line={`You found ${result.found} ${result.found === 1 ? "slipper" : "slippers"} and tossed ${result.tosses} things.`} again={start} />
        )}
      </div>
    </LabShell>
  );
}
