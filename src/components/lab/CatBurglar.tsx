"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { blip, tone, unlock } from "@/lib/lab/sound";
import { GameOverCard, LabShell, PIXEL_FONT, TitleCard, ctx2d, useBest, useFitCanvas, useLoop } from "./LabShell";

// Cat Burglar: you are the cat. Hold to slowly paw the next thing off the
// shelf; let go to sit there looking innocent. The owner is on their phone,
// but they glance up now and then (a "?" warns you first, and later on the
// "?" sometimes lies). Get caught pawing three times and you're shut out on
// the balcony. Every crash makes the owner look up sooner.

const W = 360;
const H = 600;
const SHELF_X0 = 30;
const EDGE = 300;
const SHELF_Y = [150, 250, 350];
const FLOOR = 572;
const PUSH_SPEED = 95;
const OWNER = { x: 120, y: 488 };

const THINGS: [string, number][] = [
  ["☕", 10],
  ["🪴", 15],
  ["🕯️", 10],
  ["📚", 15],
  ["⏰", 20],
  ["🧸", 15],
  ["🏺", 40],
  ["🍶", 25],
  ["👓", 30],
  ["📱", 50],
  ["🏆", 45],
  ["🎂", 35],
];

interface Thing {
  icon: string;
  pts: number;
  x: number;
  y: number;
  shelf: number;
  vy: number;
  rot: number;
  state: "shelf" | "fall" | "gone";
}
interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  c: string;
}
interface Pop {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
}

interface Game {
  level: number;
  things: Thing[];
  shelf: number;
  catX: number;
  catY: number;
  jumpT: number; // >0 while hopping down a shelf
  pushing: boolean;
  owner: "busy" | "tell" | "look" | "angry";
  ownerT: number;
  fake: boolean;
  lives: number;
  score: number;
  knocked: number;
  bits: Bit[];
  pops: Pop[];
  shake: number;
  over: boolean;
  banner: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function fillShelves(g: Game) {
  g.things = [];
  const per = Math.min(4, 3 + Math.floor(g.level / 3));
  const pool = THINGS.slice(0, Math.min(THINGS.length, 6 + g.level * 2));
  SHELF_Y.forEach((y, s) => {
    for (let i = 0; i < per; i++) {
      const [icon, pts] = pool[Math.floor(Math.random() * pool.length)];
      g.things.push({ icon, pts: pts + g.level * 5, x: EDGE - 28 - i * 60, y, shelf: s, vy: 0, rot: 0, state: "shelf" });
    }
  });
  g.shelf = 0;
  g.catX = SHELF_X0 + 6;
  g.catY = SHELF_Y[0];
  g.banner = 1.6;
}

function newGame(): Game {
  const g = { level: 0, things: [], shelf: 0, catX: 0, catY: 0, jumpT: 0, pushing: false, owner: "busy", ownerT: 2.5, fake: false, lives: 3, score: 0, knocked: 0, bits: [], pops: [], shake: 0, over: false, banner: 0 } as Game;
  fillShelves(g);
  return g;
}

/** The thing the cat goes for next: the one on its shelf nearest the edge. */
function target(g: Game): Thing | null {
  let best: Thing | null = null;
  for (const t of g.things) if (t.state === "shelf" && t.shelf === g.shelf && (!best || t.x > best.x)) best = t;
  return best;
}

function busyFor(g: Game) {
  return rnd(1.3, 3.6) * Math.max(0.5, 1 - g.level * 0.07);
}

function stepOwner(g: Game, dt: number) {
  g.ownerT -= dt;
  if (g.owner === "look" && g.pushing) {
    // caught red-pawed
    g.lives--;
    g.owner = "angry";
    g.ownerT = 1.4;
    g.shake = 0.4;
    g.pops.push({ x: OWNER.x, y: OWNER.y - 70, text: "BAD CAT!", color: "#ff4d6d", t: 0 });
    blip("caught", [
      [400, 0, 0.15, "sawtooth", 0.05],
      [300, 0.15, 0.3, "sawtooth", 0.05, 150],
    ]);
    if (g.lives <= 0) g.over = true;
    return;
  }
  if (g.ownerT > 0) return;
  switch (g.owner) {
    case "busy":
      g.owner = "tell";
      g.fake = Math.random() < Math.min(0.4, g.level * 0.07);
      g.ownerT = Math.max(0.3, 0.75 - g.level * 0.05);
      tone(880, 0, 0.08, "square", 0.03);
      break;
    case "tell":
      if (g.fake) {
        g.owner = "busy";
        g.ownerT = busyFor(g);
      } else {
        g.owner = "look";
        g.ownerT = rnd(0.9, 1.7);
      }
      break;
    case "look":
      // looked and saw nothing but a sweet cat
      g.score += 5;
      g.pops.push({ x: g.catX + 20, y: g.catY - 44, text: "+5 INNOCENT", color: "#22f3ff", t: 0 });
      g.owner = "busy";
      g.ownerT = busyFor(g);
      break;
    case "angry":
      g.owner = "busy";
      g.ownerT = busyFor(g) + 0.5;
      break;
  }
}

function step(g: Game, dt: number, holding: boolean) {
  g.shake = Math.max(0, g.shake - dt);
  g.banner = Math.max(0, g.banner - dt);
  for (const p of g.pops) p.t += dt;
  g.pops = g.pops.filter((p) => p.t < 1.1);
  for (const b of g.bits) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.vy += 700 * dt;
    if (b.y > FLOOR) (b.y = FLOOR), (b.vy *= -0.3), (b.vx *= 0.6);
    b.life -= dt;
  }
  g.bits = g.bits.filter((b) => b.life > 0);

  // falling things
  for (const t of g.things) {
    if (t.state !== "fall") continue;
    t.vy += 900 * dt;
    t.y += t.vy * dt;
    t.x += 40 * dt;
    t.rot += dt * 6;
    if (t.y >= FLOOR - 10) {
      t.state = "gone";
      g.score += t.pts;
      g.knocked++;
      g.shake = 0.2;
      g.pops.push({ x: Math.min(W - 40, t.x), y: FLOOR - 40, text: `+${t.pts}`, color: "#39ff88", t: 0 });
      const cs = ["#ece9ff", "#ffe14d", "#ff8a3d", "#22f3ff"];
      for (let i = 0; i < 12; i++) g.bits.push({ x: t.x, y: FLOOR - 4, vx: rnd(-160, 120), vy: rnd(-300, -80), life: rnd(0.5, 1), c: cs[i % 4] });
      blip("crash", [
        [1200, 0, 0.05, "square", 0.04, 300],
        [700, 0.04, 0.08, "sawtooth", 0.04, 100],
        [1800, 0.08, 0.06, "square", 0.03, 600],
      ]);
      // the noise makes the owner look up soon
      if (g.owner === "busy") g.ownerT = Math.min(g.ownerT, rnd(0.25, 0.8));
    }
  }

  stepOwner(g, dt);
  if (g.over) return;

  // the cat
  g.pushing = false;
  if (g.owner === "angry") return;
  if (g.jumpT > 0) {
    g.jumpT -= dt;
    const p = 1 - Math.max(0, g.jumpT) / 0.45;
    g.catY = SHELF_Y[g.shelf - 1] + (SHELF_Y[g.shelf] - SHELF_Y[g.shelf - 1]) * p - Math.sin(p * Math.PI) * 30;
    g.catX = EDGE - 40 + (SHELF_X0 + 6 - (EDGE - 40)) * p;
    if (g.jumpT <= 0) g.catY = SHELF_Y[g.shelf];
    return;
  }
  const tgt = target(g);
  if (!tgt) {
    if (g.things.some((t) => t.state === "fall")) return;
    if (g.shelf < SHELF_Y.length - 1) {
      g.shelf++;
      g.jumpT = 0.45;
    } else {
      g.level++;
      g.score += 50;
      g.pops.push({ x: W / 2, y: 90, text: "SHELVES CLEARED +50", color: "#ffe14d", t: 0 });
      fillShelves(g);
    }
    return;
  }
  const want = tgt.x - 32;
  if (g.catX < want - 1) {
    // trot over to it (not suspicious)
    g.catX = Math.min(want, g.catX + 140 * dt);
    return;
  }
  if (holding) {
    g.pushing = true;
    tgt.x += PUSH_SPEED * dt;
    g.catX = tgt.x - 32;
    if (tgt.x > EDGE + 6) {
      tgt.state = "fall";
      tgt.vy = 0;
    }
  }
}

function draw(cx: CanvasRenderingContext2D, g: Game, t: number, playing: boolean, holding: boolean) {
  const sx = g.shake > 0 ? Math.sin(t * 90) * g.shake * 8 : 0;
  cx.save();
  cx.translate(sx, 0);
  cx.fillStyle = "#1b1533";
  cx.fillRect(-12, 0, W + 24, H);
  // wallpaper dots
  cx.fillStyle = "#221a3d";
  for (let y = 20; y < FLOOR; y += 40) for (let x = (y / 40) % 2 ? 20 : 0; x < W; x += 40) cx.fillRect(x, y, 4, 4);
  // floor
  cx.fillStyle = "#3a2a4a";
  cx.fillRect(-12, FLOOR, W + 24, H - FLOOR);
  cx.textAlign = "center";
  cx.textBaseline = "middle";

  // owner's gaze (drawn under the shelves' contents)
  if (g.owner === "look" || g.owner === "angry") {
    cx.fillStyle = g.owner === "angry" ? "rgba(255,77,109,0.18)" : "rgba(255,225,77,0.13)";
    cx.beginPath();
    cx.moveTo(OWNER.x + 8, OWNER.y - 52);
    cx.lineTo(SHELF_X0 - 10, 90);
    cx.lineTo(EDGE + 40, 90);
    cx.closePath();
    cx.fill();
  }

  // shelves
  for (const y of SHELF_Y) {
    cx.fillStyle = "#8a5a3a";
    cx.fillRect(SHELF_X0, y + 18, EDGE - SHELF_X0, 10);
    cx.fillStyle = "#5e3a24";
    cx.fillRect(SHELF_X0 + 14, y + 28, 8, 14);
    cx.fillRect(EDGE - 22, y + 28, 8, 14);
  }
  // things
  cx.font = "30px sans-serif";
  for (const th of g.things) {
    if (th.state === "gone") continue;
    cx.save();
    // teeter as it nears the edge
    const tip = th.state === "shelf" && th.x > EDGE - 14 ? Math.sin(t * 30) * 0.15 : 0;
    cx.translate(th.x, th.y);
    cx.rotate(th.rot + tip);
    cx.fillText(th.icon, 0, 0);
    cx.restore();
  }

  // the cat (emoji faces left, so mirror it to face the edge)
  cx.save();
  const bob = g.pushing ? Math.sin(t * 22) * 2 : 0;
  cx.translate(g.catX, g.catY + 2 + bob);
  cx.scale(-1, 1);
  cx.font = "38px sans-serif";
  cx.fillText("🐈", 0, 0);
  cx.restore();
  if (g.pushing) {
    // the paw
    cx.fillStyle = "#ece9ff";
    cx.beginPath();
    cx.arc(g.catX + 20 + Math.sin(t * 22) * 3, g.catY + 4, 5, 0, Math.PI * 2);
    cx.fill();
  } else if (playing && g.owner !== "angry" && g.jumpT <= 0 && target(g) && g.catX >= target(g)!.x - 33) {
    cx.font = PIXEL_FONT(6);
    cx.fillStyle = "#8f89b8";
    cx.fillText("~innocent~", g.catX, g.catY - 26);
  }

  // sofa and owner
  cx.fillStyle = "#6b2d5c";
  cx.beginPath();
  cx.roundRect(20, OWNER.y - 10, 210, 70, 14);
  cx.fill();
  cx.fillStyle = "#4e1f44";
  cx.fillRect(20, OWNER.y + 34, 210, 26);
  // body
  cx.fillStyle = "#22f3ff";
  cx.beginPath();
  cx.roundRect(OWNER.x - 34, OWNER.y - 26, 68, 64, 18);
  cx.fill();
  // head
  const hx = OWNER.x, hy = OWNER.y - 58;
  const down = g.owner === "busy";
  cx.fillStyle = "#c98448";
  cx.beginPath();
  cx.arc(hx, hy + (down ? 4 : 0), 26, 0, Math.PI * 2);
  cx.fill();
  cx.fillStyle = "#1a1220";
  cx.beginPath();
  cx.arc(hx, hy - 6 + (down ? 4 : 0), 26, Math.PI * 1.05, Math.PI * 1.95);
  cx.fill();
  // eyes
  cx.fillStyle = "#05040b";
  for (const ex of [-9, 9]) {
    if (down) cx.fillRect(hx + ex - 5, hy + 8, 10, 3);
    else {
      const look = g.owner === "look" || g.owner === "angry";
      cx.fillStyle = "#ece9ff";
      cx.beginPath();
      cx.arc(hx + ex, hy + 2, 6, 0, Math.PI * 2);
      cx.fill();
      cx.fillStyle = "#05040b";
      cx.beginPath();
      cx.arc(hx + ex + (look ? 2 : 0), hy + (look ? -1 : 2), 3, 0, Math.PI * 2);
      cx.fill();
    }
  }
  if (g.owner === "angry") {
    cx.strokeStyle = "#05040b";
    cx.lineWidth = 3;
    cx.beginPath();
    cx.moveTo(hx - 15, hy - 10);
    cx.lineTo(hx - 4, hy - 5);
    cx.moveTo(hx + 15, hy - 10);
    cx.lineTo(hx + 4, hy - 5);
    cx.stroke();
  }
  // phone glow
  if (down) {
    cx.fillStyle = "#22f3ff";
    cx.globalAlpha = 0.25 + Math.sin(t * 3) * 0.05;
    cx.beginPath();
    cx.arc(hx, hy + 40, 22, 0, Math.PI * 2);
    cx.fill();
    cx.globalAlpha = 1;
    cx.fillStyle = "#05040b";
    cx.fillRect(hx - 9, hy + 30, 18, 26);
    cx.fillStyle = "#22f3ff";
    cx.fillRect(hx - 7, hy + 33, 14, 20);
  }
  if (g.owner === "tell") {
    cx.font = PIXEL_FONT(18);
    cx.fillStyle = "#ffe14d";
    cx.fillText("?", hx + 34, hy - 26 + Math.sin(t * 20) * 2);
  }
  if (g.owner === "look") {
    cx.font = "22px sans-serif";
    cx.fillText("👀", hx + 44, hy - 24);
  }
  cx.restore();
  cx.textAlign = "center";
  cx.textBaseline = "middle";

  for (const b of g.bits) {
    cx.fillStyle = b.c;
    cx.fillRect(b.x - 2, b.y - 2, 4, 4);
  }
  cx.font = PIXEL_FONT(10);
  for (const p of g.pops) {
    cx.globalAlpha = 1 - p.t / 1.1;
    cx.fillStyle = p.color;
    cx.fillText(p.text, p.x, p.y - p.t * 30);
  }
  cx.globalAlpha = 1;

  if (playing && g.banner > 0) {
    cx.fillStyle = "rgba(5,4,11,0.8)";
    cx.fillRect(0, 40, W, 50);
    cx.font = PIXEL_FONT(12);
    cx.fillStyle = "#ffe14d";
    cx.fillText(`SHELF SET ${g.level + 1}`, W / 2, 65);
  }
  // hold hint
  cx.font = PIXEL_FONT(7);
  cx.fillStyle = holding ? "#ff8a3d" : "#8f89b8";
  cx.fillText(holding ? "PAWING..." : "HOLD TO PAW · LET GO TO LOOK CUTE", W / 2, H - 12);
}

export function CatBurglar() {
  const [screen, setScreen] = useState<"title" | "play" | "over">("title");
  const [best, submitBest] = useBest("lab.catburglar.best");
  const [hud, setHud] = useState({ score: 0, lives: 3, knocked: 0 });
  const [result, setResult] = useState<{ score: number; knocked: number; best: boolean } | null>(null);
  const { wrapRef, canvasRef } = useFitCanvas(W, H);
  const gameRef = useRef<Game>(newGame());
  const playing = useRef(false);
  const holding = useRef(false);
  const hudAt = useRef(0);

  const start = useCallback(() => {
    unlock();
    gameRef.current = newGame();
    holding.current = false;
    playing.current = true;
    setScreen("play");
  }, []);

  useEffect(() => {
    const d = (e: KeyboardEvent) => {
      if (e.key === " " && playing.current) {
        e.preventDefault();
        holding.current = true;
      }
    };
    const u = (e: KeyboardEvent) => {
      if (e.key === " ") holding.current = false;
    };
    window.addEventListener("keydown", d);
    window.addEventListener("keyup", u);
    return () => {
      window.removeEventListener("keydown", d);
      window.removeEventListener("keyup", u);
    };
  }, []);

  useLoop((dt, now) => {
    const g = gameRef.current;
    if (playing.current) {
      step(g, dt, holding.current);
      if (g.over) {
        playing.current = false;
        holding.current = false;
        setResult({ score: g.score, knocked: g.knocked, best: submitBest(g.score) });
        setScreen("over");
      }
    }
    if (now - hudAt.current > 120) {
      hudAt.current = now;
      setHud({ score: g.score, lives: g.lives, knocked: g.knocked });
    }
    const canvas = canvasRef.current;
    if (canvas) draw(ctx2d(canvas, W), g, now / 1000, playing.current, holding.current && playing.current);
  });

  const press = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!playing.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    holding.current = true;
  };
  const release = () => (holding.current = false);

  return (
    <LabShell title="CAT BURGLAR" color="#ff8a3d">
      <div className="flex h-9 shrink-0 items-center justify-between px-3 font-pixel text-[8px]">
        <span className="text-dim">
          SMASHED <span className="text-ink">{hud.knocked}</span>
        </span>
        <span>{"🐟".repeat(Math.max(0, hud.lives))}</span>
        <span className="text-yellow">{hud.score}</span>
      </div>
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        <canvas ref={canvasRef} className="block touch-none" onPointerDown={press} onPointerUp={release} onPointerCancel={release} onContextMenu={(e) => e.preventDefault()} />
        {screen === "title" && (
          <TitleCard a="CAT" b="BURGLAR" colorA="#ff8a3d" colorB="#ffe14d" blurb="Everything on that shelf belongs on the floor." best={best} onPlay={start}>
            <p>You are the cat. Hold anywhere to slowly paw the next thing toward the edge. Let go and you just sit there, looking adorable.</p>
            <p>The human is on their phone, but a yellow ? means they are about to look up. If they look while you&apos;re pawing, that&apos;s BAD CAT. Three of those and you&apos;re locked on the balcony.</p>
            <p>Every crash makes them look up sooner. Later on, some ?s are false alarms. On a keyboard, hold space.</p>
          </TitleCard>
        )}
        {screen === "over" && result && (
          <GameOverCard
            title="ON THE BALCONY"
            score={result.score}
            isBest={result.best}
            best={best}
            color="#ff8a3d"
            line={`You sent ${result.knocked} ${result.knocked === 1 ? "thing" : "things"} to the floor. No regrets.`}
            again={start}
          />
        )}
      </div>
    </LabShell>
  );
}
