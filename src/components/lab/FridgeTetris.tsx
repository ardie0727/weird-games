"use client";

import { useCallback, useRef, useState } from "react";
import { blip, unlock } from "@/lib/lab/sound";
import { GameOverCard, LabShell, PIXEL_FONT, TitleCard, ctx2d, toLogical, useBest, useFitCanvas, useLoop } from "./LabShell";

// Fridge Tetris: oddly shaped leftovers wait on the counter. Drag each into the
// fridge (tap to rotate) before the door swings shut. Shelves split the fridge
// into compartments, and nothing can poke through a shelf. Old jars take up
// space, more each round.

const W = 360;
const H = 600;
const COLS = 6;
const ROWS = 9;
const C = 44;
const FX = (W - COLS * C) / 2;
const FY = 34;
const SHELF = 3; // rows per compartment
const TRAY_Y = 470;
const SLOT_W = 100;
const BIN = { x: 306, y: TRAY_Y + 8, w: 48, h: 112 };
const LIVES = 3;
const LIFT = 70; // dragged food floats above the finger

type Cell = [number, number];

const FOODS: { emoji: string; name: string; color: string; cells: Cell[] }[] = [
  { emoji: "🍕", name: "pizza", color: "#ff8a3d", cells: [[0, 0], [1, 0], [0, 1]] },
  { emoji: "🍝", name: "pasta", color: "#ffe14d", cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { emoji: "🥖", name: "baguette", color: "#c98b5a", cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  { emoji: "🥚", name: "eggs", color: "#ece9ff", cells: [[0, 0], [1, 0]] },
  { emoji: "🧀", name: "cheese", color: "#ffe14d", cells: [[0, 0], [0, 1], [0, 2], [1, 2]] },
  { emoji: "🍰", name: "cake", color: "#ff2bd6", cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
  { emoji: "🍗", name: "chicken", color: "#ff8a3d", cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  { emoji: "🥛", name: "milk", color: "#22f3ff", cells: [[0, 0], [0, 1], [0, 2]] },
  { emoji: "🍜", name: "noodles", color: "#ff4d6d", cells: [[0, 0]] },
  { emoji: "🍉", name: "watermelon", color: "#39ff88", cells: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]] },
  { emoji: "🌯", name: "wrap", color: "#b26bff", cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
];

interface Piece {
  id: number;
  food: number;
  cells: Cell[];
}

interface Game {
  round: number;
  grid: (number | null)[]; // food index, -1 for an old jar, null for empty
  queue: Piece[];
  tray: (Piece | null)[];
  time: number;
  total: number;
  lives: number;
  score: number;
  placed: number;
  phase: "intro" | "play" | "shut" | "clear";
  phaseT: number;
  drag: { id: number; x: number; y: number; sx: number; sy: number; moved: boolean } | null;
  pops: { x: number; y: number; text: string; color: string; t: number }[];
  nextId: number;
  over: boolean;
}

function norm(cells: Cell[]): Cell[] {
  const mx = Math.min(...cells.map((c) => c[0])), my = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => [x - mx, y - my] as Cell);
}
const rotate = (cells: Cell[]): Cell[] => norm(cells.map(([x, y]) => [-y, x] as Cell));
const size = (cells: Cell[]) => [Math.max(...cells.map((c) => c[0])) + 1, Math.max(...cells.map((c) => c[1])) + 1];

function makePiece(g: Game, food: number): Piece {
  let cells = FOODS[food].cells;
  for (let r = Math.floor(Math.random() * 4); r > 0; r--) cells = rotate(cells);
  return { id: g.nextId++, food, cells };
}

function startRound(g: Game) {
  const n = g.round;
  g.grid = new Array(COLS * ROWS).fill(null);
  // old jars nobody remembers buying
  for (let j = Math.min(10, n * 2); j > 0; j--) g.grid[Math.floor(Math.random() * g.grid.length)] = -1;
  const free = g.grid.filter((c) => c === null).length;
  const count = Math.min(11, 4 + n);
  const pieces: Piece[] = [];
  let cells = 0;
  while (pieces.length < count) {
    const food = Math.floor(Math.random() * FOODS.length);
    // keep it roomy enough to be possible
    if (cells + FOODS[food].cells.length > free * 0.72) {
      if (pieces.length >= 3) break;
      continue;
    }
    cells += FOODS[food].cells.length;
    pieces.push(makePiece(g, food));
  }
  g.queue = pieces;
  g.tray = [null, null, null];
  refill(g);
  g.total = Math.max(18, 38 - n * 2);
  g.time = g.total;
  g.phase = "intro";
  g.phaseT = 1.2;
}

function refill(g: Game) {
  for (let i = 0; i < 3; i++) if (!g.tray[i] && g.queue.length) g.tray[i] = g.queue.shift()!;
}

function newGame(): Game {
  const g: Game = { round: 1, grid: [], queue: [], tray: [null, null, null], time: 0, total: 0, lives: LIVES, score: 0, placed: 0, phase: "intro", phaseT: 0, drag: null, pops: [], nextId: 1, over: false };
  startRound(g);
  return g;
}

function fits(g: Game, p: Piece, col: number, row: number): boolean {
  const comp = Math.floor((row + p.cells[0][1]) / SHELF);
  return p.cells.every(([x, y]) => {
    const c = col + x, r = row + y;
    return c >= 0 && c < COLS && r >= 0 && r < ROWS && g.grid[r * COLS + c] === null && Math.floor(r / SHELF) === comp;
  });
}

function step(g: Game, dt: number) {
  for (const p of g.pops) p.t += dt;
  g.pops = g.pops.filter((p) => p.t < 1.2);
  if (g.phase !== "play") {
    g.phaseT -= dt;
    if (g.phaseT > 0) return;
    if (g.phase === "intro") g.phase = "play";
    else if (g.phase === "clear" || g.phase === "shut") {
      if (g.lives <= 0) {
        g.over = true;
        return;
      }
      g.round++;
      startRound(g);
    }
    return;
  }
  g.time -= dt;
  if (g.time <= 0) {
    g.time = 0;
    g.lives--;
    g.drag = null;
    g.phase = "shut";
    g.phaseT = 1.8;
    blip("shut", [
      [160, 0, 0.3, "square", 0.06],
      [90, 0.25, 0.4, "sawtooth", 0.05],
    ]);
  }
}

function dropAnchor(p: Piece, x: number, y: number): [number, number] {
  const [w, h] = size(p.cells);
  return [Math.round((x - (w * C) / 2 - FX) / C), Math.round((y - LIFT - (h * C) / 2 - FY) / C)];
}

function place(g: Game, slot: number, x: number, y: number) {
  const p = g.tray[slot]!;
  if (x >= BIN.x - 6 && y >= BIN.y - 6) {
    g.tray[slot] = null;
    g.time = Math.max(0.1, g.time - 3);
    g.score = Math.max(0, g.score - 10);
    g.pops.push({ x: BIN.x + BIN.w / 2, y: BIN.y, text: "TOSSED -3s", color: "#ff4d6d", t: 0 });
    blip("toss", [[200, 0, 0.15, "sawtooth", 0.04, 90]]);
  } else {
    const [col, row] = dropAnchor(p, x, y);
    if (!fits(g, p, col, row)) {
      blip("nope", [[140, 0, 0.1, "square", 0.04]]);
      return;
    }
    for (const [cx, cy] of p.cells) g.grid[(row + cy) * COLS + col + cx] = p.food;
    g.tray[slot] = null;
    g.placed++;
    const pts = p.cells.length * 5;
    g.score += pts;
    g.pops.push({ x: FX + (col + 1) * C, y: FY + row * C, text: `+${pts}`, color: "#39ff88", t: 0 });
    blip("place", [
      [500, 0, 0.05, "square", 0.035],
      [750, 0.05, 0.06, "square", 0.035],
    ]);
  }
  refill(g);
  if (!g.tray.some(Boolean) && !g.queue.length) {
    const bonus = Math.ceil(g.time) * 10;
    g.score += bonus;
    g.phase = "clear";
    g.phaseT = 1.6;
    g.pops.push({ x: W / 2, y: FY + 200, text: `ALL IN! +${bonus}`, color: "#ffe14d", t: 0 });
    blip("clear", [
      [523, 0, 0.1, "square", 0.04],
      [659, 0.1, 0.1, "square", 0.04],
      [784, 0.2, 0.2, "square", 0.04],
    ]);
  }
}

function drawPiece(cx: CanvasRenderingContext2D, p: Piece, x: number, y: number, cell: number, alpha = 1) {
  const f = FOODS[p.food];
  cx.globalAlpha = alpha;
  for (const [px, py] of p.cells) {
    cx.fillStyle = f.color;
    cx.fillRect(x + px * cell + 1, y + py * cell + 1, cell - 2, cell - 2);
    cx.fillStyle = "rgba(255,255,255,0.25)";
    cx.fillRect(x + px * cell + 1, y + py * cell + 1, cell - 2, 3);
  }
  cx.font = `${Math.round(cell * 0.62)}px sans-serif`;
  cx.textAlign = "center";
  cx.textBaseline = "middle";
  for (const [px, py] of p.cells) cx.fillText(f.emoji, x + px * cell + cell / 2, y + py * cell + cell / 2 + 1);
  cx.globalAlpha = 1;
}

const slotX = (i: number) => 6 + i * SLOT_W;

export function FridgeTetris() {
  const [screen, setScreen] = useState<"title" | "play" | "over">("title");
  const [best, submitBest] = useBest("lab.fridge.best");
  const [hud, setHud] = useState({ score: 0, lives: LIVES, round: 1, time: 0, total: 1, left: 0 });
  const [result, setResult] = useState<{ score: number; round: number; placed: number; best: boolean } | null>(null);
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
        setResult({ score: g.score, round: g.round, placed: g.placed, best: submitBest(g.score) });
        setScreen("over");
      }
    }
    if (now - hudAt.current > 100) {
      hudAt.current = now;
      setHud({ score: g.score, lives: g.lives, round: g.round, time: g.time, total: g.total, left: g.queue.length + g.tray.filter(Boolean).length });
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = ctx2d(canvas, W);

    cx.fillStyle = "#120d24";
    cx.fillRect(0, 0, W, H);
    // fridge body and cold light
    cx.fillStyle = "#d8d4f2";
    cx.fillRect(FX - 14, FY - 14, COLS * C + 28, ROWS * C + 28);
    cx.fillStyle = "#1a2a3a";
    cx.fillRect(FX, FY, COLS * C, ROWS * C);
    const glow = cx.createRadialGradient(W / 2, FY, 10, W / 2, FY, 260);
    glow.addColorStop(0, "rgba(34,243,255,0.22)");
    glow.addColorStop(1, "rgba(34,243,255,0)");
    cx.fillStyle = glow;
    cx.fillRect(FX, FY, COLS * C, ROWS * C);
    cx.strokeStyle = "rgba(255,255,255,0.05)";
    cx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) {
      cx.beginPath();
      cx.moveTo(FX + c * C, FY);
      cx.lineTo(FX + c * C, FY + ROWS * C);
      cx.stroke();
    }
    for (let r = 1; r < ROWS; r++) {
      cx.beginPath();
      cx.moveTo(FX, FY + r * C);
      cx.lineTo(FX + COLS * C, FY + r * C);
      cx.stroke();
    }
    // contents
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const v = g.grid[r * COLS + c];
        if (v === null) continue;
        const x = FX + c * C, y = FY + r * C;
        if (v === -1) {
          cx.fillStyle = "#5d5788";
          cx.fillRect(x + 8, y + 8, C - 16, C - 10);
          cx.fillStyle = "#8f89b8";
          cx.fillRect(x + 6, y + 4, C - 12, 6);
          cx.font = PIXEL_FONT(6);
          cx.fillStyle = "#39ff88";
          cx.textAlign = "center";
          cx.fillText("???", x + C / 2, y + C / 2 + 4);
        } else {
          cx.fillStyle = FOODS[v].color;
          cx.globalAlpha = 0.85;
          cx.fillRect(x + 1, y + 1, C - 2, C - 2);
          cx.globalAlpha = 1;
          cx.font = `${Math.round(C * 0.6)}px sans-serif`;
          cx.textAlign = "center";
          cx.textBaseline = "middle";
          cx.fillText(FOODS[v].emoji, x + C / 2, y + C / 2 + 1);
        }
      }
    // shelves
    cx.fillStyle = "#ece9ff";
    for (let r = SHELF; r < ROWS; r += SHELF) cx.fillRect(FX - 4, FY + r * C - 2, COLS * C + 8, 4);

    // drag ghost
    const d = g.drag;
    const slot = d ? g.tray.findIndex((p) => p?.id === d.id) : -1;
    if (d && d.moved && slot >= 0) {
      const p = g.tray[slot]!;
      const [col, row] = dropAnchor(p, d.x, d.y);
      const ok = fits(g, p, col, row);
      cx.fillStyle = ok ? "rgba(57,255,136,0.35)" : "rgba(255,77,109,0.3)";
      for (const [px, py] of p.cells) {
        const c = col + px, r = row + py;
        if (c >= 0 && c < COLS && r >= 0 && r < ROWS) cx.fillRect(FX + c * C + 2, FY + r * C + 2, C - 4, C - 4);
      }
    }

    // the door swings shut as time runs out
    const shut = g.phase === "shut" ? 1 : g.phase === "play" ? 1 - g.time / g.total : 0;
    if (shut > 0) {
      const dw = (COLS * C + 28) * Math.pow(shut, 2.2);
      cx.fillStyle = "#b9b4d9";
      cx.fillRect(FX + COLS * C + 14 - dw, FY - 14, dw, ROWS * C + 28);
      cx.fillStyle = "#8f89b8";
      if (dw > 20) cx.fillRect(FX + COLS * C + 14 - dw + 10, FY + 120, 6, 90);
    }

    // counter tray
    cx.fillStyle = "#3a2b1c";
    cx.fillRect(0, TRAY_Y, W, H - TRAY_Y);
    cx.fillStyle = "#5a3b1f";
    cx.fillRect(0, TRAY_Y, W, 6);
    g.tray.forEach((p, i) => {
      if (!p || (d && d.id === p.id && d.moved)) return;
      const [w, h] = size(p.cells);
      const cell = Math.min(22, (SLOT_W - 12) / w, 104 / h);
      drawPiece(cx, p, slotX(i) + (SLOT_W - w * cell) / 2, TRAY_Y + 14 + (110 - h * cell) / 2, cell);
    });
    // bin
    cx.fillStyle = "#2a2350";
    cx.fillRect(BIN.x, BIN.y, BIN.w, BIN.h);
    cx.font = "22px sans-serif";
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    cx.fillText("🗑️", BIN.x + BIN.w / 2, BIN.y + BIN.h / 2 - 8);
    cx.font = PIXEL_FONT(6);
    cx.fillStyle = "#8f89b8";
    cx.fillText("-3s", BIN.x + BIN.w / 2, BIN.y + BIN.h / 2 + 18);

    if (d && d.moved && slot >= 0) {
      const p = g.tray[slot]!;
      const [w, h] = size(p.cells);
      drawPiece(cx, p, d.x - (w * C) / 2, d.y - LIFT - (h * C) / 2, C, 0.9);
    }

    cx.textAlign = "center";
    cx.textBaseline = "alphabetic";
    cx.font = PIXEL_FONT(11);
    for (const p of g.pops) {
      cx.globalAlpha = Math.max(0, 1 - p.t / 1.2);
      cx.fillStyle = "#05040b";
      cx.fillText(p.text, p.x + 1, p.y - p.t * 24 + 1);
      cx.fillStyle = p.color;
      cx.fillText(p.text, p.x, p.y - p.t * 24);
    }
    cx.globalAlpha = 1;
    const banner = (a: string, b: string, col: string) => {
      cx.fillStyle = "rgba(5,4,11,0.8)";
      cx.fillRect(0, 190, W, 80);
      cx.font = PIXEL_FONT(16);
      cx.fillStyle = col;
      cx.fillText(a, W / 2, 226);
      cx.font = PIXEL_FONT(8);
      cx.fillStyle = "#ece9ff";
      cx.fillText(b, W / 2, 252);
    };
    if (playing.current && g.phase === "intro") banner(`FRIDGE ${g.round}`, `${g.queue.length + g.tray.filter(Boolean).length} LEFTOVERS · ${Math.round(g.total)}s`, "#22f3ff");
    if (g.phase === "shut") banner("SLAM!", g.lives > 0 ? "THE LEFTOVERS SPOIL. -1 ♥" : "EVERYTHING STINKS", "#ff4d6d");
  });

  const trayAt = (x: number, y: number) => (y >= TRAY_Y && x < 6 + 3 * SLOT_W ? Math.floor((x - 6) / SLOT_W) : -1);

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gameRef.current;
    if (!playing.current || g.phase !== "play") return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = toLogical(e, e.currentTarget, W, H);
    const i = trayAt(x, y);
    const p = i >= 0 ? g.tray[i] : null;
    if (p) g.drag = { id: p.id, x, y, sx: x, sy: y, moved: false };
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gameRef.current;
    if (!g.drag) return;
    const [x, y] = toLogical(e, e.currentTarget, W, H);
    g.drag.x = x;
    g.drag.y = y;
    if (Math.hypot(x - g.drag.sx, y - g.drag.sy) > 10) g.drag.moved = true;
  };
  const onUp = () => {
    const g = gameRef.current;
    const d = g.drag;
    g.drag = null;
    if (!d || g.phase !== "play") return;
    const slot = g.tray.findIndex((p) => p?.id === d.id);
    if (slot < 0) return;
    if (!d.moved) {
      g.tray[slot]!.cells = rotate(g.tray[slot]!.cells);
      blip("rot", [[880, 0, 0.04, "square", 0.03]]);
      return;
    }
    place(g, slot, d.x, d.y);
  };

  const pct = (hud.time / hud.total) * 100;

  return (
    <LabShell title="FRIDGE TETRIS" color="#22f3ff">
      <div className="flex h-9 shrink-0 items-center gap-3 px-3 font-pixel text-[8px]">
        <span className="text-[11px]">
          {Array.from({ length: LIVES }, (_, i) => (
            <span key={i} className={i < hud.lives ? "text-red" : "text-line"}>
              ♥
            </span>
          ))}
        </span>
        <span className="text-dim">
          #<span className="text-ink">{hud.round}</span>
        </span>
        <div className="h-2 flex-1 bg-line">
          <div className="h-full" style={{ width: `${pct}%`, background: pct < 30 ? "#ff4d6d" : "#22f3ff" }} />
        </div>
        <span className="text-dim">
          LEFT <span className="text-ink">{hud.left}</span>
        </span>
        <span className="text-cyan">{hud.score}</span>
      </div>
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        <canvas ref={canvasRef} className="block touch-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => (gameRef.current.drag = null)} />
        {screen === "title" && (
          <TitleCard a="FRIDGE" b="TETRIS" colorA="#22f3ff" colorB="#ffe14d" blurb="Get every oddly shaped leftover into the fridge before the door swings shut." best={best} onPlay={start}>
            <p>Drag food from the counter into the fridge. Tap a piece on the counter to rotate it. Food floats a little above your finger so you can see where it lands.</p>
            <p>Shelves split the fridge into three compartments, and nothing can poke through a shelf. Mystery jars take up more room every round.</p>
            <p>If the door shuts with food still out, you lose a ♥. Stuck? The bin takes a piece but costs 3 seconds.</p>
          </TitleCard>
        )}
        {screen === "over" && result && (
          <GameOverCard title="IT STINKS" score={result.score} isBest={result.best} best={best} color="#22f3ff" line={`You reached fridge ${result.round} and stored ${result.placed} leftovers.`} again={start} />
        )}
      </div>
    </LabShell>
  );
}
