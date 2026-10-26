"use client";

import { useCallback, useRef, useState } from "react";
import { blip, tone, unlock } from "@/lib/lab/sound";
import { GameOverCard, LabShell, PIXEL_FONT, TitleCard, ctx2d, toLogical, useBest, useFitCanvas, useLoop } from "./LabShell";

// Pressure Cooker: Mom says the dal needs N whistles. Count them yourself
// (there is no counter) and turn the gas off right after the Nth. Too early
// and the dal is raw; miss it and the next whistle overcooks it. Hisses,
// the neighbour's cooker, the kettle, a kid with a toy whistle and the
// doorbell all try to make you lose count.

const W = 360;
const H = 600;
const COOKER_X = 200;
const COUNTER_Y = 372;
const KNOB = { x: 180, y: 500, r: 46 };
const DOOR = { x: 40, y: 180, w: 280, h: 150 };
const WHISTLE_LEN = 1.1;

const DISHES: [string, number, number][] = [
  // name, min whistles, max whistles
  ["RICE", 2, 3],
  ["TOOR DAL", 3, 4],
  ["POTATOES", 2, 4],
  ["KHICHDI", 3, 5],
  ["SAMBAR", 3, 5],
  ["CHOLE", 4, 6],
  ["RAJMA", 5, 7],
  ["MUTTON", 6, 8],
];

type Kind = "whistle" | "hiss" | "neighbour" | "kettle" | "kid" | "door";
interface Ev {
  t: number;
  kind: Kind;
  done: boolean;
}
interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  max: number;
}
interface Pop {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  size: number;
}

interface Game {
  round: number;
  lives: number;
  score: number;
  cooked: number;
  dish: string;
  target: number;
  count: number;
  clock: number;
  lastWhistle: number;
  events: Ev[];
  phase: "order" | "cook" | "result";
  phaseT: number;
  verdict: { good: boolean; title: string; line: string } | null;
  // animation state
  whistleT: number;
  hissT: number;
  kettleT: number;
  neighbourT: number;
  kidT: number;
  door: number; // seconds left on the doorbell card
  lidFly: number;
  shake: number;
  puffs: Puff[];
  pops: Pop[];
  over: boolean;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function setupRound(g: Game) {
  const pool = DISHES.slice(0, Math.min(DISHES.length, 3 + g.round));
  const [dish, lo, hi] = pool[Math.floor(Math.random() * pool.length)];
  g.dish = dish;
  g.target = lo + Math.floor(Math.random() * (hi - lo + 1));
  g.count = 0;
  g.clock = 0;
  g.lastWhistle = -99;
  g.verdict = null;
  g.whistleT = g.hissT = g.kettleT = g.neighbourT = g.kidT = g.door = 0;
  g.lidFly = 0;
  // real whistles, one more than needed (the overcooking one)
  const gapLo = Math.max(1.7, 3 - g.round * 0.12);
  const ev: Ev[] = [];
  const reals: number[] = [];
  let t = rnd(2.2, 3.4);
  for (let i = 0; i <= g.target; i++) {
    reals.push(t);
    ev.push({ t, kind: "whistle", done: false });
    t += rnd(gapLo, gapLo + 2);
  }
  // distractions, more and nastier each round
  const kinds: Kind[] = ["hiss"];
  if (g.round >= 1) kinds.push("neighbour");
  if (g.round >= 2) kinds.push("door");
  if (g.round >= 3) kinds.push("kettle");
  if (g.round >= 4) kinds.push("kid");
  const end = reals[reals.length - 1];
  const n = g.target + Math.min(10, 1 + g.round * 2);
  for (let i = 0; i < n; i++) {
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    // whistle-like fakes keep clear of the real ones so the ear can still tell them apart
    for (let tries = 0; tries < 12; tries++) {
      const at = rnd(0.8, end);
      const gap = kind === "door" ? 0 : kind === "hiss" ? 0.5 : 0.9;
      if (reals.every((r) => Math.abs(r - at) > gap + (at > r ? WHISTLE_LEN : 0))) {
        ev.push({ t: at, kind, done: false });
        break;
      }
    }
  }
  g.events = ev.sort((a, b) => a.t - b.t);
  g.phase = "order";
  g.phaseT = 2.4;
}

function newGame(): Game {
  const g = { round: 0, lives: 3, score: 0, cooked: 0, puffs: [], pops: [], shake: 0, over: false } as unknown as Game;
  setupRound(g);
  return g;
}

function steam(g: Game, x: number, y: number, n: number, spread: number, up: number, big: number) {
  for (let i = 0; i < n; i++) {
    const max = rnd(0.6, 1.2);
    g.puffs.push({ x: x + rnd(-3, 3), y, vx: rnd(-spread, spread), vy: -rnd(up * 0.7, up), r: rnd(4, 8) * big, life: max, max });
  }
}

function fire(g: Game, e: Ev) {
  switch (e.kind) {
    case "whistle":
      g.count++;
      g.lastWhistle = g.clock;
      g.whistleT = WHISTLE_LEN;
      g.shake = 0.3;
      blip("whistle", [
        [1500, 0, WHISTLE_LEN, "sine", 0.06, 2000],
        [3000, 0, WHISTLE_LEN, "square", 0.012, 4000],
      ]);
      if (g.count > g.target) finish(g, false, "OVERCOOKED", `That was whistle ${g.count}. The ${g.dish.toLowerCase()} is now soup, and some of it is on the ceiling.`);
      break;
    case "hiss":
      g.hissT = 0.6;
      tone(5000, 0, 0.5, "triangle", 0.012, 4200);
      break;
    case "neighbour":
      g.neighbourT = 1;
      tone(1100, 0, 0.9, "sine", 0.025, 1400);
      break;
    case "kettle":
      g.kettleT = 1;
      tone(2200, 0, 0.9, "sine", 0.03, 2300);
      break;
    case "kid":
      g.kidT = 1.3;
      blip("kid", [
        [1700, 0, 0.18, "square", 0.025],
        [1700, 0.25, 0.18, "square", 0.025],
        [1900, 0.5, 0.4, "square", 0.025],
      ]);
      break;
    case "door":
      if (g.door <= 0) {
        g.door = 3;
        blip("door", [
          [880, 0, 0.3, "triangle", 0.05],
          [698, 0.32, 0.5, "triangle", 0.05],
        ]);
      }
      break;
  }
}

function finish(g: Game, good: boolean, title: string, line: string) {
  g.phase = "result";
  g.phaseT = 2.6;
  g.verdict = { good, title, line };
  g.door = 0;
  if (good) {
    const quick = g.clock - g.lastWhistle < 1.5;
    const pts = 100 + g.target * 20 + g.round * 10 + (quick ? 50 : 0);
    g.score += pts;
    g.cooked++;
    g.pops.push({ x: W / 2, y: 150, text: `+${pts}${quick ? " QUICK!" : ""}`, color: "#39ff88", t: 0, size: 12 });
    blip("good", [
      [523, 0, 0.1, "square", 0.04],
      [659, 0.1, 0.1, "square", 0.04],
      [784, 0.2, 0.2, "square", 0.04],
    ]);
  } else {
    g.lives--;
    if (title === "OVERCOOKED") g.lidFly = 0.001;
    blip("bad", [
      [300, 0, 0.25, "sawtooth", 0.05, 120],
      [150, 0.25, 0.4, "sawtooth", 0.05, 70],
    ]);
  }
}

function turnOff(g: Game) {
  if (g.phase !== "cook") return;
  if (g.count === g.target) finish(g, true, "PERFECT DAL", `Exactly ${g.target} whistles. Mom nods once. That is the highest honour.`);
  else finish(g, false, "RAW", `Only ${g.count} ${g.count === 1 ? "whistle" : "whistles"}, Mom wanted ${g.target}. The ${g.dish.toLowerCase()} crunches.`);
}

function step(g: Game, dt: number) {
  for (const p of g.puffs) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy *= 0.98;
    p.r += dt * 10;
    p.life -= dt;
  }
  g.puffs = g.puffs.filter((p) => p.life > 0);
  for (const p of g.pops) p.t += dt;
  g.pops = g.pops.filter((p) => p.t < 1.2);
  g.shake = Math.max(0, g.shake - dt);
  g.door = Math.max(0, g.door - dt);
  if (g.lidFly > 0) g.lidFly += dt;

  // effects keep running even after the round is decided
  if (g.whistleT > 0) {
    g.whistleT -= dt;
    steam(g, COOKER_X, 214, 3, 25, 260, 1.3);
  }
  if (g.hissT > 0) {
    g.hissT -= dt;
    if (Math.random() < 0.5) steam(g, COOKER_X, 222, 1, 20, 60, 0.6);
  }
  if (g.kettleT > 0) {
    g.kettleT -= dt;
    steam(g, 96, 286, 2, 30, 160, 0.9);
  }
  if (g.neighbourT > 0) {
    g.neighbourT -= dt;
    if (Math.random() < 0.5) steam(g, 288, 96, 1, 15, 70, 0.7);
  }
  if (g.kidT > 0) g.kidT -= dt;

  if (g.phase === "order") {
    g.phaseT -= dt;
    if (g.phaseT <= 0) g.phase = "cook";
    return;
  }
  if (g.phase === "result") {
    g.phaseT -= dt;
    if (g.phaseT <= 0) {
      if (g.lives <= 0) g.over = true;
      else {
        g.round++;
        setupRound(g);
      }
    }
    return;
  }
  g.clock += dt;
  for (const e of g.events) {
    if (!e.done && g.clock >= e.t) {
      e.done = true;
      fire(g, e);
      if (g.phase !== "cook") break;
    }
  }
}

function draw(cx: CanvasRenderingContext2D, g: Game, t: number, playing: boolean) {
  const sx = g.shake > 0 ? Math.sin(t * 90) * g.shake * 6 : 0;
  cx.save();
  cx.translate(sx, 0);
  // kitchen wall tiles
  cx.fillStyle = "#1b1533";
  cx.fillRect(-10, 0, W + 20, H);
  cx.strokeStyle = "#241d42";
  cx.lineWidth = 1;
  for (let y = 0; y < COUNTER_Y; y += 30) {
    cx.beginPath();
    cx.moveTo(-10, y);
    cx.lineTo(W + 10, y);
    cx.stroke();
  }
  for (let x = 0; x < W; x += 30) {
    cx.beginPath();
    cx.moveTo(x, 0);
    cx.lineTo(x, COUNTER_Y);
    cx.stroke();
  }
  // window with the neighbour's kitchen across the gap
  cx.fillStyle = "#0a0818";
  cx.fillRect(232, 24, 112, 104);
  cx.fillStyle = "#2b2550";
  cx.fillRect(250, 62, 76, 66);
  cx.fillStyle = g.neighbourT > 0 ? "#ffe14d" : "#a08a3a";
  cx.fillRect(268, 80, 40, 30);
  cx.strokeStyle = "#8f89b8";
  cx.lineWidth = 4;
  cx.strokeRect(232, 24, 112, 104);
  cx.beginPath();
  cx.moveTo(288, 24);
  cx.lineTo(288, 128);
  cx.stroke();

  // mom
  cx.textAlign = "center";
  cx.textBaseline = "middle";
  cx.font = "40px sans-serif";
  cx.fillText("👩", 38, 70);
  // the order bubble (always visible: the order is easy, the counting isn't)
  cx.fillStyle = "#ece9ff";
  cx.beginPath();
  cx.roundRect(66, 34, 154, 64, 8);
  cx.fill();
  cx.beginPath();
  cx.moveTo(70, 66);
  cx.lineTo(58, 74);
  cx.lineTo(72, 76);
  cx.fill();
  cx.fillStyle = "#05040b";
  cx.font = PIXEL_FONT(8);
  cx.fillText(g.dish, 143, 54);
  cx.font = PIXEL_FONT(10);
  cx.fillStyle = "#ff2bd6";
  cx.fillText(`${g.target} WHISTLES`, 143, 78);

  // counter and stove
  cx.fillStyle = "#3a3466";
  cx.fillRect(-10, COUNTER_Y, W + 20, 14);
  cx.fillStyle = "#26233a";
  cx.fillRect(-10, COUNTER_Y + 14, W + 20, H);
  cx.fillStyle = "#0d0b16";
  cx.fillRect(30, COUNTER_Y - 18, 300, 18);
  // kettle from round 4
  if (g.round >= 3) {
    cx.fillStyle = "#c9c6dc";
    cx.beginPath();
    cx.roundRect(70, 296, 52, 50, 12);
    cx.fill();
    cx.fillStyle = "#8f89b8";
    cx.fillRect(72, 330, 48, 6);
    cx.beginPath();
    cx.moveTo(70, 312);
    cx.lineTo(54, 290);
    cx.lineTo(60, 286);
    cx.lineTo(76, 304);
    cx.fill();
    cx.strokeStyle = "#05040b";
    cx.lineWidth = 4;
    cx.beginPath();
    cx.arc(96, 296, 16, Math.PI, 0);
    cx.stroke();
  }

  // the cooker
  const fly = g.lidFly;
  const jig = g.whistleT > 0 ? Math.sin(t * 70) * 3 : g.hissT > 0 ? Math.sin(t * 50) * 1.5 : 0;
  const lift = g.whistleT > 0 ? 8 : g.hissT > 0 ? 2 : 0;
  cx.fillStyle = "#b8b4cc";
  cx.beginPath();
  cx.roundRect(COOKER_X - 62, 262, 124, 84, 14);
  cx.fill();
  cx.fillStyle = "#d8d5e6";
  cx.fillRect(COOKER_X - 56, 270, 14, 68);
  // long black handle
  cx.fillStyle = "#05040b";
  cx.fillRect(COOKER_X + 58, 262, 82, 12);
  cx.fillRect(COOKER_X - 100, 268, 40, 10);
  cx.save();
  if (fly > 0) cx.translate(fly * 140, -fly * 420 + fly * fly * 300);
  cx.fillStyle = "#9e9ab4";
  cx.beginPath();
  cx.roundRect(COOKER_X - 66, 250, 132, 16, 6);
  cx.fill();
  cx.fillStyle = "#05040b";
  cx.fillRect(COOKER_X - 6, 234, 12, 18);
  // the whistle weight
  cx.fillStyle = "#3a3466";
  cx.beginPath();
  cx.roundRect(COOKER_X - 11 + jig, 216 - lift, 22, 20, 5);
  cx.fill();
  cx.restore();
  if (fly > 0) {
    // dal everywhere
    cx.fillStyle = "#ffcf3d";
    for (let i = 0; i < 9; i++) {
      cx.beginPath();
      cx.arc(COOKER_X - 60 + i * 15, 255 - Math.min(1, fly * 2) * (40 + ((i * 37) % 60)), 5 + (i % 3), 0, Math.PI * 2);
      cx.fill();
    }
  }

  // flames
  const lit = g.phase !== "result" || !g.verdict?.good;
  for (const fx of [96, COOKER_X]) {
    if (!lit && fx === COOKER_X) continue;
    if (fx === 96 && g.round < 3) continue;
    for (let i = -2; i <= 2; i++) {
      cx.fillStyle = i % 2 ? "#22f3ff" : "#4d7bff";
      const fh = 7 + Math.sin(t * 20 + i * 2) * 2;
      cx.beginPath();
      cx.moveTo(fx + i * 9 - 4, COUNTER_Y - 18);
      cx.lineTo(fx + i * 9, COUNTER_Y - 18 - fh);
      cx.lineTo(fx + i * 9 + 4, COUNTER_Y - 18);
      cx.fill();
    }
  }


  // steam
  for (const p of g.puffs) {
    cx.globalAlpha = Math.max(0, p.life / p.max) * 0.6;
    cx.fillStyle = "#ece9ff";
    cx.beginPath();
    cx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    cx.fill();
  }
  cx.globalAlpha = 1;

  // sound words
  if (g.whistleT > 0) {
    cx.font = PIXEL_FONT(14);
    cx.fillStyle = "#ece9ff";
    cx.fillText("WHEEEEE!", COOKER_X - 92 + Math.sin(t * 40) * 2, 214 - (WHISTLE_LEN - g.whistleT) * 20);
  }
  if (g.hissT > 0) {
    cx.font = PIXEL_FONT(8);
    cx.fillStyle = "#8f89b8";
    cx.fillText("tsss...", COOKER_X + 44, 222);
  }
  if (g.kettleT > 0) {
    cx.font = PIXEL_FONT(11);
    cx.fillStyle = "#ece9ff";
    cx.fillText("FWEEE!", 82, 250 - (1 - g.kettleT) * 16);
  }
  if (g.neighbourT > 0) {
    cx.font = PIXEL_FONT(9);
    cx.fillStyle = "#b26bff";
    cx.fillText("wheee!", 288, 146 + Math.sin(t * 30));
  }
  if (g.kidT > 0) {
    const k = Math.min(1, g.kidT, 1.3 - g.kidT + 0.01) * 4;
    const y = H - Math.min(1, k) * 90;
    cx.font = "44px sans-serif";
    cx.fillText("🧒", 320, y);
    cx.font = PIXEL_FONT(10);
    cx.fillStyle = "#ff8a3d";
    cx.fillText("PHWEE!", 300, y - 38);
  }

  // gas knob
  const on = g.phase === "cook";
  cx.fillStyle = "#05040b";
  cx.beginPath();
  cx.arc(KNOB.x, KNOB.y, KNOB.r + 6, 0, Math.PI * 2);
  cx.fill();
  cx.fillStyle = on ? "#ff4d6d" : "#3a3466";
  cx.beginPath();
  cx.arc(KNOB.x, KNOB.y, KNOB.r, 0, Math.PI * 2);
  cx.fill();
  cx.save();
  cx.translate(KNOB.x, KNOB.y);
  cx.rotate(on ? -0.6 : 0.9);
  cx.fillStyle = "#ece9ff";
  cx.fillRect(-7, -KNOB.r + 6, 14, KNOB.r * 2 - 12);
  cx.restore();
  cx.font = PIXEL_FONT(8);
  cx.fillStyle = on ? "#ece9ff" : "#8f89b8";
  cx.fillText(on ? "TAP: GAS OFF" : "GAS", KNOB.x, KNOB.y + KNOB.r + 22);
  cx.restore();
  cx.textAlign = "center";
  cx.textBaseline = "middle";

  // doorbell card blocks the view of the cooker
  if (g.door > 0 && g.phase === "cook") {
    cx.fillStyle = "rgba(42,20,60,0.93)";
    cx.beginPath();
    cx.roundRect(DOOR.x, DOOR.y, DOOR.w, DOOR.h, 10);
    cx.fill();
    cx.strokeStyle = "#ff2bd6";
    cx.lineWidth = 3;
    cx.stroke();
    cx.font = "34px sans-serif";
    cx.fillText("🔔", W / 2, DOOR.y + 36);
    cx.font = PIXEL_FONT(11);
    cx.fillStyle = "#ff2bd6";
    cx.fillText("DING DONG!", W / 2, DOOR.y + 76);
    cx.font = PIXEL_FONT(7);
    cx.fillStyle = "#ece9ff";
    cx.fillText("WATER PURIFIER SALESMAN", W / 2, DOOR.y + 100);
    cx.fillStyle = "#ffe14d";
    cx.fillText("TAP HERE TO SHOO HIM", W / 2, DOOR.y + 122);
  }

  // round banners
  if (playing && g.phase === "order") {
    cx.fillStyle = "rgba(5,4,11,0.85)";
    cx.fillRect(0, 150, W, 110);
    cx.font = PIXEL_FONT(9);
    cx.fillStyle = "#8f89b8";
    cx.fillText(`ROUND ${g.round + 1}`, W / 2, 176);
    cx.font = PIXEL_FONT(13);
    cx.fillStyle = "#ffe14d";
    cx.fillText(`${g.dish}: ${g.target} WHISTLES`, W / 2, 206);
    cx.font = PIXEL_FONT(7);
    cx.fillStyle = "#ece9ff";
    cx.fillText("COUNT THEM. NOBODY ELSE WILL.", W / 2, 236);
  }
  if (g.phase === "result" && g.verdict) {
    cx.fillStyle = "rgba(5,4,11,0.88)";
    cx.fillRect(0, 140, W, 132);
    cx.font = PIXEL_FONT(16);
    cx.fillStyle = g.verdict.good ? "#39ff88" : "#ff4d6d";
    cx.fillText(g.verdict.title, W / 2, 172);
    cx.font = PIXEL_FONT(8);
    cx.fillStyle = "#ece9ff";
    cx.fillText(`YOU HEARD ${g.count} OF ${g.target}`, W / 2, 202);
    wrapText(cx, g.verdict.line, W / 2, 228, 320, 15, "#8f89b8");
  }
  cx.font = PIXEL_FONT(12);
  for (const p of g.pops) {
    cx.globalAlpha = 1 - p.t / 1.2;
    cx.fillStyle = p.color;
    cx.fillText(p.text, p.x, 112 - p.t * 30);
  }
  cx.globalAlpha = 1;
}

function wrapText(cx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, color: string) {
  cx.font = "15px sans-serif";
  cx.fillStyle = color;
  const words = text.split(" ");
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (cx.measureText(test).width > maxW && line) {
      cx.fillText(line, x, y);
      line = w;
      y += lh;
    } else line = test;
  }
  if (line) cx.fillText(line, x, y);
}

export function PressureCooker() {
  const [screen, setScreen] = useState<"title" | "play" | "over">("title");
  const [best, submitBest] = useBest("lab.cooker.best");
  const [hud, setHud] = useState({ score: 0, lives: 3, round: 0 });
  const [result, setResult] = useState<{ score: number; rounds: number; best: boolean } | null>(null);
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
        setResult({ score: g.score, rounds: g.cooked, best: submitBest(g.score) });
        setScreen("over");
      }
    }
    if (now - hudAt.current > 120) {
      hudAt.current = now;
      setHud({ score: g.score, lives: g.lives, round: g.round });
    }
    const canvas = canvasRef.current;
    if (canvas) draw(ctx2d(canvas, W), g, now / 1000, playing.current);
  });

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!playing.current) return;
    e.preventDefault();
    const g = gameRef.current;
    const [x, y] = toLogical(e, e.currentTarget, W, H);
    if (g.door > 0 && g.phase === "cook" && x > DOOR.x && x < DOOR.x + DOOR.w && y > DOOR.y && y < DOOR.y + DOOR.h) {
      g.door = 0;
      tone(300, 0, 0.08, "square", 0.04);
      return;
    }
    if (y > COUNTER_Y + 20) turnOff(g);
  };

  return (
    <LabShell title="PRESSURE COOKER" color="#ff4d6d">
      <div className="flex h-9 shrink-0 items-center justify-between px-3 font-pixel text-[8px]">
        <span className="text-dim">
          ROUND <span className="text-ink">{hud.round + 1}</span>
        </span>
        <span className="text-red">{"♥".repeat(Math.max(0, hud.lives))}</span>
        <span className="text-yellow">{hud.score}</span>
      </div>
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        <canvas ref={canvasRef} className="block touch-none" onPointerDown={onDown} />
        {screen === "title" && (
          <TitleCard a="PRESSURE" b="COOKER" colorA="#ff4d6d" colorB="#ffe14d" blurb="Mom said 3 whistles. Mom is not going to say it again." best={best} onPlay={start}>
            <p>Each round Mom names a dish and how many whistles it needs. There is no counter: you count. Turn the gas off (tap the bottom of the screen) right after the last whistle.</p>
            <p>Too early and it&apos;s raw. Wait for one more whistle and it&apos;s overcooked. Three ruined dishes and you&apos;re banned from the kitchen.</p>
            <p>Only the big WHEEEE from your cooker counts. Hisses, the neighbour&apos;s cooker, the kettle and the kid with the toy whistle do not. Shoo the salesman at the door. Sound on helps a lot.</p>
          </TitleCard>
        )}
        {screen === "over" && result && (
          <GameOverCard
            title="KITCHEN BAN"
            score={result.score}
            isBest={result.best}
            best={best}
            color="#ff4d6d"
            line={`You cooked ${result.rounds} ${result.rounds === 1 ? "dish" : "dishes"} before Mom took the ladle away.`}
            again={start}
          />
        )}
      </div>
    </LabShell>
  );
}
