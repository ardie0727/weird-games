"use client";

import { useCallback, useRef, useState } from "react";
import { blip, unlock } from "@/lib/lab/sound";
import { GameOverCard, LabShell, PIXEL_FONT, TitleCard, ctx2d, toLogical, useBest, useFitCanvas, useLoop } from "./LabShell";

// Dabbawala Rush: lunch tiffins arrive on the handcart with a coloured lid and
// a painted mark. Three local trains wait at the platforms, each with a code
// board and a departure clock. Drag every tiffin onto its train before it
// leaves. Wrong train, or a train leaving without its lunch, is a strike.

const W = 360;
const H = 600;
const TRACK_Y = [24, 128, 232]; // top of each platform row
const TRACK_H = 92;
const CART = { y: 360, cols: 4, rows: 2, cw: 84, ch: 96, x0: 12 };
const STRIKES = 3;
const FULL = 4; // tiffins for a full-train bonus

const COLORS = [
  { name: "red", hex: "#ff4d6d" },
  { name: "cyan", hex: "#22f3ff" },
  { name: "yellow", hex: "#ffe14d" },
  { name: "green", hex: "#39ff88" },
  { name: "purple", hex: "#b26bff" },
];
const MARKS = ["●", "▲", "■", "✚"];

interface Code {
  c: number;
  m: number;
}
const same = (a: Code, b: Code) => a.c === b.c && a.m === b.m;

interface Train {
  code: Code;
  timeLeft: number;
  total: number;
  loaded: number;
  state: "arrive" | "wait" | "leave";
  x: number; // slide offset
}

interface Tiffin {
  id: number;
  code: Code;
  slot: number;
  x: number;
  y: number;
}

interface Game {
  time: number;
  trains: (Train | null)[];
  respawn: number[];
  tiffins: Tiffin[];
  spawnIn: number;
  nextId: number;
  score: number;
  delivered: number;
  strikes: number;
  drag: { id: number; dx: number; dy: number; sx: number; sy: number; moved: boolean } | null;
  selected: number | null;
  pops: { x: number; y: number; text: string; color: string; t: number }[];
  over: boolean;
}

function slotPos(slot: number): [number, number] {
  const c = slot % CART.cols, r = Math.floor(slot / CART.cols);
  return [CART.x0 + c * CART.cw + CART.cw / 2, CART.y + 40 + r * CART.ch + CART.ch / 2];
}

const tricky = (g: Game) => g.time > 40;

function newCode(g: Game): Code {
  const taken = g.trains.filter((t): t is Train => !!t).map((t) => t.code);
  for (;;) {
    const code = { c: Math.floor(Math.random() * COLORS.length), m: tricky(g) ? Math.floor(Math.random() * MARKS.length) : 0 };
    // later on, sometimes reuse a colour with a different mark to make you read both
    if (tricky(g) && taken.length && Math.random() < 0.5) code.c = taken[Math.floor(Math.random() * taken.length)].c;
    if (!taken.some((t) => same(t, code))) return code;
  }
}

function newTrain(g: Game): Train {
  const total = Math.max(9, 17 - g.time / 12) * (0.85 + Math.random() * 0.3);
  return { code: newCode(g), timeLeft: total, total, loaded: 0, state: "arrive", x: W };
}

function newGame(): Game {
  const g: Game = { time: 0, trains: [null, null, null], respawn: [0, 1.2, 2.4], tiffins: [], spawnIn: 1.5, nextId: 1, score: 0, delivered: 0, strikes: 0, drag: null, selected: null, pops: [], over: false };
  return g;
}

function strike(g: Game, x: number, y: number, text: string) {
  g.strikes++;
  g.pops.push({ x, y, text, color: "#ff4d6d", t: 0 });
  blip("strike", [
    [220, 0, 0.15, "sawtooth", 0.05],
    [160, 0.15, 0.25, "sawtooth", 0.05],
  ]);
  if (g.strikes >= STRIKES) g.over = true;
}

function step(g: Game, dt: number) {
  g.time += dt;
  for (const p of g.pops) p.t += dt;
  g.pops = g.pops.filter((p) => p.t < 1.2);

  g.trains.forEach((t, i) => {
    if (!t) {
      g.respawn[i] -= dt;
      if (g.respawn[i] <= 0) {
        g.trains[i] = newTrain(g);
        blip("horn", [[330, 0, 0.25, "triangle", 0.04]]);
      }
      return;
    }
    if (t.state === "arrive") {
      t.x = Math.max(0, t.x - 700 * dt);
      if (t.x === 0) t.state = "wait";
    } else if (t.state === "wait") {
      t.timeLeft -= dt;
      if (t.timeLeft <= 0) {
        t.state = "leave";
        const missed = g.tiffins.filter((f) => same(f.code, t.code));
        const y = TRACK_Y[i] + TRACK_H / 2;
        if (missed.length) {
          g.tiffins = g.tiffins.filter((f) => !missed.includes(f));
          strike(g, W / 2, y, `${missed.length} LUNCH${missed.length > 1 ? "ES" : ""} MISSED`);
        } else if (t.loaded >= FULL) {
          g.score += 50;
          g.pops.push({ x: W / 2, y, text: "FULL TRAIN +50", color: "#ffe14d", t: 0 });
        }
        blip("depart", [
          [440, 0, 0.12, "triangle", 0.04],
          [440, 0.18, 0.12, "triangle", 0.04],
        ]);
      }
    } else {
      t.x -= 600 * dt;
      if (t.x < -W) {
        g.trains[i] = null;
        g.respawn[i] = 0.8 + Math.random() * 1.2;
      }
    }
  });

  // new tiffins only for trains that are in or arriving
  g.spawnIn -= dt;
  if (g.spawnIn <= 0) {
    g.spawnIn = Math.max(0.65, 1.5 - g.time / 90) * (0.7 + Math.random() * 0.6);
    const free = [...Array(CART.cols * CART.rows).keys()].filter((s) => !g.tiffins.some((f) => f.slot === s));
    const open = g.trains.filter((t): t is Train => !!t && t.state !== "leave" && t.timeLeft > 2.5);
    if (free.length && open.length) {
      const slot = free[Math.floor(Math.random() * free.length)];
      const [x, y] = slotPos(slot);
      g.tiffins.push({ id: g.nextId++, code: open[Math.floor(Math.random() * open.length)].code, slot, x, y });
    }
  }
}

function load(g: Game, f: Tiffin, track: number) {
  const t = g.trains[track];
  const y = TRACK_Y[track] + TRACK_H / 2;
  if (!t || t.state === "leave") {
    snapBack(f);
    return;
  }
  g.tiffins = g.tiffins.filter((o) => o !== f);
  if (same(t.code, f.code)) {
    t.loaded++;
    g.delivered++;
    const pts = 10 + (t.timeLeft < 3 ? 15 : 0);
    g.score += pts;
    g.pops.push({ x: W / 2, y, text: t.timeLeft < 3 ? `JUST IN TIME +${pts}` : `+${pts}`, color: "#39ff88", t: 0 });
    blip("load", [
      [600, 0, 0.05, "square", 0.035],
      [900, 0.05, 0.08, "square", 0.035],
    ]);
  } else strike(g, W / 2, y, "WRONG TRAIN!");
}

function snapBack(f: Tiffin) {
  [f.x, f.y] = slotPos(f.slot);
}

function trackAt(y: number): number {
  return TRACK_Y.findIndex((ty) => y >= ty - 6 && y <= ty + TRACK_H + 6);
}

function drawMark(cx: CanvasRenderingContext2D, code: Code, x: number, y: number, size: number) {
  cx.fillStyle = "#05040b";
  cx.font = `${size}px ui-monospace, monospace`;
  cx.textAlign = "center";
  cx.textBaseline = "middle";
  cx.fillText(MARKS[code.m], x, y + 1);
}

function drawTiffin(cx: CanvasRenderingContext2D, f: Tiffin, lifted: boolean) {
  const { x, y } = f;
  const col = COLORS[f.code.c].hex;
  if (lifted) {
    cx.fillStyle = "rgba(0,0,0,0.35)";
    cx.beginPath();
    cx.ellipse(x + 6, y + 36, 24, 7, 0, 0, Math.PI * 2);
    cx.fill();
  }
  // three steel tiers
  for (let i = 0; i < 3; i++) {
    cx.fillStyle = i % 2 ? "#b9b4d9" : "#d8d4f2";
    cx.fillRect(x - 20, y - 14 + i * 14, 40, 13);
  }
  cx.fillStyle = "#8f89b8";
  cx.fillRect(x - 22, y - 2, 4, 6);
  cx.fillRect(x + 18, y - 2, 4, 6);
  // handle
  cx.strokeStyle = "#8f89b8";
  cx.lineWidth = 3;
  cx.beginPath();
  cx.moveTo(x - 14, y - 16);
  cx.lineTo(x - 14, y - 30);
  cx.lineTo(x + 14, y - 30);
  cx.lineTo(x + 14, y - 16);
  cx.stroke();
  // coloured lid with the painted mark
  cx.fillStyle = col;
  cx.beginPath();
  cx.roundRect(x - 22, y - 22, 44, 10, 4);
  cx.fill();
  cx.beginPath();
  cx.arc(x, y + 7, 9, 0, Math.PI * 2);
  cx.fill();
  drawMark(cx, f.code, x, y + 7, 12);
}

export function DabbawalaRush() {
  const [screen, setScreen] = useState<"title" | "play" | "over">("title");
  const [best, submitBest] = useBest("lab.dabba.best");
  const [hud, setHud] = useState({ score: 0, strikes: 0, delivered: 0 });
  const [result, setResult] = useState<{ score: number; delivered: number; best: boolean } | null>(null);
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
        setResult({ score: g.score, delivered: g.delivered, best: submitBest(g.score) });
        setScreen("over");
      }
    }
    if (now - hudAt.current > 100) {
      hudAt.current = now;
      setHud({ score: g.score, strikes: g.strikes, delivered: g.delivered });
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = ctx2d(canvas, W);
    const t = now / 1000;

    cx.fillStyle = "#120d24";
    cx.fillRect(0, 0, W, H);

    // platforms and tracks
    g.trains.forEach((tr, i) => {
      const y = TRACK_Y[i];
      cx.fillStyle = "#1d1838";
      cx.fillRect(0, y, W, TRACK_H);
      cx.strokeStyle = "#3a3466";
      cx.lineWidth = 2;
      for (const ry of [y + TRACK_H - 22, y + TRACK_H - 10]) {
        cx.beginPath();
        cx.moveTo(0, ry);
        cx.lineTo(W, ry);
        cx.stroke();
      }
      cx.font = PIXEL_FONT(7);
      cx.fillStyle = "#8f89b8";
      cx.textAlign = "left";
      cx.fillText(`PF ${i + 1}`, 6, y + 12);
      if (!tr) return;
      const ox = tr.x;
      // carriages, Mumbai local style
      for (let c = 0; c < 3; c++) {
        const x = ox + 70 + c * 98;
        cx.fillStyle = "#8a2340";
        cx.fillRect(x, y + 22, 92, 50);
        cx.fillStyle = "#f2e6c9";
        cx.fillRect(x, y + 38, 92, 12);
        cx.fillStyle = "#05040b";
        for (let w = 0; w < 4; w++) cx.fillRect(x + 8 + w * 21, y + 26, 12, 9);
        cx.fillStyle = tr.state === "wait" ? "#39ff88" : "#3a3466";
        cx.fillRect(x + 40, y + 52, 12, 20); // door
      }
      // code board
      const bx = ox + 10;
      cx.fillStyle = "#05040b";
      cx.fillRect(bx, y + 20, 54, 54);
      cx.fillStyle = COLORS[tr.code.c].hex;
      cx.fillRect(bx + 4, y + 24, 46, 46);
      drawMark(cx, tr.code, bx + 27, y + 47, 26);
      // departure clock
      if (tr.state === "wait") {
        const f = tr.timeLeft / tr.total;
        cx.fillStyle = "#2a2350";
        cx.fillRect(70, y + 76, W - 80, 5);
        cx.fillStyle = f < 0.25 ? (Math.sin(t * 20) > 0 ? "#ff4d6d" : "#ffe14d") : "#39ff88";
        cx.fillRect(70, y + 76, (W - 80) * f, 5);
        cx.font = PIXEL_FONT(7);
        cx.fillStyle = "#ece9ff";
        cx.textAlign = "right";
        cx.fillText(`${tr.loaded} LOADED`, W - 10, y + 12);
      }
    });

    // handcart
    cx.fillStyle = "#3a2b1c";
    cx.fillRect(4, CART.y + 30, W - 8, CART.rows * CART.ch + 16);
    cx.fillStyle = "#5a3b1f";
    for (let s = 0; s < CART.cols * CART.rows; s++) {
      const [x, y] = slotPos(s);
      cx.fillRect(x - 36, y - 44, 72, 86);
    }
    cx.font = PIXEL_FONT(7);
    cx.fillStyle = "#8f89b8";
    cx.textAlign = "center";
    cx.fillText("HANDCART", W / 2, CART.y + 22);

    const lifted = g.drag?.id;
    for (const f of g.tiffins) if (f.id !== lifted) drawTiffin(cx, f, false);
    for (const f of g.tiffins) {
      if (f.id !== g.selected) continue;
      cx.strokeStyle = "#ffe14d";
      cx.lineWidth = 2;
      cx.strokeRect(f.x - 34, f.y - 42, 68, 82);
    }
    const d = g.tiffins.find((f) => f.id === lifted);
    if (d) {
      const tr = trackAt(d.y);
      if (tr >= 0) {
        cx.fillStyle = "rgba(255,225,77,0.12)";
        cx.fillRect(0, TRACK_Y[tr], W, TRACK_H);
      }
      drawTiffin(cx, d, true);
    }

    cx.textAlign = "center";
    cx.font = PIXEL_FONT(10);
    for (const p of g.pops) {
      cx.globalAlpha = Math.max(0, 1 - p.t / 1.2);
      cx.fillStyle = "#05040b";
      cx.fillText(p.text, p.x + 1, p.y - p.t * 20 + 1);
      cx.fillStyle = p.color;
      cx.fillText(p.text, p.x, p.y - p.t * 20);
    }
    cx.globalAlpha = 1;
  });

  const tiffinAt = (g: Game, x: number, y: number) => g.tiffins.find((f) => Math.abs(f.x - x) < 34 && Math.abs(f.y - y) < 42) ?? null;

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gameRef.current;
    if (!playing.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = toLogical(e, e.currentTarget, W, H);
    const f = tiffinAt(g, x, y);
    if (f) {
      g.drag = { id: f.id, dx: f.x - x, dy: f.y - y, sx: x, sy: y, moved: false };
      return;
    }
    // tap a train with a tiffin selected
    const tr = trackAt(y);
    const sel = g.tiffins.find((o) => o.id === g.selected);
    if (tr >= 0 && sel) {
      load(g, sel, tr);
      g.selected = null;
    }
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gameRef.current;
    if (!g.drag) return;
    const [x, y] = toLogical(e, e.currentTarget, W, H);
    const f = g.tiffins.find((o) => o.id === g.drag!.id);
    if (!f) return;
    if (Math.hypot(x - g.drag.sx, y - g.drag.sy) > 8) g.drag.moved = true;
    if (g.drag.moved) {
      f.x = x + g.drag.dx;
      f.y = y + g.drag.dy;
    }
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gameRef.current;
    const d = g.drag;
    g.drag = null;
    if (!d) return;
    const f = g.tiffins.find((o) => o.id === d.id);
    if (!f) return;
    if (!d.moved) {
      g.selected = g.selected === f.id ? null : f.id;
      return;
    }
    const [, y] = toLogical(e, e.currentTarget, W, H);
    const tr = trackAt(y);
    g.selected = null;
    if (tr >= 0) load(g, f, tr);
    else snapBack(f);
  };

  return (
    <LabShell title="DABBAWALA RUSH" color="#ffe14d">
      <div className="flex h-9 shrink-0 items-center justify-between px-3 font-pixel text-[8px]">
        <span className="text-dim">
          STRIKES{" "}
          {Array.from({ length: STRIKES }, (_, i) => (
            <span key={i} className={i < hud.strikes ? "text-red" : "text-line"}>
              ✖
            </span>
          ))}
        </span>
        <span className="text-dim">
          DELIVERED <span className="text-green">{hud.delivered}</span>
        </span>
        <span className="text-yellow">{hud.score}</span>
      </div>
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        <canvas ref={canvasRef} className="block touch-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => (gameRef.current.drag = null)} />
        {screen === "title" && (
          <TitleCard a="DABBAWALA" b="RUSH" colorA="#ffe14d" colorB="#ff4d6d" blurb="A city's lunch depends on you. Get every tiffin onto the right local train before it pulls out." best={best} onPlay={start}>
            <p>Drag a tiffin from the handcart onto a train, or tap a tiffin and then tap a train. The lid colour and mark must match the train&apos;s board.</p>
            <p>After 40 seconds, trains start sharing colours with different marks, so read both.</p>
            <p>A wrong train is a strike. So is a train leaving while its lunches are still on the cart. Three strikes and lunch is cancelled. Load {FULL} or more onto one train for a bonus.</p>
          </TitleCard>
        )}
        {screen === "over" && result && (
          <GameOverCard title="LUNCH LOST" score={result.score} isBest={result.best} best={best} color="#ffe14d" line={`${result.delivered} tiffins reached their offices.`} again={start} />
        )}
      </div>
    </LabShell>
  );
}
