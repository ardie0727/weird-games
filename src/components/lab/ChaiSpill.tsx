"use client";

import { useCallback, useRef, useState } from "react";
import { blip, unlock } from "@/lib/lab/sound";
import { GameOverCard, LabShell, PIXEL_FONT, TitleCard, ctx2d, toLogical, useBest, useFitCanvas, useLoop } from "./LabShell";

// Chai Spill: carry a tray of four overfilled cups through the office to the
// boss's cabin. Drag to steer. Jerky moves slosh the chai, and a full cup
// slops over at the smallest wobble. Bump a desk or a colleague and it all
// splashes. Deliver too little chai and you're done.

const W = 360;
const H = 600;
const TRAY_Y = 480;
const TRAY_W = 96;
const TRAY_H = 60;
const RUN = 1400; // floor length per delivery, in world units

type OKind = "desk" | "walker" | "chair" | "wet" | "dog";
interface Obstacle {
  kind: OKind;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  hit: boolean;
}

interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
}

interface Game {
  round: number;
  x: number;
  tx: number;
  vx: number;
  slosh: number;
  sloshV: number;
  cups: number[];
  dist: number;
  speed: number;
  obs: Obstacle[];
  puddles: { x: number; y: number; r: number }[];
  drops: Drop[];
  spawnAt: number;
  score: number;
  delivered: number;
  pops: { x: number; y: number; text: string; color: string; t: number }[];
  pause: number;
  slip: number;
  over: "" | "empty" | "boss";
}

function newGame(): Game {
  return { round: 1, x: W / 2, tx: W / 2, vx: 0, slosh: 0, sloshV: 0, cups: [1.08, 1.08, 1.08, 1.08], dist: 0, speed: 120, obs: [], puddles: [], drops: [], spawnAt: 160, score: 0, delivered: 0, pops: [], pause: 0, slip: 0, over: "" };
}

function spawnRow(g: Game) {
  const r = Math.random();
  const lvl = g.round;
  if (r < 0.35) {
    // a desk on one side, sometimes two with a gap
    const gap = Math.max(120, 170 - lvl * 8);
    const gx = 30 + Math.random() * (W - 60 - gap);
    if (gx > 30) g.obs.push({ kind: "desk", x: 0, y: -40, w: gx, h: 46, vx: 0, hit: false });
    if (gx + gap < W - 30) g.obs.push({ kind: "desk", x: gx + gap, y: -40, w: W - gx - gap, h: 46, vx: 0, hit: false });
  } else if (r < 0.62) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    g.obs.push({ kind: "walker", x: dir > 0 ? -30 : W + 30, y: -30, w: 34, h: 34, vx: dir * (50 + Math.random() * 40 + lvl * 6), hit: false });
  } else if (r < 0.78 && lvl >= 2) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    g.obs.push({ kind: "chair", x: dir > 0 ? -20 : W + 20, y: -30, w: 30, h: 30, vx: dir * (120 + lvl * 10), hit: false });
  } else if (r < 0.9) {
    g.obs.push({ kind: "wet", x: 40 + Math.random() * (W - 120), y: -40, w: 80, h: 50, vx: 0, hit: false });
  } else if (lvl >= 3) {
    g.obs.push({ kind: "dog", x: Math.random() * W, y: -30, w: 30, h: 30, vx: (Math.random() < 0.5 ? -1 : 1) * 90, hit: false });
  }
}

function spill(g: Game, i: number, amt: number) {
  const a = Math.min(g.cups[i], amt);
  if (a <= 0) return;
  g.cups[i] -= a;
  const cx = g.x + (i % 2 ? 22 : -22);
  const cy = TRAY_Y + (i < 2 ? -14 : 14);
  const n = Math.min(4, 1 + Math.floor(a * 40));
  for (let k = 0; k < n; k++) g.drops.push({ x: cx, y: cy, vx: Math.sign(g.slosh || 1) * (40 + Math.random() * 80) + (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 80, t: 0 });
}

function step(g: Game, dt: number) {
  for (const p of g.pops) p.t += dt;
  g.pops = g.pops.filter((p) => p.t < 1.2);
  for (const d of g.drops) {
    d.t += dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt + g.speed * dt;
    if (d.t > 0.35 && Math.random() < 0.08) g.puddles.push({ x: d.x, y: d.y, r: 4 + Math.random() * 6 });
  }
  g.drops = g.drops.filter((d) => d.t < 0.4);

  if (g.pause > 0) {
    g.pause -= dt;
    if (g.pause <= 0) {
      g.round++;
      g.dist = 0;
      g.speed = 120 + g.round * 16;
      g.cups = [1.08, 1.08, 1.08, 1.08];
      g.obs = [];
      g.puddles = [];
      g.spawnAt = 160;
    }
    return;
  }

  // the tray chases your finger; a wet floor makes it skid
  const prevV = g.vx;
  const follow = g.slip > 0 ? 2.5 : 11;
  g.slip = Math.max(0, g.slip - dt);
  const nx = g.x + (g.tx - g.x) * Math.min(1, dt * follow);
  g.vx = (nx - g.x) / Math.max(dt, 1e-3);
  g.x = Math.max(TRAY_W / 2, Math.min(W - TRAY_W / 2, nx));
  const acc = (g.vx - prevV) / Math.max(dt, 1e-3);

  // the chai is a damped spring pushed by the tray's acceleration
  g.sloshV += (-40 * g.slosh - 4 * g.sloshV - acc * 0.0011) * dt;
  g.slosh += g.sloshV * dt;
  g.slosh = Math.max(-1.4, Math.min(1.4, g.slosh));
  const lean = Math.abs(g.slosh);
  for (let i = 0; i < 4; i++) {
    // the cups on the high side of the slosh lose the most
    const side = (i % 2 ? 1 : -1) * Math.sign(g.slosh);
    const lip = g.cups[i] + lean * (side > 0 ? 0.55 : 0.3) - 1;
    if (lip > 0) spill(g, i, lip * dt * 2.2);
  }

  g.dist += g.speed * dt;
  const scroll = g.speed * dt;
  for (const p of g.puddles) p.y += scroll;
  g.puddles = g.puddles.filter((p) => p.y < H + 20);
  if (g.dist + 200 < RUN && g.dist > g.spawnAt) {
    spawnRow(g);
    g.spawnAt = g.dist + Math.max(85, 170 - g.round * 12) * (0.8 + Math.random() * 0.5);
  }
  for (const o of g.obs) {
    o.y += scroll;
    o.x += o.vx * dt;
    if (o.kind === "dog" && Math.random() < dt * 1.2) o.vx = -o.vx;
    if (o.hit) continue;
    const tl = g.x - TRAY_W / 2 + 6, tr = g.x + TRAY_W / 2 - 6, tt = TRAY_Y - TRAY_H / 2 + 6, tb = TRAY_Y + TRAY_H / 2 - 6;
    const ox = o.kind === "desk" ? o.x : o.x - o.w / 2;
    if (tr > ox && tl < ox + o.w && tb > o.y && tt < o.y + o.h) {
      o.hit = true;
      if (o.kind === "wet") {
        g.slip = 1.1;
        g.sloshV += (Math.random() < 0.5 ? -1 : 1) * 4;
        g.pops.push({ x: g.x, y: TRAY_Y - 50, text: "SLIPPERY!", color: "#22f3ff", t: 0 });
        blip("slip", [[600, 0, 0.25, "sine", 0.04, 200]]);
      } else {
        const push = Math.sign(g.x - (ox + o.w / 2)) || 1;
        g.sloshV += push * 9;
        g.tx = g.x + push * 40;
        for (let i = 0; i < 4; i++) spill(g, i, 0.12 + Math.random() * 0.08);
        const what = o.kind === "desk" ? "DESK!" : o.kind === "walker" ? "SORRY SIR!" : o.kind === "chair" ? "CHAIR!" : "WOOF!";
        g.pops.push({ x: g.x, y: TRAY_Y - 50, text: what, color: "#ff4d6d", t: 0 });
        blip("bump", [
          [140, 0, 0.12, "square", 0.06],
          [90, 0.06, 0.15, "square", 0.05],
        ]);
      }
    }
  }
  g.obs = g.obs.filter((o) => o.y < H + 60 && o.x > -80 && o.x < W + 80 + (o.kind === "desk" ? W : 0));

  const total = g.cups.reduce((a, b) => a + b, 0);
  if (total < 0.6) {
    g.over = "empty";
    return;
  }
  if (g.dist >= RUN) {
    const pct = Math.round((Math.min(4, total) / 4) * 100);
    if (pct < 45) {
      g.over = "boss";
      return;
    }
    const pts = pct * g.round;
    g.score += pts;
    g.delivered++;
    g.pops.push({ x: W / 2, y: 220, text: `DELIVERED ${pct}% +${pts}`, color: "#39ff88", t: 0 });
    blip("deliver", [
      [523, 0, 0.1, "square", 0.04],
      [659, 0.1, 0.1, "square", 0.04],
      [784, 0.2, 0.18, "square", 0.04],
    ]);
    g.pause = 1.4;
  }
}

function drawCup(cx: CanvasRenderingContext2D, x: number, y: number, level: number, slosh: number, t: number) {
  cx.fillStyle = "#e9e6ff";
  cx.beginPath();
  cx.arc(x, y, 15, 0, Math.PI * 2);
  cx.fill();
  cx.fillStyle = "#c9c4ea";
  cx.fillRect(x + 13, y - 3, 7, 6);
  // chai surface: shrinks as it empties, shifts with the slosh
  const r = 12 * Math.sqrt(Math.max(0, Math.min(1, level)));
  if (r > 0.5) {
    cx.fillStyle = level > 1 ? "#d29a5a" : "#b97a3e";
    cx.beginPath();
    cx.ellipse(x + slosh * 3, y, r, r * (1 - Math.abs(slosh) * 0.15), 0, 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = "rgba(255,255,255,0.25)";
    cx.beginPath();
    cx.arc(x - 3 + slosh * 4 + Math.sin(t * 3) * 1, y - 3, r * 0.3, 0, Math.PI * 2);
    cx.fill();
  }
}

export function ChaiSpill() {
  const [screen, setScreen] = useState<"title" | "play" | "over">("title");
  const [best, submitBest] = useBest("lab.chai.best");
  const [hud, setHud] = useState({ score: 0, chai: 100, round: 1, dist: 0 });
  const [result, setResult] = useState<{ score: number; delivered: number; why: string; best: boolean } | null>(null);
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
        setResult({ score: g.score, delivered: g.delivered, why: g.over, best: submitBest(g.score) });
        setScreen("over");
        blip("over", [[300, 0, 0.5, "sawtooth", 0.05, 80]]);
      }
    }
    if (now - hudAt.current > 100) {
      hudAt.current = now;
      const total = g.cups.reduce((a, b) => a + b, 0);
      setHud({ score: g.score, chai: Math.round((Math.min(4, total) / 4) * 100), round: g.round, dist: Math.min(1, g.dist / RUN) });
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = ctx2d(canvas, W);
    const t = now / 1000;

    // office carpet tiles scrolling past
    cx.fillStyle = "#2a2350";
    cx.fillRect(0, 0, W, H);
    const off = g.dist % 60;
    cx.fillStyle = "#322a5e";
    for (let y = -60 + off; y < H; y += 60) for (let x = 0; x < W; x += 60) if (((x / 60 + Math.floor((y - off) / 60)) & 1) === 0) cx.fillRect(x, y, 60, 60);
    for (const p of g.puddles) {
      cx.fillStyle = "rgba(185,122,62,0.55)";
      cx.beginPath();
      cx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      cx.fill();
    }

    // the boss's cabin door at the end of the floor
    const doorY = TRAY_Y - (RUN - g.dist) - 60;
    if (doorY > -140) {
      cx.fillStyle = "#1a1438";
      cx.fillRect(0, doorY - 80, W, 80);
      cx.fillStyle = "#8a4b2a";
      cx.fillRect(W / 2 - 50, doorY - 70, 100, 70);
      cx.fillStyle = "#ffe14d";
      cx.font = PIXEL_FONT(9);
      cx.textAlign = "center";
      cx.textBaseline = "middle";
      cx.fillText("BOSS", W / 2, doorY - 50);
      cx.font = "26px sans-serif";
      cx.fillText("👔", W / 2, doorY - 22);
    }

    cx.textAlign = "center";
    cx.textBaseline = "middle";
    for (const o of g.obs) {
      if (o.kind === "desk") {
        cx.fillStyle = "#6b5aa8";
        cx.fillRect(o.x, o.y, o.w, o.h);
        cx.fillStyle = "#8f7fd0";
        cx.fillRect(o.x, o.y, o.w, 6);
        cx.font = "20px sans-serif";
        for (let x = o.x + 24; x < o.x + o.w - 10; x += 56) cx.fillText(x % 3 < 1.5 ? "💻" : "🖥️", x, o.y + 26);
      } else if (o.kind === "wet") {
        cx.fillStyle = "rgba(34,243,255,0.2)";
        cx.beginPath();
        cx.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
        cx.fill();
        cx.font = "22px sans-serif";
        cx.fillText("⚠️", o.x + o.w / 2, o.y + o.h / 2);
      } else {
        const em = o.kind === "walker" ? "🚶" : o.kind === "chair" ? "🪑" : "🐕";
        cx.save();
        cx.translate(o.x, o.y + o.h / 2);
        if (o.vx < 0) cx.scale(-1, 1);
        if (o.kind === "chair") cx.rotate(t * 6);
        cx.font = `${o.kind === "walker" ? 34 : 28}px sans-serif`;
        cx.fillText(em, 0, 0);
        cx.restore();
      }
    }

    // the tray
    cx.save();
    cx.translate(g.x, TRAY_Y);
    cx.rotate(g.slosh * 0.05);
    cx.fillStyle = "#b9b4d9";
    cx.beginPath();
    cx.roundRect(-TRAY_W / 2, -TRAY_H / 2, TRAY_W, TRAY_H, 10);
    cx.fill();
    cx.fillStyle = "#9b95c4";
    cx.beginPath();
    cx.roundRect(-TRAY_W / 2 + 4, -TRAY_H / 2 + 4, TRAY_W - 8, TRAY_H - 8, 8);
    cx.fill();
    cx.restore();
    for (let i = 0; i < 4; i++) drawCup(cx, g.x + (i % 2 ? 22 : -22), TRAY_Y + (i < 2 ? -14 : 14), g.cups[i], g.slosh, t + i);
    cx.font = "30px sans-serif";
    cx.fillText("🙌", g.x, TRAY_Y + 50);

    cx.fillStyle = "#b97a3e";
    for (const d of g.drops) {
      cx.beginPath();
      cx.arc(d.x, d.y, 3, 0, Math.PI * 2);
      cx.fill();
    }

    cx.font = PIXEL_FONT(10);
    for (const p of g.pops) {
      cx.globalAlpha = Math.max(0, 1 - p.t / 1.2);
      cx.fillStyle = "#05040b";
      cx.fillText(p.text, p.x + 1, p.y - p.t * 24 + 1);
      cx.fillStyle = p.color;
      cx.fillText(p.text, p.x, p.y - p.t * 24);
    }
    cx.globalAlpha = 1;
  });

  const steer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!playing.current) return;
    if (e.type === "pointermove" && e.pointerType !== "mouse" && e.buttons === 0) return;
    const [x] = toLogical(e, e.currentTarget, W, H);
    gameRef.current.tx = Math.max(TRAY_W / 2, Math.min(W - TRAY_W / 2, x));
  };

  return (
    <LabShell title="CHAI SPILL" color="#ff8a3d">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 px-3 font-pixel text-[8px]">
        <span className="text-dim">
          TRIP <span className="text-ink">{hud.round}</span>
        </span>
        <span className="flex flex-1 items-center gap-1 text-dim">
          ☕
          <span className="relative h-2 flex-1 bg-line">
            <span className="absolute inset-y-0 left-0" style={{ width: `${hud.chai}%`, background: hud.chai < 50 ? "#ff4d6d" : "#b97a3e" }} />
          </span>
          <span className="text-ink">{hud.chai}%</span>
        </span>
        <span className="text-orange">{hud.score}</span>
      </div>
      <div className="mx-3 h-1 shrink-0 bg-line">
        <div className="h-full bg-green" style={{ width: `${hud.dist * 100}%` }} />
      </div>
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        <canvas ref={canvasRef} className="block touch-none" onPointerDown={steer} onPointerMove={steer} />
        {screen === "title" && (
          <TitleCard a="CHAI" b="SPILL" colorA="#ff8a3d" colorB="#ffe14d" blurb="Four cups, filled to the brim, and the boss is waiting at the far end of the office." best={best} onPlay={start}>
            <p>Drag left and right to steer the tray. Smooth moves keep the chai calm. Jerky ones make it slosh over.</p>
            <p>Desks, colleagues, rolling chairs and the office dog all splash it everywhere. ⚠️ wet floors make you skid.</p>
            <p>Reach the boss with at least half the chai left, or don&apos;t come back.</p>
          </TitleCard>
        )}
        {screen === "over" && result && (
          <GameOverCard
            title={result.why === "boss" ? "BOSS IS UPSET" : "ALL SPILLED"}
            score={result.score}
            isBest={result.best}
            best={best}
            color="#ff8a3d"
            line={
              result.why === "boss"
                ? `"Half a cup? Each?" You made ${result.delivered} good deliveries before this one.`
                : `The carpet drank it all. You made ${result.delivered} deliveries.`
            }
            again={start}
          />
        )}
      </div>
    </LabShell>
  );
}
