"use client";

import { useCallback, useRef, useState } from "react";
import { blip, unlock } from "@/lib/lab/sound";
import { GameOverCard, LabShell, PIXEL_FONT, TitleCard, ctx2d, toLogical, useBest, useFitCanvas, useLoop } from "./LabShell";

// Kite Cutter: Makar Sankranti on the rooftops. Drag to fly your kite. When
// your string crosses a rival's, both strings rub, and the faster you pull,
// the faster theirs frays. Cut it and their kite drifts off. Let them saw
// through yours and the day is over.

const W = 360;
const H = 600;
const ANCHOR: [number, number] = [180, 560];
const LEN = 500;

interface Kite {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number; // where the string is held
  ay: number;
  hp: number;
  color: string;
  cut: boolean;
  // rival brain
  hx: number;
  hy: number;
  phase: number;
  power: number;
  hunter: boolean;
}

interface Game {
  time: number;
  me: Kite;
  tx: number;
  ty: number;
  rivals: Kite[];
  spawnIn: number;
  cuts: number;
  score: number;
  sparks: { x: number; y: number; vx: number; vy: number; t: number }[];
  pops: { x: number; y: number; text: string; color: string; t: number }[];
  over: number; // seconds since your kite was cut, 0 while flying
}

const COLORS = ["#ff4d6d", "#39ff88", "#22f3ff", "#b26bff", "#ff8a3d", "#ffffff"];

function kite(x: number, y: number, ax: number, ay: number, color: string): Kite {
  return { x, y, vx: 0, vy: 0, ax, ay, hp: 100, color, cut: false, hx: x, hy: y, phase: Math.random() * 6, power: 1, hunter: false };
}

function newGame(): Game {
  return { time: 0, me: kite(180, 260, ...ANCHOR, "#ffe14d"), tx: 180, ty: 260, rivals: [], spawnIn: 1, cuts: 0, score: 0, sparks: [], pops: [], over: 0 };
}

function spawnRival(g: Game) {
  const left = Math.random() < 0.5;
  const ax = left ? 10 + Math.random() * 90 : W - 10 - Math.random() * 90;
  const ay = 470 + Math.random() * 70;
  const r = kite(left ? -30 : W + 30, 120 + Math.random() * 160, ax, ay, COLORS[Math.floor(Math.random() * COLORS.length)]);
  r.hx = left ? 70 + Math.random() * 120 : 170 + Math.random() * 120;
  r.hy = 110 + Math.random() * 180;
  r.power = 0.7 + Math.min(1.3, g.time / 60) + Math.random() * 0.3;
  r.hunter = g.time > 25 && Math.random() < Math.min(0.7, g.time / 90);
  if (r.hunter) r.color = "#ff2bd6";
  g.rivals.push(r);
}

function fly(k: Kite, tx: number, ty: number, dt: number, pull: number) {
  k.vx += (tx - k.x) * pull * dt;
  k.vy += (ty - k.y) * pull * dt;
  const damp = Math.pow(0.04, dt);
  k.vx *= damp;
  k.vy *= damp;
  k.x += k.vx * dt;
  k.y += k.vy * dt;
  // the string can't stretch
  const dx = k.x - k.ax, dy = k.y - k.ay, d = Math.hypot(dx, dy);
  if (d > LEN) {
    k.x = k.ax + (dx / d) * LEN;
    k.y = k.ay + (dy / d) * LEN;
  }
  k.y = Math.min(k.y, 440);
}

function cross(a: Kite, b: Kite): [number, number] | null {
  const x1 = a.ax, y1 = a.ay, x2 = a.x, y2 = a.y, x3 = b.ax, y3 = b.ay, x4 = b.x, y4 = b.y;
  const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d;
  const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d;
  // ignore the bit right by the hands
  if (t < 0.15 || t > 1 || u < 0.15 || u > 1) return null;
  return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
}

function drift(k: Kite, dt: number) {
  k.vx += 30 * dt;
  k.vy += 25 * dt;
  k.x += k.vx * dt;
  k.y += k.vy * dt;
}

function step(g: Game, dt: number) {
  g.time += dt;
  for (const p of g.pops) p.t += dt;
  g.pops = g.pops.filter((p) => p.t < 1.2);
  for (const s of g.sparks) {
    s.t -= dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vy += 300 * dt;
  }
  g.sparks = g.sparks.filter((s) => s.t > 0);

  const me = g.me;
  if (g.over > 0) {
    g.over += dt;
    drift(me, dt);
  } else fly(me, g.tx, g.ty, dt, 28);
  const mySpeed = Math.hypot(me.vx, me.vy);

  g.spawnIn -= dt;
  const want = Math.min(4, 1 + Math.floor(g.time / 20));
  if (g.spawnIn <= 0 && g.rivals.filter((r) => !r.cut).length < want) {
    spawnRival(g);
    g.spawnIn = 2.5;
  }

  for (const r of g.rivals) {
    if (r.cut) {
      drift(r, dt);
      continue;
    }
    r.phase += dt * (0.8 + r.power * 0.3);
    let tx = r.hx + Math.sin(r.phase) * 60, ty = r.hy + Math.sin(r.phase * 2) * 35;
    if (r.hunter && g.over === 0) {
      // swoop across the middle of your string
      tx = (me.x + me.ax) / 2 + Math.cos(r.phase * 1.7) * 110;
      ty = (me.y + me.ay) / 2 - 60 + Math.sin(r.phase * 1.7) * 40;
    }
    fly(r, tx, ty, dt, 6 + r.power * 4);
    if (g.over > 0) continue;
    const hit = cross(me, r);
    if (!hit) continue;
    const theirSpeed = Math.hypot(r.vx, r.vy);
    r.hp -= dt * (14 + mySpeed * 0.28);
    me.hp -= dt * r.power * (16 + theirSpeed * 0.12);
    if (Math.random() < dt * 30) g.sparks.push({ x: hit[0], y: hit[1], vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 80, t: 0.4 });
    if (Math.random() < dt * 12) blip("saw", [[1200 + Math.random() * 400, 0, 0.03, "sawtooth", 0.02]]);
    if (r.hp <= 0) {
      r.cut = true;
      r.ax = r.x;
      r.ay = r.y;
      g.cuts++;
      const pts = Math.round(50 * r.power) + (r.hunter ? 50 : 0);
      g.score += pts;
      me.hp = Math.min(100, me.hp + 20);
      g.pops.push({ x: hit[0], y: hit[1], text: `KAI PO CHE! +${pts}`, color: "#ffe14d", t: 0 });
      blip("cut", [
        [660, 0, 0.08, "square", 0.05],
        [990, 0.08, 0.08, "square", 0.05],
        [1320, 0.16, 0.2, "square", 0.05],
      ]);
    }
    if (me.hp <= 0 && g.over === 0) {
      me.hp = 0;
      g.over = 0.001;
      me.cut = true;
      me.ax = me.x;
      me.ay = me.y;
      g.pops.push({ x: me.x, y: me.y, text: "CUT!", color: "#ff4d6d", t: 0 });
      blip("lost", [[500, 0, 0.7, "sawtooth", 0.05, 60]]);
    }
  }
  g.rivals = g.rivals.filter((r) => r.y < H + 60 && r.x < W + 80);
  if (g.over === 0) g.score += dt * 2;
}

function drawKite(cx: CanvasRenderingContext2D, k: Kite, t: number) {
  // string sags a little toward the ground
  if (!k.cut || k.ax !== k.x) {
    cx.strokeStyle = k.color;
    cx.globalAlpha = 0.75;
    cx.lineWidth = 1.2;
    cx.beginPath();
    if (k.cut) {
      cx.moveTo(k.x, k.y);
      cx.quadraticCurveTo(k.x - 20, k.y + 40, k.x - 10, k.y + 70);
    } else {
      cx.moveTo(k.ax, k.ay);
      cx.quadraticCurveTo((k.ax + k.x) / 2, (k.ay + k.y) / 2 + 30, k.x, k.y);
    }
    cx.stroke();
    cx.globalAlpha = 1;
  }
  cx.save();
  cx.translate(k.x, k.y);
  cx.rotate(Math.max(-0.6, Math.min(0.6, k.vx * 0.004)) + (k.cut ? t * 2 : 0));
  cx.fillStyle = k.color;
  cx.beginPath();
  cx.moveTo(0, -18);
  cx.lineTo(14, 0);
  cx.lineTo(0, 20);
  cx.lineTo(-14, 0);
  cx.closePath();
  cx.fill();
  cx.strokeStyle = "rgba(5,4,11,0.5)";
  cx.lineWidth = 1;
  cx.beginPath();
  cx.moveTo(0, -18);
  cx.lineTo(0, 20);
  cx.moveTo(-14, 0);
  cx.quadraticCurveTo(0, -8, 14, 0);
  cx.stroke();
  cx.fillStyle = k.color;
  cx.beginPath();
  cx.moveTo(0, 20);
  cx.lineTo(-5, 28 + Math.sin(t * 8) * 2);
  cx.lineTo(5, 28 - Math.sin(t * 8) * 2);
  cx.fill();
  cx.restore();
}

export function KiteCutter() {
  const [screen, setScreen] = useState<"title" | "play" | "over">("title");
  const [best, submitBest] = useBest("lab.kite.best");
  const [hud, setHud] = useState({ score: 0, hp: 100, cuts: 0 });
  const [result, setResult] = useState<{ score: number; cuts: number; time: number; best: boolean } | null>(null);
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
      if (g.over > 1.6) {
        playing.current = false;
        const score = Math.floor(g.score);
        setResult({ score, cuts: g.cuts, time: g.time, best: submitBest(score) });
        setScreen("over");
      }
    }
    if (now - hudAt.current > 100) {
      hudAt.current = now;
      setHud({ score: Math.floor(g.score), hp: Math.max(0, Math.round(g.me.hp)), cuts: g.cuts });
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = ctx2d(canvas, W);
    const t = now / 1000;

    const sky = cx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#22f3ff");
    sky.addColorStop(0.6, "#ffd39a");
    sky.addColorStop(1, "#ff8a3d");
    cx.fillStyle = sky;
    cx.fillRect(0, 0, W, H);
    cx.fillStyle = "#ffffff";
    cx.globalAlpha = 0.6;
    for (let i = 0; i < 4; i++) {
      const x = ((i * 120 + t * 8) % (W + 120)) - 60;
      cx.beginPath();
      cx.ellipse(x, 60 + i * 35, 40, 12, 0, 0, Math.PI * 2);
      cx.fill();
    }
    cx.globalAlpha = 1;
    // rooftops
    const roofs = [0, 70, 120, 200, 250, 310];
    roofs.forEach((x, i) => {
      cx.fillStyle = i % 2 ? "#5a3a6a" : "#4a2f5a";
      const top = 470 + ((i * 37) % 50);
      cx.fillRect(x, top, 72, H - top);
      cx.fillStyle = "#ffe14d";
      cx.globalAlpha = 0.5;
      for (let wy = top + 14; wy < H - 10; wy += 26) cx.fillRect(x + 12, wy, 10, 12), cx.fillRect(x + 44, wy, 10, 12);
      cx.globalAlpha = 1;
    });
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    cx.font = "20px sans-serif";
    cx.fillText("🧍", ANCHOR[0], ANCHOR[1] + 10);

    for (const r of g.rivals) drawKite(cx, r, t);
    drawKite(cx, g.me, t);
    // tiny flyers holding the rival strings
    cx.font = "14px sans-serif";
    for (const r of g.rivals) if (!r.cut) cx.fillText("🧍", r.ax, r.ay + 8);

    // string health bars above rival kites
    for (const r of g.rivals)
      if (!r.cut && r.hp < 100) {
        cx.fillStyle = "#05040b";
        cx.fillRect(r.x - 15, r.y - 30, 30, 4);
        cx.fillStyle = "#ffe14d";
        cx.fillRect(r.x - 15, r.y - 30, (30 * r.hp) / 100, 4);
      }

    cx.fillStyle = "#ffe14d";
    for (const s of g.sparks) cx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);

    cx.font = PIXEL_FONT(10);
    for (const p of g.pops) {
      cx.globalAlpha = Math.max(0, 1 - p.t / 1.2);
      cx.fillStyle = "#05040b";
      cx.fillText(p.text, p.x + 1, p.y - 20 - p.t * 24 + 1);
      cx.fillStyle = p.color;
      cx.fillText(p.text, p.x, p.y - 20 - p.t * 24);
    }
    cx.globalAlpha = 1;
  });

  const steer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!playing.current) return;
    if (e.type === "pointermove" && e.buttons === 0) return;
    e.preventDefault();
    const [x, y] = toLogical(e, e.currentTarget, W, H);
    gameRef.current.tx = x;
    gameRef.current.ty = Math.min(430, y);
  };

  return (
    <LabShell title="KITE CUTTER" color="#22f3ff">
      <div className="flex h-9 shrink-0 items-center justify-between gap-3 px-3 font-pixel text-[8px]">
        <span className="flex flex-1 items-center gap-1 text-dim">
          MANJA
          <span className="relative h-2 flex-1 bg-line">
            <span className="absolute inset-y-0 left-0" style={{ width: `${hud.hp}%`, background: hud.hp < 35 ? "#ff4d6d" : "#ffe14d" }} />
          </span>
        </span>
        <span className="text-dim">
          CUTS <span className="text-ink">{hud.cuts}</span>
        </span>
        <span className="text-cyan">{hud.score}</span>
      </div>
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        <canvas ref={canvasRef} className="block touch-none" onPointerDown={steer} onPointerMove={steer} />
        {screen === "title" && (
          <TitleCard a="KITE" b="CUTTER" colorA="#22f3ff" colorB="#ffe14d" blurb="Makar Sankranti. Every roof has a kite up, and every kite is after yours." best={best} onPlay={start}>
            <p>Drag to fly your yellow kite. Cross your string over a rival&apos;s and pull hard. The faster you move, the faster their string frays.</p>
            <p>They saw at yours too. Each cut mends your manja a bit. Pink kites hunt your string on purpose.</p>
            <p>When your string snaps, your kite drifts off and the day is over.</p>
          </TitleCard>
        )}
        {screen === "over" && result && (
          <GameOverCard title="KITE LOST" score={result.score} isBest={result.best} best={best} color="#22f3ff" line={`You cut ${result.cuts} kites in ${Math.floor(result.time)} seconds before someone cut yours.`} again={start} />
        )}
      </div>
    </LabShell>
  );
}
