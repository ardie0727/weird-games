"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { blip, unlock } from "@/lib/lab/sound";
import { GameOverCard, LabShell, PIXEL_FONT, TitleCard, ctx2d, toLogical, useBest, useFitCanvas, useLoop } from "./LabShell";

// Power Cut: the lights flicker on for a moment, then the room goes black.
// Cross the room to the fuse box from memory. Furniture bonks you, Lego hurts,
// and the cat never stays where you last saw it. The lights come back now and
// then, for less time each room.

const W = 360;
const H = 600;
const COLS = 7;
const ROWS = 10;
const T = 46;
const GX = (W - COLS * T) / 2;
const GY = 16;
const LIVES = 3;
const PAD_Y = 492;

type Tile = "floor" | "block" | "lego";
interface Thing {
  emoji: string;
  cells: [number, number][];
}

interface Game {
  room: number;
  grid: Tile[];
  things: Thing[];
  me: [number, number];
  goal: [number, number];
  cat: [number, number] | null;
  catIn: number;
  walked: Set<number>;
  lit: boolean;
  lightT: number;
  time: number;
  total: number;
  lives: number;
  score: number;
  rooms: number;
  hurt: number;
  phase: "play" | "done" | "fail";
  phaseT: number;
  pops: { x: number; y: number; text: string; color: string; t: number }[];
  over: boolean;
}

const idx = (c: number, r: number) => r * COLS + c;
const FURNITURE: { emoji: string; w: number; h: number }[] = [
  { emoji: "🛋️", w: 2, h: 1 },
  { emoji: "🪑", w: 1, h: 1 },
  { emoji: "🪴", w: 1, h: 1 },
  { emoji: "📦", w: 1, h: 1 },
  { emoji: "🛏️", w: 2, h: 2 },
  { emoji: "📺", w: 2, h: 1 },
  { emoji: "🧺", w: 1, h: 1 },
];

function reachable(grid: Tile[], from: [number, number], to: [number, number]) {
  const seen = new Set([idx(...from)]);
  const q = [from];
  while (q.length) {
    const [c, r] = q.shift()!;
    if (c === to[0] && r === to[1]) return true;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || grid[idx(nc, nr)] === "block" || seen.has(idx(nc, nr))) continue;
      seen.add(idx(nc, nr));
      q.push([nc, nr]);
    }
  }
  return false;
}

function lightTimes(room: number) {
  return { on: Math.max(0.9, 2.4 - room * 0.18), off: Math.min(6.5, 3.6 + room * 0.3) };
}

function buildRoom(g: Game) {
  for (;;) {
    const grid: Tile[] = new Array(COLS * ROWS).fill("floor");
    const things: Thing[] = [];
    const me: [number, number] = [Math.floor(Math.random() * COLS), ROWS - 1];
    const goal: [number, number] = [Math.floor(Math.random() * COLS), 0];
    const nFurn = Math.min(14, 6 + g.room);
    for (let i = 0; i < nFurn * 3 && things.length < nFurn; i++) {
      const f = FURNITURE[Math.floor(Math.random() * FURNITURE.length)];
      const c = Math.floor(Math.random() * (COLS - f.w + 1)), r = 1 + Math.floor(Math.random() * (ROWS - 2 - f.h + 1));
      const cells: [number, number][] = [];
      for (let dc = 0; dc < f.w; dc++) for (let dr = 0; dr < f.h; dr++) cells.push([c + dc, r + dr]);
      if (cells.some(([a, b]) => grid[idx(a, b)] !== "floor")) continue;
      for (const [a, b] of cells) grid[idx(a, b)] = "block";
      things.push({ emoji: f.emoji, cells });
    }
    if (!reachable(grid, me, goal)) continue;
    for (let i = Math.min(8, 2 + g.room); i > 0; i--) {
      const c = Math.floor(Math.random() * COLS), r = 1 + Math.floor(Math.random() * (ROWS - 2));
      if (grid[idx(c, r)] === "floor") grid[idx(c, r)] = "lego";
    }
    g.grid = grid;
    g.things = things;
    g.me = me;
    g.goal = goal;
    let cat: [number, number] | null = null;
    if (g.room >= 2)
      for (let i = 0; i < 50 && !cat; i++) {
        const c = Math.floor(Math.random() * COLS), r = 2 + Math.floor(Math.random() * (ROWS - 4));
        if (grid[idx(c, r)] === "floor") cat = [c, r];
      }
    g.cat = cat;
    g.catIn = 2.5;
    g.walked = new Set([idx(...me)]);
    g.lit = true;
    g.lightT = lightTimes(g.room).on + 1.2; // a longer first look
    g.total = 22 + g.room;
    g.time = g.total;
    g.phase = "play";
    return;
  }
}

function newGame(): Game {
  const g = { room: 1, grid: [], things: [], me: [0, 0], goal: [0, 0], cat: null, catIn: 0, walked: new Set<number>(), lit: true, lightT: 0, time: 0, total: 1, lives: LIVES, score: 0, rooms: 0, hurt: 0, phase: "play", phaseT: 0, pops: [], over: false } as Game;
  buildRoom(g);
  return g;
}

const cellXY = (c: number, r: number): [number, number] => [GX + c * T + T / 2, GY + r * T + T / 2];

function ouch(g: Game, text: string) {
  g.lives--;
  g.hurt = 0.4;
  const [x, y] = cellXY(...g.me);
  g.pops.push({ x, y, text, color: "#ff4d6d", t: 0 });
  blip("ouch", [
    [220, 0, 0.1, "square", 0.06],
    [160, 0.08, 0.15, "square", 0.05],
  ]);
  if (g.lives <= 0) {
    g.phase = "fail";
    g.phaseT = 1.4;
  }
}

function move(g: Game, dc: number, dr: number) {
  if (g.phase !== "play") return;
  const nc = g.me[0] + dc, nr = g.me[1] + dr;
  if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) {
    blip("wall", [[120, 0, 0.06, "square", 0.04]]);
    return;
  }
  const tile = g.grid[idx(nc, nr)];
  if (tile === "block") return ouch(g, "BONK!");
  if (g.cat && g.cat[0] === nc && g.cat[1] === nr) {
    g.catIn = 0.3; // it bolts
    return ouch(g, "MREOW!");
  }
  g.me = [nc, nr];
  g.walked.add(idx(nc, nr));
  blip("step", [[300 + nr * 10, 0, 0.03, "triangle", 0.025]]);
  if (tile === "lego") {
    g.grid[idx(nc, nr)] = "floor";
    ouch(g, "LEGO!!");
  }
  if (g.phase === "play" && nc === g.goal[0] && nr === g.goal[1]) {
    const pts = 100 + Math.ceil(g.time) * 8;
    g.score += pts;
    g.rooms++;
    g.phase = "done";
    g.phaseT = 1.5;
    g.lit = true;
    const [x, y] = cellXY(nc, nr);
    g.pops.push({ x, y: y + 30, text: `POWER ON +${pts}`, color: "#ffe14d", t: 0 });
    blip("power", [
      [262, 0, 0.1, "square", 0.04],
      [392, 0.1, 0.1, "square", 0.04],
      [523, 0.2, 0.25, "square", 0.04],
    ]);
  }
}

function step(g: Game, dt: number) {
  for (const p of g.pops) p.t += dt;
  g.pops = g.pops.filter((p) => p.t < 1.2);
  g.hurt = Math.max(0, g.hurt - dt);
  if (g.phase !== "play") {
    g.phaseT -= dt;
    if (g.phaseT > 0) return;
    if (g.lives <= 0) g.over = true;
    else {
      if (g.phase === "done") g.room++;
      buildRoom(g);
    }
    return;
  }
  g.time -= dt;
  if (g.time <= 0) {
    g.time = 0;
    ouch(g, "TOO SLOW");
    if (g.phase === "play") {
      g.phase = "fail";
      g.phaseT = 1.4;
    }
    return;
  }
  g.lightT -= dt;
  if (g.lightT <= 0) {
    g.lit = !g.lit;
    const lt = lightTimes(g.room);
    g.lightT = g.lit ? lt.on : lt.off * (0.8 + Math.random() * 0.4);
    blip(g.lit ? "on" : "off", [[g.lit ? 900 : 200, 0, 0.08, "square", 0.03, g.lit ? 1200 : 80]]);
  }
  // the cat wanders
  if (g.cat) {
    g.catIn -= dt;
    if (g.catIn <= 0) {
      g.catIn = 1.6 + Math.random() * 1.6;
      const opts = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]
        .map(([dc, dr]) => [g.cat![0] + dc, g.cat![1] + dr] as [number, number])
        .filter(([c, r]) => c >= 0 && r >= 1 && c < COLS && r < ROWS - 1 && g.grid[idx(c, r)] !== "block" && !(c === g.me[0] && r === g.me[1]));
      if (opts.length) g.cat = opts[Math.floor(Math.random() * opts.length)];
    }
  }
}

const PAD: { key: string; dc: number; dr: number; x: number; y: number }[] = [
  { key: "▲", dc: 0, dr: -1, x: 180, y: PAD_Y + 30 },
  { key: "◀", dc: -1, dr: 0, x: 110, y: PAD_Y + 74 },
  { key: "▼", dc: 0, dr: 1, x: 180, y: PAD_Y + 74 },
  { key: "▶", dc: 1, dr: 0, x: 250, y: PAD_Y + 74 },
];
const PAD_W = 64;
const PAD_H = 40;

export function PowerCut() {
  const [screen, setScreen] = useState<"title" | "play" | "over">("title");
  const [best, submitBest] = useBest("lab.powercut.best");
  const [hud, setHud] = useState({ score: 0, lives: LIVES, room: 1, time: 0, total: 1 });
  const [result, setResult] = useState<{ score: number; rooms: number; best: boolean } | null>(null);
  const { wrapRef, canvasRef } = useFitCanvas(W, H);
  const gameRef = useRef<Game>(newGame());
  const playing = useRef(false);
  const hudAt = useRef(0);
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);

  const start = useCallback(() => {
    unlock();
    gameRef.current = newGame();
    playing.current = true;
    setScreen("play");
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!playing.current) return;
      const m: Record<string, [number, number]> = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] };
      const d = m[e.key];
      if (d) {
        e.preventDefault();
        move(gameRef.current, ...d);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  useLoop((dt, now) => {
    const g = gameRef.current;
    if (playing.current) {
      step(g, dt);
      if (g.over) {
        playing.current = false;
        setResult({ score: g.score, rooms: g.rooms, best: submitBest(g.score) });
        setScreen("over");
      }
    }
    if (now - hudAt.current > 100) {
      hudAt.current = now;
      setHud({ score: g.score, lives: g.lives, room: g.room, time: g.time, total: g.total });
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = ctx2d(canvas, W);
    const t = now / 1000;
    const lit = g.lit || !playing.current;

    cx.fillStyle = "#05040b";
    cx.fillRect(0, 0, W, H);
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    if (lit) {
      // the room, all at once
      cx.fillStyle = "#3a2f63";
      cx.fillRect(GX, GY, COLS * T, ROWS * T);
      cx.strokeStyle = "#2a2350";
      cx.lineWidth = 1;
      for (let c = 0; c <= COLS; c++) {
        cx.beginPath();
        cx.moveTo(GX + c * T, GY);
        cx.lineTo(GX + c * T, GY + ROWS * T);
        cx.stroke();
      }
      for (let r = 0; r <= ROWS; r++) {
        cx.beginPath();
        cx.moveTo(GX, GY + r * T);
        cx.lineTo(GX + COLS * T, GY + r * T);
        cx.stroke();
      }
      for (const th of g.things) {
        const xs = th.cells.map((c) => c[0]), ys = th.cells.map((c) => c[1]);
        const c0 = Math.min(...xs), r0 = Math.min(...ys), w = Math.max(...xs) - c0 + 1, h = Math.max(...ys) - r0 + 1;
        cx.fillStyle = "#5a3b1f";
        cx.fillRect(GX + c0 * T + 3, GY + r0 * T + 3, w * T - 6, h * T - 6);
        cx.font = `${Math.min(w, h) * 30}px sans-serif`;
        cx.fillText(th.emoji, GX + (c0 + w / 2) * T, GY + (r0 + h / 2) * T + 2);
      }
      cx.font = "22px sans-serif";
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (g.grid[idx(c, r)] === "lego") cx.fillText("🧱", ...cellXY(c, r));
      if (g.cat) {
        cx.font = "28px sans-serif";
        cx.fillText("🐈‍⬛", ...cellXY(...g.cat));
      }
    } else {
      // pitch black: only the footsteps you remember
      cx.fillStyle = "rgba(143,137,184,0.12)";
      for (const i of g.walked) {
        const c = i % COLS, r = Math.floor(i / COLS);
        cx.fillRect(GX + c * T + 14, GY + r * T + 14, T - 28, T - 28);
      }
      cx.strokeStyle = "rgba(42,35,80,0.6)";
      cx.strokeRect(GX, GY, COLS * T, ROWS * T);
    }
    // fuse box (it glows faintly even in the dark)
    const [gx, gy] = cellXY(...g.goal);
    cx.globalAlpha = lit ? 1 : 0.18 + 0.1 * Math.sin(t * 4);
    cx.font = "28px sans-serif";
    cx.fillText("⚡", gx, gy);
    cx.globalAlpha = 1;
    // you
    const [mx, my] = cellXY(...g.me);
    if (!lit) {
      const glow = cx.createRadialGradient(mx, my, 2, mx, my, 34);
      glow.addColorStop(0, "rgba(255,225,77,0.25)");
      glow.addColorStop(1, "rgba(255,225,77,0)");
      cx.fillStyle = glow;
      cx.fillRect(mx - 40, my - 40, 80, 80);
    }
    cx.font = "28px sans-serif";
    cx.fillText(g.hurt > 0 ? "😖" : "🧍", mx + (g.hurt ? Math.sin(t * 60) * 3 : 0), my);

    // d-pad
    for (const p of PAD) {
      cx.fillStyle = "#1d1838";
      cx.fillRect(p.x - PAD_W / 2, p.y - PAD_H / 2, PAD_W, PAD_H);
      cx.strokeStyle = "#ffe14d";
      cx.lineWidth = 2;
      cx.strokeRect(p.x - PAD_W / 2, p.y - PAD_H / 2, PAD_W, PAD_H);
      cx.font = PIXEL_FONT(14);
      cx.fillStyle = "#ffe14d";
      cx.fillText(p.key, p.x, p.y + 1);
    }
    cx.font = PIXEL_FONT(7);
    cx.fillStyle = lit ? "#ffe14d" : "#8f89b8";
    cx.fillText(lit ? "LIGHTS ON — LOOK!" : "DARK — SWIPE OR TAP ARROWS", W / 2, PAD_Y - 4);

    cx.font = PIXEL_FONT(10);
    for (const p of g.pops) {
      cx.globalAlpha = Math.max(0, 1 - p.t / 1.2);
      cx.fillStyle = "#05040b";
      cx.fillText(p.text, p.x + 1, p.y - 24 - p.t * 22 + 1);
      cx.fillStyle = p.color;
      cx.fillText(p.text, p.x, p.y - 24 - p.t * 22);
    }
    cx.globalAlpha = 1;
    if (g.hurt > 0) {
      cx.fillStyle = `rgba(255,77,109,${g.hurt * 0.5})`;
      cx.fillRect(0, 0, W, H);
    }
  });

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!playing.current) return;
    e.preventDefault();
    const [x, y] = toLogical(e, e.currentTarget, W, H);
    const p = PAD.find((b) => Math.abs(b.x - x) <= PAD_W / 2 + 4 && Math.abs(b.y - y) <= PAD_H / 2 + 4);
    if (p) return move(gameRef.current, p.dc, p.dr);
    swipe.current = { id: e.pointerId, x, y };
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.id !== e.pointerId) return;
    const [x, y] = toLogical(e, e.currentTarget, W, H);
    const dx = x - s.x, dy = y - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
    if (Math.abs(dx) > Math.abs(dy)) move(gameRef.current, Math.sign(dx), 0);
    else move(gameRef.current, 0, Math.sign(dy));
  };

  return (
    <LabShell title="POWER CUT" color="#ffe14d">
      <div className="flex h-9 shrink-0 items-center gap-3 px-3 font-pixel text-[8px]">
        <span className="text-[11px]">
          {Array.from({ length: LIVES }, (_, i) => (
            <span key={i} className={i < hud.lives ? "text-red" : "text-line"}>
              ♥
            </span>
          ))}
        </span>
        <span className="text-dim">
          ROOM <span className="text-ink">{hud.room}</span>
        </span>
        <div className="h-2 flex-1 bg-line">
          <div className="h-full" style={{ width: `${(hud.time / hud.total) * 100}%`, background: hud.time / hud.total < 0.25 ? "#ff4d6d" : "#ffe14d" }} />
        </div>
        <span className="text-yellow">{hud.score}</span>
      </div>
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        <canvas ref={canvasRef} className="block touch-none" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => (swipe.current = null)} />
        {screen === "title" && (
          <TitleCard a="POWER" b="CUT" colorA="#ffe14d" colorB="#22f3ff" blurb="The power keeps cutting out. Get to the fuse box ⚡ before the room timer runs out, mostly in the dark." best={best} onPlay={start}>
            <p>When the lights flash on, memorise the room. Then move a square at a time in the dark by swiping or tapping the arrows.</p>
            <p>Walking into furniture is a BONK, stepping on 🧱 Lego hurts, and the 🐈‍⬛ cat moves around while you can&apos;t see it. Each one costs a ♥.</p>
            <p>Every room gives you less light and more clutter. Faster fuse fixes score more.</p>
          </TitleCard>
        )}
        {screen === "over" && result && (
          <GameOverCard title="STILL DARK" score={result.score} isBest={result.best} best={best} color="#ffe14d" line={`You got the power back in ${result.rooms} ${result.rooms === 1 ? "room" : "rooms"}.`} again={start} />
        )}
      </div>
    </LabShell>
  );
}
