"use client";

import { useCallback, useRef, useState } from "react";
import { blip, unlock } from "@/lib/lab/sound";
import { GameOverCard, LabShell, PIXEL_FONT, TitleCard, ctx2d, toLogical, useBest, useFitCanvas, useLoop } from "./LabShell";

// Escalator Panic: a mall with one up and one down escalator, and nobody
// knows how to use either. Some people freeze at the bottom, scared to step
// on. Others stop dead at the top to look at their phone while everyone
// behind them piles up. A kid keeps running up the down escalator. Tap to
// sort them out.

const W = 360;
const H = 600;
const TOP = 195;
const BOT = 545;
// up belt runs A→B, down belt runs D→E; they're parallel
const A: [number, number] = [100, BOT];
const B: [number, number] = [200, TOP];
const D: [number, number] = [330, TOP];
const E: [number, number] = [230, BOT];
const BELT = 0.17; // belt speed in belt-lengths per second
const GAP = 0.1; // closest two riders can stand
const TAP_R = 34;
const QMAX = 7;

type Kind = "normal" | "granny" | "phone" | "shopper";
const KINDS: Record<Kind, { emoji: string; confused: number; freeze: number; walk: number }> = {
  normal: { emoji: "🧑", confused: 0.25, freeze: 0.15, walk: 70 },
  granny: { emoji: "👵", confused: 1, freeze: 0.3, walk: 40 },
  phone: { emoji: "🤳", confused: 0.3, freeze: 0.9, walk: 60 },
  shopper: { emoji: "🛍️", confused: 0.4, freeze: 1, walk: 55 },
};

interface Person {
  id: number;
  kind: Kind;
  belt: "up" | "down";
  state: "queue" | "wait" | "ride" | "freeze" | "leave" | "tumble";
  u: number;
  x: number;
  y: number;
  wait: number; // seconds left before a non-confused person steps on
  confused: boolean;
  willFreeze: boolean;
  t: number;
}

interface Kid {
  u: number;
  t: number;
}

interface Game {
  time: number;
  people: Person[];
  kid: Kid | null;
  kidIn: number;
  spawnUp: number;
  spawnDown: number;
  nextId: number;
  lives: number;
  score: number;
  moved: number;
  pops: { x: number; y: number; text: string; color: string; t: number }[];
  shake: number;
  over: boolean;
}

function newGame(): Game {
  return { time: 0, people: [], kid: null, kidIn: 25, spawnUp: 0.5, spawnDown: 2, nextId: 1, lives: 3, score: 0, moved: 0, pops: [], shake: 0, over: false };
}

function onBelt(belt: "up" | "down", u: number): [number, number] {
  const [s, e] = belt === "up" ? [A, B] : [D, E];
  return [s[0] + (e[0] - s[0]) * u, s[1] + (e[1] - s[1]) * u - 14];
}

function queueSpot(belt: "up" | "down", i: number): [number, number] {
  return belt === "up" ? [A[0] - 24 - i * 22, BOT - 14] : [D[0] - 26 - i * 22, TOP - 14];
}

function pickKind(time: number): Kind {
  const r = Math.random();
  if (r < Math.min(0.25, 0.08 + time / 300)) return "granny";
  if (r < 0.45) return "phone";
  if (r < 0.55 + Math.min(0.15, time / 400)) return "shopper";
  return "normal";
}

function spawn(g: Game, belt: "up" | "down") {
  const kind = pickKind(g.time);
  const k = KINDS[kind];
  const [x, y] = belt === "up" ? [-20, BOT - 14] : [B[0] + 10, TOP - 14];
  g.people.push({ id: g.nextId++, kind, belt, state: "queue", u: 0, x, y, wait: 0.25 + Math.random() * 0.4, confused: Math.random() < k.confused + Math.min(0.25, g.time / 240), willFreeze: Math.random() < k.freeze + Math.min(0.3, g.time / 200), t: 0 });
}

function loseLife(g: Game, x: number, y: number, why: string) {
  g.lives--;
  g.shake = 0.4;
  g.pops.push({ x, y, text: why, color: "#ff4d6d", t: 0 });
  blip("pileup", [
    [200, 0, 0.15, "square", 0.06],
    [140, 0.12, 0.25, "square", 0.06],
  ]);
  if (g.lives <= 0) g.over = true;
}

function step(g: Game, dt: number) {
  g.time += dt;
  g.shake = Math.max(0, g.shake - dt);
  for (const p of g.pops) p.t += dt;
  g.pops = g.pops.filter((p) => p.t < 1.2);

  const rate = Math.max(1.1, 3.2 - g.time / 35);
  g.spawnUp -= dt;
  g.spawnDown -= dt;
  if (g.spawnUp <= 0) {
    spawn(g, "up");
    g.spawnUp = rate * (0.6 + Math.random() * 0.8);
  }
  if (g.spawnDown <= 0) {
    spawn(g, "down");
    g.spawnDown = rate * 1.15 * (0.6 + Math.random() * 0.8);
  }

  for (const belt of ["up", "down"] as const) {
    const exit = belt === "up" ? B : E;
    // riders, front of the belt first
    const riders = g.people.filter((p) => p.belt === belt && (p.state === "ride" || p.state === "freeze")).sort((a, b) => b.u - a.u);
    let limit = 1;
    let stuck = 0;
    const blocked = riders.some((p) => p.state === "freeze");
    for (const p of riders) {
      if (p.state === "freeze") {
        p.t += dt;
        limit = p.u - GAP;
        continue;
      }
      const nu = p.u + BELT * dt;
      if (nu >= limit && limit < 1) {
        p.u = Math.max(p.u, limit);
        stuck++;
      } else p.u = Math.min(nu, 1);
      if (p.u >= 1) {
        if (p.willFreeze) {
          p.state = "freeze";
          p.t = 0;
          blip("ding", [[1400, 0, 0.05, "sine", 0.03]]);
        } else p.state = "leave";
      }
      limit = p.u - GAP;
      [p.x, p.y] = onBelt(belt, p.u);
    }
    // three people jammed up behind someone frozen at the exit all go flying
    if (blocked && stuck >= 3) {
      for (const p of riders) {
        p.state = "tumble";
        p.t = 0;
      }
      loseLife(g, exit[0], exit[1] - 40, "PILE-UP!");
    }

    // the queue walks up to the entry; the one at the front decides whether to step on
    const queue = g.people.filter((p) => p.belt === belt && (p.state === "queue" || p.state === "wait"));
    const last = riders.length ? Math.min(...riders.map((r) => r.u)) : 1;
    queue.forEach((p, i) => {
      const [qx, qy] = queueSpot(belt, i);
      const k = KINDS[p.kind];
      const dx = qx - p.x;
      p.x += Math.sign(dx) * Math.min(Math.abs(dx), k.walk * dt);
      p.y = qy;
      if (i === 0 && Math.abs(dx) < 2) {
        p.state = "wait";
        p.t += dt;
        if (!p.confused) p.wait -= dt;
        if (p.wait <= 0 && last > GAP) {
          p.state = "ride";
          p.u = 0;
        }
      }
    });
    if (queue.length > QMAX) {
      // the back of the line gives up and storms off to the stairs
      for (const p of queue.slice(3)) p.state = "tumble";
      const [qx, qy] = queueSpot(belt, 2);
      loseLife(g, Math.max(60, qx), qy - 30, "TAKING THE STAIRS!");
    }
  }

  for (const p of g.people) {
    if (p.state === "leave") {
      const k = KINDS[p.kind];
      p.x += (p.belt === "up" ? -1 : 1) * k.walk * 1.3 * dt;
      if (p.x < -30 || p.x > W + 30) {
        p.state = "tumble";
        p.t = 99;
        g.moved++;
        g.score += 10;
      }
    } else if (p.state === "tumble") p.t += dt;
  }
  g.people = g.people.filter((p) => !(p.state === "tumble" && p.t > 1));

  // the kid who runs up the down escalator
  g.kidIn -= dt;
  if (!g.kid && g.kidIn <= 0) {
    g.kid = { u: 1, t: 0 };
    blip("kid", [
      [880, 0, 0.08, "square", 0.03],
      [1100, 0.1, 0.08, "square", 0.03],
    ]);
  }
  if (g.kid) {
    const kid = g.kid;
    kid.t += dt;
    kid.u -= dt * 0.12;
    const hit = kid.t > 1.2 && g.people.find((p) => p.belt === "down" && p.state === "ride" && Math.abs(p.u - kid.u) < 0.06);
    if (hit || kid.u <= 0) {
      for (const p of g.people) if (p.belt === "down" && p.state === "ride") (p.state = "tumble"), (p.t = 0);
      const [x, y] = onBelt("down", Math.max(0, kid.u));
      g.kid = null;
      g.kidIn = 12 + Math.random() * 10;
      loseLife(g, x, y - 30, "KID CRASH!");
    }
  }
}

function tap(g: Game, x: number, y: number) {
  if (g.kid) {
    const [kx, ky] = onBelt("down", g.kid.u);
    if (Math.hypot(kx - x, ky - y) < TAP_R) {
      g.kid = null;
      g.kidIn = 10 + Math.random() * 12;
      g.score += 25;
      g.pops.push({ x: kx, y: ky - 20, text: "GOT HIM +25", color: "#39ff88", t: 0 });
      blip("caught", [[660, 0, 0.1, "square", 0.04]]);
      return;
    }
  }
  let best: Person | null = null, bd = TAP_R;
  for (const p of g.people) {
    if (p.state !== "wait" && p.state !== "freeze") continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bd) (bd = d), (best = p);
  }
  if (!best) return;
  if (best.state === "freeze") {
    best.state = "leave";
    g.score += 5;
    g.pops.push({ x: best.x, y: best.y - 26, text: "MOVE IT!", color: "#22f3ff", t: 0 });
    blip("nudge", [[520, 0, 0.06, "square", 0.04]]);
  } else {
    const riders = g.people.filter((p) => p.belt === best!.belt && (p.state === "ride" || p.state === "freeze"));
    if (riders.some((r) => r.u < GAP)) return;
    best.state = "ride";
    best.u = 0;
    g.pops.push({ x: best.x, y: best.y - 26, text: "STEP!", color: "#ffe14d", t: 0 });
    blip("step", [[740, 0, 0.05, "square", 0.04]]);
  }
}

function drawBelt(cx: CanvasRenderingContext2D, s: [number, number], e: [number, number], dir: number, t: number, color: string) {
  const len = Math.hypot(e[0] - s[0], e[1] - s[1]);
  const ux = (e[0] - s[0]) / len, uy = (e[1] - s[1]) / len;
  cx.strokeStyle = "#1a1438";
  cx.lineWidth = 34;
  cx.lineCap = "round";
  cx.beginPath();
  cx.moveTo(s[0], s[1]);
  cx.lineTo(e[0], e[1]);
  cx.stroke();
  cx.strokeStyle = color;
  cx.lineWidth = 3;
  cx.beginPath();
  cx.moveTo(s[0] - uy * 17, s[1] + ux * 17);
  cx.lineTo(e[0] - uy * 17, e[1] + ux * 17);
  cx.stroke();
  // steps sliding along
  cx.strokeStyle = "#6b5aa8";
  cx.lineWidth = 2;
  const off = ((t * BELT * len * dir) % 18 + 18) % 18;
  for (let d = off; d < len; d += 18) {
    const x = s[0] + ux * d, y = s[1] + uy * d;
    cx.beginPath();
    cx.moveTo(x - 12, y - 4);
    cx.lineTo(x + 12, y - 4);
    cx.stroke();
  }
}

export function EscalatorPanic() {
  const [screen, setScreen] = useState<"title" | "play" | "over">("title");
  const [best, submitBest] = useBest("lab.escalator.best");
  const [hud, setHud] = useState({ score: 0, lives: 3, moved: 0 });
  const [result, setResult] = useState<{ score: number; moved: number; time: number; best: boolean } | null>(null);
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
        setResult({ score: g.score, moved: g.moved, time: g.time, best: submitBest(g.score) });
        setScreen("over");
      }
    }
    if (now - hudAt.current > 100) {
      hudAt.current = now;
      setHud({ score: g.score, lives: g.lives, moved: g.moved });
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = ctx2d(canvas, W);
    const t = now / 1000;
    cx.save();
    if (g.shake) cx.translate(Math.sin(t * 90) * 4 * g.shake, 0);

    // mall: shop fronts upstairs and downstairs, two floors
    cx.fillStyle = "#14102c";
    cx.fillRect(-10, 0, W + 20, H);
    const shops = ["#ff2bd6", "#22f3ff", "#ffe14d", "#39ff88", "#ff8a3d"];
    for (let i = 0; i < 5; i++) {
      cx.fillStyle = shops[i];
      cx.globalAlpha = 0.18;
      cx.fillRect(i * 74, 70, 70, TOP - 80);
      cx.fillRect(i * 74, 400, 70, BOT - 410);
      cx.globalAlpha = 0.8;
      cx.fillRect(i * 74 + 6, 74, 58, 10);
      cx.fillRect(i * 74 + 6, 404, 58, 10);
    }
    cx.globalAlpha = 1;
    cx.fillStyle = "#3a3566";
    cx.fillRect(-10, TOP, W + 20, 14);
    cx.fillRect(-10, BOT, W + 20, H - BOT);
    cx.font = PIXEL_FONT(7);
    cx.fillStyle = "#b9b4d9";
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    cx.fillText("FLOOR 1", 40, TOP + 26);
    cx.fillText("GROUND", 40, BOT + 26);

    drawBelt(cx, A, B, 1, t, "#39ff88");
    drawBelt(cx, D, E, 1, t, "#ff4d6d");
    cx.font = PIXEL_FONT(8);
    cx.fillStyle = "#39ff88";
    cx.fillText("▲ UP", (A[0] + B[0]) / 2 - 34, (A[1] + B[1]) / 2);
    cx.fillStyle = "#ff4d6d";
    cx.fillText("▼ DOWN", (D[0] + E[0]) / 2 + 40, (D[1] + E[1]) / 2);

    for (const p of g.people) {
      const k = KINDS[p.kind];
      cx.save();
      cx.translate(p.x, p.y);
      if (p.state === "tumble") {
        cx.globalAlpha = Math.max(0, 1 - p.t);
        cx.rotate(p.t * 8);
        cx.translate(0, p.t * 30);
      }
      if (p.state === "wait" && p.confused) cx.translate(Math.sin(t * 14 + p.id) * 2, 0);
      if (p.belt === "up" && (p.state === "leave" || p.state === "queue")) cx.scale(p.state === "leave" ? -1 : 1, 1);
      cx.font = "26px sans-serif";
      cx.fillText(k.emoji, 0, 0);
      cx.restore();
      cx.font = PIXEL_FONT(10);
      if (p.state === "wait" && p.confused) {
        cx.fillStyle = Math.floor(t * 4) % 2 ? "#ffe14d" : "#ff8a3d";
        cx.fillText("?", p.x + 12, p.y - 22);
      }
      if (p.state === "freeze") {
        cx.fillStyle = p.t > 2 ? "#ff4d6d" : "#22f3ff";
        cx.fillText(p.kind === "phone" ? "📱" : p.kind === "shopper" ? "👀" : "…", p.x + 14, p.y - 22);
      }
    }
    if (g.kid) {
      const [x, y] = onBelt("down", g.kid.u);
      cx.font = "22px sans-serif";
      cx.fillText("🧒", x + Math.sin(t * 20) * 2, y + 2);
      cx.font = PIXEL_FONT(7);
      cx.fillStyle = "#ff4d6d";
      cx.fillText("WRONG WAY!", x, y - 22);
    }
    // queue warnings
    for (const belt of ["up", "down"] as const) {
      const n = g.people.filter((p) => p.belt === belt && (p.state === "queue" || p.state === "wait")).length;
      if (n >= QMAX - 2) {
        cx.font = PIXEL_FONT(7);
        cx.fillStyle = Math.floor(t * 6) % 2 ? "#ff4d6d" : "#ffe14d";
        const [qx, qy] = queueSpot(belt, 0);
        cx.fillText(`LINE ${n}/${QMAX}`, Math.max(40, qx - 20), qy - 36);
      }
    }

    cx.font = PIXEL_FONT(10);
    for (const p of g.pops) {
      cx.globalAlpha = Math.max(0, 1 - p.t / 1.2);
      cx.fillStyle = "#05040b";
      cx.fillText(p.text, Math.max(70, Math.min(W - 70, p.x)) + 1, p.y - p.t * 24 + 1);
      cx.fillStyle = p.color;
      cx.fillText(p.text, Math.max(70, Math.min(W - 70, p.x)), p.y - p.t * 24);
    }
    cx.globalAlpha = 1;
    cx.restore();
  });

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!playing.current) return;
    e.preventDefault();
    const [x, y] = toLogical(e, e.currentTarget, W, H);
    tap(gameRef.current, x, y);
  };

  return (
    <LabShell title="ESCALATOR PANIC" color="#39ff88">
      <div className="flex h-9 shrink-0 items-center justify-between px-3 font-pixel text-[8px]">
        <span className="text-dim">
          MOVED <span className="text-ink">{hud.moved}</span>
        </span>
        <span>{"🚨".repeat(3 - Math.max(0, hud.lives))}<span className="opacity-30">{"🚨".repeat(Math.max(0, hud.lives))}</span></span>
        <span className="text-green">{hud.score}</span>
      </div>
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        <canvas ref={canvasRef} className="block touch-none" onPointerDown={onDown} />
        {screen === "title" && (
          <TitleCard a="ESCALATOR" b="PANIC" colorA="#39ff88" colorB="#ff4d6d" blurb="Sale day at the mall. Nobody remembers how escalators work." best={best} onPlay={start}>
            <p>People with a ❓ are scared to step on. Tap them when there&apos;s room.</p>
            <p>Some stop dead at the top or bottom to check their phone. Tap them to move along before three people pile up behind them.</p>
            <p>Don&apos;t let a line grow past {QMAX}, and catch the 🧒 kid running up the down escalator. Three disasters and the mall shuts it off.</p>
          </TitleCard>
        )}
        {screen === "over" && result && (
          <GameOverCard title="ESCALATOR SHUT" score={result.score} isBest={result.best} best={best} color="#39ff88" line={`You moved ${result.moved} shoppers in ${Math.floor(result.time)} seconds before security switched it off.`} again={start} />
        )}
      </div>
    </LabShell>
  );
}
