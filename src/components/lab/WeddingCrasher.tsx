"use client";

import { useCallback, useRef, useState } from "react";
import { blip, unlock } from "@/lib/lab/sound";
import { GameOverCard, LabShell, PIXEL_FONT, TitleCard, ctx2d, toLogical, useBest, useFitCanvas, useLoop } from "./LabShell";

// Wedding Crasher: you don't know the bride or the groom, but the buffet is
// huge. Sneak to every food counter and back out the gate. Uncles wander the
// hall looking around. Stay in an uncle's sight too long and he asks what you
// do, whose side you're from, and when you're getting married. The dance floor
// hides you, but nobody moves fast while dancing.

const W = 360;
const H = 600;
const SPEED = 120;
const R = 12;
const GATE: [number, number] = [180, 572];
const DANCE = { x: 30, y: 270, w: 130, h: 110 };
const TABLES: [number, number, number][] = [
  [250, 220, 24],
  [300, 320, 24],
  [230, 420, 24],
  [90, 470, 24],
  [70, 190, 22],
];
const STALLS: { x: number; dish: string; name: string }[] = [
  { x: 40, dish: "🍛", name: "BIRYANI" },
  { x: 110, dish: "🥘", name: "PANEER" },
  { x: 180, dish: "🍢", name: "TIKKA" },
  { x: 250, dish: "🫓", name: "NAAN" },
  { x: 320, dish: "🍮", name: "JAMUN" },
];
const STALL_Y = 86;
const QUESTIONS = ["Beta, what do you do?", "Whose side are you from?", "When are YOU getting married?", "What's your salary?", "Arre, you've become so fat!", "Which college? Engineering?", "Do you know Sharma ji's son?"];

interface Uncle {
  x: number;
  y: number;
  dir: number;
  look: number; // where he turns to look
  tx: number;
  ty: number;
  wait: number;
  sus: number;
  cool: number;
  speed: number;
  emoji: string;
}

interface Game {
  round: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  uncles: Uncle[];
  got: boolean[];
  lives: number;
  frozen: number;
  question: string;
  asker: number;
  score: number;
  dishes: number;
  pops: { x: number; y: number; text: string; color: string; t: number }[];
  between: number;
  over: boolean;
}

function wander(u: Uncle) {
  u.tx = 30 + Math.random() * (W - 60);
  u.ty = 140 + Math.random() * 360;
}

function makeUncles(round: number): Uncle[] {
  const n = Math.min(7, 2 + round);
  const out: Uncle[] = [];
  for (let i = 0; i < n; i++) {
    const u: Uncle = { x: 40 + Math.random() * 280, y: 150 + Math.random() * 260, dir: Math.random() * 6.28, look: 0, tx: 0, ty: 0, wait: Math.random() * 2, sus: 0, cool: 1.5, speed: 34 + round * 5 + Math.random() * 14, emoji: i % 3 === 2 ? "👵" : "👴" };
    u.look = u.dir;
    wander(u);
    out.push(u);
  }
  return out;
}

function newGame(): Game {
  return { round: 1, x: GATE[0], y: GATE[1] - 20, tx: GATE[0], ty: GATE[1] - 20, uncles: makeUncles(1), got: STALLS.map(() => false), lives: 3, frozen: 0, question: "", asker: -1, score: 0, dishes: 0, pops: [], between: 0, over: false };
}

function onDance(x: number, y: number) {
  return x > DANCE.x && x < DANCE.x + DANCE.w && y > DANCE.y && y < DANCE.y + DANCE.h;
}

function push(x: number, y: number, r: number): [number, number] {
  for (const [tx, ty, tr] of TABLES) {
    const d = Math.hypot(x - tx, y - ty), m = tr + r;
    if (d < m && d > 0) {
      x = tx + ((x - tx) / d) * m;
      y = ty + ((y - ty) / d) * m;
    }
  }
  return [Math.max(r, Math.min(W - r, x)), Math.max(STALL_Y + 24, Math.min(H - r, y))];
}

const CONE = 0.62; // half-angle of an uncle's gaze
const SIGHT = 120;

function sees(u: Uncle, x: number, y: number) {
  const dx = x - u.x, dy = y - u.y;
  const d = Math.hypot(dx, dy);
  if (d > SIGHT || u.cool > 0) return false;
  let da = Math.atan2(dy, dx) - u.dir;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  return Math.abs(da) < CONE;
}

function step(g: Game, dt: number) {
  for (const p of g.pops) p.t += dt;
  g.pops = g.pops.filter((p) => p.t < 1.2);
  if (g.between > 0) {
    g.between -= dt;
    if (g.between <= 0) {
      g.round++;
      g.uncles = makeUncles(g.round);
      g.got = STALLS.map(() => false);
      g.x = g.tx = GATE[0];
      g.y = g.ty = GATE[1] - 20;
    }
    return;
  }

  // uncles stroll, stop, and look around
  for (const u of g.uncles) {
    u.cool = Math.max(0, u.cool - dt);
    if (u.wait > 0) {
      u.wait -= dt;
      if (Math.random() < dt * 0.9) u.look = u.dir + (Math.random() - 0.5) * 3;
    } else {
      const dx = u.tx - u.x, dy = u.ty - u.y, d = Math.hypot(dx, dy);
      if (d < 4) {
        u.wait = 1 + Math.random() * 2.5;
        wander(u);
      } else {
        u.look = Math.atan2(dy, dx);
        [u.x, u.y] = push(u.x + (dx / d) * u.speed * dt, u.y + (dy / d) * u.speed * dt, 10);
      }
    }
    let da = u.look - u.dir;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    u.dir += da * Math.min(1, dt * 3);
  }

  if (g.frozen > 0) {
    g.frozen -= dt;
    if (g.frozen <= 0) {
      g.question = "";
      if (g.lives <= 0) g.over = true;
    }
    return;
  }

  const dancing = onDance(g.x, g.y);
  const dx = g.tx - g.x, dy = g.ty - g.y, d = Math.hypot(dx, dy);
  const sp = SPEED * (dancing ? 0.55 : 1);
  if (d > 2) [g.x, g.y] = push(g.x + (dx / d) * Math.min(d, sp * dt), g.y + (dy / d) * Math.min(d, sp * dt), R);

  // being watched builds suspicion; the dance floor hides you
  g.uncles.forEach((u, i) => {
    if (sees(u, g.x, g.y)) {
      const near = 1 - Math.hypot(g.x - u.x, g.y - u.y) / SIGHT;
      u.sus += dt * (0.9 + near * 1.6) * (dancing ? 0.2 : 1);
      if (u.sus > 0.35 && Math.random() < dt * 2) blip("hmm", [[220 + u.sus * 200, 0, 0.06, "triangle", 0.02]]);
    } else u.sus = Math.max(0, u.sus - dt * 0.7);
    if (u.sus >= 1 && g.frozen <= 0) {
      u.sus = 0;
      u.cool = 4;
      g.lives--;
      g.frozen = 2;
      g.asker = i;
      g.question = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
      blip("caught", [
        [392, 0, 0.12, "square", 0.05],
        [262, 0.14, 0.3, "square", 0.05],
      ]);
    }
  });

  STALLS.forEach((s, i) => {
    if (!g.got[i] && Math.hypot(g.x - s.x, g.y - (STALL_Y + 26)) < 26) {
      g.got[i] = true;
      g.dishes++;
      g.score += 10 * g.round;
      g.pops.push({ x: s.x, y: STALL_Y + 10, text: `+${s.dish}`, color: "#39ff88", t: 0 });
      blip("grab", [[880, 0, 0.06, "square", 0.04]]);
    }
  });
  if (g.got.every(Boolean) && Math.hypot(g.x - GATE[0], g.y - GATE[1]) < 28) {
    const bonus = 50 * g.round + g.lives * 10;
    g.score += bonus;
    g.pops.push({ x: W / 2, y: 300, text: `ESCAPED +${bonus}`, color: "#ffe14d", t: 0 });
    blip("escape", [
      [523, 0, 0.1, "square", 0.04],
      [659, 0.1, 0.1, "square", 0.04],
      [784, 0.2, 0.1, "square", 0.04],
      [1046, 0.3, 0.2, "square", 0.04],
    ]);
    g.between = 1.5;
  }
}

export function WeddingCrasher() {
  const [screen, setScreen] = useState<"title" | "play" | "over">("title");
  const [best, submitBest] = useBest("lab.wedding.best");
  const [hud, setHud] = useState({ score: 0, lives: 3, round: 1, plate: 0 });
  const [result, setResult] = useState<{ score: number; rounds: number; dishes: number; best: boolean } | null>(null);
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
        setResult({ score: g.score, rounds: g.round - 1, dishes: g.dishes, best: submitBest(g.score) });
        setScreen("over");
      }
    }
    if (now - hudAt.current > 100) {
      hudAt.current = now;
      setHud({ score: g.score, lives: g.lives, round: g.round, plate: g.got.filter(Boolean).length });
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = ctx2d(canvas, W);
    const t = now / 1000;

    // the hall: carpet, marigold strings, stage lights
    cx.fillStyle = "#3a1530";
    cx.fillRect(0, 0, W, H);
    cx.fillStyle = "#4a1c3c";
    for (let y = 0; y < H; y += 24) for (let x = (y / 24) % 2 ? 12 : 0; x < W; x += 24) cx.fillRect(x, y, 12, 12);
    for (let i = 0; i < 18; i++) {
      cx.fillStyle = i % 2 ? "#ff8a3d" : "#ffe14d";
      cx.beginPath();
      cx.arc(10 + i * 20, 8 + Math.sin(i * 0.7) * 3, 5, 0, Math.PI * 2);
      cx.fill();
    }
    // dance floor
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        const hue = (i + j + Math.floor(t * 4)) % 4;
        cx.fillStyle = ["#ff2bd6", "#22f3ff", "#ffe14d", "#39ff88"][hue];
        cx.globalAlpha = 0.35;
        cx.fillRect(DANCE.x + (i * DANCE.w) / 4, DANCE.y + (j * DANCE.h) / 4, DANCE.w / 4 - 2, DANCE.h / 4 - 2);
      }
    cx.globalAlpha = 1;
    cx.font = PIXEL_FONT(7);
    cx.fillStyle = "#fff";
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    cx.fillText("DANCE FLOOR", DANCE.x + DANCE.w / 2, DANCE.y - 8);
    cx.font = "18px sans-serif";
    for (let i = 0; i < 3; i++) cx.fillText(i % 2 ? "🕺" : "💃", DANCE.x + 24 + i * 40, DANCE.y + 30 + Math.sin(t * 6 + i) * 6 + (i % 2) * 40);

    // buffet counters
    cx.fillStyle = "#c9c4ea";
    cx.fillRect(8, STALL_Y - 22, W - 16, 40);
    STALLS.forEach((s, i) => {
      cx.fillStyle = g.got[i] ? "#39ff88" : "#ffe14d";
      cx.globalAlpha = g.got[i] ? 0.3 : 0.18 + Math.sin(t * 4 + i) * 0.08;
      cx.beginPath();
      cx.arc(s.x, STALL_Y + 26, 22, 0, Math.PI * 2);
      cx.fill();
      cx.globalAlpha = 1;
      cx.font = "26px sans-serif";
      cx.fillText(s.dish, s.x, STALL_Y - 2);
      cx.font = PIXEL_FONT(6);
      cx.fillStyle = "#3a1530";
      cx.fillText(s.name, s.x, STALL_Y + 13);
    });
    cx.font = PIXEL_FONT(8);
    cx.fillStyle = "#ffe14d";
    cx.fillText("BUFFET", W / 2, STALL_Y - 34);

    // tables
    for (const [x, y, r] of TABLES) {
      cx.fillStyle = "#f4f0ff";
      cx.beginPath();
      cx.arc(x, y, r, 0, Math.PI * 2);
      cx.fill();
      cx.font = "14px sans-serif";
      cx.fillText("🌼", x, y);
    }

    // gate
    const open = g.got.every(Boolean);
    cx.fillStyle = open ? "#39ff88" : "#6b5aa8";
    cx.globalAlpha = open ? 0.5 + Math.sin(t * 6) * 0.3 : 0.6;
    cx.fillRect(GATE[0] - 34, H - 14, 68, 14);
    cx.globalAlpha = 1;
    cx.font = PIXEL_FONT(7);
    cx.fillStyle = open ? "#39ff88" : "#b9b4d9";
    cx.fillText(open ? "▼ ESCAPE ▼" : "GATE", GATE[0], H - 24);

    // uncles and their gaze
    for (const u of g.uncles) {
      cx.fillStyle = u.cool > 0 ? "rgba(185,180,217,0.06)" : `rgba(255,${Math.round(225 - u.sus * 180)},77,${0.14 + u.sus * 0.3})`;
      cx.beginPath();
      cx.moveTo(u.x, u.y);
      cx.arc(u.x, u.y, SIGHT, u.dir - CONE, u.dir + CONE);
      cx.closePath();
      cx.fill();
    }
    for (const u of g.uncles) {
      cx.fillStyle = "#fff";
      cx.font = "26px sans-serif";
      cx.fillText(u.emoji, u.x, u.y);
      if (u.sus > 0.05) {
        cx.fillStyle = "#05040b";
        cx.fillRect(u.x - 13, u.y - 24, 26, 5);
        cx.fillStyle = u.sus > 0.7 ? "#ff4d6d" : "#ffe14d";
        cx.fillRect(u.x - 13, u.y - 24, 26 * u.sus, 5);
        if (u.sus > 0.5) {
          cx.font = PIXEL_FONT(10);
          cx.fillText("?", u.x + 14, u.y - 26);
        }
      }
    }

    // you
    cx.fillStyle = "#fff";
    const dancing = onDance(g.x, g.y);
    cx.save();
    cx.translate(g.x, g.y);
    if (dancing) cx.rotate(Math.sin(t * 10) * 0.3);
    cx.font = "26px sans-serif";
    cx.fillText(dancing ? "🕺" : "🧑", 0, 0);
    cx.restore();
    if (g.dishes > 0 || g.got.some(Boolean)) {
      cx.font = "12px sans-serif";
      cx.fillText("🍽️", g.x + 14, g.y + 8);
    }

    if (g.question && g.asker >= 0) {
      const u = g.uncles[g.asker];
      const bx = Math.max(90, Math.min(W - 90, u.x)), by = Math.max(60, u.y - 54);
      cx.fillStyle = "#f4f0ff";
      cx.beginPath();
      cx.roundRect(bx - 86, by - 20, 172, 36, 8);
      cx.fill();
      cx.fillStyle = "#3a1530";
      cx.font = "15px sans-serif";
      cx.fillText(g.question, bx, by - 2);
      cx.fillStyle = "rgba(5,4,11,0.25)";
      cx.fillRect(0, 0, W, H);
    }

    cx.font = PIXEL_FONT(10);
    for (const p of g.pops) {
      cx.globalAlpha = Math.max(0, 1 - p.t / 1.2);
      cx.fillStyle = p.color;
      cx.fillText(p.text, p.x, p.y - p.t * 24);
    }
    cx.globalAlpha = 1;
  });

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!playing.current) return;
    if (e.type === "pointermove" && e.buttons === 0) return;
    e.preventDefault();
    const [x, y] = toLogical(e, e.currentTarget, W, H);
    gameRef.current.tx = x;
    gameRef.current.ty = y;
  };

  return (
    <LabShell title="WEDDING CRASHER" color="#ffe14d">
      <div className="flex h-9 shrink-0 items-center justify-between px-3 font-pixel text-[8px]">
        <span className="text-dim">
          WEDDING <span className="text-ink">{hud.round}</span>
        </span>
        <span className="text-dim">
          PLATE <span className="text-green">{hud.plate}</span>/{STALLS.length}
        </span>
        <span>{"😬".repeat(Math.max(0, hud.lives))}</span>
        <span className="text-yellow">{hud.score}</span>
      </div>
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        <canvas ref={canvasRef} className="block touch-none" onPointerDown={move} onPointerMove={move} />
        {screen === "title" && (
          <TitleCard a="WEDDING" b="CRASHER" colorA="#ffe14d" colorB="#ff2bd6" blurb="You know nobody here. The buffet doesn't care. The uncles do." best={best} onPlay={start}>
            <p>Tap or drag to walk. Grab something from all five counters, then slip out the gate.</p>
            <p>Uncles and aunties wander and look around. Stand in their gaze too long and the questions start. Three awkward chats and you&apos;re out.</p>
            <p>The dance floor hides you, but you move slowly while dancing.</p>
          </TitleCard>
        )}
        {screen === "over" && result && (
          <GameOverCard
            title="WHOSE SIDE?"
            score={result.score}
            isBest={result.best}
            best={best}
            color="#ffe14d"
            line={`Escorted out after ${result.dishes} dishes and ${result.rounds} weddings. Worth it.`}
            again={start}
          />
        )}
      </div>
    </LabShell>
  );
}
