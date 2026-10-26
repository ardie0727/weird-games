"use client";

import { useCallback, useRef, useState } from "react";
import { blip, unlock } from "@/lib/lab/sound";
import { GameOverCard, LabShell, PIXEL_FONT, TitleCard, ctx2d, useBest, useFitCanvas, useLoop, toLogical } from "./LabShell";

// Cloud Sculptor: a lumpy cloud drifts across the sky. Push its puffs around
// with your finger until it looks like the animal outline. The wind keeps
// shoving it off and tearing bits loose. Hold a good match for a moment to
// win the round.

const W = 360;
const H = 600;
const CX = 180;
const CY = 270;
const BRUSH = 54;
const GRID = 8; // px per match cell
const PASS = 0.55;
const HOLD = 1.2;
const LIVES = 3;

type Circ = [number, number, number];

const SIZE = 1.3;
const RAW: { name: string; emoji: string; parts: Circ[] }[] = [
  { name: "RABBIT", emoji: "🐇", parts: [[10, 30, 46], [-38, -22, 30], [-52, -72, 13], [-48, -54, 12], [-26, -78, 13], [-28, -58, 12], [56, 42, 15]] },
  { name: "DUCK", emoji: "🦆", parts: [[14, 26, 50], [-40, -30, 29], [-76, -26, 13], [64, 6, 18], [-20, 10, 20]] },
  { name: "ELEPHANT", emoji: "🐘", parts: [[24, 6, 52], [-44, -10, 36], [-70, 26, 13], [-74, 50, 12], [-70, 72, 11], [0, 62, 15], [48, 62, 15]] },
  { name: "FISH", emoji: "🐟", parts: [[-10, 0, 46], [30, 0, 36], [82, -26, 19], [82, 26, 19], [-50, 0, 24]] },
  { name: "SNAIL", emoji: "🐌", parts: [[18, -12, 48], [-30, 44, 22], [10, 48, 22], [52, 48, 18], [-62, 30, 17], [-72, -2, 7], [-58, -4, 7]] },
  { name: "CAT", emoji: "🐈", parts: [[22, 30, 48], [-42, -28, 32], [-62, -62, 12], [-22, -64, 12], [72, 4, 12], [82, -22, 11], [86, -46, 10]] },
];
const ANIMALS = RAW.map((a) => ({ ...a, parts: a.parts.map(([x, y, r]) => [x * SIZE, y * SIZE, r * SIZE] as Circ) }));

interface Puff {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
}

interface Game {
  round: number;
  animal: number;
  puffs: Puff[];
  time: number;
  total: number;
  match: number;
  held: number;
  lives: number;
  score: number;
  shaped: number;
  gust: { vx: number; vy: number; t: number } | null;
  gustIn: number;
  phase: "intro" | "play" | "won" | "lost";
  phaseT: number;
  matchAt: number;
  over: boolean;
}

function cells(test: (x: number, y: number) => boolean) {
  const out = new Set<number>();
  for (let y = 0; y < H; y += GRID) for (let x = 0; x < W; x += GRID) if (test(x + GRID / 2, y + GRID / 2)) out.add((y / GRID) * 1000 + x / GRID);
  return out;
}

function targetCells(animal: number) {
  const parts = ANIMALS[animal].parts;
  return cells((x, y) => parts.some(([px, py, r]) => (x - CX - px) ** 2 + (y - CY - py) ** 2 <= r * r));
}

function matchOf(g: Game, target: Set<number>) {
  const cloud = cells((x, y) => g.puffs.some((p) => (x - p.x) ** 2 + (y - p.y) ** 2 <= p.r * p.r));
  let inter = 0;
  for (const c of cloud) if (target.has(c)) inter++;
  return inter / (cloud.size + target.size - inter || 1);
}

function startRound(g: Game) {
  let a = Math.floor(Math.random() * ANIMALS.length);
  if (a === g.animal) a = (a + 1) % ANIMALS.length;
  g.animal = a;
  const area = targetCells(a).size * GRID * GRID;
  const n = Math.max(6, Math.round(area / (Math.PI * 22 * 22 * 0.75)));
  // a lumpy blob somewhere off to the left
  const bx = 110 + Math.random() * 40, by = CY + (Math.random() - 0.5) * 120;
  g.puffs = Array.from({ length: n }, () => {
    const a2 = Math.random() * Math.PI * 2, d = Math.random() * 55;
    return { x: bx + Math.cos(a2) * d * 1.3, y: by + Math.sin(a2) * d, r: 18 + Math.random() * 9, vx: 0, vy: 0 };
  });
  g.total = Math.max(16, 28 - g.round);
  g.time = g.total;
  g.held = 0;
  g.match = 0;
  g.gust = null;
  g.gustIn = 3;
  g.phase = "intro";
  g.phaseT = 1.4;
}

function newGame(): Game {
  const g: Game = { round: 1, animal: -1, puffs: [], time: 0, total: 1, match: 0, held: 0, lives: LIVES, score: 0, shaped: 0, gust: null, gustIn: 0, phase: "intro", phaseT: 0, matchAt: 0, over: false };
  startRound(g);
  return g;
}

function step(g: Game, dt: number, target: Set<number>, now: number) {
  if (g.phase !== "play") {
    g.phaseT -= dt;
    if (g.phase === "won") for (const p of g.puffs) p.x += 20 * dt;
    if (g.phaseT > 0) return;
    if (g.phase === "intro") g.phase = "play";
    else if (g.lives <= 0) g.over = true;
    else {
      g.round++;
      startRound(g);
    }
    return;
  }
  g.time -= dt;
  const windX = 10 + g.round * 2.5;
  g.gustIn -= dt;
  if (g.gustIn <= 0 && !g.gust) {
    const a = Math.random() * Math.PI * 2;
    const s = 50 + g.round * 8;
    g.gust = { vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5, t: 0.9 };
    g.gustIn = Math.max(2, 5 - g.round * 0.3) + Math.random() * 2;
    blip("gust", [[200, 0, 0.6, "sine", 0.03, 120]]);
  }
  if (g.gust) {
    g.gust.t -= dt;
    if (g.gust.t <= 0) g.gust = null;
  }
  const tear = 6 + g.round * 2;
  for (const p of g.puffs) {
    // wind, gusts that hit some puffs harder than others, and drag
    p.vx += (Math.random() - 0.5) * tear * 4 * dt;
    p.vy += (Math.random() - 0.5) * tear * 4 * dt;
    p.vx *= Math.pow(0.4, dt);
    p.vy *= Math.pow(0.4, dt);
    const gx = g.gust ? g.gust.vx * (0.6 + ((p.r * 7) % 1) * 0.8) : 0;
    const gy = g.gust ? g.gust.vy * (0.6 + ((p.r * 13) % 1) * 0.8) : 0;
    p.x += (p.vx + windX + gx) * dt;
    p.y += (p.vy + gy) * dt;
    p.x = Math.max(-20, Math.min(W + 20, p.x));
    p.y = Math.max(40, Math.min(H - 60, p.y));
  }
  if (now - g.matchAt > 90) {
    g.matchAt = now;
    g.match = matchOf(g, target);
  }
  g.held = g.match >= PASS ? g.held + dt : Math.max(0, g.held - dt * 2);
  if (g.held >= HOLD) {
    const pts = 100 + Math.ceil(g.time) * 10 + Math.round((g.match - PASS) * 400);
    g.score += pts;
    g.shaped++;
    g.phase = "won";
    g.phaseT = 2;
    blip("win", [
      [523, 0, 0.12, "triangle", 0.05],
      [784, 0.12, 0.12, "triangle", 0.05],
      [1046, 0.24, 0.3, "triangle", 0.05],
    ]);
  } else if (g.time <= 0) {
    g.time = 0;
    g.lives--;
    g.phase = "lost";
    g.phaseT = 2;
    blip("lost", [[300, 0, 0.5, "sawtooth", 0.04, 90]]);
  }
}

export function CloudSculptor() {
  const [screen, setScreen] = useState<"title" | "play" | "over">("title");
  const [best, submitBest] = useBest("lab.cloud.best");
  const [hud, setHud] = useState({ score: 0, lives: LIVES, match: 0, time: 0, total: 1 });
  const [result, setResult] = useState<{ score: number; shaped: number; best: boolean } | null>(null);
  const { wrapRef, canvasRef } = useFitCanvas(W, H);
  const gameRef = useRef<Game>(newGame());
  const targetRef = useRef<{ animal: number; cells: Set<number> }>({ animal: -1, cells: new Set() });
  const playing = useRef(false);
  const hudAt = useRef(0);
  const brush = useRef<{ id: number; x: number; y: number } | null>(null);

  const start = useCallback(() => {
    unlock();
    gameRef.current = newGame();
    playing.current = true;
    setScreen("play");
  }, []);

  useLoop((dt, now) => {
    const g = gameRef.current;
    if (targetRef.current.animal !== g.animal) targetRef.current = { animal: g.animal, cells: targetCells(g.animal) };
    if (playing.current) {
      step(g, dt, targetRef.current.cells, now);
      if (g.over) {
        playing.current = false;
        setResult({ score: g.score, shaped: g.shaped, best: submitBest(g.score) });
        setScreen("over");
      }
    }
    if (now - hudAt.current > 100) {
      hudAt.current = now;
      setHud({ score: g.score, lives: g.lives, match: g.match, time: g.time, total: g.total });
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = ctx2d(canvas, W);
    const t = now / 1000;

    const sky = cx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#1e3a8a");
    sky.addColorStop(1, "#22f3ff");
    cx.fillStyle = sky;
    cx.fillRect(0, 0, W, H);
    // distant hills
    cx.fillStyle = "#1a5a46";
    cx.beginPath();
    cx.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) cx.lineTo(x, H - 50 - Math.sin(x / 50) * 18);
    cx.lineTo(W, H);
    cx.fill();

    // the target outline: stroke every circle, then fill over the insides
    const parts = ANIMALS[Math.max(0, g.animal)].parts;
    const good = g.match >= PASS;
    cx.strokeStyle = good ? "#39ff88" : "#ff2bd6";
    cx.lineWidth = 5;
    cx.setLineDash([8, 6]);
    for (const [px, py, r] of parts) {
      cx.beginPath();
      cx.arc(CX + px, CY + py, r, 0, Math.PI * 2);
      cx.stroke();
    }
    cx.setLineDash([]);
    cx.fillStyle = "#2a62b8";
    for (const [px, py, r] of parts) {
      cx.beginPath();
      cx.arc(CX + px, CY + py, r - 2, 0, Math.PI * 2);
      cx.fill();
    }

    // the cloud: a shadow pass, then a bright pass, so overlaps merge
    cx.fillStyle = "#b9c6e8";
    for (const p of g.puffs) {
      cx.beginPath();
      cx.arc(p.x + 2, p.y + 4, p.r, 0, Math.PI * 2);
      cx.fill();
    }
    cx.fillStyle = good ? "#f2fff6" : "#ffffff";
    for (const p of g.puffs) {
      cx.beginPath();
      cx.arc(p.x, p.y, p.r - 1, 0, Math.PI * 2);
      cx.fill();
    }
    if (g.gust) {
      cx.strokeStyle = "rgba(255,255,255,0.5)";
      cx.lineWidth = 2;
      const a = Math.atan2(g.gust.vy, g.gust.vx);
      for (let i = 0; i < 5; i++) {
        const y = 80 + i * 90 + Math.sin(t * 3 + i) * 10;
        const x = ((t * 400 + i * 130) % (W + 120)) - 60;
        cx.beginPath();
        cx.moveTo(x, y);
        cx.lineTo(x - Math.cos(a) * 40, y - Math.sin(a) * 40);
        cx.stroke();
      }
    }
    if (brush.current) {
      cx.strokeStyle = "rgba(255,255,255,0.5)";
      cx.lineWidth = 1;
      cx.beginPath();
      cx.arc(brush.current.x, brush.current.y, BRUSH, 0, Math.PI * 2);
      cx.stroke();
    }

    cx.textAlign = "center";
    cx.textBaseline = "middle";
    // hold progress
    if (g.held > 0 && g.phase === "play") {
      cx.fillStyle = "rgba(5,4,11,0.4)";
      cx.fillRect(W / 2 - 60, 60, 120, 8);
      cx.fillStyle = "#39ff88";
      cx.fillRect(W / 2 - 60, 60, 120 * Math.min(1, g.held / HOLD), 8);
    }
    const banner = (a: string, b: string, col: string) => {
      cx.fillStyle = "rgba(5,4,11,0.75)";
      cx.fillRect(0, 440, W, 74);
      cx.font = PIXEL_FONT(15);
      cx.fillStyle = col;
      cx.fillText(a, W / 2, 466);
      cx.font = PIXEL_FONT(8);
      cx.fillStyle = "#ece9ff";
      cx.fillText(b, W / 2, 492);
    };
    const an = ANIMALS[Math.max(0, g.animal)];
    if (playing.current && g.phase === "intro") banner(`MAKE A ${an.name}`, `${an.emoji}  ${Math.round(g.total)} SECONDS`, "#ffe14d");
    if (g.phase === "won") banner(`IT'S A ${an.name}!`, "THE KIDS BELOW ARE POINTING", "#39ff88");
    if (g.phase === "lost") banner("JUST A BLOB", g.lives > 0 ? "-1 ♥" : "THE SKY IS CLOSED", "#ff4d6d");
    if (g.phase === "play") {
      cx.font = PIXEL_FONT(9);
      cx.fillStyle = "#05040b";
      cx.fillText(`${an.emoji} ${an.name}`, W / 2, 36);
    }
  });

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!playing.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = toLogical(e, e.currentTarget, W, H);
    brush.current = { id: e.pointerId, x, y };
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const b = brush.current;
    const g = gameRef.current;
    if (!b || b.id !== e.pointerId || g.phase !== "play") return;
    const [x, y] = toLogical(e, e.currentTarget, W, H);
    const dx = x - b.x, dy = y - b.y;
    // smudge: puffs near the finger get carried along, the closest ones most
    for (const p of g.puffs) {
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d > BRUSH + p.r * 0.5) continue;
      const f = Math.max(0.15, 1 - d / (BRUSH + p.r * 0.5));
      p.x += dx * f;
      p.y += dy * f;
    }
    b.x = x;
    b.y = y;
  };
  const onUp = () => {
    brush.current = null;
  };

  const pct = Math.round(hud.match * 100);

  return (
    <LabShell title="CLOUD SCULPTOR" color="#22f3ff">
      <div className="flex h-9 shrink-0 items-center gap-3 px-3 font-pixel text-[8px]">
        <span className="text-[11px]">
          {Array.from({ length: LIVES }, (_, i) => (
            <span key={i} className={i < hud.lives ? "text-red" : "text-line"}>
              ♥
            </span>
          ))}
        </span>
        <span className="text-dim">
          MATCH <span className={hud.match >= PASS ? "text-green" : "text-ink"}>{pct}%</span>
        </span>
        <div className="h-2 flex-1 bg-line">
          <div className="h-full" style={{ width: `${(hud.time / hud.total) * 100}%`, background: hud.time / hud.total < 0.25 ? "#ff4d6d" : "#22f3ff" }} />
        </div>
        <span className="text-cyan">{hud.score}</span>
      </div>
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        <canvas ref={canvasRef} className="block touch-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
        {screen === "title" && (
          <TitleCard a="CLOUD" b="SCULPTOR" colorA="#22f3ff" colorB="#ffe14d" blurb="Shape a drifting cloud into the animal before the wind ruins it." best={best} onPlay={start}>
            <p>Drag through the cloud to push its puffs around. Puffs closest to your finger move the most.</p>
            <p>Fill the dotted outline. When the match hits {Math.round(PASS * 100)}% it turns green. Hold it there for a moment to win the round.</p>
            <p>The wind pushes the whole cloud along, gusts rip it about, and it gets windier every round. Run out of time and you lose a ♥.</p>
          </TitleCard>
        )}
        {screen === "over" && result && (
          <GameOverCard title="CLEAR SKIES" score={result.score} isBest={result.best} best={best} color="#22f3ff" line={`You sculpted ${result.shaped} ${result.shaped === 1 ? "animal" : "animals"}.`} again={start} />
        )}
      </div>
    </LabShell>
  );
}
