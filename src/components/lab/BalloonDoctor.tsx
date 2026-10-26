"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { blip, unlock } from "@/lib/lab/sound";
import { GameOverCard, LabShell, PIXEL_FONT, TitleCard, ctx2d, toLogical, useBest, useFitCanvas, useLoop } from "./LabShell";

// Balloon Doctor: a leaky balloon floats up a cactus canyon. Holes keep
// appearing; each one leaks air and shoves the balloon like a little jet. Tap
// holes to patch them, and steer by tilting the phone (or holding either side
// of the screen when tilt isn't available). Less air means a smaller balloon,
// which is easier to squeeze through gaps, but empty means you sink.

const W = 360;
const H = 600;
const BY = 400; // balloon's screen height
const WALL = 14;
const LEAK = 5.5; // air per second per hole
const JET = 140; // push per hole
const HOLE_TAP = 26;

interface Hole {
  a: number; // angle on the balloon
  age: number;
}

interface Ledge {
  x0: number;
  x1: number;
  y: number; // world height of its middle
  h: number;
  kind: "ledge" | "cactus";
}

interface Game {
  time: number;
  x: number;
  vx: number;
  climb: number; // world height reached
  speed: number;
  air: number;
  holes: Hole[];
  patches: number[];
  holeIn: number;
  ledges: Ledge[];
  nextLedge: number;
  puffs: { x: number; y: number; vx: number; vy: number; t: number }[];
  pops: { x: number; y: number; text: string; t: number }[];
  patched: number;
  over: "" | "popped" | "deflated";
  overIn: number;
}

function newGame(): Game {
  return { time: 0, x: W / 2, vx: 0, climb: 0, speed: 55, air: 100, holes: [], patches: [], holeIn: 2, ledges: [], nextLedge: 260, puffs: [], pops: [], patched: 0, over: "", overIn: 0 };
}

const radius = (g: Game) => 16 + 18 * (g.air / 100);

function addLedges(g: Game) {
  while (g.nextLedge < g.climb + H + 100) {
    const y = g.nextLedge;
    const lvl = Math.min(1, g.climb / 6000);
    const gap = 150 - lvl * 50 + Math.random() * 30;
    const r = Math.random();
    if (r < 0.4) {
      // a ledge from one wall
      const left = Math.random() < 0.5;
      const len = W - WALL * 2 - gap - Math.random() * 60;
      g.ledges.push(left ? { x0: 0, x1: WALL + len, y, h: 18, kind: "ledge" } : { x0: W - WALL - len, x1: W, y, h: 18, kind: "ledge" });
    } else if (r < 0.75) {
      // ledges from both walls with a gap somewhere
      const gx = WALL + 30 + Math.random() * (W - WALL * 2 - gap - 60);
      g.ledges.push({ x0: 0, x1: gx, y, h: 18, kind: "ledge" }, { x0: gx + gap, x1: W, y, h: 18, kind: "ledge" });
    } else {
      // a lone floating cactus
      const cx = WALL + 50 + Math.random() * (W - WALL * 2 - 100);
      g.ledges.push({ x0: cx - 13, x1: cx + 13, y, h: 44, kind: "cactus" });
    }
    g.nextLedge += 170 - lvl * 40 + Math.random() * 80;
  }
  g.ledges = g.ledges.filter((l) => l.y > g.climb - 200);
}

const screenY = (g: Game, worldY: number) => BY - (worldY - g.climb);

function step(g: Game, dt: number, steer: number) {
  for (const p of g.puffs) {
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  g.puffs = g.puffs.filter((p) => p.t < 0.6);
  for (const p of g.pops) p.t += dt;
  g.pops = g.pops.filter((p) => p.t < 1);
  if (g.over) {
    g.overIn -= dt;
    if (g.over === "deflated") g.climb -= 80 * dt;
    return;
  }
  g.time += dt;
  g.speed = Math.min(150, 55 + g.time * 1.4);

  // new holes
  g.holeIn -= dt;
  if (g.holeIn <= 0) {
    g.holes.push({ a: Math.random() * Math.PI * 2, age: 0 });
    g.holeIn = Math.max(0.9, 2.8 - g.time / 40) * (0.7 + Math.random() * 0.6);
    blip("hole", [[1400, 0, 0.12, "sine", 0.03, 600]]);
  }

  // leaks: drain air and push the balloon away from each hole
  const r = radius(g);
  let push = 0, lift = 0;
  for (const h of g.holes) {
    h.age += dt;
    g.air -= LEAK * dt;
    push -= Math.cos(h.a) * JET;
    lift += Math.sin(h.a) * 0.25;
    if (Math.random() < dt * 14)
      g.puffs.push({ x: g.x + Math.cos(h.a) * r, y: BY + Math.sin(h.a) * r, vx: Math.cos(h.a) * 90, vy: Math.sin(h.a) * 90 + g.speed * 0.5, t: 0 });
  }
  g.vx += (steer * 520 + push) * dt;
  g.vx *= Math.pow(0.25, dt);
  g.x += g.vx * dt;
  if (g.x < WALL + r) (g.x = WALL + r), (g.vx = Math.abs(g.vx) * 0.4);
  if (g.x > W - WALL - r) (g.x = W - WALL - r), (g.vx = -Math.abs(g.vx) * 0.4);
  g.climb += g.speed * Math.max(0.4, 1 + lift) * dt;
  addLedges(g);

  if (g.air <= 0) {
    g.air = 0;
    g.over = "deflated";
    g.overIn = 1.6;
    blip("deflate", [[600, 0, 0.9, "sawtooth", 0.04, 80]]);
    return;
  }
  // cactus contact pops it
  for (const l of g.ledges) {
    const top = screenY(g, l.y) - l.h / 2, bottom = top + l.h;
    const nx = Math.max(l.x0, Math.min(g.x, l.x1)), ny = Math.max(top, Math.min(BY, bottom));
    if (Math.hypot(g.x - nx, BY - ny) < r * 0.88) {
      g.over = "popped";
      g.overIn = 1.4;
      blip("pop", [
        [900, 0, 0.05, "square", 0.08, 100],
        [120, 0.04, 0.3, "sawtooth", 0.05, 40],
      ]);
      return;
    }
  }
}

function patch(g: Game, x: number, y: number): boolean {
  if (g.over) return false;
  const r = radius(g);
  let bi = -1, bd = HOLE_TAP;
  g.holes.forEach((h, i) => {
    const d = Math.hypot(g.x + Math.cos(h.a) * r - x, BY + Math.sin(h.a) * r - y);
    if (d < bd) (bd = d), (bi = i);
  });
  if (bi < 0) return false;
  const [h] = g.holes.splice(bi, 1);
  g.patches = [...g.patches.slice(-7), h.a];
  g.patched++;
  g.pops.push({ x: g.x + Math.cos(h.a) * r, y: BY + Math.sin(h.a) * r, text: "PATCHED", t: 0 });
  blip("patch", [
    [520, 0, 0.05, "square", 0.035],
    [780, 0.05, 0.07, "square", 0.035],
  ]);
  return true;
}

function drawCactus(cx: CanvasRenderingContext2D, x: number, base: number, hgt: number, up: boolean) {
  const d = up ? -1 : 1;
  cx.fillStyle = "#39ff88";
  cx.fillRect(x - 4, Math.min(base, base + d * hgt), 8, hgt);
  cx.fillRect(x - 11, Math.min(base + d * hgt * 0.45, base + d * hgt * 0.45 + d * 4), 7, 4);
  cx.fillRect(x - 11, Math.min(base + d * hgt * 0.45, base + d * hgt * 0.8), 4, hgt * 0.35);
  cx.fillRect(x + 4, Math.min(base + d * hgt * 0.3, base + d * hgt * 0.3 + d * 4), 7, 4);
  cx.fillRect(x + 7, Math.min(base + d * hgt * 0.3, base + d * hgt * 0.62), 4, hgt * 0.32);
}

export function BalloonDoctor() {
  const [screen, setScreen] = useState<"title" | "play" | "over">("title");
  const [best, submitBest] = useBest("lab.balloon.best");
  const [hud, setHud] = useState({ meters: 0, air: 100, holes: 0 });
  const [tilt, setTilt] = useState<"off" | "on" | "denied">("off");
  const [result, setResult] = useState<{ score: number; how: string; patched: number; best: boolean } | null>(null);
  const { wrapRef, canvasRef } = useFitCanvas(W, H);
  const gameRef = useRef<Game>(newGame());
  const playing = useRef(false);
  const hudAt = useRef(0);
  const input = useRef({ gamma: 0, tiltOn: false, touch: new Map<number, number>(), keys: 0 });

  // tilt readings, when the browser sends them
  useEffect(() => {
    const on = (e: DeviceOrientationEvent) => {
      if (e.gamma === null) return;
      input.current.gamma = e.gamma;
      if (!input.current.tiltOn) {
        input.current.tiltOn = true;
        setTilt("on");
      }
    };
    window.addEventListener("deviceorientation", on);
    const key = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const dir = k === "arrowleft" || k === "a" ? -1 : k === "arrowright" || k === "d" ? 1 : 0;
      if (!dir) return;
      input.current.keys = e.type === "keydown" ? dir : input.current.keys === dir ? 0 : input.current.keys;
    };
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    return () => {
      window.removeEventListener("deviceorientation", on);
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
    };
  }, []);

  const start = useCallback(async () => {
    unlock();
    // iOS asks for motion permission, and only from a tap
    const DOE = (typeof window !== "undefined" ? window.DeviceOrientationEvent : undefined) as unknown as { requestPermission?: () => Promise<string> } | undefined;
    if (DOE && typeof DOE.requestPermission === "function" && !input.current.tiltOn) {
      try {
        const res = await DOE.requestPermission();
        if (res !== "granted") setTilt("denied");
      } catch {
        setTilt("denied");
      }
    }
    gameRef.current = newGame();
    addLedges(gameRef.current);
    playing.current = true;
    setScreen("play");
  }, []);

  useLoop((dt, now) => {
    const g = gameRef.current;
    const inp = input.current;
    let steer = inp.keys;
    for (const side of inp.touch.values()) steer += side;
    if (inp.tiltOn && steer === 0) steer = Math.max(-1, Math.min(1, inp.gamma / 25));
    steer = Math.max(-1, Math.min(1, steer));
    if (playing.current) {
      step(g, dt, steer);
      if (g.over && g.overIn <= 0) {
        playing.current = false;
        const score = Math.floor(g.climb / 10);
        setResult({ score, how: g.over, patched: g.patched, best: submitBest(score) });
        setScreen("over");
      }
    }
    if (now - hudAt.current > 100) {
      hudAt.current = now;
      setHud({ meters: Math.floor(g.climb / 10), air: g.air, holes: g.holes.length });
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = ctx2d(canvas, W);
    const t = now / 1000;

    // desert dusk sky
    const sky = cx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#1b1040");
    sky.addColorStop(0.7, "#5a1f4a");
    sky.addColorStop(1, "#ff8a3d");
    cx.fillStyle = sky;
    cx.fillRect(0, 0, W, H);
    // parallax mesas
    cx.fillStyle = "#3a1838";
    const off = (g.climb * 0.2) % 200;
    for (let y = -200 + off; y < H; y += 200) {
      cx.fillRect(40, y, 90, 60);
      cx.fillRect(220, y + 100, 110, 50);
    }
    // canyon walls with spines
    cx.fillStyle = "#6b3a22";
    cx.fillRect(0, 0, WALL, H);
    cx.fillRect(W - WALL, 0, WALL, H);

    for (const l of g.ledges) {
      const y = screenY(g, l.y);
      if (y < -80 || y > H + 80) continue;
      if (l.kind === "ledge") {
        cx.fillStyle = "#8a4b2a";
        cx.fillRect(l.x0, y - l.h / 2, l.x1 - l.x0, l.h);
        cx.fillStyle = "#6b3a22";
        cx.fillRect(l.x0, y + l.h / 2 - 5, l.x1 - l.x0, 5);
        for (let x = l.x0 + 16; x < l.x1 - 8; x += 34) {
          drawCactus(cx, x, y - l.h / 2, 16, true);
          drawCactus(cx, x + 17, y + l.h / 2, 12, false);
        }
      } else {
        const mid = (l.x0 + l.x1) / 2;
        drawCactus(cx, mid, y + l.h / 2, l.h, true);
        // spikes
        cx.strokeStyle = "#ece9ff";
        cx.lineWidth = 1;
        for (let i = 0; i < 6; i++) {
          const sy = y - l.h / 2 + 6 + i * 7;
          cx.beginPath();
          cx.moveTo(mid - 4, sy);
          cx.lineTo(mid - 8, sy - 2);
          cx.moveTo(mid + 4, sy);
          cx.lineTo(mid + 8, sy - 2);
          cx.stroke();
        }
      }
    }

    // balloon
    const r = radius(g);
    if (g.over !== "popped") {
      cx.strokeStyle = "#ece9ff";
      cx.lineWidth = 1;
      cx.beginPath();
      cx.moveTo(g.x, BY + r);
      cx.quadraticCurveTo(g.x + Math.sin(t * 3) * 8, BY + r + 30, g.x, BY + r + 56);
      cx.stroke();
      cx.fillStyle = "#ece9ff";
      cx.fillRect(g.x - 9, BY + r + 54, 18, 12); // the doctor's bag
      cx.fillStyle = "#ff4d6d";
      cx.fillRect(g.x - 2, BY + r + 56, 4, 8);
      cx.fillRect(g.x - 4, BY + r + 58, 8, 4);
      cx.fillStyle = "#ff2bd6";
      cx.beginPath();
      cx.ellipse(g.x, BY, r, r * 1.08, 0, 0, Math.PI * 2);
      cx.fill();
      cx.beginPath();
      cx.moveTo(g.x - 4, BY + r * 1.08);
      cx.lineTo(g.x + 4, BY + r * 1.08);
      cx.lineTo(g.x, BY + r * 1.08 - 6);
      cx.fill();
      cx.fillStyle = "rgba(255,255,255,0.35)";
      cx.beginPath();
      cx.ellipse(g.x - r * 0.35, BY - r * 0.4, r * 0.22, r * 0.32, -0.5, 0, Math.PI * 2);
      cx.fill();
      // old patches
      for (const a of g.patches) {
        const px = g.x + Math.cos(a) * r * 0.8, py = BY + Math.sin(a) * r * 0.8;
        cx.save();
        cx.translate(px, py);
        cx.rotate(a);
        cx.fillStyle = "#ffe14d";
        cx.fillRect(-6, -2.5, 12, 5);
        cx.fillRect(-2.5, -6, 5, 12);
        cx.restore();
      }
      // live holes
      for (const h of g.holes) {
        const hx = g.x + Math.cos(h.a) * r, hy = BY + Math.sin(h.a) * r;
        cx.fillStyle = "#05040b";
        cx.beginPath();
        cx.arc(hx, hy, 4, 0, Math.PI * 2);
        cx.fill();
        cx.strokeStyle = `rgba(255,225,77,${0.5 + 0.5 * Math.sin(t * 12)})`;
        cx.lineWidth = 2;
        cx.beginPath();
        cx.arc(hx, hy, 11, 0, Math.PI * 2);
        cx.stroke();
      }
    } else {
      cx.fillStyle = "#ff2bd6";
      for (let i = 0; i < 10; i++) {
        const a = i * 0.63, d = (1.4 - g.overIn) * 120;
        cx.fillRect(g.x + Math.cos(a) * d, BY + Math.sin(a) * d, 6, 4);
      }
    }
    cx.fillStyle = "rgba(236,233,255,0.7)";
    for (const p of g.puffs) {
      cx.globalAlpha = 1 - p.t / 0.6;
      cx.beginPath();
      cx.arc(p.x, p.y, 3 + p.t * 8, 0, Math.PI * 2);
      cx.fill();
    }
    cx.globalAlpha = 1;
    cx.textAlign = "center";
    cx.font = PIXEL_FONT(8);
    for (const p of g.pops) {
      cx.globalAlpha = 1 - p.t;
      cx.fillStyle = "#ffe14d";
      cx.fillText(p.text, p.x, p.y - 16 - p.t * 24);
    }
    cx.globalAlpha = 1;
    if (g.over === "popped" || g.over === "deflated") {
      cx.font = PIXEL_FONT(18);
      cx.fillStyle = "#ff4d6d";
      cx.fillText(g.over === "popped" ? "POP!" : "PFFFT...", W / 2, 180);
    }
  });

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!playing.current) return;
    e.preventDefault();
    const [x, y] = toLogical(e, e.currentTarget, W, H);
    if (patch(gameRef.current, x, y)) return;
    // not a hole: hold this side to steer
    input.current.touch.set(e.pointerId, x < W / 2 ? -1 : 1);
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    input.current.touch.delete(e.pointerId);
  };

  const airCol = hud.air < 25 ? "#ff4d6d" : hud.air < 55 ? "#ffe14d" : "#39ff88";

  return (
    <LabShell title="BALLOON DOCTOR" color="#ff2bd6">
      <div className="flex h-9 shrink-0 items-center gap-3 px-3 font-pixel text-[8px]">
        <span className="text-dim">AIR</span>
        <div className="h-2 flex-1 bg-line">
          <div className="h-full" style={{ width: `${hud.air}%`, background: airCol }} />
        </div>
        <span className={hud.holes >= 3 ? "text-red blink" : "text-dim"}>HOLES {hud.holes}</span>
        <span className="text-pink">{hud.meters}m</span>
      </div>
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        <canvas ref={canvasRef} className="block touch-none" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp} />
        {screen === "play" && (
          <div className="pointer-events-none absolute bottom-3 left-0 right-0 text-center font-pixel text-[7px] text-ink/50">
            {tilt === "on" ? "TILT TO STEER · TAP HOLES" : "HOLD LEFT / RIGHT TO STEER · TAP HOLES"}
          </div>
        )}
        {screen === "title" && (
          <TitleCard a="BALLOON" b="DOCTOR" colorA="#ff2bd6" colorB="#ffe14d" blurb="Your patient is a leaky balloon floating up a cactus canyon. Keep it alive." best={best} onPlay={start}>
            <p>Tap the flashing holes to patch them. Every open hole leaks air and pushes the balloon like a tiny jet.</p>
            <p>Tilt your phone to steer. Where tilt isn&apos;t available (or you said no on iPhone), hold the left or right side of the screen. On a keyboard, use the arrows.</p>
            <p>Less air means a smaller balloon that fits through tighter gaps. If the air runs out or you touch a cactus, it&apos;s over.</p>
          </TitleCard>
        )}
        {screen === "over" && result && (
          <GameOverCard
            title={result.how === "popped" ? "POPPED" : "DEFLATED"}
            score={result.score}
            isBest={result.best}
            best={best}
            color="#ff2bd6"
            line={`You climbed ${result.score}m and patched ${result.patched} ${result.patched === 1 ? "hole" : "holes"}.`}
            again={start}
          />
        )}
      </div>
    </LabShell>
  );
}
