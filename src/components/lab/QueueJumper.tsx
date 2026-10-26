"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { blip, unlock } from "@/lib/lab/sound";
import { GameOverCard, LabShell, PIXEL_FONT, TitleCard, ctx2d, useBest, useFitCanvas, useLoop } from "./LabShell";

// Queue Jumper: a long ticket queue. Hold to squeeze past the person ahead of
// you. The aunty behind you looks up from her phone now and then, and the
// person ahead glances back. Get caught mid-squeeze three times and you're
// marched to the back. Reach the counter before it closes.

const W = 360;
const H = 600;
const GAP = 58;
const ME_Y = 360;
const STRIKES = 3;

const PEOPLE = [
  { emoji: "🧑", squeeze: 1 },
  { emoji: "👨", squeeze: 1 },
  { emoji: "👩", squeeze: 0.9 },
  { emoji: "👴", squeeze: 0.7 },
  { emoji: "🧔", squeeze: 1.6 },
  { emoji: "👨‍🦲", squeeze: 1.2 },
  { emoji: "👩‍🦱", squeeze: 0.9 },
  { emoji: "🧕", squeeze: 1 },
];

type Look = "away" | "tell" | "watch";

interface Watcher {
  look: Look;
  t: number;
}

interface Game {
  round: number;
  queue: number[]; // people ahead of you, front first
  pos: number; // shown position, eases to queue length
  squeeze: number;
  holding: boolean;
  aunty: Watcher;
  ahead: Watcher;
  counterIn: number;
  time: number;
  total: number;
  strikes: number;
  score: number;
  jumped: number;
  flash: number;
  phase: "intro" | "play" | "won" | "closed";
  phaseT: number;
  pops: { y: number; text: string; color: string; t: number }[];
  over: boolean;
}

function startRound(g: Game) {
  const n = 7 + g.round * 3;
  g.queue = Array.from({ length: n }, () => Math.floor(Math.random() * PEOPLE.length));
  g.pos = n;
  g.squeeze = 0;
  g.aunty = { look: "away", t: 2.5 };
  g.ahead = { look: "away", t: 4 };
  g.counterIn = 4;
  g.total = 40 + g.round * 6;
  g.time = g.total;
  g.phase = "intro";
  g.phaseT = 1.3;
}

function newGame(): Game {
  const g: Game = {
    round: 1,
    queue: [],
    pos: 0,
    squeeze: 0,
    holding: false,
    aunty: { look: "away", t: 0 },
    ahead: { look: "away", t: 0 },
    counterIn: 0,
    time: 0,
    total: 0,
    strikes: 0,
    score: 0,
    jumped: 0,
    flash: 0,
    phase: "intro",
    phaseT: 0,
    pops: [],
    over: false,
  };
  startRound(g);
  return g;
}

/** Aunty's habits: long phone sessions, a short tell, then a hard stare. Sharper each round. */
function tickWatcher(w: Watcher, dt: number, round: number, who: "aunty" | "ahead") {
  w.t -= dt;
  if (w.t > 0) return;
  const sharp = Math.min(1, (round - 1) / 5);
  if (w.look === "away") {
    w.look = "tell";
    w.t = (who === "aunty" ? 0.75 : 0.6) - sharp * 0.35;
  } else if (w.look === "tell") {
    w.look = "watch";
    w.t = (who === "aunty" ? 1.2 : 0.8) + Math.random() * 0.8;
  } else {
    w.look = "away";
    w.t = who === "aunty" ? 1.4 + Math.random() * (3.2 - sharp * 1.4) : 2.5 + Math.random() * (4.5 - sharp * 2);
  }
}

function step(g: Game, dt: number) {
  for (const p of g.pops) p.t += dt;
  g.pops = g.pops.filter((p) => p.t < 1.2);
  g.flash = Math.max(0, g.flash - dt);
  g.pos += (g.queue.length - g.pos) * Math.min(1, dt * 8);
  if (g.phase !== "play") {
    g.phaseT -= dt;
    if (g.phaseT > 0) return;
    if (g.phase === "intro") g.phase = "play";
    else if (g.phase === "won") {
      g.round++;
      startRound(g);
    } else g.over = true;
    return;
  }
  g.time -= dt;
  if (g.time <= 0) {
    g.phase = "closed";
    g.phaseT = 1.8;
    blip("closed", [[200, 0, 0.5, "sawtooth", 0.05, 80]]);
    return;
  }
  tickWatcher(g.aunty, dt, g.round, "aunty");
  if (g.queue.length) tickWatcher(g.ahead, dt, g.round, "ahead");

  // the counter serves the front of the queue every few seconds
  g.counterIn -= dt;
  if (g.counterIn <= 0) {
    g.counterIn = 5 + Math.random() * 3;
    if (g.queue.length) {
      g.queue.shift();
      blip("served", [[700, 0, 0.06, "triangle", 0.03]]);
      if (!g.queue.length) g.squeeze = 0;
    }
  }

  const ahead = g.queue[g.queue.length - 1];
  if (g.holding && ahead !== undefined) {
    const caughtBy = g.aunty.look === "watch" ? "AUNTY" : g.ahead.look === "watch" ? "UNCLE" : null;
    if (caughtBy) {
      g.strikes++;
      g.squeeze = 0;
      g.holding = false;
      g.flash = 0.5;
      g.pops.push({ y: ME_Y - 40, text: caughtBy === "AUNTY" ? "OI! BEHIND YOU!" : "EXCUSE ME?!", color: "#ff4d6d", t: 0 });
      blip("oi", [
        [500, 0, 0.12, "square", 0.06],
        [350, 0.12, 0.2, "square", 0.06],
      ]);
      if (g.strikes >= STRIKES) {
        g.phase = "closed";
        g.phaseT = 1.8;
      }
      return;
    }
    g.squeeze += dt / PEOPLE[ahead].squeeze;
    if (g.squeeze >= 1) {
      g.squeeze = 0;
      g.queue.pop();
      g.jumped++;
      g.score += 20 * g.round;
      g.pops.push({ y: ME_Y - 40, text: `+${20 * g.round}`, color: "#39ff88", t: 0 });
      g.ahead = { look: "away", t: 1.5 + Math.random() * 2 };
      blip("slip", [[300, 0, 0.1, "triangle", 0.04, 600]]);
    }
  } else g.squeeze = Math.max(0, g.squeeze - dt * 0.6);

  if (!g.queue.length) {
    const bonus = 100 + Math.ceil(g.time) * 5;
    g.score += bonus;
    g.phase = "won";
    g.phaseT = 2;
    g.pops.push({ y: ME_Y - 60, text: `TICKET! +${bonus}`, color: "#ffe14d", t: 0 });
    blip("ticket", [
      [523, 0, 0.1, "square", 0.04],
      [659, 0.1, 0.1, "square", 0.04],
      [1046, 0.2, 0.25, "square", 0.04],
    ]);
  }
}

function bubble(cx: CanvasRenderingContext2D, x: number, y: number, w: Watcher, t: number) {
  const text = w.look === "away" ? "📱" : w.look === "tell" ? "❗" : "👁️";
  if (w.look === "tell" && Math.sin(t * 30) < 0) return;
  cx.fillStyle = w.look === "watch" ? "#ff4d6d" : "#ece9ff";
  cx.beginPath();
  cx.roundRect(x - 16, y - 16, 32, 28, 8);
  cx.fill();
  cx.beginPath();
  cx.moveTo(x - 4, y + 12);
  cx.lineTo(x, y + 18);
  cx.lineTo(x + 4, y + 12);
  cx.fill();
  cx.font = "16px sans-serif";
  cx.fillText(text, x, y - 1);
}

export function QueueJumper() {
  const [screen, setScreen] = useState<"title" | "play" | "over">("title");
  const [best, submitBest] = useBest("lab.queue.best");
  const [hud, setHud] = useState({ score: 0, strikes: 0, ahead: 0, time: 0, total: 1, round: 1 });
  const [result, setResult] = useState<{ score: number; round: number; jumped: number; caught: boolean; best: boolean } | null>(null);
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

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== " " || !playing.current) return;
      e.preventDefault();
      gameRef.current.holding = e.type === "keydown";
    };
    window.addEventListener("keydown", k);
    window.addEventListener("keyup", k);
    return () => {
      window.removeEventListener("keydown", k);
      window.removeEventListener("keyup", k);
    };
  }, []);

  useLoop((dt, now) => {
    const g = gameRef.current;
    if (playing.current) {
      step(g, dt);
      if (g.over) {
        playing.current = false;
        setResult({ score: g.score, round: g.round, jumped: g.jumped, caught: g.strikes >= STRIKES, best: submitBest(g.score) });
        setScreen("over");
      }
    }
    if (now - hudAt.current > 100) {
      hudAt.current = now;
      setHud({ score: g.score, strikes: g.strikes, ahead: g.queue.length, time: g.time, total: g.total, round: g.round });
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = ctx2d(canvas, W);
    const t = now / 1000;

    // station floor
    cx.fillStyle = "#17122c";
    cx.fillRect(0, 0, W, H);
    cx.strokeStyle = "#221a40";
    for (let y = ((ME_Y - g.pos * GAP) % 40 + 40) % 40; y < H; y += 40) {
      cx.beginPath();
      cx.moveTo(0, y);
      cx.lineTo(W, y);
      cx.stroke();
    }
    // queue rails
    cx.fillStyle = "#3a3466";
    cx.fillRect(140, 0, 4, H);
    cx.fillRect(216, 0, 4, H);

    // ticket counter at the head of the queue
    const counterY = ME_Y - (g.pos + 1) * GAP;
    if (counterY > -80) {
      cx.fillStyle = "#8a2340";
      cx.fillRect(90, counterY - 40, 180, 50);
      cx.fillStyle = "#ffe14d";
      cx.font = PIXEL_FONT(9);
      cx.textAlign = "center";
      cx.textBaseline = "middle";
      cx.fillText("TICKETS", W / 2, counterY - 22);
      cx.fillStyle = "#05040b";
      cx.fillRect(150, counterY - 10, 60, 18);
    }

    cx.textAlign = "center";
    cx.textBaseline = "middle";
    // people ahead (front first)
    g.queue.forEach((p, i) => {
      const y = ME_Y - (g.queue.length - i) * GAP + (g.pos - g.queue.length) * GAP;
      if (y < -40 || y > H + 40) return;
      const isAhead = i === g.queue.length - 1;
      cx.font = "34px sans-serif";
      cx.save();
      cx.translate(W / 2 + (isAhead ? g.squeeze * 14 : 0), y);
      if (isAhead && g.ahead.look !== "away") cx.scale(-1, 1);
      cx.fillText(PEOPLE[p].emoji, 0, 0);
      cx.restore();
      if (isAhead && g.ahead.look !== "away") bubble(cx, W / 2 + 40, y - 26, g.ahead, t);
    });
    // you, slipping sideways while squeezing
    const myX = W / 2 - g.squeeze * 22;
    cx.strokeStyle = "#22f3ff";
    cx.lineWidth = 2;
    cx.beginPath();
    cx.arc(myX, ME_Y, 24, 0, Math.PI * 2);
    cx.stroke();
    cx.font = "34px sans-serif";
    cx.fillText(g.squeeze > 0 ? "🫣" : "🙂", myX, ME_Y);
    cx.font = PIXEL_FONT(7);
    cx.fillStyle = "#22f3ff";
    cx.fillText("YOU", myX, ME_Y + 32);
    // the aunty
    cx.font = "36px sans-serif";
    cx.fillText("👵", W / 2, ME_Y + GAP + 6);
    bubble(cx, W / 2 + 42, ME_Y + GAP - 22, g.aunty, t);
    // and the rest of the queue behind her
    cx.font = "30px sans-serif";
    cx.globalAlpha = 0.5;
    for (let i = 2; i < 6; i++) cx.fillText(PEOPLE[(i * 3 + g.round) % PEOPLE.length].emoji, W / 2, ME_Y + i * GAP);
    cx.globalAlpha = 1;

    // squeeze meter
    if (g.squeeze > 0 && g.queue.length) {
      cx.fillStyle = "#2a2350";
      cx.fillRect(W / 2 - 50, ME_Y - 54, 100, 7);
      cx.fillStyle = "#39ff88";
      cx.fillRect(W / 2 - 50, ME_Y - 54, 100 * g.squeeze, 7);
    }

    // somebody is watching: the edges glow red
    if (g.aunty.look === "watch" || g.ahead.look === "watch") {
      const grad = cx.createRadialGradient(W / 2, H / 2, 150, W / 2, H / 2, 380);
      grad.addColorStop(0, "rgba(255,77,109,0)");
      grad.addColorStop(1, "rgba(255,77,109,0.35)");
      cx.fillStyle = grad;
      cx.fillRect(0, 0, W, H);
    }
    if (g.flash > 0) {
      cx.fillStyle = `rgba(255,77,109,${g.flash * 0.6})`;
      cx.fillRect(0, 0, W, H);
    }

    // hold pad
    cx.fillStyle = g.holding ? "#39ff88" : "#2a2350";
    cx.fillRect(20, H - 70, W - 40, 54);
    cx.font = PIXEL_FONT(12);
    cx.fillStyle = g.holding ? "#05040b" : "#ece9ff";
    cx.fillText(g.holding ? "SQUEEZING..." : "HOLD TO SNEAK", W / 2, H - 43);

    cx.font = PIXEL_FONT(10);
    for (const p of g.pops) {
      cx.globalAlpha = Math.max(0, 1 - p.t / 1.2);
      cx.fillStyle = "#05040b";
      cx.fillText(p.text, W / 2 + 1, p.y - p.t * 24 + 1);
      cx.fillStyle = p.color;
      cx.fillText(p.text, W / 2, p.y - p.t * 24);
    }
    cx.globalAlpha = 1;
    const banner = (a: string, b: string, col: string) => {
      cx.fillStyle = "rgba(5,4,11,0.8)";
      cx.fillRect(0, 150, W, 76);
      cx.font = PIXEL_FONT(15);
      cx.fillStyle = col;
      cx.fillText(a, W / 2, 178);
      cx.font = PIXEL_FONT(8);
      cx.fillStyle = "#ece9ff";
      cx.fillText(b, W / 2, 204);
    };
    if (playing.current && g.phase === "intro") banner(`QUEUE ${g.round}`, `${g.queue.length} AHEAD · COUNTER CLOSES IN ${g.total}s`, "#ffe14d");
    if (g.phase === "closed") banner(g.strikes >= STRIKES ? "TO THE BACK!" : "COUNTER CLOSED", g.strikes >= STRIKES ? "AUNTY HAS HAD ENOUGH" : "TRY AGAIN TOMORROW", "#ff4d6d");
  });

  const hold = (on: boolean) => (e: React.PointerEvent) => {
    if (!playing.current) return;
    e.preventDefault();
    gameRef.current.holding = on;
  };

  const pct = (hud.time / hud.total) * 100;

  return (
    <LabShell title="QUEUE JUMPER" color="#ffe14d">
      <div className="flex h-9 shrink-0 items-center gap-3 px-3 font-pixel text-[8px]">
        <span className="text-dim">
          OI!{" "}
          {Array.from({ length: STRIKES }, (_, i) => (
            <span key={i} className={i < hud.strikes ? "text-red" : "text-line"}>
              ●
            </span>
          ))}
        </span>
        <div className="h-2 flex-1 bg-line">
          <div className="h-full" style={{ width: `${pct}%`, background: pct < 25 ? "#ff4d6d" : "#ffe14d" }} />
        </div>
        <span className="text-dim">
          AHEAD <span className="text-ink">{hud.ahead}</span>
        </span>
        <span className="text-yellow">{hud.score}</span>
      </div>
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        <canvas ref={canvasRef} className="block touch-none" onPointerDown={hold(true)} onPointerUp={hold(false)} onPointerCancel={hold(false)} onPointerLeave={hold(false)} />
        {screen === "title" && (
          <TitleCard a="QUEUE" b="JUMPER" colorA="#ffe14d" colorB="#22f3ff" blurb="The ticket counter closes soon and the queue is huge. Time to get creative." best={best} onPlay={start}>
            <p>Hold anywhere to squeeze past the person ahead of you. Let go before anyone looks.</p>
            <p>📱 means the aunty behind you is busy. ❗ means she&apos;s about to look up. 👁️ means she&apos;s watching. The person ahead sometimes turns round too.</p>
            <p>Getting caught mid-squeeze is an OI!, and three of those send you to the back. Reach the counter before it closes. Bigger people take longer to squeeze past.</p>
          </TitleCard>
        )}
        {screen === "over" && result && (
          <GameOverCard
            title={result.caught ? "SENT TO THE BACK" : "COUNTER CLOSED"}
            score={result.score}
            isBest={result.best}
            best={best}
            color="#ffe14d"
            line={`You jumped ${result.jumped} ${result.jumped === 1 ? "person" : "people"} and reached queue ${result.round}.`}
            again={start}
          />
        )}
      </div>
    </LabShell>
  );
}
