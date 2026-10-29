"use client";

import { useCallback, useRef, useState } from "react";
import { blip, unlock } from "@/lib/lab/sound";
import { GameOverCard, LabShell, PIXEL_FONT, TitleCard, ctx2d, toLogical, useBest, useFitCanvas, useLoop } from "./LabShell";

// Umbrella Dash: walking home through the monsoon with a paper bag of
// groceries. The rain comes sideways and the wind keeps switching. Drag to
// point the umbrella into the rain. Cars splash puddles from below, so swing
// it low to block those. Once the bag is soaked, the atta is paste.

const W = 360;
const H = 600;
const PIVOT: [number, number] = [176, 392];
const REACH = 46;
const HALF = 58; // half the canopy width
const BAG = { x: 194, y: 448, w: 30, h: 36 };
const ROAD_Y = 548;

interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  big: boolean;
  fall: boolean; // thrown up by a car, so gravity pulls it back
}

interface Car {
  x: number;
  dir: number;
  warned: boolean;
  splashed: boolean;
}

interface Game {
  time: number;
  angle: number;
  target: number;
  wind: number;
  windTo: number;
  windIn: number;
  drops: Drop[];
  splashes: { x: number; y: number; vx: number; vy: number; t: number }[];
  cars: Car[];
  carIn: number;
  wet: number;
  blocked: number;
  flash: number;
  walk: number;
  pops: { x: number; y: number; text: string; color: string; t: number }[];
  over: boolean;
}

function newGame(): Game {
  return { time: 0, angle: -Math.PI / 2, target: -Math.PI / 2, wind: 0.3, windTo: 0.3, windIn: 4, drops: [], splashes: [], cars: [], carIn: 9, wet: 0, blocked: 0, flash: 0, walk: 0, pops: [], over: false };
}

function canopy(a: number): [number, number, number, number] {
  const cx = PIVOT[0] + Math.cos(a) * REACH, cy = PIVOT[1] + Math.sin(a) * REACH;
  const px = -Math.sin(a), py = Math.cos(a);
  return [cx - px * HALF, cy - py * HALF, cx + px * HALF, cy + py * HALF];
}

function crosses(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) {
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function inBag(x: number, y: number) {
  return x > BAG.x && x < BAG.x + BAG.w && y > BAG.y && y < BAG.y + BAG.h;
}

function step(g: Game, dt: number) {
  g.time += dt;
  g.walk += dt;
  g.flash = Math.max(0, g.flash - dt);
  for (const p of g.pops) p.t += dt;
  g.pops = g.pops.filter((p) => p.t < 1);

  // the umbrella swings toward your finger, but not instantly
  let da = g.target - g.angle;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  g.angle += da * Math.min(1, dt * 14);

  // wind shifts, and gets wilder the longer you're out
  g.windIn -= dt;
  if (g.windIn <= 0) {
    const wild = Math.min(1.9, 0.8 + g.time / 40);
    g.windTo = (Math.random() * 2 - 1) * wild;
    if (Math.abs(g.windTo - g.wind) > 1.2) g.pops.push({ x: W / 2, y: 120, text: "GUST!", color: "#22f3ff", t: 0 });
    g.windIn = Math.max(1.6, 4.5 - g.time / 30) * (0.7 + Math.random() * 0.6);
    if (Math.random() < 0.25) {
      g.flash = 0.25;
      blip("thunder", [[60, 0.1, 0.6, "sawtooth", 0.05, 30]]);
    }
  }
  g.wind += (g.windTo - g.wind) * Math.min(1, dt * 1.6);

  const vx = g.wind * 340, vy = 470 + Math.abs(g.wind) * 60;
  const rate = 55 + Math.min(120, g.time * 2.2);
  let n = rate * dt;
  while (n > 0) {
    if (Math.random() < n) {
      // drops start far enough up and upwind to cross the whole scene
      const lead = (vx / vy) * ROAD_Y;
      const x = Math.random() * (W + Math.abs(lead)) - Math.max(0, lead);
      g.drops.push({ x, y: -10 - Math.random() * 40, vx: vx * (0.9 + Math.random() * 0.2), vy: vy * (0.9 + Math.random() * 0.2), big: Math.random() < 0.1, fall: false });
    }
    n -= 1;
  }

  const [ax, ay, bx, by] = canopy(g.angle);
  const nx = Math.cos(g.angle), ny = Math.sin(g.angle);
  const keep: Drop[] = [];
  for (const d of g.drops) {
    const ox = d.x, oy = d.y;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    if (d.vx * nx + d.vy * ny < 0 && crosses(ox, oy, d.x, d.y, ax, ay, bx, by)) {
      g.blocked++;
      if (Math.random() < 0.3) g.splashes.push({ x: d.x, y: d.y, vx: nx * 60 + (Math.random() - 0.5) * 80, vy: ny * 60 - 40, t: 0.7 });
      continue;
    }
    if (inBag(d.x, d.y)) {
      g.wet += d.big ? 2.4 : 1.2;
      g.splashes.push({ x: d.x, y: d.y, vx: 0, vy: 0, t: 0.8 });
      continue;
    }
    if (d.y < ROAD_Y && d.x > -400 && d.x < W + 400) keep.push(d);
    else if (d.y >= ROAD_Y && Math.random() < 0.15) g.splashes.push({ x: d.x, y: ROAD_Y, vx: 0, vy: -20, t: 0.85 });
  }
  g.drops = keep;

  // cars that hit the puddle right next to you
  g.carIn -= dt;
  if (g.carIn <= 0) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    g.cars.push({ x: dir > 0 ? -260 : W + 260, dir, warned: false, splashed: false });
    g.carIn = Math.max(3.5, 9 - g.time / 15) * (0.7 + Math.random() * 0.6);
  }
  for (const c of g.cars) {
    c.x += c.dir * 420 * dt;
    if (!c.warned && Math.abs(c.x - PIVOT[0]) < 360) {
      c.warned = true;
      blip("honk", [
        [330, 0, 0.12, "square", 0.04],
        [330, 0.16, 0.18, "square", 0.04],
      ]);
    }
    if (!c.splashed && (c.x - BAG.x) * c.dir > -30) {
      c.splashed = true;
      // a wall of water thrown up and across toward you
      for (let i = 0; i < 46; i++) {
        const s = 260 + Math.random() * 260;
        const a = -Math.PI / 2 + c.dir * (0.35 + Math.random() * 0.7);
        g.drops.push({ x: BAG.x + 15 - c.dir * (40 + Math.random() * 40), y: ROAD_Y - 2, vx: Math.cos(a) * s, vy: Math.sin(a) * s, big: true, fall: true });
      }
      blip("splash", [[900, 0, 0.3, "sawtooth", 0.03, 120]]);
    }
  }
  g.cars = g.cars.filter((c) => c.x > -300 && c.x < W + 300);
  for (const d of g.drops) if (d.fall) d.vy += 900 * dt;

  for (const s of g.splashes) {
    s.t -= dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
  }
  g.splashes = g.splashes.filter((s) => s.t > 0);
  if (g.wet >= 100) g.over = true;
}

export function UmbrellaDash() {
  const [screen, setScreen] = useState<"title" | "play" | "over">("title");
  const [best, submitBest] = useBest("lab.umbrella.best");
  const [hud, setHud] = useState({ score: 0, wet: 0 });
  const [result, setResult] = useState<{ score: number; time: number; blocked: number; best: boolean } | null>(null);
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

  const scoreOf = (g: Game) => Math.floor(g.time * 10);

  useLoop((dt, now) => {
    const g = gameRef.current;
    if (playing.current) {
      step(g, dt);
      if (g.over) {
        playing.current = false;
        const score = scoreOf(g);
        setResult({ score, time: g.time, blocked: g.blocked, best: submitBest(score) });
        setScreen("over");
        blip("soggy", [[200, 0, 0.6, "sine", 0.05, 70]]);
      }
    } else if (!g.over) {
      // keep the title screen rainy
      step(g, dt);
      g.wet = 0;
      g.cars = [];
    }
    if (now - hudAt.current > 100) {
      hudAt.current = now;
      setHud({ score: scoreOf(g), wet: Math.min(100, Math.round(g.wet)) });
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = ctx2d(canvas, W);
    const t = now / 1000;

    // dark monsoon street, shops sliding past as you walk
    const sky = cx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#1c2340");
    sky.addColorStop(1, "#0b0f22");
    cx.fillStyle = sky;
    cx.fillRect(0, 0, W, H);
    const shift = (g.walk * 40) % 120;
    for (let i = -1; i < 5; i++) {
      const x = i * 120 - shift;
      cx.fillStyle = i % 2 ? "#2b2650" : "#332c5e";
      cx.fillRect(x, 170, 116, 300);
      cx.fillStyle = ["#ff4d6d", "#ffe14d", "#39ff88", "#22f3ff"][(i + 8 + Math.floor((g.walk * 40) / 120)) % 4];
      cx.globalAlpha = 0.6;
      cx.fillRect(x + 6, 180, 104, 22);
      cx.globalAlpha = 0.25;
      cx.fillRect(x + 14, 230, 88, 70);
      cx.globalAlpha = 1;
    }
    cx.fillStyle = "#3a3566";
    cx.fillRect(0, 470, W, ROAD_Y - 470);
    cx.fillStyle = "#151530";
    cx.fillRect(0, ROAD_Y, W, H - ROAD_Y);
    cx.fillStyle = "rgba(34,243,255,0.25)";
    cx.beginPath();
    cx.ellipse(BAG.x + 10, ROAD_Y + 10, 60, 7, 0, 0, Math.PI * 2);
    cx.fill();

    // cars
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    for (const c of g.cars) {
      cx.save();
      cx.translate(c.x, ROAD_Y + 22);
      if (c.dir > 0) cx.scale(-1, 1);
      cx.font = "48px sans-serif";
      cx.fillText("🚕", 0, 0);
      cx.restore();
    }
    // warning arrow for a car about to splash
    for (const c of g.cars)
      if (!c.splashed && Math.abs(c.x - PIVOT[0]) < 360) {
        cx.font = PIXEL_FONT(10);
        cx.fillStyle = Math.floor(t * 8) % 2 ? "#ffe14d" : "#ff4d6d";
        cx.fillText(c.dir > 0 ? "◀◀ SPLASH" : "SPLASH ▶▶", c.dir > 0 ? 60 : W - 60, ROAD_Y - 20);
      }

    // you, the bag, and the umbrella
    cx.font = "56px sans-serif";
    cx.fillText("🚶", PIVOT[0] - 6, 440);
    cx.font = "34px sans-serif";
    cx.fillText("🛍️", BAG.x + BAG.w / 2, BAG.y + BAG.h / 2);
    if (g.wet > 0) {
      cx.fillStyle = `rgba(34,120,255,${Math.min(0.6, g.wet / 160)})`;
      cx.fillRect(BAG.x + 2, BAG.y + BAG.h * (1 - g.wet / 100), BAG.w - 4, (BAG.h * g.wet) / 100);
    }
    const [ax, ay, bx, by] = canopy(g.angle);
    const nx = Math.cos(g.angle), ny = Math.sin(g.angle);
    cx.strokeStyle = "#b9b4d9";
    cx.lineWidth = 3;
    cx.beginPath();
    cx.moveTo(PIVOT[0], PIVOT[1]);
    cx.lineTo(PIVOT[0] + nx * (REACH + 6), PIVOT[1] + ny * (REACH + 6));
    cx.stroke();
    cx.fillStyle = "#ff2bd6";
    cx.beginPath();
    cx.moveTo(ax, ay);
    cx.quadraticCurveTo(PIVOT[0] + nx * (REACH + 44), PIVOT[1] + ny * (REACH + 44), bx, by);
    cx.closePath();
    cx.fill();
    cx.strokeStyle = "#ff8ae8";
    cx.lineWidth = 2;
    cx.beginPath();
    cx.moveTo(ax, ay);
    cx.lineTo(bx, by);
    cx.stroke();

    // rain
    cx.strokeStyle = "rgba(160,200,255,0.65)";
    cx.lineWidth = 1.5;
    cx.beginPath();
    for (const d of g.drops) {
      const k = 0.028;
      cx.moveTo(d.x, d.y);
      cx.lineTo(d.x - d.vx * k, d.y - d.vy * k);
    }
    cx.stroke();
    cx.fillStyle = "rgba(190,220,255,0.7)";
    for (const s of g.splashes) {
      cx.beginPath();
      cx.arc(s.x, s.y, 2, 0, Math.PI * 2);
      cx.fill();
    }

    // wind sock
    cx.font = PIXEL_FONT(8);
    cx.fillStyle = "#b9b4d9";
    cx.fillText("WIND", 40, 30);
    cx.strokeStyle = "#22f3ff";
    cx.lineWidth = 3;
    cx.beginPath();
    cx.moveTo(40, 48);
    cx.lineTo(40 + g.wind * 22, 48);
    cx.stroke();
    cx.fillStyle = "#22f3ff";
    cx.beginPath();
    const tip = 40 + g.wind * 22, s = Math.sign(g.wind) || 1;
    cx.moveTo(tip + s * 8, 48);
    cx.lineTo(tip, 42);
    cx.lineTo(tip, 54);
    cx.fill();

    if (g.flash > 0) {
      cx.fillStyle = `rgba(255,255,255,${g.flash * 2})`;
      cx.fillRect(0, 0, W, H);
    }
    cx.font = PIXEL_FONT(12);
    for (const p of g.pops) {
      cx.globalAlpha = 1 - p.t;
      cx.fillStyle = p.color;
      cx.fillText(p.text, p.x, p.y - p.t * 20);
    }
    cx.globalAlpha = 1;
  });

  const aim = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!playing.current) return;
    if (e.type === "pointermove" && e.pointerType !== "mouse" && e.buttons === 0) return;
    e.preventDefault();
    const [x, y] = toLogical(e, e.currentTarget, W, H);
    gameRef.current.target = Math.atan2(y - PIVOT[1], x - PIVOT[0]);
  };

  return (
    <LabShell title="UMBRELLA DASH" color="#ff2bd6">
      <div className="flex h-9 shrink-0 items-center justify-between gap-3 px-3 font-pixel text-[8px]">
        <span className="flex flex-1 items-center gap-1 text-dim">
          🛍️ WET
          <span className="relative h-2 flex-1 bg-line">
            <span className="absolute inset-y-0 left-0" style={{ width: `${hud.wet}%`, background: hud.wet > 70 ? "#ff4d6d" : "#22f3ff" }} />
          </span>
          <span className="text-ink">{hud.wet}%</span>
        </span>
        <span className="text-pink">{hud.score}</span>
      </div>
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        <canvas ref={canvasRef} className="block touch-none" onPointerDown={aim} onPointerMove={aim} />
        {screen === "title" && (
          <TitleCard a="UMBRELLA" b="DASH" colorA="#ff2bd6" colorB="#22f3ff" blurb="Monsoon, sideways rain, and a paper bag full of atta. Keep it dry for as long as you can." best={best} onPlay={start}>
            <p>Touch and drag anywhere to point the umbrella. Aim it into the rain, not straight up.</p>
            <p>The wind keeps switching, and gusts get wilder. Watch the wind arrow at the top.</p>
            <p>🚕 Taxis honk, then hit the puddle. Swing the umbrella low to the side the splash comes from.</p>
          </TitleCard>
        )}
        {screen === "over" && result && (
          <GameOverCard title="SOGGY ATTA" score={result.score} isBest={result.best} best={best} color="#ff2bd6" line={`The bag gave up after ${Math.floor(result.time)} seconds. Your umbrella stopped ${result.blocked} drops.`} again={start} />
        )}
      </div>
    </LabShell>
  );
}
