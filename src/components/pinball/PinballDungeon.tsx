"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BALL_R, BOSS_ROOM, FLIP_R, H, MONSTERS, ROOMS, UPGRADES, W, WALLS, advance, chooseUpgrade, flipperTip, launch, lv, newMeta, newRun, press, recordRun, takeFx, type Fx, type Meta, type Run, type SoundName, type UpgradeId } from "@/lib/pinball/engine";
import { load, save } from "@/lib/client/storage";
import { currentTheme } from "@/lib/client/theme";
import { blip, unlock } from "@/lib/lab/sound";
import { BigButton, LabShell, Overlay, PIXEL_FONT, ctx2d, useFitCanvas, useLoop } from "@/components/lab/LabShell";
import { sprite, type Theme } from "./sprites";

// Pinball Dungeon: you are the pinball. Each room is a table full of monsters.
// The engine is in src/lib/pinball/engine.ts; this file draws it and reads taps and keys.

const META_KEY = "pd.meta";
const GOLD = "#ffe14d";
const CYAN = "#22f3ff";
const PINK = "#ff2bd6";

const PAL = {
  dark: {
    bg: "#0a0816",
    brick: "#141030",
    mortar: "#07060f",
    wall: CYAN,
    wallGlow: "rgba(34,243,255,0.35)",
    flip: PINK,
    ice: "#9ff7ff",
    ink: "#ece9ff",
    dim: "#8f89b8",
    ball: "#e8e6f5",
    ballShade: "#7f7a9e",
    bump: GOLD,
    bumpLit: "#ffffff",
    peg: "#5a5480",
    hp: "#ff4d6d",
    hpBack: "rgba(255,255,255,0.12)",
    good: "#39ff88",
    gold: GOLD,
    bad: "#ff4d6d",
    torch: "#ff8a3d",
  },
  light: {
    bg: "#efe6d3",
    brick: "#e4d7bd",
    mortar: "#d3c3a3",
    wall: "#141210",
    wallGlow: "rgba(20,18,16,0)",
    flip: "#c21aa0",
    ice: "#0a7f8f",
    ink: "#141210",
    dim: "#6f6352",
    ball: "#b9b4c9",
    ballShade: "#4b4660",
    bump: "#a86f00",
    bumpLit: "#ffd23d",
    peg: "#8c7d64",
    hp: "#d22d4b",
    hpBack: "rgba(20,18,16,0.12)",
    good: "#13824a",
    gold: "#a86f00",
    bad: "#d22d4b",
    torch: "#c4581a",
  },
};
type Pal = (typeof PAL)["dark"];

interface Live {
  fx: Fx;
  t0: number;
}

function sound(name: SoundName) {
  switch (name) {
    case "flip":
      return blip(name, [[180, 0, 0.04, "square", 0.03, 120]]);
    case "hit":
      return blip(name, [[660, 0, 0.05, "square", 0.04, 990]]);
    case "bump":
      return blip(name, [[1046, 0, 0.05, "square", 0.04], [1318, 0.04, 0.06, "square", 0.03]]);
    case "kill":
      return blip(name, [[784, 0, 0.05], [1046, 0.05, 0.05], [1568, 0.1, 0.09]]);
    case "boss":
      return blip(name, [[110, 0, 0.35, "sawtooth", 0.06], [98, 0.35, 0.35, "sawtooth", 0.06], [82, 0.7, 0.6, "sawtooth", 0.06]]);
    case "drain":
      return blip(name, [[392, 0, 0.15, "sawtooth", 0.05], [262, 0.15, 0.15, "sawtooth", 0.05], [131, 0.3, 0.35, "sawtooth", 0.05]]);
    case "saved":
      return blip(name, [[523, 0, 0.06], [784, 0.06, 0.1]]);
    case "clear":
      return blip(name, [[523, 0, 0.08], [659, 0.08, 0.08], [784, 0.16, 0.08], [1047, 0.24, 0.2]]);
    case "dead":
      return blip(name, [[523, 0, 0.18], [415, 0.18, 0.18], [330, 0.36, 0.18], [262, 0.54, 0.45]]);
    case "won":
      return blip(name, [[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.12], [784, 0.42, 0.1], [1047, 0.52, 0.3]]);
    case "arrow":
      return blip(name, [[1400, 0, 0.06, "triangle", 0.03, 600]]);
    case "freeze":
      return blip(name, [[2400, 0, 0.05, "square", 0.025], [1800, 0.05, 0.12, "square", 0.025, 900]]);
    case "clink":
      return blip(name, [[1900, 0, 0.03, "square", 0.02]]);
    case "launch":
      return blip(name, [[220, 0, 0.2, "square", 0.04, 880]]);
    case "split":
      return blip(name, [[880, 0, 0.05], [1320, 0.05, 0.08]]);
  }
}

// ---------- drawing ----------

const bgCache = new Map<Theme, HTMLCanvasElement>();
function background(theme: Theme, P: Pal): HTMLCanvasElement {
  const hit = bgCache.get(theme);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const cx = c.getContext("2d")!;
  cx.fillStyle = P.mortar;
  cx.fillRect(0, 0, W, H);
  // dungeon bricks
  for (let y = 0, row = 0; y < H; y += 20, row++)
    for (let x = row % 2 ? -20 : 0; x < W; x += 40) {
      cx.fillStyle = P.brick;
      cx.fillRect(x + 1, y + 1, 38, 18);
    }
  bgCache.set(theme, c);
  return c;
}

function draw(cx: CanvasRenderingContext2D, r: Run, theme: Theme, now: number, live: Live[]) {
  const P = PAL[theme];
  cx.imageSmoothingEnabled = false;
  cx.save();
  if (r.shake > 0) cx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
  cx.drawImage(background(theme, P), 0, 0);

  // torches on the walls flicker
  for (const [tx, ty] of [
    [24, 140],
    [336, 140],
    [24, 300],
    [336, 300],
  ]) {
    cx.fillStyle = P.torch;
    cx.globalAlpha = 0.6 + Math.sin(now / 90 + tx) * 0.25;
    cx.fillRect(tx - 3, ty - 8 - (Math.floor(now / 120) % 2) * 2, 6, 8);
    cx.globalAlpha = 1;
    cx.fillStyle = P.peg;
    cx.fillRect(tx - 2, ty, 4, 8);
  }

  // the table edges
  cx.lineCap = "round";
  cx.strokeStyle = P.wallGlow;
  cx.lineWidth = 9;
  cx.beginPath();
  for (const s of WALLS) {
    cx.moveTo(s.a.x, s.a.y);
    cx.lineTo(s.b.x, s.b.y);
  }
  cx.stroke();
  cx.strokeStyle = P.wall;
  cx.lineWidth = 4;
  cx.stroke();

  // the drain pit, and the ball saver light
  const saver = 3 + lv(r, "saver") * 4;
  if (r.phase === "play" && r.roomTime < saver) {
    cx.fillStyle = P.good;
    cx.globalAlpha = Math.floor(now / 150) % 2 ? 0.9 : 0.4;
    cx.font = PIXEL_FONT(7);
    cx.textAlign = "center";
    cx.fillText("SAVE", W / 2, 592);
    cx.globalAlpha = 1;
  }
  if (lv(r, "post") && r.roomTime < 12) {
    cx.fillStyle = P.gold;
    cx.beginPath();
    cx.arc(W / 2, 556, 6, 0, Math.PI * 2);
    cx.fill();
  }

  // pegs and mushroom bumpers
  for (const p of r.pegs) {
    cx.fillStyle = P.peg;
    cx.beginPath();
    cx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = P.ink;
    cx.globalAlpha = 0.3;
    cx.fillRect(p.x - 3, p.y - 3, 2, 2);
    cx.globalAlpha = 1;
  }
  for (const b of r.bumpers) {
    const lit = b.lit > 0;
    cx.fillStyle = lit ? P.bumpLit : P.bump;
    cx.beginPath();
    cx.arc(b.x, b.y, b.r + (lit ? 3 : 0), 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = P.bg;
    cx.beginPath();
    cx.arc(b.x, b.y, b.r - 5, 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = lit ? P.bumpLit : P.bump;
    cx.beginPath();
    cx.arc(b.x, b.y, 4, 0, Math.PI * 2);
    cx.fill();
  }

  // monsters
  for (const m of r.monsters) {
    const d = MONSTERS[m.kind];
    const size = m.r * 2.3;
    const bob = d.boss ? 0 : Math.sin(now / 200 + m.id) * 1.5;
    if (m.kind === "ghost" && m.phase > 0) cx.globalAlpha = 0.25;
    cx.drawImage(sprite(m.kind, theme, !!d.boss, m.hurt > 0), Math.round(m.x - size / 2), Math.round(m.y - size / 2 + bob), size, size);
    cx.globalAlpha = 1;
    if (m.burn > 0) {
      cx.fillStyle = P.torch;
      for (let k = 0; k < 3; k++) cx.fillRect(m.x - m.r / 2 + k * (m.r / 2) - 2, m.y - m.r - 4 - ((Math.floor(now / 80) + k) % 3) * 2, 4, 5);
    }
    if (!d.boss && m.kind !== "skull" && m.hp < m.max) {
      cx.fillStyle = P.hpBack;
      cx.fillRect(m.x - 12, m.y - m.r - 7, 24, 3);
      cx.fillStyle = P.hp;
      cx.fillRect(m.x - 12, m.y - m.r - 7, (24 * m.hp) / m.max, 3);
    }
    if (m.kind === "knight") {
      cx.strokeStyle = P.dim;
      cx.lineWidth = 2;
      cx.beginPath();
      cx.arc(m.x, m.y, m.r + 3, 0, Math.PI * 2);
      cx.stroke();
    }
  }

  // arrows and fireballs
  for (const s of r.shots) {
    if (s.kind === "arrow") {
      const a = Math.atan2(s.vy, s.vx);
      cx.save();
      cx.translate(s.x, s.y);
      cx.rotate(a);
      cx.fillStyle = P.ink;
      cx.fillRect(-10, -1, 14, 2);
      cx.fillStyle = P.bad;
      cx.beginPath();
      cx.moveTo(8, 0);
      cx.lineTo(3, -4);
      cx.lineTo(3, 4);
      cx.fill();
      cx.restore();
    } else {
      cx.fillStyle = P.torch;
      cx.beginPath();
      cx.arc(s.x, s.y, 6 + (Math.floor(now / 60) % 2), 0, Math.PI * 2);
      cx.fill();
      cx.fillStyle = GOLD;
      cx.beginPath();
      cx.arc(s.x, s.y, 3, 0, Math.PI * 2);
      cx.fill();
    }
  }

  // flippers
  for (const f of r.flippers) {
    const tip = flipperTip(f);
    const frozen = f.frozen > 0;
    cx.strokeStyle = frozen ? P.ice : P.flip;
    cx.lineWidth = FLIP_R * 2 + 2;
    cx.beginPath();
    cx.moveTo(f.pivot.x, f.pivot.y);
    cx.lineTo(tip.x, tip.y);
    cx.stroke();
    cx.strokeStyle = theme === "dark" ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.6)";
    cx.lineWidth = 2;
    cx.beginPath();
    cx.moveTo(f.pivot.x, f.pivot.y - 2);
    cx.lineTo(tip.x, tip.y - 2);
    cx.stroke();
    if (frozen) {
      cx.fillStyle = P.ice;
      cx.font = PIXEL_FONT(7);
      cx.textAlign = "center";
      cx.fillText("FROZEN", (f.pivot.x + tip.x) / 2, (f.pivot.y + tip.y) / 2 + 20);
    }
    cx.fillStyle = P.ink;
    cx.beginPath();
    cx.arc(f.pivot.x, f.pivot.y, 3, 0, Math.PI * 2);
    cx.fill();
  }

  // balls
  for (const b of r.balls) {
    b.trail.forEach((t, i) => {
      cx.globalAlpha = 0.25 * (1 - i / b.trail.length);
      cx.fillStyle = lv(r, "fire") ? P.torch : P.ball;
      cx.beginPath();
      cx.arc(t.x, t.y, BALL_R - i * 0.6, 0, Math.PI * 2);
      cx.fill();
    });
    cx.globalAlpha = 1;
    cx.fillStyle = P.ballShade;
    cx.beginPath();
    cx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = P.ball;
    cx.beginPath();
    cx.arc(b.x - 1, b.y - 1, BALL_R - 2, 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = "#ffffff";
    cx.fillRect(Math.round(b.x - 4), Math.round(b.y - 4), 3, 3);
  }

  // effects
  for (const { fx: f, t0 } of live) {
    const age = now - t0;
    if (f.k === "hit") {
      const t = age / 220;
      cx.globalAlpha = Math.max(0, 1 - t);
      cx.fillStyle = f.big ? GOLD : P.ink;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const d = 4 + t * (f.big ? 20 : 12);
        cx.fillRect(f.x + Math.cos(a) * d - 1.5, f.y + Math.sin(a) * d - 1.5, 3, 3);
      }
    } else if (f.k === "kill") {
      const t = age / (f.boss ? 900 : 450);
      cx.globalAlpha = Math.max(0, 1 - t);
      const cols = [PINK, CYAN, GOLD, "#39ff88"];
      for (let k = 0; k < (f.boss ? 24 : 12); k++) {
        const a = (k / (f.boss ? 24 : 12)) * Math.PI * 2 + k;
        const d = 6 + t * (f.boss ? 90 : 34) * (0.6 + (k % 3) * 0.2);
        cx.fillStyle = cols[k % cols.length];
        cx.fillRect(f.x + Math.cos(a) * d - 2, f.y + Math.sin(a) * d - 2, 4, 4);
      }
    } else if (f.k === "freeze") {
      const t = age / 400;
      cx.globalAlpha = Math.max(0, 1 - t);
      cx.strokeStyle = P.ice;
      cx.lineWidth = 2;
      cx.beginPath();
      cx.arc(f.x, f.y, 6 + t * 18, 0, Math.PI * 2);
      cx.stroke();
    } else if (f.k === "zap") {
      if (age < 160) {
        cx.strokeStyle = GOLD;
        cx.lineWidth = 2;
        cx.beginPath();
        cx.moveTo(f.x, f.y);
        const mx = (f.x + f.x2) / 2 + (Math.random() - 0.5) * 20, my = (f.y + f.y2) / 2 + (Math.random() - 0.5) * 20;
        cx.lineTo(mx, my);
        cx.lineTo(f.x2, f.y2);
        cx.stroke();
      }
    } else if (f.k === "pop") {
      const t = age / 900;
      cx.globalAlpha = Math.max(0, 1 - t * t);
      cx.font = PIXEL_FONT(f.text.length > 8 ? 8 : 9);
      cx.textAlign = "center";
      cx.textBaseline = "middle";
      const x = Math.max(44, Math.min(W - 44, f.x)), y = f.y - 10 - t * 24;
      cx.fillStyle = theme === "dark" ? "rgba(0,0,0,0.6)" : "rgba(255,250,240,0.8)";
      cx.fillText(f.text, x + 1, y + 1);
      cx.fillStyle = f.tone === "bad" ? P.bad : f.tone === "gold" ? P.gold : P.good;
      cx.fillText(f.text, x, y);
    }
    cx.globalAlpha = 1;
  }

  // waiting to launch
  if (r.phase === "ready") {
    cx.fillStyle = P.ball;
    cx.beginPath();
    cx.arc(W / 2, 40 + Math.sin(now / 200) * 3, BALL_R, 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = theme === "dark" ? "rgba(5,4,11,0.75)" : "rgba(255,250,240,0.85)";
    cx.fillRect(0, 230, W, 96);
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    const boss = BOSS_ROOM[r.room];
    cx.font = PIXEL_FONT(16);
    cx.fillStyle = boss ? (theme === "dark" ? PINK : "#c21aa0") : P.gold;
    cx.fillText(boss ? MONSTERS[boss].name : `ROOM ${r.room}`, W / 2, 258);
    cx.font = PIXEL_FONT(8);
    cx.fillStyle = P.ink;
    cx.fillText(boss ? `BOSS · ROOM ${r.room} OF ${ROOMS}` : "SMASH EVERY MONSTER", W / 2, 284);
    cx.fillStyle = P.dim;
    if (Math.floor(now / 400) % 2) cx.fillText("FLIP TO DROP THE BALL", W / 2, 306);
  }
  cx.restore();
}

// ---------- UI ----------

interface Hud {
  room: number;
  score: number;
  lives: number;
  combo: number;
  boss: { name: string; pct: number } | null;
}
function hudOf(r: Run): Hud {
  const b = r.monsters.find((m) => MONSTERS[m.kind].boss);
  return { room: r.room, score: r.score, lives: r.lives, combo: Math.min(5, 1 + Math.floor(r.combo / 3)), boss: b ? { name: MONSTERS[b.kind].name, pct: Math.max(0, b.hp / b.max) } : null };
}

export function PinballDungeon() {
  const { wrapRef, canvasRef } = useFitCanvas(W, H);
  const runRef = useRef<Run | null>(null);
  const demoRef = useRef<Run | null>(null);
  const liveRef = useRef<Live[]>([]);
  const [meta, setMeta] = useState<Meta>(newMeta);
  const [screen, setScreen] = useState<"title" | "game">("title");
  const [phase, setPhase] = useState<Run["phase"]>("ready");
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState<Hud | null>(null);
  const [newBest, setNewBest] = useState(false);
  const [touch, setTouch] = useState(false);
  const hudKey = useRef("");
  const pointers = useRef(new Map<number, 0 | 1>());

  useEffect(() => {
    setMeta({ ...newMeta(), ...load<Partial<Meta>>(META_KEY, {}) });
    setTouch(window.matchMedia?.("(pointer: coarse)").matches ?? false);
  }, []);

  const start = useCallback(() => {
    unlock();
    runRef.current = newRun((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    liveRef.current = [];
    pointers.current.clear();
    setPaused(false);
    setNewBest(false);
    setPhase("ready");
    setScreen("game");
    sound("boss");
  }, []);

  const finish = useCallback((r: Run) => {
    const m = { ...newMeta(), ...load<Partial<Meta>>(META_KEY, {}) };
    setNewBest(r.score > m.best);
    recordRun(m, r);
    save(META_KEY, m);
    setMeta(m);
  }, []);

  useLoop((dt, now) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = ctx2d(canvas, W);
    const theme: Theme = currentTheme();
    const r = runRef.current;
    if (!r || screen !== "game") {
      const demo = (demoRef.current ??= newRun(11));
      draw(cx, demo, theme, now, []);
      return;
    }
    if (!paused) advance(r, dt);
    for (const f of takeFx(r)) {
      if (f.k === "snd") sound(f.name);
      else liveRef.current.push({ fx: f, t0: now });
    }
    liveRef.current = liveRef.current.filter((l) => now - l.t0 < 1000);
    draw(cx, r, theme, now, liveRef.current);
    const h = hudOf(r);
    const key = JSON.stringify(h) + r.phase;
    if (key !== hudKey.current) {
      hudKey.current = key;
      setHud(h);
      setPhase(r.phase);
      if ((r.phase === "dead" || r.phase === "won") && phase !== r.phase) finish(r);
    }
  });

  // dev-only handle for screenshot scripts
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") (window as unknown as { __pd: unknown }).__pd = { runRef, chooseUpgrade };
  }, []);

  // keyboard: left/right flippers, space drops the ball
  useEffect(() => {
    const side = (code: string): 0 | 1 | null => (["ArrowLeft", "KeyZ", "KeyA", "ShiftLeft"].includes(code) ? 0 : ["ArrowRight", "Slash", "KeyM", "KeyD", "ShiftRight"].includes(code) ? 1 : null);
    const down = (e: KeyboardEvent) => {
      const r = runRef.current;
      if (screen === "title") {
        if (e.code === "Space" || e.code === "Enter") {
          e.preventDefault();
          start();
        }
        return;
      }
      if (!r) return;
      const s = side(e.code);
      if (s !== null) {
        e.preventDefault();
        if (!e.repeat && !paused) press(r, s, true);
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        if (!paused) launch(r);
      }
      if ((e.code === "KeyP" || e.code === "Escape") && (r.phase === "play" || r.phase === "ready")) setPaused((p) => !p);
      if (r.phase === "pick" && ["Digit1", "Digit2", "Digit3"].includes(e.code)) {
        const u = r.offer[Number(e.code.slice(-1)) - 1];
        if (u) pick(u);
      }
    };
    const up = (e: KeyboardEvent) => {
      const r = runRef.current;
      const s = side(e.code);
      if (r && s !== null) press(r, s, false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  });

  useEffect(() => {
    const vis = () => {
      const r = runRef.current;
      if (document.hidden && r && (r.phase === "play" || r.phase === "ready")) setPaused(true);
    };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, []);

  // touch: the left half of the screen is the left flipper, the right half the right one
  const onDown = (e: React.PointerEvent) => {
    const r = runRef.current;
    unlock();
    if (!r || paused || screen !== "game") return;
    if (r.phase !== "play" && r.phase !== "ready") return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const s: 0 | 1 = e.clientX < rect.left + rect.width / 2 ? 0 : 1;
    pointers.current.set(e.pointerId, s);
    press(r, s, true);
  };
  const onUp = (e: React.PointerEvent) => {
    const r = runRef.current;
    const s = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (!r || s === undefined) return;
    if (![...pointers.current.values()].includes(s)) press(r, s, false);
  };

  const pick = (u: UpgradeId) => {
    const r = runRef.current;
    if (!r) return;
    chooseUpgrade(r, u);
    sound("split");
    setPhase(r.phase);
  };

  const r = runRef.current;
  const pauseBtn =
    screen === "game" && (phase === "play" || phase === "ready") ? (
      <button className="font-pixel text-[9px] text-dim" onClick={() => setPaused((p) => !p)} aria-label={paused ? "Resume" : "Pause"}>
        {paused ? "▶" : "❚❚"}
      </button>
    ) : null;

  return (
    <LabShell title="PINBALL DUNGEON" color={CYAN} right={pauseBtn}>
      <div className="mx-auto flex h-9 w-full max-w-xl shrink-0 items-center justify-between gap-2 px-3 font-pixel text-[8px]">
        {screen === "game" && hud ? (
          <>
            <div className="text-yellow">
              ROOM {hud.room}/{ROOMS}
            </div>
            <div className="flex items-center gap-1" aria-label={`${hud.lives} balls left`}>
              <span className="text-dim">BALLS</span>
              {Array.from({ length: Math.min(9, hud.lives) }, (_, i) => (
                <span key={i} className="inline-block h-2.5 w-2.5 rounded-full bg-cyan" />
              ))}
            </div>
            <div className={hud.combo > 1 ? "text-pink" : "text-dim"}>x{hud.combo}</div>
            <div className="text-ink">{hud.score}</div>
          </>
        ) : (
          <div className="w-full text-center text-dim">
            BEST {meta.best} · DEEPEST ROOM {meta.bestRoom}
            {meta.wins > 0 ? ` · ${meta.wins} WIN${meta.wins > 1 ? "S" : ""}` : ""}
          </div>
        )}
      </div>
      {screen === "game" && hud?.boss && (
        <div className="mx-auto mb-1 w-full max-w-xl shrink-0 px-3">
          <div className="mb-0.5 text-center font-pixel text-[7px] text-pink">{hud.boss.name}</div>
          <div className="h-1.5 w-full border border-line">
            <div className="h-full bg-pink" style={{ width: `${hud.boss.pct * 100}%` }} />
          </div>
        </div>
      )}
      <div
        ref={wrapRef}
        className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-2"
        style={{ touchAction: "none" }}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas ref={canvasRef} className="block" style={{ imageRendering: "pixelated" }} />

        {screen === "title" && (
          <Overlay glow={CYAN}>
            <div className="text-center font-pixel text-[20px] leading-snug">
              <span className="text-cyan neon">PINBALL</span>
              <br />
              <span className="text-pink neon">DUNGEON</span>
            </div>
            <p className="mt-3 text-center text-[19px] leading-snug text-ink/85">You are the pinball. Twelve rooms of monsters stand between you and the way out. Smash them all to open the next room.</p>
            <BigButton onClick={start} color={CYAN}>
              ▶ ENTER THE DUNGEON
            </BigButton>
            <div className="mt-4 space-y-1 border-t border-line pt-3 text-[16px] leading-snug text-dim">
              <p>{touch ? "Tap the left or right half of the screen to flip. Hold to keep the flipper up." : "Left / Z / A flips left. Right / M / D flips right. Space drops the ball. P pauses."}</p>
              <p>Lose the ball down the middle and it costs a ball. Run out of balls and the run is over.</p>
              <p>Hit several monsters without touching a flipper to build a combo (up to x5 points).</p>
              <p>Skeleton archers and bosses freeze your flippers. Hit their arrows with the ball to break them. Knights only feel a hard hit.</p>
              <p>After each room, pick one of three upgrades. Bosses wait in rooms 4, 8 and 12.</p>
            </div>
          </Overlay>
        )}

        {screen === "game" && paused && (phase === "play" || phase === "ready") && (
          <Overlay glow={CYAN}>
            <div className="text-center font-pixel text-[16px] text-cyan neon">PAUSED</div>
            <BigButton onClick={() => setPaused(false)} color={CYAN}>
              ▶ RESUME
            </BigButton>
            <button className="mt-3 block w-full py-2 font-pixel text-[9px] text-dim" onClick={() => setScreen("title")}>
              QUIT TO TITLE
            </button>
          </Overlay>
        )}

        {screen === "game" && r && phase === "pick" && (
          <Overlay glow={GOLD}>
            <div className="text-center font-pixel text-[13px] text-yellow neon">ROOM {r.room} CLEARED!</div>
            <p className="mt-2 text-center text-[18px] text-ink/80">You find a chest. Pick one thing from it.</p>
            <div className="mt-3 grid gap-2">
              {r.offer.map((u, i) => (
                <button key={u} onClick={() => pick(u)} className="border-2 border-line px-3 py-2 text-left hover:border-yellow active:scale-[0.98]">
                  <div className="font-pixel text-[9px] text-yellow">
                    {!touch && <span className="text-dim">{i + 1} </span>}
                    {UPGRADES[u].name.toUpperCase()}
                    {lv(r, u) > 0 && u !== "extra" && <span className="text-cyan"> LV{lv(r, u) + 1}</span>}
                  </div>
                  <div className="mt-1 text-[16px] leading-tight text-ink/80">{UPGRADES[u].desc}</div>
                </button>
              ))}
            </div>
            {BOSS_ROOM[r.room + 1] && <p className="mt-3 text-center font-pixel text-[8px] text-pink blink">BOSS NEXT: {MONSTERS[BOSS_ROOM[r.room + 1]].name}</p>}
          </Overlay>
        )}

        {screen === "game" && r && (phase === "dead" || phase === "won") && (
          <Overlay glow={phase === "won" ? GOLD : PINK}>
            <div className={`text-center font-pixel text-[15px] leading-snug neon ${phase === "won" ? "text-yellow" : "text-red"}`}>{phase === "won" ? "YOU ESCAPED!" : "GAME OVER"}</div>
            <p className="mt-2 text-center text-[18px] text-ink/80">
              {phase === "won" ? "The Lich is dust. You roll out into the daylight." : r.room >= 9 ? "So close to the way out." : r.room >= 5 ? "You got further than most balls." : "The dungeon keeps another pinball."}
            </p>
            <div className="mt-4 text-center font-pixel text-[26px] text-cyan neon">{r.score}</div>
            {newBest && <div className="mt-1 text-center font-pixel text-[9px] text-yellow blink">NEW BEST!</div>}
            <div className="mt-3 grid grid-cols-3 gap-2 text-center font-pixel text-[7px] text-dim">
              <div>
                <div className="text-[12px] text-yellow">{phase === "won" ? ROOMS : r.room}</div>ROOM
              </div>
              <div>
                <div className="text-[12px] text-green">{r.kills}</div>MONSTERS
              </div>
              <div>
                <div className="text-[12px] text-pink">{r.bestCombo}</div>BEST COMBO
              </div>
            </div>
            <BigButton onClick={start} color={CYAN}>
              ▶ PLAY AGAIN
            </BigButton>
          </Overlay>
        )}
      </div>
      {screen === "game" && (phase === "play" || phase === "ready") && !paused && (
        <div className="flex shrink-0 justify-between px-6 pb-1 font-pixel text-[7px] text-dim">
          {touch ? (
            <>
              <span>◀ TAP LEFT</span>
              <span>TAP RIGHT ▶</span>
            </>
          ) : (
            <span className="w-full text-center">← / Z FLIP LEFT · → / M FLIP RIGHT · P PAUSE</span>
          )}
        </div>
      )}
    </LabShell>
  );
}
