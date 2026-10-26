"use client";

import { useCallback, useRef, useState } from "react";
import { blip, tone, unlock } from "@/lib/lab/sound";
import { GameOverCard, LabShell, PIXEL_FONT, TitleCard, ctx2d, toLogical, useBest, useFitCanvas, useLoop } from "./LabShell";

// Mosquito Bat: it's night, someone is asleep, and mosquitoes keep diving in
// for a bite. Swing the electric racket through them. A racket held still
// doesn't zap; it has to be moving. Each wave the mosquitoes get better at
// reading your swing and dodging it.

const W = 360;
const H = 600;
const HEAD_RX = 34;
const HEAD_RY = 42;
const LIFT = 84; // the racket head sits above the finger
const SWING = 260; // px/s needed to zap
const BITE = { x: 176, y: 520 };
const MAX_ITCH = 5;

interface Mozzie {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  mode: "wander" | "dive" | "flee";
  modeT: number;
  diveIn: number;
  dodgeCd: number;
  hp: number;
  tiger: boolean;
  phase: number;
}

interface Game {
  wave: number;
  mozzies: Mozzie[];
  racket: { x: number; y: number; vx: number; vy: number; speed: number; seen: boolean };
  itch: number;
  score: number;
  zapped: number;
  sparks: { x: number; y: number; vx: number; vy: number; t: number }[];
  pops: { x: number; y: number; text: string; color: string; t: number }[];
  banner: number;
  over: boolean;
}

function rnd(a: number, b: number) {
  return a + Math.random() * (b - a);
}

function spawnWave(g: Game) {
  const n = 2 + g.wave;
  g.mozzies = Array.from({ length: n }, () => {
    const tiger = g.wave >= 4 && Math.random() < 0.3;
    return {
      x: rnd(30, W - 30),
      y: rnd(40, 200),
      vx: 0,
      vy: 0,
      tx: rnd(30, W - 30),
      ty: rnd(40, 380),
      mode: "wander" as const,
      modeT: 0,
      diveIn: rnd(3, 8),
      dodgeCd: 0,
      hp: tiger ? 2 : 1,
      tiger,
      phase: Math.random() * 10,
    };
  });
  g.banner = 1.5;
}

function newGame(): Game {
  const g: Game = { wave: 1, mozzies: [], racket: { x: W / 2, y: 330, vx: 0, vy: 0, speed: 0, seen: false }, itch: 0, score: 0, zapped: 0, sparks: [], pops: [], banner: 0, over: false };
  spawnWave(g);
  return g;
}

/** How smart this wave is: dodge radius, reaction cooldown, and whether they dodge a still racket. */
function smarts(wave: number) {
  return { dodge: wave >= 2, radius: 50 + wave * 12, cooldown: Math.max(0.35, 1.3 - wave * 0.13), still: wave >= 6, boost: 1.5 + Math.min(1, wave * 0.1) };
}

const inHead = (r: Game["racket"], x: number, y: number) => ((x - r.x) / HEAD_RX) ** 2 + ((y - r.y) / HEAD_RY) ** 2 <= 1;

function step(g: Game, dt: number) {
  for (const s of g.sparks) {
    s.t += dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
  }
  g.sparks = g.sparks.filter((s) => s.t < 0.4);
  for (const p of g.pops) p.t += dt;
  g.pops = g.pops.filter((p) => p.t < 1);
  g.banner = Math.max(0, g.banner - dt);
  if (g.banner > 0.6) return;

  const r = g.racket;
  // racket speed eases toward measured motion
  r.speed *= Math.pow(0.02, dt);
  const sm = smarts(g.wave);
  const base = 80 + g.wave * 9;

  for (const m of g.mozzies) {
    m.phase += dt;
    m.dodgeCd = Math.max(0, m.dodgeCd - dt);
    m.modeT -= dt;
    const dR = Math.hypot(m.x - r.x, m.y - r.y);
    const threat = r.seen && dR < sm.radius && (r.speed > 90 || sm.still);
    if (sm.dodge && threat && m.dodgeCd <= 0) {
      // dodge away from the racket and sideways to its swing
      const ax = (m.x - r.x) / (dR || 1), ay = (m.y - r.y) / (dR || 1);
      const sv = Math.hypot(r.vx, r.vy) || 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      const px = (-r.vy / sv) * side, py = (r.vx / sv) * side;
      const smart = Math.min(1, g.wave / 6);
      m.vx = (ax * (1 - smart * 0.5) + px * smart) * base * sm.boost * 1.6;
      m.vy = (ay * (1 - smart * 0.5) + py * smart) * base * sm.boost * 1.6;
      m.mode = "flee";
      m.modeT = 0.45;
      m.dodgeCd = sm.cooldown;
    }
    if (m.mode === "flee" && m.modeT <= 0) {
      m.mode = "wander";
      m.tx = rnd(30, W - 30);
      m.ty = rnd(40, 360);
    }
    if (m.mode === "wander") {
      m.diveIn -= dt;
      if (m.diveIn <= 0) {
        m.mode = "dive";
        blip("dive", [[900, 0, 0.3, "sawtooth", 0.015, 1300]]);
      } else if (Math.hypot(m.tx - m.x, m.ty - m.y) < 20) {
        m.tx = rnd(30, W - 30);
        m.ty = rnd(40, 380);
      }
    }
    if (m.mode !== "flee") {
      const tx = m.mode === "dive" ? BITE.x : m.tx, ty = m.mode === "dive" ? BITE.y : m.ty;
      const d = Math.hypot(tx - m.x, ty - m.y) || 1;
      const sp = base * (m.mode === "dive" ? 1.1 : 1);
      // steer with a wobbly buzz
      m.vx += ((tx - m.x) / d * sp - m.vx) * Math.min(1, dt * 3) + Math.sin(m.phase * 9) * 140 * dt;
      m.vy += ((ty - m.y) / d * sp - m.vy) * Math.min(1, dt * 3) + Math.cos(m.phase * 7) * 140 * dt;
      if (m.mode === "dive" && d < 14) {
        g.itch++;
        g.pops.push({ x: BITE.x, y: BITE.y - 30, text: "BITE!", color: "#ff4d6d", t: 0 });
        blip("bite", [[260, 0, 0.12, "square", 0.05, 180]]);
        m.mode = "wander";
        m.diveIn = rnd(4, 9) - Math.min(3, g.wave * 0.3);
        m.tx = rnd(30, W - 30);
        m.ty = rnd(40, 250);
        m.vy = -base;
      }
    }
    m.x = Math.max(8, Math.min(W - 8, m.x + m.vx * dt));
    m.y = Math.max(8, Math.min(H - 8, m.y + m.vy * dt));

    // zap
    if (r.seen && r.speed > SWING && inHead(r, m.x, m.y) && m.hp > 0) {
      m.hp--;
      for (let i = 0; i < 10; i++) g.sparks.push({ x: m.x, y: m.y, vx: rnd(-160, 160), vy: rnd(-160, 160), t: 0 });
      blip("zap", [
        [2400, 0, 0.05, "square", 0.04, 800],
        [1800, 0.04, 0.06, "sawtooth", 0.03, 400],
      ]);
      if (m.hp <= 0) {
        g.zapped++;
        const pts = 10 * g.wave * (m.tiger ? 2 : 1);
        g.score += pts;
        g.pops.push({ x: m.x, y: m.y, text: `ZAP +${pts}`, color: "#22f3ff", t: 0 });
      } else {
        // a tiger shrugs off the first zap and bolts
        m.mode = "flee";
        m.modeT = 0.5;
        m.vx = rnd(-1, 1) * base * 2.5;
        m.vy = -base * 2;
      }
    }
  }
  g.mozzies = g.mozzies.filter((m) => m.hp > 0);
  if (g.itch >= MAX_ITCH) {
    g.over = true;
    return;
  }
  if (!g.mozzies.length) {
    g.score += 50;
    g.pops.push({ x: W / 2, y: 200, text: "WAVE CLEAR +50", color: "#ffe14d", t: 0 });
    g.wave++;
    spawnWave(g);
  }
}

export function MosquitoBat() {
  const [screen, setScreen] = useState<"title" | "play" | "over">("title");
  const [best, submitBest] = useBest("lab.mosquito.best");
  const [hud, setHud] = useState({ score: 0, itch: 0, wave: 1, left: 0 });
  const [result, setResult] = useState<{ score: number; wave: number; zapped: number; best: boolean } | null>(null);
  const { wrapRef, canvasRef } = useFitCanvas(W, H);
  const gameRef = useRef<Game>(newGame());
  const playing = useRef(false);
  const hudAt = useRef(0);
  const buzzAt = useRef(0);
  const lastMove = useRef({ x: 0, y: 0, t: 0 });

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
      // the whine of the nearest mosquito
      if (now - buzzAt.current > 260 && g.mozzies.length) {
        buzzAt.current = now;
        const near = Math.min(...g.mozzies.map((m) => Math.hypot(m.x - BITE.x, m.y - BITE.y)));
        tone(620 + Math.random() * 60, 0, 0.22, "sawtooth", Math.max(0.002, 0.012 - near / 50000));
      }
      if (g.over) {
        playing.current = false;
        setResult({ score: g.score, wave: g.wave, zapped: g.zapped, best: submitBest(g.score) });
        setScreen("over");
      }
    }
    if (now - hudAt.current > 100) {
      hudAt.current = now;
      setHud({ score: g.score, itch: g.itch, wave: g.wave, left: g.mozzies.length });
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = ctx2d(canvas, W);
    const t = now / 1000;

    // dark bedroom with a moonlit window
    cx.fillStyle = "#0b0918";
    cx.fillRect(0, 0, W, H);
    cx.fillStyle = "#1a2350";
    cx.fillRect(230, 40, 90, 110);
    cx.fillStyle = "#ece9ff";
    cx.beginPath();
    cx.arc(290, 75, 14, 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = "#0b0918";
    cx.fillRect(272, 40, 4, 110);
    cx.fillRect(230, 92, 90, 4);
    // bed and sleeper
    cx.fillStyle = "#2a2350";
    cx.fillRect(40, 500, 280, 90);
    cx.fillStyle = "#ece9ff";
    cx.fillRect(56, 510, 80, 30);
    cx.fillStyle = "#b26bff";
    cx.fillRect(120, 530, 200, 60);
    cx.font = "34px sans-serif";
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    cx.fillText(g.itch >= 3 ? "😫" : "😴", 96, 522);
    cx.fillStyle = "#f0c6a0";
    cx.fillRect(140, 518, 80, 10);
    // bite marks on the arm
    cx.fillStyle = "#ff4d6d";
    for (let i = 0; i < g.itch; i++) {
      cx.beginPath();
      cx.arc(150 + i * 14, 523, 4, 0, Math.PI * 2);
      cx.fill();
    }

    // mosquitoes
    for (const m of g.mozzies) {
      cx.save();
      cx.translate(m.x, m.y);
      cx.scale(1.5, 1.5);
      cx.translate(-m.x, -m.y);
      const flap = Math.sin(t * 80 + m.phase) * 4;
      if (m.mode === "dive") {
        cx.strokeStyle = "rgba(255,77,109,0.5)";
        cx.lineWidth = 1;
        cx.beginPath();
        cx.moveTo(m.x, m.y);
        cx.lineTo(m.x - m.vx * 0.15, m.y - m.vy * 0.15);
        cx.stroke();
      }
      cx.fillStyle = "rgba(236,233,255,0.45)";
      cx.beginPath();
      cx.ellipse(m.x - 4, m.y - 3 - flap * 0.3, 5, 2.5, -0.6, 0, Math.PI * 2);
      cx.ellipse(m.x + 4, m.y - 3 - flap * 0.3, 5, 2.5, 0.6, 0, Math.PI * 2);
      cx.fill();
      cx.fillStyle = m.tiger ? "#ffe14d" : "#8f89b8";
      cx.fillRect(m.x - 1.5, m.y - 4, 3, 9);
      if (m.tiger) {
        cx.fillStyle = "#05040b";
        cx.fillRect(m.x - 1.5, m.y - 1, 3, 1.5);
        cx.fillRect(m.x - 1.5, m.y + 2, 3, 1.5);
      }
      cx.strokeStyle = "#8f89b8";
      cx.beginPath();
      cx.moveTo(m.x, m.y + 5);
      cx.lineTo(m.x, m.y + 10);
      cx.stroke();
      cx.restore();
    }

    // racket
    const r = g.racket;
    if (r.seen) {
      const live = r.speed > SWING;
      cx.strokeStyle = "#ffe14d";
      cx.lineWidth = 8;
      cx.beginPath();
      cx.moveTo(r.x, r.y + HEAD_RY);
      cx.lineTo(r.x, r.y + HEAD_RY + 60);
      cx.stroke();
      cx.strokeStyle = live ? "#22f3ff" : "#ffe14d";
      cx.lineWidth = 5;
      if (live) {
        cx.shadowColor = "#22f3ff";
        cx.shadowBlur = 14;
      }
      cx.beginPath();
      cx.ellipse(r.x, r.y, HEAD_RX, HEAD_RY, 0, 0, Math.PI * 2);
      cx.stroke();
      cx.shadowBlur = 0;
      cx.save();
      cx.beginPath();
      cx.ellipse(r.x, r.y, HEAD_RX - 3, HEAD_RY - 3, 0, 0, Math.PI * 2);
      cx.clip();
      cx.strokeStyle = live ? "rgba(34,243,255,0.6)" : "rgba(236,233,255,0.18)";
      cx.lineWidth = 1;
      for (let i = -HEAD_RX; i < HEAD_RX; i += 6) {
        cx.beginPath();
        cx.moveTo(r.x + i, r.y - HEAD_RY);
        cx.lineTo(r.x + i, r.y + HEAD_RY);
        cx.stroke();
      }
      for (let i = -HEAD_RY; i < HEAD_RY; i += 6) {
        cx.beginPath();
        cx.moveTo(r.x - HEAD_RX, r.y + i);
        cx.lineTo(r.x + HEAD_RX, r.y + i);
        cx.stroke();
      }
      cx.restore();
    }

    cx.fillStyle = "#22f3ff";
    for (const s of g.sparks) {
      cx.globalAlpha = 1 - s.t / 0.4;
      cx.fillRect(s.x, s.y, 3, 3);
    }
    cx.globalAlpha = 1;
    cx.font = PIXEL_FONT(10);
    for (const p of g.pops) {
      cx.globalAlpha = 1 - p.t;
      cx.fillStyle = p.color;
      cx.fillText(p.text, p.x, p.y - 14 - p.t * 24);
    }
    cx.globalAlpha = 1;
    if (g.banner > 0 && playing.current) {
      cx.font = PIXEL_FONT(16);
      cx.fillStyle = "#ffe14d";
      cx.fillText(`WAVE ${g.wave}`, W / 2, 250);
      cx.font = PIXEL_FONT(8);
      cx.fillStyle = "#ece9ff";
      const s = smarts(g.wave);
      cx.fillText(s.still ? "THEY DODGE EVEN A STILL RACKET" : s.dodge ? "THEY'RE WATCHING YOUR SWING" : "SWING TO ZAP", W / 2, 276);
    }
  });

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gameRef.current;
    const [x, y] = toLogical(e, e.currentTarget, W, H);
    const now = performance.now();
    const lm = lastMove.current;
    const r = g.racket;
    const nx = x, ny = Math.max(HEAD_RY, y - (e.pointerType === "mouse" ? 0 : LIFT));
    if (r.seen && now - lm.t < 100) {
      const dtm = Math.max(1, now - lm.t) / 1000;
      r.vx = (nx - r.x) / dtm;
      r.vy = (ny - r.y) / dtm;
      r.speed = Math.max(r.speed, Math.hypot(r.vx, r.vy));
    }
    r.x = nx;
    r.y = ny;
    r.seen = true;
    lastMove.current = { x, y, t: now };
  };

  return (
    <LabShell title="MOSQUITO BAT" color="#22f3ff">
      <div className="flex h-9 shrink-0 items-center justify-between px-3 font-pixel text-[8px]">
        <span className="text-dim">
          ITCH{" "}
          {Array.from({ length: MAX_ITCH }, (_, i) => (
            <span key={i} className={i < hud.itch ? "text-red" : "text-line"}>
              ●
            </span>
          ))}
        </span>
        <span className="text-dim">
          WAVE <span className="text-ink">{hud.wave}</span> · 🦟 <span className="text-ink">{hud.left}</span>
        </span>
        <span className="text-cyan">{hud.score}</span>
      </div>
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        <canvas
          ref={canvasRef}
          className="block touch-none"
          onPointerDown={(e) => {
            e.preventDefault();
            move(e);
          }}
          onPointerMove={move}
        />
        {screen === "title" && (
          <TitleCard a="MOSQUITO" b="BAT" colorA="#22f3ff" colorB="#ffe14d" blurb="Someone is trying to sleep. The mosquitoes have other plans. You have an electric racket." best={best} onPlay={start}>
            <p>Drag to move the racket (it floats above your finger). It only zaps while you swing it fast, and the mesh glows blue when it&apos;s live.</p>
            <p>Mosquitoes dive at the sleeper. Five bites and the night is over. Clear a wave to start the next.</p>
            <p>From wave 2 they read your swing and dodge, getting sharper every wave. From wave 4, yellow tiger mosquitoes take two zaps.</p>
          </TitleCard>
        )}
        {screen === "over" && result && (
          <GameOverCard
            title="TOO ITCHY"
            score={result.score}
            isBest={result.best}
            best={best}
            color="#22f3ff"
            line={`You zapped ${result.zapped} mosquitoes and reached wave ${result.wave}.`}
            again={start}
          />
        )}
      </div>
    </LabShell>
  );
}
