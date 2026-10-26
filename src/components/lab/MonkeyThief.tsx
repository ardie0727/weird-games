"use client";

import { useCallback, useRef, useState } from "react";
import { blip, unlock } from "@/lib/lab/sound";
import { GameOverCard, LabShell, PIXEL_FONT, TitleCard, ctx2d, toLogical, useBest, useFitCanvas, useLoop } from "./LabShell";

// Monkey Thief: your balcony table holds snacks, a phone and your glasses.
// Monkeys climb over the railing and up the walls to grab them. Tap a monkey
// to shoo it. Tap a monkey running off with loot and it drops it. Lose
// everything and the monkeys win.

const W = 360;
const H = 600;
const TAP_R = 36;

const LOOT = ["🍌", "📱", "👓", "🍪", "🥭", "🔑"];
const SLOTS: [number, number][] = [
  [110, 330],
  [180, 318],
  [250, 330],
  [110, 410],
  [180, 422],
  [250, 410],
];

type MKind = "normal" | "baby" | "big" | "sneaky";
const MK: Record<MKind, { emoji: string; hp: number; speed: number; size: number }> = {
  normal: { emoji: "🐒", hp: 1, speed: 1, size: 40 },
  baby: { emoji: "🐒", hp: 1, speed: 1.7, size: 28 },
  big: { emoji: "🦍", hp: 3, speed: 0.7, size: 52 },
  sneaky: { emoji: "🙈", hp: 1, speed: 1.1, size: 40 },
};

interface Monkey {
  id: number;
  kind: MKind;
  x: number;
  y: number;
  sx: number;
  sy: number;
  slot: number;
  t: number; // 0..1 progress toward the slot
  dur: number;
  hp: number;
  state: "come" | "fake" | "flee" | "shoo";
  loot: string | null;
  vx: number;
  vy: number;
  hit: number;
}

interface Game {
  time: number;
  table: (string | null)[];
  monkeys: Monkey[];
  spawnIn: number;
  nextId: number;
  score: number;
  shooed: number;
  saves: number;
  pops: { x: number; y: number; text: string; color: string; t: number }[];
  over: boolean;
}

function newGame(): Game {
  return { time: 0, table: [...LOOT], monkeys: [], spawnIn: 1.2, nextId: 1, score: 0, shooed: 0, saves: 0, pops: [], over: false };
}

function pickKind(time: number): MKind {
  const r = Math.random();
  if (time > 20 && r < 0.2) return "baby";
  if (time > 35 && r < 0.35) return "big";
  if (time > 50 && r < 0.5) return "sneaky";
  return "normal";
}

function spawn(g: Game) {
  const left = g.table.map((l, i) => (l ? i : -1)).filter((i) => i >= 0);
  if (!left.length) return;
  const slot = left[Math.floor(Math.random() * left.length)];
  const side = Math.floor(Math.random() * 3);
  const [sx, sy] = side === 0 ? [40 + Math.random() * 280, 70] : side === 1 ? [-20, 150 + Math.random() * 380] : [W + 20, 150 + Math.random() * 380];
  const kind = pickKind(g.time);
  const dur = Math.max(1.1, 3 - g.time / 40) / MK[kind].speed;
  g.monkeys.push({ id: g.nextId++, kind, x: sx, y: sy, sx, sy, slot, t: 0, dur, hp: MK[kind].hp, state: "come", loot: null, vx: 0, vy: 0, hit: 0 });
  blip("ooh", [[500, 0, 0.12, "triangle", 0.03, 800]]);
}

function step(g: Game, dt: number) {
  g.time += dt;
  for (const p of g.pops) p.t += dt;
  g.pops = g.pops.filter((p) => p.t < 1);
  g.spawnIn -= dt;
  if (g.spawnIn <= 0) {
    spawn(g);
    if (g.time > 30 && Math.random() < 0.3) spawn(g);
    g.spawnIn = Math.max(0.7, 2.4 - g.time / 35) * (0.7 + Math.random() * 0.6);
  }
  for (const m of g.monkeys) {
    m.hit = Math.max(0, m.hit - dt);
    const [tx, ty] = SLOTS[m.slot];
    if (m.state === "come") {
      m.t += dt / m.dur;
      // sneaky ones duck back once before lunging
      if (m.kind === "sneaky" && m.t > 0.55 && m.t < 0.6) {
        m.state = "fake";
        m.t = 0.3;
      }
      const e = Math.min(1, m.t);
      m.x = m.sx + (tx - m.sx) * e;
      m.y = m.sy + (ty - m.sy) * e + Math.sin(e * Math.PI * 4) * 8;
      if (m.t >= 1) {
        const loot = g.table[m.slot];
        if (loot) {
          g.table[m.slot] = null;
          m.loot = loot;
          g.pops.push({ x: tx, y: ty, text: "GRAB!", color: "#ff4d6d", t: 0 });
          blip("grab", [[700, 0, 0.1, "square", 0.04, 300]]);
        }
        m.state = "flee";
        const a = Math.atan2(m.sy - ty, m.sx - tx);
        m.vx = Math.cos(a) * 260 * MK[m.kind].speed;
        m.vy = Math.sin(a) * 260 * MK[m.kind].speed;
      }
    } else if (m.state === "fake") {
      m.t += dt / m.dur;
      if (m.t >= 0.62) m.state = "come";
      const e = Math.min(1, m.t);
      m.x = m.sx + (tx - m.sx) * e;
      m.y = m.sy + (ty - m.sy) * e;
    } else {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
    }
  }
  // gone off screen
  for (const m of g.monkeys)
    if ((m.state === "flee" || m.state === "shoo") && (m.x < -60 || m.x > W + 60 || m.y < -60 || m.y > H + 60) && m.loot) {
      g.pops.push({ x: Math.max(40, Math.min(W - 40, m.x)), y: Math.max(40, Math.min(H - 40, m.y)), text: `${m.loot} GONE`, color: "#ff4d6d", t: 0 });
      m.loot = null;
    }
  g.monkeys = g.monkeys.filter((m) => !(m.x < -60 || m.x > W + 60 || m.y < -60 || m.y > H + 60));
  if (g.table.every((l) => !l) && !g.monkeys.some((m) => m.loot)) g.over = true;
}

function tap(g: Game, x: number, y: number) {
  let best: Monkey | null = null, bd = TAP_R;
  for (const m of g.monkeys) {
    if (m.state === "shoo") continue;
    const d = Math.hypot(m.x - x, m.y - y);
    if (d < bd + MK[m.kind].size * 0.2) (bd = d), (best = m);
  }
  if (!best) return;
  const m = best;
  m.hp--;
  m.hit = 0.2;
  if (m.hp > 0) {
    g.pops.push({ x: m.x, y: m.y, text: `${m.hp} MORE`, color: "#ffe14d", t: 0 });
    blip("bonk", [[180, 0, 0.08, "square", 0.05]]);
    return;
  }
  if (m.loot) {
    // it drops the loot back on the table
    const free = g.table.findIndex((l, i) => !l && i === m.slot);
    const slot = free >= 0 ? free : g.table.findIndex((l) => !l);
    if (slot >= 0) g.table[slot] = m.loot;
    g.saves++;
    g.score += 30;
    g.pops.push({ x: m.x, y: m.y, text: `SAVED ${m.loot} +30`, color: "#39ff88", t: 0 });
    m.loot = null;
  } else {
    g.score += 10 + Math.floor(g.time / 10);
    g.pops.push({ x: m.x, y: m.y, text: "SHOO!", color: "#22f3ff", t: 0 });
  }
  g.shooed++;
  m.state = "shoo";
  const a = Math.atan2(m.y - SLOTS[m.slot][1], m.x - SLOTS[m.slot][0]);
  m.vx = Math.cos(a) * 420;
  m.vy = Math.sin(a) * 420 - 80;
  blip("shoo", [
    [900, 0, 0.05, "square", 0.04],
    [600, 0.05, 0.08, "square", 0.04],
  ]);
}

export function MonkeyThief() {
  const [screen, setScreen] = useState<"title" | "play" | "over">("title");
  const [best, submitBest] = useBest("lab.monkey.best");
  const [hud, setHud] = useState({ score: 0, left: LOOT.length, time: 0 });
  const [result, setResult] = useState<{ score: number; time: number; saves: number; best: boolean } | null>(null);
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
      g.score += dt * 2;
      step(g, dt);
      if (g.over) {
        playing.current = false;
        const score = Math.floor(g.score);
        setResult({ score, time: g.time, saves: g.saves, best: submitBest(score) });
        setScreen("over");
      }
    }
    if (now - hudAt.current > 100) {
      hudAt.current = now;
      setHud({ score: Math.floor(g.score), left: g.table.filter(Boolean).length, time: g.time });
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = ctx2d(canvas, W);
    const t = now / 1000;

    // sky, trees and the balcony
    const sky = cx.createLinearGradient(0, 0, 0, 100);
    sky.addColorStop(0, "#22f3ff");
    sky.addColorStop(1, "#7af8ff");
    cx.fillStyle = sky;
    cx.fillRect(0, 0, W, 100);
    cx.fillStyle = "#1a5a46";
    for (let i = 0; i < 5; i++) {
      cx.beginPath();
      cx.arc(30 + i * 80, 50 + (i % 2) * 15, 42, 0, Math.PI * 2);
      cx.fill();
    }
    cx.fillStyle = "#3a2f63";
    cx.fillRect(0, 100, W, H - 100);
    cx.fillStyle = "#2a2350";
    for (let y = 100; y < H; y += 30) cx.fillRect(0, y, W, 2);
    // railing
    cx.fillStyle = "#b9b4d9";
    cx.fillRect(0, 86, W, 8);
    for (let x = 8; x < W; x += 22) cx.fillRect(x, 94, 4, 30);
    cx.fillRect(0, 122, W, 6);
    // potted plant and a chair for flavour
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    cx.font = "36px sans-serif";
    cx.fillText("🪴", 34, 540);
    cx.fillText("🪑", 320, 540);

    // the table and loot
    cx.fillStyle = "#8a4b2a";
    cx.beginPath();
    cx.ellipse(180, 372, 130, 92, 0, 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = "#a35c35";
    cx.beginPath();
    cx.ellipse(180, 366, 124, 86, 0, 0, Math.PI * 2);
    cx.fill();
    cx.font = "34px sans-serif";
    g.table.forEach((l, i) => {
      if (l) cx.fillText(l, ...SLOTS[i]);
    });

    for (const m of g.monkeys) {
      const k = MK[m.kind];
      cx.save();
      cx.translate(m.x, m.y);
      if (m.hit) cx.translate(Math.sin(t * 80) * 3, 0);
      if (m.state === "shoo") cx.rotate(t * 12);
      cx.font = `${k.size}px sans-serif`;
      cx.fillText(m.state === "come" || m.state === "fake" ? k.emoji : m.state === "shoo" ? "🙊" : k.emoji, 0, 0);
      if (m.loot) {
        cx.font = "24px sans-serif";
        cx.fillText(m.loot, k.size * 0.35, k.size * 0.25);
      }
      cx.restore();
      if (m.kind === "big" && m.hp > 0 && m.state !== "shoo") {
        cx.fillStyle = "#ffe14d";
        for (let i = 0; i < m.hp; i++) cx.fillRect(m.x - 12 + i * 9, m.y - k.size * 0.6, 6, 4);
      }
    }

    cx.font = PIXEL_FONT(10);
    for (const p of g.pops) {
      cx.globalAlpha = 1 - p.t;
      cx.fillStyle = "#05040b";
      cx.fillText(p.text, p.x + 1, p.y - 30 - p.t * 24 + 1);
      cx.fillStyle = p.color;
      cx.fillText(p.text, p.x, p.y - 30 - p.t * 24);
    }
    cx.globalAlpha = 1;
  });

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!playing.current) return;
    e.preventDefault();
    const [x, y] = toLogical(e, e.currentTarget, W, H);
    tap(gameRef.current, x, y);
  };

  return (
    <LabShell title="MONKEY THIEF" color="#ff8a3d">
      <div className="flex h-9 shrink-0 items-center justify-between px-3 font-pixel text-[8px]">
        <span className="text-dim">
          ON TABLE <span className="text-ink">{hud.left}</span>/{LOOT.length}
        </span>
        <span className="text-dim">
          ⏱ <span className="text-ink">{Math.floor(hud.time)}s</span>
        </span>
        <span className="text-orange">{hud.score}</span>
      </div>
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        <canvas ref={canvasRef} className="block touch-none" onPointerDown={onDown} />
        {screen === "title" && (
          <TitleCard a="MONKEY" b="THIEF" colorA="#ff8a3d" colorB="#39ff88" blurb="Monkeys raid your balcony for snacks, your phone, your glasses, anything. Guard the table." best={best} onPlay={start}>
            <p>Tap a monkey to shoo it. If one is already running off with something, tap it and it drops the loot.</p>
            <p>Baby monkeys are fast, 🦍 big ones take three taps, and 🙈 sneaky ones back off and then lunge.</p>
            <p>The longer you protect at least one thing, the higher you score. When everything is gone, the monkeys win.</p>
          </TitleCard>
        )}
        {screen === "over" && result && (
          <GameOverCard
            title="CLEANED OUT"
            score={result.score}
            isBest={result.best}
            best={best}
            color="#ff8a3d"
            line={`You held out for ${Math.floor(result.time)} seconds and saved ${result.saves} things mid-escape.`}
            again={start}
          />
        )}
      </div>
    </LabShell>
  );
}
