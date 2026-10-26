"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { blip, unlock } from "@/lib/lab/sound";
import { GameOverCard, LabShell, PIXEL_FONT, TitleCard, ctx2d, toLogical, useBest, useFitCanvas, useLoop } from "./LabShell";

// Tiffin Stack: a delivery scooter carries a tower of steel tiffin boxes down
// a bumpy road. A hand overhead swings the next box; tap to drop it on top.
// Drag left and right to move the scooter under the tower and keep it
// balanced, like balancing a stick on your palm. Potholes make it wobble.

const W = 360;
const H = 600;
const GROUND = 500; // screen y of the scooter rack
const BW = 54;
const BH = 24;
const GRAV = 600;
const TOPPLE = 0.75;
const LIVES = 3;
const BAND = ["#ff4d6d", "#22f3ff", "#ffe14d", "#39ff88", "#b26bff", "#ff8a3d"];

interface Game {
  boxes: number[]; // offset of each box relative to the one below
  theta: number;
  omega: number;
  sx: number;
  sv: number;
  sa: number;
  target: number;
  handT: number;
  falling: { x: number; y: number; vy: number } | null;
  miss: { x: number; y: number; vy: number; rot: number } | null;
  lives: number;
  score: number;
  cam: number;
  road: number;
  bumpIn: number;
  pothole: number | null; // screen x of the pothole coming in
  pops: { x: number; y: number; text: string; color: string; t: number }[];
  over: boolean;
  overT: number;
  perfects: number;
}

function newGame(): Game {
  return { boxes: [0], theta: 0, omega: 0, sx: W / 2, sv: 0, sa: 0, target: W / 2, handT: 0, falling: null, miss: null, lives: LIVES, score: 0, cam: 0, road: 0, bumpIn: 5, pothole: null, pops: [], over: false, overT: 0, perfects: 0 };
}

/** Horizontal centre of mass of the tower relative to its base, and its height. */
function mass(g: Game) {
  let x = 0, sum = 0;
  for (let i = 0; i < g.boxes.length; i++) {
    x += g.boxes[i];
    sum += x;
  }
  return { com: sum / g.boxes.length, top: x, h: g.boxes.length * BH };
}

/** Screen position of a point at height h and offset off along the tilted tower. */
function towerPoint(g: Game, off: number, h: number): [number, number] {
  const s = Math.sin(g.theta), c = Math.cos(g.theta);
  return [g.sx + off * c + h * s, GROUND + g.cam - (h * c - off * s)];
}

const handX = (g: Game) => W / 2 + Math.sin(g.handT * (1.1 + Math.min(1.2, g.boxes.length * 0.05))) * 105;
const HAND_Y = 70;

function step(g: Game, dt: number) {
  for (const p of g.pops) p.t += dt;
  g.pops = g.pops.filter((p) => p.t < 1.1);
  if (g.miss) {
    g.miss.vy += 900 * dt;
    g.miss.y += g.miss.vy * dt;
    g.miss.rot += dt * 6;
    if (g.miss.y > H + 60) g.miss = null;
  }
  if (g.over) {
    g.overT -= dt;
    g.omega += Math.sign(g.theta || 1) * 4 * dt;
    g.theta += g.omega * dt;
    return;
  }
  g.handT += dt;
  g.road += dt * 140;

  // scooter chases the finger
  const prevV = g.sv;
  g.sv += ((g.target - g.sx) * 40 - g.sv * 9) * dt;
  g.sx = Math.max(60, Math.min(W - 60, g.sx + g.sv * dt));
  g.sa = (g.sv - prevV) / Math.max(dt, 1e-3);

  // inverted pendulum
  const m = mass(g);
  const L = 20 + m.h * 0.6;
  const lean = Math.atan2(m.com, L) * 0.35;
  // the rider steadies short towers; past a few boxes it's all on you
  const steady = (GRAV / L) * Math.max(0, 1.6 - g.boxes.length * 0.06);
  g.omega += ((GRAV / L) * Math.sin(g.theta + lean) - steady * g.theta - (g.sa / L) * Math.cos(g.theta) * 0.9 - g.omega * 1.6) * dt;
  g.theta += g.omega * dt;

  // potholes roll in from the right
  g.bumpIn -= dt;
  if (g.bumpIn <= 0 && g.pothole === null) g.pothole = W + 30;
  if (g.pothole !== null) {
    g.pothole -= 140 * dt;
    if (Math.abs(g.pothole - g.sx) < 8) {
      g.omega += (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.min(1, g.boxes.length / 15));
      g.pops.push({ x: g.sx, y: GROUND + 40, text: "BUMP!", color: "#ff8a3d", t: 0 });
      blip("bump", [[90, 0, 0.15, "square", 0.06]]);
      g.pothole = -999;
    }
    if (g.pothole < -40) {
      g.pothole = null;
      g.bumpIn = Math.max(2.5, 7 - g.boxes.length * 0.25) * (0.7 + Math.random() * 0.6);
    }
  }

  // falling box
  if (g.falling) {
    g.falling.vy += 1100 * dt;
    g.falling.y += g.falling.vy * dt;
    const [tx, ty] = towerPoint(g, m.top, m.h);
    if (g.falling.y + BH / 2 >= ty - BH / 2) {
      const off = (g.falling.x - tx) * Math.cos(g.theta);
      if (Math.abs(off) > BW * 0.72) {
        g.miss = { x: g.falling.x, y: g.falling.y, vy: g.falling.vy * 0.5, rot: 0 };
        g.lives--;
        g.pops.push({ x: g.falling.x, y: ty - 20, text: "DAL SPILLED!", color: "#ff4d6d", t: 0 });
        blip("spill", [[300, 0, 0.3, "sawtooth", 0.05, 70]]);
        if (g.lives <= 0) {
          g.over = true;
          g.overT = 1.6;
        }
      } else {
        const perfect = Math.abs(off) < 5;
        g.boxes.push(perfect ? 0 : off);
        const pts = 10 + (perfect ? 15 : 0) + g.boxes.length;
        g.score += pts;
        if (perfect) g.perfects++;
        g.pops.push({ x: tx, y: ty - 30, text: perfect ? `PERFECT +${pts}` : `+${pts}`, color: perfect ? "#ffe14d" : "#39ff88", t: 0 });
        g.omega += off / 400; // the landing nudges the tower
        blip("clank", [
          [1200, 0, 0.04, "square", 0.03],
          [1600, 0.03, 0.08, "triangle", 0.03],
        ]);
      }
      g.falling = null;
    }
  }

  // camera keeps the top of the tower in view
  const want = Math.max(0, m.h - 300);
  g.cam += (want - g.cam) * Math.min(1, dt * 3);

  if (Math.abs(g.theta) > TOPPLE) {
    g.over = true;
    g.overT = 1.6;
    blip("topple", [
      [400, 0, 0.6, "sawtooth", 0.05, 60],
      [1500, 0.3, 0.05, "square", 0.04],
      [1300, 0.4, 0.05, "square", 0.04],
    ]);
  }
}

function drawBox(cx: CanvasRenderingContext2D, i: number) {
  cx.fillStyle = "#d8d4f2";
  cx.fillRect(-BW / 2, -BH, BW, BH);
  cx.fillStyle = "#b9b4d9";
  cx.fillRect(-BW / 2, -BH, BW, 4);
  cx.fillStyle = BAND[i % BAND.length];
  cx.fillRect(-BW / 2, -BH / 2 - 2, BW, 4);
  cx.fillStyle = "#8f89b8";
  cx.fillRect(-BW / 2 - 3, -BH / 2 - 3, 3, 6);
  cx.fillRect(BW / 2, -BH / 2 - 3, 3, 6);
}

export function TiffinStack() {
  const [screen, setScreen] = useState<"title" | "play" | "over">("title");
  const [best, submitBest] = useBest("lab.tiffinstack.best");
  const [hud, setHud] = useState({ score: 0, lives: LIVES, height: 1, lean: 0 });
  const [result, setResult] = useState<{ score: number; height: number; perfects: number; best: boolean } | null>(null);
  const { wrapRef, canvasRef } = useFitCanvas(W, H);
  const gameRef = useRef<Game>(newGame());
  const playing = useRef(false);
  const hudAt = useRef(0);
  const touch = useRef<{ id: number; sx: number; moved: boolean } | null>(null);

  const start = useCallback(() => {
    unlock();
    gameRef.current = newGame();
    playing.current = true;
    setScreen("play");
  }, []);

  const drop = () => {
    const g = gameRef.current;
    if (!playing.current || g.over || g.falling) return;
    g.falling = { x: handX(g), y: HAND_Y + 20, vy: 0 };
    blip("drop", [[500, 0, 0.06, "triangle", 0.03, 300]]);
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (!playing.current) return;
      if (e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        drop();
      }
      if (e.key === "ArrowLeft") g.target = Math.max(60, g.target - 30);
      if (e.key === "ArrowRight") g.target = Math.min(W - 60, g.target + 30);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  useLoop((dt, now) => {
    const g = gameRef.current;
    if (playing.current) {
      step(g, dt);
      if (g.over && g.overT <= 0) {
        playing.current = false;
        setResult({ score: g.score, height: g.boxes.length, perfects: g.perfects, best: submitBest(g.score) });
        setScreen("over");
      }
    }
    if (now - hudAt.current > 100) {
      hudAt.current = now;
      setHud({ score: g.score, lives: g.lives, height: g.boxes.length, lean: g.theta / TOPPLE });
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = ctx2d(canvas, W);

    // street at dusk with scrolling buildings
    cx.fillStyle = "#1b1040";
    cx.fillRect(0, 0, W, H);
    cx.fillStyle = "#2a2350";
    for (let i = 0; i < 6; i++) {
      const x = ((i * 90 - g.road * 0.3) % 540 + 540) % 540 - 90;
      const h = 120 + ((i * 53) % 90);
      cx.fillRect(x, GROUND + g.cam - h - 40, 70, h);
      cx.fillStyle = "#ffe14d";
      for (let w = 0; w < 4; w++) if ((i + w) % 3) cx.fillRect(x + 10 + (w % 2) * 30, GROUND + g.cam - h - 30 + Math.floor(w / 2) * 30, 12, 10);
      cx.fillStyle = "#2a2350";
    }
    cx.fillStyle = "#26233a";
    cx.fillRect(0, GROUND + g.cam + 30, W, H);
    cx.fillStyle = "#ffe14d";
    for (let x = -(g.road % 60); x < W; x += 60) cx.fillRect(x, GROUND + g.cam + 62, 30, 4);
    if (g.pothole !== null && g.pothole > -40) {
      cx.fillStyle = "#05040b";
      cx.beginPath();
      cx.ellipse(g.pothole, GROUND + g.cam + 48, 18, 5, 0, 0, Math.PI * 2);
      cx.fill();
      if (g.pothole > g.sx) {
        cx.font = PIXEL_FONT(8);
        cx.fillStyle = "#ff8a3d";
        cx.textAlign = "center";
        cx.fillText("!", g.pothole, GROUND + g.cam + 30);
      }
    }

    // scooter
    const by = GROUND + g.cam;
    cx.fillStyle = "#05040b";
    for (const wx of [g.sx - 34, g.sx + 36]) {
      cx.beginPath();
      cx.arc(wx, by + 34, 12, 0, Math.PI * 2);
      cx.fill();
    }
    cx.fillStyle = "#ff4d6d";
    cx.beginPath();
    cx.roundRect(g.sx - 46, by + 6, 92, 22, 8);
    cx.fill();
    cx.fillStyle = "#8f89b8";
    cx.fillRect(g.sx - 30, by, 60, 6); // rack
    cx.fillRect(g.sx + 40, by - 24, 5, 30);
    cx.font = "26px sans-serif";
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    cx.fillText("🧑", g.sx + 40, by - 34);

    // the tower
    cx.save();
    cx.translate(g.sx, by);
    cx.rotate(g.theta);
    let off = 0;
    g.boxes.forEach((o, i) => {
      off += o;
      cx.save();
      cx.translate(off, -i * BH);
      drawBox(cx, i);
      cx.restore();
    });
    cx.restore();

    // hand with the next box
    const hx = handX(g);
    cx.strokeStyle = "#f0c6a0";
    cx.lineWidth = 6;
    cx.beginPath();
    cx.moveTo(hx, 0);
    cx.lineTo(hx, HAND_Y - 6);
    cx.stroke();
    if (!g.falling && !g.over) {
      cx.save();
      cx.translate(hx, HAND_Y + 32);
      drawBox(cx, g.boxes.length);
      cx.restore();
      cx.setLineDash([3, 6]);
      cx.strokeStyle = "rgba(236,233,255,0.18)";
      cx.lineWidth = 1;
      cx.beginPath();
      cx.moveTo(hx, HAND_Y + 34);
      cx.lineTo(hx, GROUND);
      cx.stroke();
      cx.setLineDash([]);
    }
    if (g.falling) {
      cx.save();
      cx.translate(g.falling.x, g.falling.y + BH / 2);
      drawBox(cx, g.boxes.length);
      cx.restore();
    }
    if (g.miss) {
      cx.save();
      cx.translate(g.miss.x, g.miss.y);
      cx.rotate(g.miss.rot);
      drawBox(cx, g.boxes.length);
      cx.restore();
    }
    cx.font = PIXEL_FONT(10);
    for (const p of g.pops) {
      cx.globalAlpha = Math.max(0, 1 - p.t / 1.1);
      cx.fillStyle = p.color;
      cx.fillText(p.text, p.x, p.y - p.t * 24);
    }
    cx.globalAlpha = 1;
  });

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!playing.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x] = toLogical(e, e.currentTarget, W, H);
    touch.current = { id: e.pointerId, sx: x, moved: false };
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const tc = touch.current;
    if (!tc || tc.id !== e.pointerId) return;
    const [x] = toLogical(e, e.currentTarget, W, H);
    if (Math.abs(x - tc.sx) > 6) tc.moved = true;
    // drag steers relative to where the finger went down, so you don't have to cover the scooter
    if (tc.moved) {
      const g = gameRef.current;
      g.target = Math.max(60, Math.min(W - 60, g.target + (x - tc.sx)));
      tc.sx = x;
    }
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const tc = touch.current;
    touch.current = null;
    if (tc && tc.id === e.pointerId && !tc.moved) drop();
  };

  const lean = Math.max(-1, Math.min(1, hud.lean));

  return (
    <LabShell title="TIFFIN STACK" color="#ffe14d">
      <div className="flex h-9 shrink-0 items-center gap-3 px-3 font-pixel text-[8px]">
        <span className="text-[11px]">
          {Array.from({ length: LIVES }, (_, i) => (
            <span key={i} className={i < hud.lives ? "text-red" : "text-line"}>
              ♥
            </span>
          ))}
        </span>
        <span className="text-dim">
          HEIGHT <span className="text-ink">{hud.height}</span>
        </span>
        <div className="relative h-2 flex-1 bg-line" title="Lean">
          <div className="absolute top-0 h-full w-1 -translate-x-1/2" style={{ left: `${50 + lean * 50}%`, background: Math.abs(lean) > 0.6 ? "#ff4d6d" : "#39ff88" }} />
          <div className="absolute left-1/2 top-0 h-full w-px bg-dim" />
        </div>
        <span className="text-yellow">{hud.score}</span>
      </div>
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        <canvas ref={canvasRef} className="block touch-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => (touch.current = null)} />
        {screen === "title" && (
          <TitleCard a="TIFFIN" b="STACK" colorA="#ffe14d" colorB="#ff4d6d" blurb="One scooter, one road full of potholes, and a tower of steel tiffin boxes that keeps getting taller." best={best} onPlay={start}>
            <p>Tap to drop the swinging box onto the tower. Land it dead centre for a PERFECT that doesn&apos;t add any lean.</p>
            <p>Drag left or right anywhere to move the scooter and catch a wobble, like balancing a stick on your palm. If the tower leans, land the next box on the other side to straighten it. The bar at the top shows the lean.</p>
            <p>A box that misses spills (3 spills and you&apos;re done). If the tower leans too far, it all comes down. Watch for the ! on potholes.</p>
          </TitleCard>
        )}
        {screen === "over" && result && (
          <GameOverCard
            title="DAL EVERYWHERE"
            score={result.score}
            isBest={result.best}
            best={best}
            color="#ffe14d"
            line={`Your tower reached ${result.height} ${result.height === 1 ? "box" : "boxes"} with ${result.perfects} perfect ${result.perfects === 1 ? "drop" : "drops"}.`}
            again={start}
          />
        )}
      </div>
    </LabShell>
  );
}
