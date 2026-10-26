"use client";

import { useCallback, useRef, useState } from "react";
import { blip, unlock } from "@/lib/lab/sound";
import { GameOverCard, LabShell, PIXEL_FONT, TitleCard, ctx2d, toLogical, useBest, useFitCanvas, useLoop } from "./LabShell";

// Pigeon Air Traffic: pigeons flap in from the edges of a plaza. Draw a path
// from each pigeon to the perch of its colour on the statue. Two pigeons that
// touch in the air is a feather explosion and the end of your shift.

const W = 360;
const H = 600;
const CRASH_R = 15;
const WARN_R = 38;
const PERCH_R = 24;
const LAND_TIME = 2.6;

type Breed = "grey" | "white" | "brown";
const BREED: Record<Breed, { body: string; wing: string }> = {
  grey: { body: "#8f89b8", wing: "#5d5788" },
  white: { body: "#ece9ff", wing: "#b9b4d9" },
  brown: { body: "#c98b5a", wing: "#8a5a35" },
};

interface Perch {
  breed: Breed;
  x: number;
  y: number;
  busy: number; // seconds left that a pigeon sits here
}

interface Pigeon {
  id: number;
  breed: Breed;
  x: number;
  y: number;
  a: number; // heading, radians
  speed: number;
  path: [number, number][];
  state: "fly" | "landed" | "leave";
  perch: Perch | null;
  t: number;
  fat: boolean;
}

interface Game {
  time: number;
  pigeons: Pigeon[];
  perches: Perch[];
  spawnIn: number;
  warn: { x: number; y: number; breed: Breed; t: number; e: { x: number; y: number; a: number } } | null;
  nextId: number;
  landed: number;
  score: number;
  drawing: number | null;
  crash: { x: number; y: number } | null;
  overIn: number;
  pops: { x: number; y: number; text: string; t: number }[];
}

function newGame(): Game {
  return {
    time: 0,
    pigeons: [],
    perches: [
      { breed: "grey", x: 180, y: 300, busy: 0 },
      { breed: "white", x: 116, y: 318, busy: 0 },
      { breed: "brown", x: 244, y: 318, busy: 0 },
    ],
    spawnIn: 1,
    warn: null,
    nextId: 1,
    landed: 0,
    score: 0,
    drawing: null,
    crash: null,
    overIn: 0,
    pops: [],
  };
}

const BREEDS: Breed[] = ["grey", "white", "brown"];

function edgePoint(): { x: number; y: number; a: number } {
  const side = Math.floor(Math.random() * 4);
  const r = Math.random();
  const p = side === 0 ? { x: 30 + r * (W - 60), y: -14 } : side === 1 ? { x: W + 14, y: 40 + r * (H - 80) } : side === 2 ? { x: 30 + r * (W - 60), y: H + 14 } : { x: -14, y: 40 + r * (H - 80) };
  // aim roughly at the plaza, not straight at the statue
  const tx = W / 2 + (Math.random() - 0.5) * 220, ty = H / 2 + (Math.random() - 0.5) * 300;
  return { ...p, a: Math.atan2(ty - p.y, tx - p.x) };
}

function step(g: Game, dt: number) {
  if (g.crash) {
    g.overIn -= dt;
    return;
  }
  g.time += dt;
  for (const p of g.pops) p.t += dt;
  g.pops = g.pops.filter((p) => p.t < 1);

  // spawn, with a warning blip at the edge first
  g.spawnIn -= dt;
  if (!g.warn && g.spawnIn <= 1.2) {
    const e = edgePoint();
    g.warn = { x: Math.max(12, Math.min(W - 12, e.x)), y: Math.max(12, Math.min(H - 12, e.y)), breed: BREEDS[Math.floor(Math.random() * 3)], t: 0, e };
  }
  if (g.spawnIn <= 0 && g.warn) {
    const e = g.warn.e;
    const fat = g.time > 40 && Math.random() < 0.25;
    const racer = !fat && g.time > 70 && Math.random() < 0.25;
    const base = 34 + Math.min(26, g.time / 6);
    g.pigeons.push({ id: g.nextId++, breed: g.warn.breed, x: e.x, y: e.y, a: e.a, speed: base * (fat ? 0.65 : racer ? 1.5 : 1), path: [], state: "fly", perch: null, t: 0, fat });
    g.warn = null;
    g.spawnIn = Math.max(1.9, 5 - g.time / 30) * (0.8 + Math.random() * 0.4);
    blip("coo", [
      [420, 0, 0.08, "sine", 0.05, 360],
      [380, 0.1, 0.12, "sine", 0.05, 300],
    ]);
  }
  if (g.warn) g.warn.t += dt;

  for (const pr of g.perches) pr.busy = Math.max(0, pr.busy - dt);

  for (const p of g.pigeons) {
    p.t += dt;
    if (p.state === "landed") {
      if (p.perch!.busy <= 0) {
        p.state = "leave";
        p.a = Math.atan2(p.y - H / 2, p.x - W / 2) + (Math.random() - 0.5);
      }
      continue;
    }
    let move = p.speed * (p.state === "leave" ? 2.2 : 1) * dt;
    while (p.state === "fly" && p.path.length && move > 0) {
      const [tx, ty] = p.path[0];
      const dx = tx - p.x, dy = ty - p.y;
      const d = Math.hypot(dx, dy);
      if (d <= move) {
        p.x = tx;
        p.y = ty;
        move -= d;
        p.path.shift();
      } else {
        p.a = Math.atan2(dy, dx);
        p.x += (dx / d) * move;
        p.y += (dy / d) * move;
        move = 0;
      }
      if (!p.path.length) {
        const pr = g.perches.find((q) => q.breed === p.breed && Math.hypot(q.x - p.x, q.y - p.y) < PERCH_R);
        if (pr && pr.busy <= 0 && g.drawing !== p.id) {
          p.state = "landed";
          p.perch = pr;
          p.x = pr.x;
          p.y = pr.y;
          pr.busy = LAND_TIME;
          g.landed++;
          const pts = 10 + Math.floor(g.time / 20) * 5;
          g.score += pts;
          g.pops.push({ x: pr.x, y: pr.y, text: `+${pts}`, t: 0 });
          blip("land", [
            [700, 0, 0.06, "square", 0.035],
            [1050, 0.06, 0.08, "square", 0.035],
          ]);
        } else if (pr && pr.busy > 0) g.pops.push({ x: pr.x, y: pr.y, text: "TAKEN!", t: 0 });
      }
    }
    if (move > 0) {
      p.x += Math.cos(p.a) * move;
      p.y += Math.sin(p.a) * move;
    }
    // flying pigeons turn back at the plaza edge once they are in
    if (p.state === "fly" && p.t > 1.5) {
      if (p.x < 10 || p.x > W - 10) (p.a = Math.PI - p.a), (p.x = Math.max(10, Math.min(W - 10, p.x)));
      if (p.y < 10 || p.y > H - 10) (p.a = -p.a), (p.y = Math.max(10, Math.min(H - 10, p.y)));
    }
  }
  g.pigeons = g.pigeons.filter((p) => !(p.state === "leave" && (p.x < -30 || p.x > W + 30 || p.y < -30 || p.y > H + 30)));

  // mid-air collisions
  const fly = g.pigeons.filter((p) => p.state === "fly");
  for (let i = 0; i < fly.length; i++)
    for (let j = i + 1; j < fly.length; j++) {
      const a = fly[i], b = fly[j];
      const r = CRASH_R * ((a.fat ? 1.3 : 1) + (b.fat ? 1.3 : 1)) / 2;
      if (Math.hypot(a.x - b.x, a.y - b.y) < r) {
        g.crash = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        g.overIn = 1.4;
        blip("crash", [
          [200, 0, 0.3, "sawtooth", 0.06, 50],
          [900, 0, 0.15, "square", 0.03, 300],
        ]);
        return;
      }
    }
}

function drawPigeon(cx: CanvasRenderingContext2D, p: Pigeon, t: number) {
  const c = BREED[p.breed];
  const s = p.fat ? 1.3 : 1;
  cx.save();
  cx.translate(p.x, p.y);
  cx.rotate(p.a);
  cx.scale(s, s);
  const flap = p.state === "landed" ? 0.2 : Math.sin(t * 22 + p.id) * 0.6;
  cx.fillStyle = c.wing;
  for (const side of [-1, 1]) {
    cx.save();
    cx.rotate(side * (0.9 + flap));
    cx.beginPath();
    cx.ellipse(0, side * 9, 4, 11, 0, 0, Math.PI * 2);
    cx.fill();
    cx.restore();
  }
  cx.fillStyle = c.body;
  cx.beginPath();
  cx.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2);
  cx.fill();
  // tail
  cx.beginPath();
  cx.moveTo(-8, 0);
  cx.lineTo(-15, -4);
  cx.lineTo(-15, 4);
  cx.fill();
  // head with a shiny neck
  cx.fillStyle = "#39ff88";
  cx.beginPath();
  cx.arc(7, 0, 4.5, 0, Math.PI * 2);
  cx.fill();
  cx.fillStyle = c.body;
  cx.beginPath();
  cx.arc(9, 0, 3.6, 0, Math.PI * 2);
  cx.fill();
  cx.fillStyle = "#ff8a3d";
  cx.beginPath();
  cx.moveTo(12, -1.2);
  cx.lineTo(15.5, 0);
  cx.lineTo(12, 1.2);
  cx.fill();
  cx.restore();
}

export function PigeonAirTraffic() {
  const [screen, setScreen] = useState<"title" | "play" | "over">("title");
  const [best, submitBest] = useBest("lab.pigeon.best");
  const [hud, setHud] = useState({ score: 0, landed: 0, flying: 0 });
  const [result, setResult] = useState<{ score: number; landed: number; best: boolean } | null>(null);
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
      if (g.crash && g.overIn <= 0) {
        playing.current = false;
        setResult({ score: g.score, landed: g.landed, best: submitBest(g.score) });
        setScreen("over");
      }
    }
    if (now - hudAt.current > 100) {
      hudAt.current = now;
      setHud({ score: g.score, landed: g.landed, flying: g.pigeons.filter((p) => p.state === "fly").length });
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = ctx2d(canvas, W);
    const t = now / 1000;

    // plaza paving
    cx.fillStyle = "#17122c";
    cx.fillRect(0, 0, W, H);
    cx.strokeStyle = "#221a40";
    cx.lineWidth = 1;
    for (let r = 40; r < 420; r += 40) {
      cx.beginPath();
      cx.arc(W / 2, 300, r, 0, Math.PI * 2);
      cx.stroke();
    }
    // benches and a bin, for flavour
    cx.fillStyle = "#3a2b1c";
    cx.fillRect(20, 520, 70, 14);
    cx.fillRect(270, 70, 70, 14);
    // statue plinth and figure, seen from above
    cx.fillStyle = "#2a2350";
    cx.fillRect(120, 250, 120, 100);
    cx.fillStyle = "#2f2a55";
    cx.fillRect(130, 260, 100, 80);
    cx.strokeStyle = "#3a3466";
    cx.lineWidth = 10;
    cx.lineCap = "round";
    cx.beginPath();
    cx.moveTo(116, 318);
    cx.lineTo(180, 300);
    cx.lineTo(244, 318);
    cx.stroke();
    cx.lineCap = "butt";
    cx.fillStyle = "#3a3466";
    cx.beginPath();
    cx.arc(180, 300, 18, 0, Math.PI * 2);
    cx.fill();
    for (const pr of g.perches) {
      const free = pr.busy <= 0;
      cx.fillStyle = BREED[pr.breed].body;
      cx.globalAlpha = free ? 0.3 : 0.12;
      cx.beginPath();
      cx.arc(pr.x, pr.y, 15, 0, Math.PI * 2);
      cx.fill();
      cx.lineWidth = 3;
      cx.strokeStyle = BREED[pr.breed].body;
      cx.globalAlpha = free ? 0.7 + 0.3 * Math.sin(t * 4) : 0.3;
      cx.stroke();
      cx.globalAlpha = 1;
    }

    // paths
    for (const p of g.pigeons) {
      if (!p.path.length || p.state !== "fly") continue;
      const last = p.path[p.path.length - 1];
      const ok = g.perches.some((q) => q.breed === p.breed && Math.hypot(q.x - last[0], q.y - last[1]) < PERCH_R);
      cx.strokeStyle = BREED[p.breed].body;
      cx.globalAlpha = 0.75;
      cx.lineWidth = 2;
      cx.setLineDash(ok ? [] : [4, 5]);
      cx.beginPath();
      cx.moveTo(p.x, p.y);
      for (const [x, y] of p.path) cx.lineTo(x, y);
      cx.stroke();
      cx.setLineDash([]);
      cx.globalAlpha = 1;
    }

    // near-miss warnings
    const fly = g.pigeons.filter((p) => p.state === "fly");
    for (let i = 0; i < fly.length; i++)
      for (let j = i + 1; j < fly.length; j++)
        if (Math.hypot(fly[i].x - fly[j].x, fly[i].y - fly[j].y) < WARN_R)
          for (const p of [fly[i], fly[j]]) {
            cx.strokeStyle = `rgba(255,77,109,${0.5 + 0.5 * Math.sin(t * 20)})`;
            cx.lineWidth = 2;
            cx.beginPath();
            cx.arc(p.x, p.y, 20, 0, Math.PI * 2);
            cx.stroke();
          }

    for (const p of g.pigeons) drawPigeon(cx, p, t);

    if (g.warn) {
      cx.fillStyle = BREED[g.warn.breed].body;
      cx.globalAlpha = Math.sin(g.warn.t * 14) > 0 ? 1 : 0.3;
      cx.font = PIXEL_FONT(12);
      cx.textAlign = "center";
      cx.textBaseline = "middle";
      cx.fillText("!", g.warn.x, g.warn.y);
      cx.globalAlpha = 1;
    }

    cx.textAlign = "center";
    cx.font = PIXEL_FONT(10);
    for (const p of g.pops) {
      cx.globalAlpha = 1 - p.t;
      cx.fillStyle = p.text === "TAKEN!" ? "#ff4d6d" : "#39ff88";
      cx.fillText(p.text, p.x, p.y - 22 - p.t * 24);
    }
    cx.globalAlpha = 1;

    if (g.crash) {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + i;
        const r = (1.4 - g.overIn) * 90;
        cx.fillStyle = i % 2 ? "#ece9ff" : "#8f89b8";
        cx.beginPath();
        cx.ellipse(g.crash.x + Math.cos(a) * r, g.crash.y + Math.sin(a) * r, 6, 2.5, a * 3, 0, Math.PI * 2);
        cx.fill();
      }
    }
  });

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gameRef.current;
    if (!playing.current || g.crash) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = toLogical(e, e.currentTarget, W, H);
    let pick: Pigeon | null = null, bd = 34;
    for (const p of g.pigeons) {
      if (p.state !== "fly") continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) (bd = d), (pick = p);
    }
    if (pick) {
      pick.path = [];
      g.drawing = pick.id;
    }
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gameRef.current;
    const p = g.pigeons.find((q) => q.id === g.drawing);
    if (!p) return;
    const [x, y] = toLogical(e, e.currentTarget, W, H);
    const last = p.path[p.path.length - 1] ?? [p.x, p.y];
    if (Math.hypot(x - last[0], y - last[1]) > 7) p.path.push([x, y]);
  };
  const onUp = () => {
    const g = gameRef.current;
    const p = g.pigeons.find((q) => q.id === g.drawing);
    g.drawing = null;
    if (!p || !p.path.length) return;
    // snap a path that ends near the right perch onto it
    const last = p.path[p.path.length - 1];
    const pr = g.perches.find((q) => q.breed === p.breed && Math.hypot(q.x - last[0], q.y - last[1]) < PERCH_R + 8);
    if (pr) p.path.push([pr.x, pr.y]);
  };

  return (
    <LabShell title="PIGEON AIR TRAFFIC" color="#8f89b8">
      <div className="flex h-9 shrink-0 items-center justify-between px-3 font-pixel text-[8px]">
        <span className="text-dim">
          LANDED <span className="text-green">{hud.landed}</span>
        </span>
        <span className="text-dim">
          IN AIR <span className="text-ink">{hud.flying}</span>
        </span>
        <span className="text-cyan">{hud.score}</span>
      </div>
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        <canvas ref={canvasRef} className="block touch-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
        {screen === "title" && (
          <TitleCard a="PIGEON" b="AIR TRAFFIC" colorA="#22f3ff" colorB="#ece9ff" blurb="Everyone wants a spot on the statue. You're the tower. Keep them from flying into each other." best={best} onPlay={start}>
            <p>Drag from a pigeon to draw its flight path. Grey pigeons land on the head, white on the left hand, brown on the right hand.</p>
            <p>A perch stays taken while its pigeon sits there. Fat pigeons are slow and wide, racing pigeons are fast.</p>
            <p>A blinking ! at the edge means a pigeon is about to arrive. Red rings mean two pigeons are about to collide.</p>
          </TitleCard>
        )}
        {screen === "over" && result && (
          <GameOverCard title="FEATHER CRASH" score={result.score} isBest={result.best} best={best} color="#22f3ff" line={`${result.landed} ${result.landed === 1 ? "pigeon" : "pigeons"} landed safely.`} again={start} />
        )}
      </div>
    </LabShell>
  );
}
