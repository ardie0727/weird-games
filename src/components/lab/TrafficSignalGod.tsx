"use client";

import { useCallback, useRef, useState } from "react";
import { blip, unlock } from "@/lib/lab/sound";
import { GameOverCard, LabShell, PIXEL_FONT, TitleCard, ctx2d, toLogical, useBest, useFitCanvas, useLoop } from "./LabShell";

// Traffic Signal God: a four-way junction where you flip each approach's light
// between red and green. Vehicles from crossing roads that meet in the box
// crash. Queues backed up off the screen gridlock. Auto-rickshaws often treat a
// red light as a suggestion. Traffic keeps left.

const W = 360;
const H = 600;
const CX = 180;
const CY = 300;
const BOX = { x0: 140, x1: 220, y0: 260, y1: 340 };
const LIVES = 3;

type Dir = "N" | "S" | "E" | "W"; // where the vehicle comes from
const DIRS: Dir[] = ["N", "S", "E", "W"];
const STOP: Record<Dir, number> = { N: BOX.y0 - 8, S: H - BOX.y1 - 8, W: BOX.x0 - 8, E: W - BOX.x1 - 8 };
const END: Record<Dir, number> = { N: H + 60, S: H + 60, W: W + 60, E: W + 60 };
const VERTICAL = (d: Dir) => d === "N" || d === "S";

type VKind = "car" | "bus" | "auto";
const VK: Record<VKind, { len: number; wid: number; speed: number; colors: string[]; pts: number }> = {
  car: { len: 26, wid: 15, speed: 95, colors: ["#22f3ff", "#ff2bd6", "#ece9ff", "#ff8a3d", "#b26bff"], pts: 1 },
  bus: { len: 46, wid: 17, speed: 70, colors: ["#ff4d6d"], pts: 3 },
  auto: { len: 19, wid: 14, speed: 115, colors: ["#ffe14d"], pts: 1 },
};

interface Vehicle {
  id: number;
  dir: Dir;
  kind: VKind;
  s: number; // distance of the front from where it spawned
  color: string;
  rogue: boolean; // decided to run the red
  rolled: boolean;
  crashed: number; // seconds of crash left, 0 if fine, -1 once towed
  wait: number;
}

interface Game {
  time: number;
  green: Record<Dir, boolean>;
  cars: Vehicle[];
  spawnIn: Record<Dir, number>;
  blocked: Record<Dir, number>;
  nextId: number;
  lives: number;
  passed: number;
  score: number;
  pops: { x: number; y: number; text: string; color: string; t: number }[];
  over: boolean;
}

function newGame(): Game {
  return {
    time: 0,
    green: { N: true, S: true, E: false, W: false },
    cars: [],
    spawnIn: { N: 1, S: 2.2, E: 1.6, W: 3 },
    blocked: { N: 0, S: 0, E: 0, W: 0 },
    nextId: 1,
    lives: LIVES,
    passed: 0,
    score: 0,
    pops: [],
    over: false,
  };
}

/** Front-of-vehicle point and heading for a distance along its lane. Keep left. */
function place(dir: Dir, s: number): { x: number; y: number; dx: number; dy: number } {
  switch (dir) {
    case "N":
      return { x: 200, y: s, dx: 0, dy: 1 };
    case "S":
      return { x: 160, y: H - s, dx: 0, dy: -1 };
    case "W":
      return { x: s, y: 280, dx: 1, dy: 0 };
    case "E":
      return { x: W - s, y: 320, dx: -1, dy: 0 };
  }
}

function rect(v: Vehicle) {
  const p = place(v.dir, v.s);
  const k = VK[v.kind];
  const bx = p.x - p.dx * k.len, by = p.y - p.dy * k.len;
  const hw = k.wid / 2;
  return { x0: Math.min(p.x, bx) - (p.dx ? 0 : hw), x1: Math.max(p.x, bx) + (p.dx ? 0 : hw), y0: Math.min(p.y, by) - (p.dy ? 0 : hw), y1: Math.max(p.y, by) + (p.dy ? 0 : hw) };
}

const inBox = (v: Vehicle) => v.s > STOP[v.dir] + 8 && v.s - VK[v.kind].len < STOP[v.dir] + 8 + (VERTICAL(v.dir) ? BOX.y1 - BOX.y0 : BOX.x1 - BOX.x0);

function pickKind(time: number): VKind {
  const r = Math.random();
  const autoP = Math.min(0.4, 0.15 + time / 300);
  if (r < autoP) return "auto";
  if (time > 25 && r < autoP + 0.12) return "bus";
  return "car";
}

function step(g: Game, dt: number) {
  g.time += dt;
  for (const p of g.pops) p.t += dt;
  g.pops = g.pops.filter((p) => p.t < 1.2);
  const ramp = Math.min(1.8, 1 + g.time / 150);

  // spawning
  for (const d of DIRS) {
    g.spawnIn[d] -= dt;
    if (g.spawnIn[d] > 0) continue;
    const lane = g.cars.filter((v) => v.dir === d);
    const last = lane.reduce<Vehicle | null>((m, v) => (!m || v.s < m.s ? v : m), null);
    const kind = pickKind(g.time);
    if (last && last.s - VK[last.kind].len < 6) {
      // no room to enter: the queue has backed off the screen
      g.blocked[d] += dt;
      if (g.blocked[d] > 2.5) {
        g.blocked[d] = 0;
        g.lives--;
        const p = place(d, 40);
        g.pops.push({ x: Math.max(60, Math.min(W - 60, p.x)), y: Math.max(30, Math.min(H - 30, p.y)), text: "GRIDLOCK!", color: "#ff4d6d", t: 0 });
        g.cars = g.cars.filter((v) => v.dir !== d || v.s > STOP[d]);
        blip("jam", [
          [300, 0, 0.12, "square", 0.05],
          [300, 0.16, 0.12, "square", 0.05],
          [300, 0.32, 0.25, "square", 0.05],
        ]);
      }
      continue;
    }
    g.blocked[d] = 0;
    const k = VK[kind];
    g.cars.push({ id: g.nextId++, dir: d, kind, s: 0, color: k.colors[Math.floor(Math.random() * k.colors.length)], rogue: false, rolled: false, crashed: 0, wait: 0 });
    const vert = VERTICAL(d);
    g.spawnIn[d] = ((vert ? 2.6 : 3.4) / ramp) * (0.6 + Math.random() * 0.9);
  }

  // movement, front to back per lane
  for (const d of DIRS) {
    const lane = g.cars.filter((v) => v.dir === d).sort((a, b) => b.s - a.s);
    let leader: Vehicle | null = null;
    for (const v of lane) {
      if (v.crashed > 0) {
        v.crashed -= dt;
        if (v.crashed <= 0) v.crashed = -1; // towed away below
        leader = v;
        continue;
      }
      const k = VK[v.kind];
      let limit = Infinity;
      if (leader) limit = leader.s - VK[leader.kind].len - 7;
      const atLine = v.s <= STOP[d] + 0.5;
      if (!g.green[d] && atLine) {
        if (v.kind === "auto" && !v.rolled && STOP[d] - v.s < 40) {
          v.rolled = true;
          v.rogue = Math.random() < 0.5;
          if (v.rogue) {
            const p = place(d, v.s);
            g.pops.push({ x: p.x, y: p.y, text: "🤪 YOLO", color: "#ffe14d", t: 0 });
            blip("honk", [[520, 0, 0.18, "square", 0.04]]);
          }
        }
        if (!v.rogue) limit = Math.min(limit, STOP[d]);
      }
      const next = Math.min(v.s + k.speed * ramp * 0.85 * dt, limit);
      v.wait = next - v.s < k.speed * 0.2 * dt ? v.wait + dt : 0;
      v.s = Math.max(v.s, next);
      leader = v;
    }
  }

  // exits
  for (const v of g.cars)
    if (v.s > END[v.dir]) {
      g.passed++;
      g.score += VK[v.kind].pts * 10;
    }
  g.cars = g.cars.filter((v) => v.s <= END[v.dir] && v.crashed >= 0);

  // crashes between crossing roads, inside the box
  const live = g.cars.filter((v) => v.crashed === 0 && inBox(v));
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      if (VERTICAL(a.dir) === VERTICAL(b.dir)) continue;
      const ra = rect(a), rb = rect(b);
      if (ra.x0 < rb.x1 && rb.x0 < ra.x1 && ra.y0 < rb.y1 && rb.y0 < ra.y1) {
        a.crashed = b.crashed = 1.4;
        g.lives--;
        g.pops.push({ x: CX, y: CY, text: "CRASH!", color: "#ff4d6d", t: 0 });
        blip("crash", [
          [120, 0, 0.35, "sawtooth", 0.07, 40],
          [700, 0, 0.1, "square", 0.04, 200],
        ]);
      }
    }
  if (g.lives <= 0) {
    g.lives = 0;
    g.over = true;
  }
}

function drawVehicle(cx: CanvasRenderingContext2D, v: Vehicle, t: number) {
  const p = place(v.dir, v.s);
  const k = VK[v.kind];
  cx.save();
  cx.translate(p.x, p.y);
  cx.rotate(Math.atan2(p.dy, p.dx));
  if (v.crashed > 0) cx.rotate(Math.sin(t * 40) * 0.15);
  // body runs backwards from the front at x=0
  cx.fillStyle = v.crashed > 0 ? "#5d5788" : v.color;
  cx.beginPath();
  cx.roundRect(-k.len, -k.wid / 2, k.len, k.wid, v.kind === "auto" ? 6 : 3);
  cx.fill();
  if (v.kind === "auto") {
    cx.fillStyle = "#39ff88";
    cx.fillRect(-k.len + 3, -k.wid / 2 + 2, k.len - 9, k.wid - 4); // green canopy
  } else {
    cx.fillStyle = "rgba(5,4,11,0.55)";
    cx.fillRect(-9, -k.wid / 2 + 2, 5, k.wid - 4); // windscreen
    if (v.kind === "bus") for (let x = -k.len + 6; x < -12; x += 8) cx.fillRect(x, -k.wid / 2 + 2, 5, k.wid - 4);
  }
  // headlights
  cx.fillStyle = "#fff6c2";
  cx.fillRect(-2, -k.wid / 2 + 1, 2, 3);
  cx.fillRect(-2, k.wid / 2 - 4, 2, 3);
  cx.restore();
  if (v.wait > 6 && v.crashed === 0 && Math.sin(t * 10 + v.id) > 0.3) {
    cx.font = PIXEL_FONT(7);
    cx.fillStyle = "#ffe14d";
    cx.textAlign = "center";
    cx.fillText("BEEP", p.x, p.y - 12);
  }
}

function signalPos(d: Dir): [number, number] {
  return d === "N" ? [236, BOX.y0 - 24] : d === "S" ? [124, BOX.y1 + 24] : d === "W" ? [BOX.x0 - 24, 244] : [BOX.x1 + 24, 356];
}

export function TrafficSignalGod() {
  const [screen, setScreen] = useState<"title" | "play" | "over">("title");
  const [best, submitBest] = useBest("lab.traffic.best");
  const [hud, setHud] = useState({ score: 0, lives: LIVES, passed: 0 });
  const [result, setResult] = useState<{ score: number; passed: number; time: number; best: boolean } | null>(null);
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
        setResult({ score: g.score, passed: g.passed, time: g.time, best: submitBest(g.score) });
        setScreen("over");
      }
    }
    if (now - hudAt.current > 100) {
      hudAt.current = now;
      setHud({ score: g.score, lives: g.lives, passed: g.passed });
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = ctx2d(canvas, W);
    const t = now / 1000;

    cx.fillStyle = "#14202a";
    cx.fillRect(0, 0, W, H);
    // pavement blocks
    cx.fillStyle = "#1d1838";
    cx.fillRect(0, 0, BOX.x0 - 6, BOX.y0 - 6);
    cx.fillRect(BOX.x1 + 6, 0, W, BOX.y0 - 6);
    cx.fillRect(0, BOX.y1 + 6, BOX.x0 - 6, H);
    cx.fillRect(BOX.x1 + 6, BOX.y1 + 6, W, H);
    // roads
    cx.fillStyle = "#26233a";
    cx.fillRect(BOX.x0, 0, BOX.x1 - BOX.x0, H);
    cx.fillRect(0, BOX.y0, W, BOX.y1 - BOX.y0);
    // centre dashes
    cx.strokeStyle = "#ffe14d";
    cx.globalAlpha = 0.5;
    cx.setLineDash([10, 10]);
    cx.lineWidth = 2;
    cx.beginPath();
    cx.moveTo(CX, 0);
    cx.lineTo(CX, BOX.y0);
    cx.moveTo(CX, BOX.y1);
    cx.lineTo(CX, H);
    cx.moveTo(0, CY);
    cx.lineTo(BOX.x0, CY);
    cx.moveTo(BOX.x1, CY);
    cx.lineTo(W, CY);
    cx.stroke();
    cx.setLineDash([]);
    cx.globalAlpha = 1;
    // zebra crossings at the stop lines
    cx.fillStyle = "rgba(236,233,255,0.18)";
    for (let i = 0; i < 8; i++) {
      cx.fillRect(BOX.x0 + 2 + i * 10, BOX.y0 - 6, 6, 6);
      cx.fillRect(BOX.x0 + 2 + i * 10, BOX.y1, 6, 6);
      cx.fillRect(BOX.x0 - 6, BOX.y0 + 2 + i * 10, 6, 6);
      cx.fillRect(BOX.x1, BOX.y0 + 2 + i * 10, 6, 6);
    }
    // stop lines, coloured by signal
    for (const d of DIRS) {
      cx.fillStyle = g.green[d] ? "#39ff88" : "#ff4d6d";
      cx.globalAlpha = 0.7;
      if (d === "N") cx.fillRect(CX, BOX.y0 - 9, BOX.x1 - CX, 3);
      if (d === "S") cx.fillRect(BOX.x0, BOX.y1 + 6, CX - BOX.x0, 3);
      if (d === "W") cx.fillRect(BOX.x0 - 9, BOX.y0, 3, CY - BOX.y0);
      if (d === "E") cx.fillRect(BOX.x1 + 6, CY, 3, BOX.y1 - CY);
      cx.globalAlpha = 1;
    }

    for (const v of g.cars) drawVehicle(cx, v, t);

    // signal heads
    for (const d of DIRS) {
      const [x, y] = signalPos(d);
      cx.fillStyle = "#05040b";
      cx.beginPath();
      cx.roundRect(x - 13, y - 13, 26, 26, 5);
      cx.fill();
      const col = g.green[d] ? "#39ff88" : "#ff4d6d";
      cx.fillStyle = col;
      cx.shadowColor = col;
      cx.shadowBlur = 12;
      cx.beginPath();
      cx.arc(x, y, 9, 0, Math.PI * 2);
      cx.fill();
      cx.shadowBlur = 0;
      const n = g.cars.filter((v) => v.dir === d && v.s <= STOP[d] + 1 && v.wait > 0.3).length;
      if (n >= 3) {
        cx.font = PIXEL_FONT(7);
        cx.textAlign = "center";
        cx.fillStyle = n >= 6 ? "#ff4d6d" : "#ffe14d";
        cx.fillText(`${n}`, x, y + 24);
      }
    }

    cx.textAlign = "center";
    cx.font = PIXEL_FONT(11);
    for (const p of g.pops) {
      cx.globalAlpha = Math.max(0, 1 - p.t / 1.2);
      cx.fillStyle = "#05040b";
      cx.fillText(p.text, p.x + 1, p.y - 16 - p.t * 20 + 1);
      cx.fillStyle = p.color;
      cx.fillText(p.text, p.x, p.y - 16 - p.t * 20);
    }
    cx.globalAlpha = 1;
  });

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gameRef.current;
    if (!playing.current) return;
    e.preventDefault();
    const [x, y] = toLogical(e, e.currentTarget, W, H);
    // the whole screen is four tap zones, one per road arm
    const dx = x - CX, dy = (y - CY) * 0.6;
    const d: Dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "W" : "E") : dy < 0 ? "N" : "S";
    g.green[d] = !g.green[d];
    blip("flip", [[g.green[d] ? 880 : 440, 0, 0.05, "square", 0.035]]);
  };

  return (
    <LabShell title="TRAFFIC SIGNAL GOD" color="#39ff88">
      <div className="flex h-9 shrink-0 items-center justify-between px-3 font-pixel text-[8px]">
        <span className="text-[11px]">
          {Array.from({ length: LIVES }, (_, i) => (
            <span key={i} className={i < hud.lives ? "text-red" : "text-line"}>
              ♥
            </span>
          ))}
        </span>
        <span className="text-dim">
          THROUGH <span className="text-ink">{hud.passed}</span>
        </span>
        <span className="text-green">{hud.score}</span>
      </div>
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        <canvas ref={canvasRef} className="block touch-none" onPointerDown={onDown} />
        {screen === "title" && (
          <TitleCard a="TRAFFIC" b="SIGNAL GOD" colorA="#39ff88" colorB="#ff4d6d" blurb="You control the lights at a busy junction. Most drivers obey them. The auto-rickshaws mostly don't." best={best} onPlay={start}>
            <p>Tap a road arm (anywhere on that side of the screen) to flip its light between red and green. Each arm has its own light.</p>
            <p>Cross traffic that meets in the box crashes. A queue that backs up off the screen is gridlock. Each costs a ♥.</p>
            <p>🛺 Yellow autos run red lights about half the time. Buses are slow and long but worth 3x.</p>
          </TitleCard>
        )}
        {screen === "over" && result && (
          <GameOverCard
            title="JUNCTION CLOSED"
            score={result.score}
            isBest={result.best}
            best={best}
            color="#39ff88"
            line={`${result.passed} vehicles got through in ${Math.floor(result.time / 60)}:${String(Math.floor(result.time % 60)).padStart(2, "0")}.`}
            again={start}
          />
        )}
      </div>
    </LabShell>
  );
}
