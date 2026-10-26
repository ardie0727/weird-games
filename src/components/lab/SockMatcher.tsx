"use client";

import { useCallback, useRef, useState } from "react";
import { blip, unlock } from "@/lib/lab/sound";
import { GameOverCard, LabShell, PIXEL_FONT, TitleCard, ctx2d, toLogical, useBest, useFitCanvas, useLoop } from "./LabShell";

// Sock Matcher: a washing machine spits socks onto a pile. Drag one sock onto
// its twin (or tap one, then the other) to fold the pair away. Too many socks
// and the pile buries you.

const W = 360;
const H = 600;
const CAP = 18;
const DOOR = { x: 180, y: 74 };
const PILE_TOP = 175;
const GRAB_R = 30;
const COLORS = ["#ff2bd6", "#22f3ff", "#ffe14d", "#39ff88", "#ff8a3d", "#b26bff", "#ece9ff", "#ff4d6d"];
// near-twins that show up later to trip you up
const LOOKALIKES = ["#ff70e4", "#7af8ff", "#fff09a"];
const PATTERNS = ["plain", "stripes", "dots", "toes"] as const;

interface Kind {
  color: string;
  pattern: (typeof PATTERNS)[number];
}

interface Sock {
  id: number;
  kind: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  landY: number;
  landed: boolean;
  flip: boolean;
  wobble: number;
}

interface Pop {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
}

interface Game {
  time: number;
  socks: Sock[];
  kinds: Kind[];
  pending: { kind: number; t: number }[];
  spawnIn: number;
  nextId: number;
  score: number;
  pairs: number;
  combo: number;
  lastMatch: number;
  selected: number | null;
  drag: { id: number; dx: number; dy: number; sx: number; sy: number; moved: boolean } | null;
  pops: Pop[];
  shake: number;
  over: boolean;
}

function allKinds(): Kind[] {
  const out: Kind[] = [];
  for (const p of PATTERNS) for (const c of [...COLORS, ...LOOKALIKES]) out.push({ color: c, pattern: p });
  return out;
}

function newGame(): Game {
  return { time: 0, socks: [], kinds: allKinds(), pending: [], spawnIn: 0.6, nextId: 1, score: 0, pairs: 0, combo: 1, lastMatch: -10, selected: null, drag: null, pops: [], shake: 0, over: false };
}

/** Kinds in play grow with time: more colours, then patterns, then lookalike shades. */
function pool(g: Game): number[] {
  const lvl = Math.floor(g.time / 20);
  const nColors = Math.min(COLORS.length, 3 + lvl);
  const nPatterns = Math.min(PATTERNS.length, 1 + Math.floor(lvl / 2));
  const colors = [...COLORS.slice(0, nColors), ...(lvl >= 5 ? LOOKALIKES : [])];
  const ids: number[] = [];
  g.kinds.forEach((k, i) => {
    if (colors.includes(k.color) && PATTERNS.indexOf(k.pattern) < nPatterns) ids.push(i);
  });
  return ids;
}

function spit(g: Game, kind: number) {
  g.socks.push({
    id: g.nextId++,
    kind,
    x: DOOR.x,
    y: DOOR.y,
    vx: (Math.random() - 0.5) * 340,
    vy: -180 - Math.random() * 160,
    rot: Math.random() * 6,
    spin: (Math.random() - 0.5) * 14,
    landY: PILE_TOP + 20 + Math.random() * (H - PILE_TOP - 50),
    landed: false,
    flip: Math.random() < 0.5,
    wobble: 0,
  });
  g.shake = 0.25;
  blip("spit", [[180, 0, 0.08, "triangle", 0.04, 420]]);
}

function step(g: Game, dt: number) {
  g.time += dt;
  g.shake = Math.max(0, g.shake - dt);
  for (const p of g.pending) p.t -= dt;
  g.spawnIn -= dt;
  if (g.spawnIn <= 0) {
    g.spawnIn = Math.max(0.55, 1.6 - g.time / 80) * (0.75 + Math.random() * 0.5);
    const due = g.pending.findIndex((p) => p.t <= 0);
    if (due >= 0) spit(g, g.pending.splice(due, 1)[0].kind);
    else {
      const ids = pool(g);
      const k = ids[Math.floor(Math.random() * ids.length)];
      spit(g, k);
      g.pending.push({ kind: k, t: 0.4 + Math.random() * 4.5 });
    }
  }
  for (const s of g.socks) {
    s.wobble = Math.max(0, s.wobble - dt);
    if (s.landed || (g.drag && g.drag.id === s.id)) continue;
    s.vy += 900 * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.rot += s.spin * dt;
    if (s.x < 26) (s.x = 26), (s.vx = Math.abs(s.vx) * 0.5);
    if (s.x > W - 26) (s.x = W - 26), (s.vx = -Math.abs(s.vx) * 0.5);
    if (s.vy > 0 && s.y >= s.landY) {
      s.y = s.landY;
      s.landed = true;
    }
  }
  if (g.socks.filter((s) => s.landed).length > CAP) {
    g.over = true;
    blip("over", [
      [300, 0, 0.2, "sawtooth", 0.05, 120],
      [200, 0.2, 0.4, "sawtooth", 0.05, 60],
    ]);
  }
  for (const p of g.pops) p.t += dt;
  g.pops = g.pops.filter((p) => p.t < 1);
}

function sockAt(g: Game, x: number, y: number, except?: number): Sock | null {
  for (let i = g.socks.length - 1; i >= 0; i--) {
    const s = g.socks[i];
    if (s.id === except) continue;
    if (Math.hypot(s.x - x, s.y - y) < GRAB_R) return s;
  }
  return null;
}

function tryPair(g: Game, a: Sock, b: Sock): boolean {
  if (a.kind !== b.kind) {
    a.wobble = b.wobble = 0.35;
    g.combo = 1;
    g.pops.push({ x: b.x, y: b.y, text: "NOPE", color: "#ff4d6d", t: 0 });
    blip("nope", [[150, 0, 0.12, "square", 0.04]]);
    return false;
  }
  g.combo = g.time - g.lastMatch < 2 ? Math.min(5, g.combo + 1) : 1;
  g.lastMatch = g.time;
  const pts = 10 * g.combo;
  g.score += pts;
  g.pairs++;
  g.socks = g.socks.filter((s) => s !== a && s !== b);
  g.pops.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, text: g.combo > 1 ? `PAIR x${g.combo} +${pts}` : `PAIR +${pts}`, color: "#39ff88", t: 0 });
  blip("pair", [
    [660, 0, 0.07, "square", 0.035],
    [990, 0.06, 0.1, "square", 0.035],
  ]);
  return true;
}

function drawSock(cx: CanvasRenderingContext2D, s: Sock, kind: Kind, t: number, glow: boolean) {
  cx.save();
  cx.translate(s.x + (s.wobble ? Math.sin(t * 70) * 3 : 0), s.y);
  cx.rotate(s.rot);
  if (s.flip) cx.scale(-1, 1);
  const shape = () => {
    cx.beginPath();
    cx.moveTo(-10, -28);
    cx.lineTo(10, -28);
    cx.lineTo(10, 6);
    cx.lineTo(16, 6);
    cx.arc(16, 16, 10, -Math.PI / 2, Math.PI / 2);
    cx.lineTo(0, 26);
    cx.quadraticCurveTo(-10, 26, -10, 16);
    cx.closePath();
  };
  if (glow) {
    cx.shadowColor = "#ffffff";
    cx.shadowBlur = 16;
  }
  shape();
  cx.fillStyle = kind.color;
  cx.fill();
  cx.shadowBlur = 0;
  cx.save();
  shape();
  cx.clip();
  cx.fillStyle = "rgba(5,4,11,0.45)";
  if (kind.pattern === "stripes") for (let y = -22; y < 28; y += 9) cx.fillRect(-12, y, 36, 4);
  else if (kind.pattern === "dots")
    for (const [x, y] of [
      [-4, -18],
      [4, -8],
      [-4, 2],
      [4, 12],
      [14, 18],
    ]) {
      cx.beginPath();
      cx.arc(x, y, 2.6, 0, Math.PI * 2);
      cx.fill();
    }
  else if (kind.pattern === "toes") {
    cx.fillStyle = "#05040b";
    cx.globalAlpha = 0.6;
    cx.beginPath();
    cx.arc(20, 16, 9, 0, Math.PI * 2);
    cx.arc(-8, 20, 7, 0, Math.PI * 2);
    cx.fill();
    cx.globalAlpha = 1;
  }
  cx.restore();
  // cuff
  cx.fillStyle = "rgba(255,255,255,0.75)";
  cx.fillRect(-11, -30, 22, 6);
  cx.strokeStyle = glow ? "#ffffff" : "rgba(5,4,11,0.6)";
  cx.lineWidth = glow ? 2 : 1;
  shape();
  cx.stroke();
  cx.restore();
}

export function SockMatcher() {
  const [screen, setScreen] = useState<"title" | "play" | "over">("title");
  const [best, submitBest] = useBest("lab.socks.best");
  const [hud, setHud] = useState({ score: 0, pile: 0, combo: 1 });
  const [result, setResult] = useState<{ score: number; pairs: number; time: number; best: boolean } | null>(null);
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
        setResult({ score: g.score, pairs: g.pairs, time: g.time, best: submitBest(g.score) });
        setScreen("over");
      }
    }
    if (now - hudAt.current > 100) {
      hudAt.current = now;
      setHud({ score: g.score, pile: g.socks.filter((s) => s.landed).length, combo: g.combo });
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = ctx2d(canvas, W);
    const t = now / 1000;
    // laundry room
    cx.fillStyle = "#120d24";
    cx.fillRect(0, 0, W, H);
    cx.fillStyle = "#1a1433";
    for (let r = 0; PILE_TOP + r * 30 < H; r++)
      for (let x = r % 2 ? 0 : 30; x < W; x += 60) cx.fillRect(x, PILE_TOP + r * 30, 30, 30);
    // danger line glow when the pile is high
    const pile = g.socks.filter((s) => s.landed).length;
    if (pile >= CAP - 4) {
      cx.fillStyle = `rgba(255,77,109,${0.08 + 0.06 * Math.sin(t * 8)})`;
      cx.fillRect(0, PILE_TOP, W, H - PILE_TOP);
    }
    // washing machine
    const sx = g.shake ? Math.sin(t * 90) * 3 : Math.sin(t * 30) * 0.8;
    cx.save();
    cx.translate(sx, 0);
    cx.fillStyle = "#ece9ff";
    cx.fillRect(110, 8, 140, 150);
    cx.fillStyle = "#b9b4d9";
    cx.fillRect(110, 8, 140, 22);
    cx.fillStyle = "#22f3ff";
    cx.fillRect(122, 14, 30, 10);
    cx.fillStyle = "#ff2bd6";
    cx.beginPath();
    cx.arc(230, 19, 5, 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = "#2a2350";
    cx.beginPath();
    cx.arc(DOOR.x, DOOR.y + 18, 46, 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = "#22f3ff";
    cx.globalAlpha = 0.35;
    cx.beginPath();
    cx.arc(DOOR.x, DOOR.y + 18, 38, 0, Math.PI * 2);
    cx.fill();
    cx.globalAlpha = 1;
    // churning water
    cx.strokeStyle = "#ece9ff";
    cx.lineWidth = 2;
    cx.beginPath();
    cx.arc(DOOR.x, DOOR.y + 18, 24, t * 6, t * 6 + 2);
    cx.stroke();
    cx.restore();

    const sel = g.selected;
    // landed first, flying on top, dragged last
    const order = [...g.socks].sort((a, b) => Number(!a.landed) - Number(!b.landed) || Number(g.drag?.id === a.id) - Number(g.drag?.id === b.id));
    for (const s of order) drawSock(cx, s, g.kinds[s.kind], t, s.id === sel || s.id === g.drag?.id);

    cx.textAlign = "center";
    cx.font = PIXEL_FONT(10);
    for (const p of g.pops) {
      cx.globalAlpha = 1 - p.t;
      cx.fillStyle = "#05040b";
      cx.fillText(p.text, p.x + 1, p.y - 30 - p.t * 30 + 1);
      cx.fillStyle = p.color;
      cx.fillText(p.text, p.x, p.y - 30 - p.t * 30);
    }
    cx.globalAlpha = 1;
  });

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gameRef.current;
    if (!playing.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = toLogical(e, e.currentTarget, W, H);
    const s = sockAt(g, x, y);
    if (!s) {
      g.selected = null;
      return;
    }
    // bring to the top of the pile
    g.socks = [...g.socks.filter((o) => o !== s), s];
    g.drag = { id: s.id, dx: s.x - x, dy: s.y - y, sx: x, sy: y, moved: false };
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gameRef.current;
    if (!g.drag) return;
    const [x, y] = toLogical(e, e.currentTarget, W, H);
    const s = g.socks.find((o) => o.id === g.drag!.id);
    if (!s) return;
    if (Math.hypot(x - g.drag.sx, y - g.drag.sy) > 8) g.drag.moved = true;
    if (g.drag.moved) {
      s.x = Math.max(20, Math.min(W - 20, x + g.drag.dx));
      s.y = Math.max(PILE_TOP, Math.min(H - 20, y + g.drag.dy));
      s.landed = true;
    }
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gameRef.current;
    const d = g.drag;
    g.drag = null;
    if (!d || !playing.current) return;
    const s = g.socks.find((o) => o.id === d.id);
    if (!s) return;
    const [x, y] = toLogical(e, e.currentTarget, W, H);
    if (d.moved) {
      const other = sockAt(g, x, y, s.id);
      if (other) tryPair(g, s, other);
      g.selected = null;
      return;
    }
    // a tap: pick, then tap the twin
    const prev = g.socks.find((o) => o.id === g.selected);
    if (prev && prev !== s) {
      tryPair(g, prev, s);
      g.selected = null;
    } else g.selected = prev === s ? null : s.id;
  };

  return (
    <LabShell title="SOCK MATCHER" color="#ff2bd6">
      <div className="flex h-9 shrink-0 items-center justify-between px-3 font-pixel text-[8px]">
        <span className="text-dim">
          PILE <span className={hud.pile >= CAP - 4 ? "text-red blink" : "text-ink"}>{hud.pile}</span>/{CAP}
        </span>
        <span className="text-dim">
          COMBO <span className="text-green">x{hud.combo}</span>
        </span>
        <span className="text-pink">{hud.score}</span>
      </div>
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        <canvas ref={canvasRef} className="block touch-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => (gameRef.current.drag = null)} />
        {screen === "title" && (
          <TitleCard a="SOCK" b="MATCHER" colorA="#ff2bd6" colorB="#22f3ff" blurb="The washing machine won't stop spitting socks. Pair them up before the pile buries you." best={best} onPlay={start}>
            <p>Drag a sock onto its twin, or tap one and then the other. Twins share a colour and a pattern.</p>
            <p>More colours and patterns join over time, and later some shades get sneakily close.</p>
            <p>Quick pairs build a combo. More than {CAP} socks on the floor and you&apos;re buried.</p>
          </TitleCard>
        )}
        {screen === "over" && result && (
          <GameOverCard
            title="BURIED IN SOCKS"
            score={result.score}
            isBest={result.best}
            best={best}
            color="#ff2bd6"
            line={`You folded ${result.pairs} ${result.pairs === 1 ? "pair" : "pairs"} in ${Math.floor(result.time)} seconds.`}
            again={start}
          />
        )}
      </div>
    </LabShell>
  );
}
