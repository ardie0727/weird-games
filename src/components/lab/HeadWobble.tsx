"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { blip, tone, unlock } from "@/lib/lab/sound";
import { GameOverCard, LabShell, PIXEL_FONT, TitleCard, ctx2d, toLogical, useBest, useFitCanvas, useLoop } from "./LabShell";

// Head Wobble: Uncle answers everything with his head. He nods (yes), shakes
// (no) or does the famous side-to-side wobble (could mean anything). Watch
// his sequence, then swipe it back to him in the same order. Each round he
// adds one more. Getting it wrong costs respect; run out and you're
// "not like your cousin".

const W = 360;
const H = 600;
const UNCLE = { x: 180, y: 206, r: 66 };
const YOU = { x: 180, y: 456, r: 46 };

type Move = "yes" | "no" | "maybe";
const MOVES: Move[] = ["yes", "no", "maybe"];
const LABEL: Record<Move, string> = { yes: "YES", no: "NO", maybe: "MAYBE" };
const COLOR: Record<Move, string> = { yes: "#39ff88", no: "#ff4d6d", maybe: "#ffe14d" };
const NOTE: Record<Move, number> = { yes: 523, no: 330, maybe: 415 };

const QUESTIONS = [
  "Beta, coming for the wedding?",
  "You have eaten?",
  "Still single, ah?",
  "Salary is good?",
  "Engineering only, no?",
  "You will take some more rice?",
  "Have you met Sharma's son?",
  "Shall we leave by 5?",
  "Traffic will be there?",
  "Petrol prices, hm?",
  "You will drop me to the station?",
  "This phone is the new one?",
  "Cricket match tonight?",
  "Your mother told you?",
];
const SCOLD = ["Arre? What was that?", "Not like your cousin...", "In my time we nodded properly.", "Hello? Network issue?"];
const PRAISE = ["Very good, very good.", "Correct. Have a ladoo.", "See? Smart boy.", "Exactly what I meant."];

interface Anim {
  move: Move | null;
  t: number;
  dur: number;
}

interface Game {
  round: number;
  seq: Move[];
  idx: number; // position being shown or answered
  lives: number;
  score: number;
  phase: "talk" | "show" | "turn" | "good" | "bad";
  phaseT: number;
  question: string;
  bubble: string;
  dur: number;
  inputT: number;
  uncle: Anim;
  you: Anim;
  over: boolean;
  shake: number;
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function newRound(g: Game) {
  g.seq.push(pick(MOVES));
  g.idx = 0;
  g.question = pick(QUESTIONS);
  g.bubble = g.question;
  g.dur = Math.max(0.48, 0.9 - g.round * 0.035);
  g.phase = "talk";
  g.phaseT = 1.3;
}

function newGame(): Game {
  const g = { round: 0, seq: [], idx: 0, lives: 3, score: 0, phase: "talk", phaseT: 0, question: "", bubble: "", dur: 0.9, inputT: 0, uncle: { move: null, t: 0, dur: 1 }, you: { move: null, t: 0, dur: 0.6 }, over: false, shake: 0 } as Game;
  g.seq.push(pick(MOVES));
  newRound(g);
  return g;
}

function play(a: Anim, m: Move, dur: number) {
  a.move = m;
  a.t = 0;
  a.dur = dur;
}

function answer(g: Game, m: Move) {
  if (g.phase !== "turn") return;
  play(g.you, m, 0.55);
  tone(NOTE[m], 0, 0.14, "square", 0.04);
  if (g.seq[g.idx] === m) {
    g.idx++;
    g.inputT = 4;
    if (g.idx >= g.seq.length) {
      g.score += g.seq.length * 10;
      g.round++;
      g.phase = "good";
      g.phaseT = 1.2;
      g.bubble = pick(PRAISE);
      blip("good", [
        [523, 0.1, 0.08, "square", 0.04],
        [659, 0.18, 0.08, "square", 0.04],
        [784, 0.26, 0.16, "square", 0.04],
      ]);
    }
  } else mistake(g);
}

function mistake(g: Game) {
  g.lives--;
  g.shake = 0.35;
  g.phase = "bad";
  g.phaseT = 1.5;
  g.bubble = pick(SCOLD);
  play(g.uncle, "no", 0.7);
  blip("bad", [[200, 0, 0.35, "sawtooth", 0.05, 90]]);
}

function step(g: Game, dt: number) {
  for (const a of [g.uncle, g.you]) {
    if (a.move) {
      a.t += dt;
      if (a.t >= a.dur) a.move = null;
    }
  }
  g.shake = Math.max(0, g.shake - dt);
  if (g.phase === "turn") {
    g.inputT -= dt;
    if (g.inputT <= 0) mistake(g);
    return;
  }
  g.phaseT -= dt;
  if (g.phaseT > 0) return;
  switch (g.phase) {
    case "talk":
      g.phase = "show";
      g.idx = 0;
      g.phaseT = 0.15;
      break;
    case "show":
      if (g.idx < g.seq.length) {
        const m = g.seq[g.idx];
        play(g.uncle, m, g.dur);
        tone(NOTE[m], 0, 0.14, "square", 0.04);
        g.idx++;
        g.phaseT = g.dur + 0.18;
      } else {
        g.phase = "turn";
        g.idx = 0;
        g.inputT = 4.5;
      }
      break;
    case "good":
      newRound(g);
      break;
    case "bad":
      if (g.lives <= 0) g.over = true;
      else {
        // same sequence again, from the top
        g.bubble = "Again. Watch carefully.";
        g.phase = "talk";
        g.phaseT = 1.1;
      }
      break;
  }
}

/** Head offset and tilt for a move at progress p (0..1). */
function pose(a: Anim, amp: number): [number, number, number] {
  if (!a.move) return [0, 0, 0];
  const p = a.t / a.dur;
  const env = Math.sin(Math.PI * p);
  const s = Math.sin(p * Math.PI * 4);
  if (a.move === "yes") return [0, s * amp * 0.16 * env, 0];
  if (a.move === "no") return [s * amp * 0.2 * env, 0, s * 0.08 * env];
  // the wobble: tilt side to side, pivoting at the neck
  return [s * amp * 0.08 * env, Math.abs(s) * amp * 0.03, s * 0.42 * env];
}

function drawHead(cx: CanvasRenderingContext2D, x: number, y: number, r: number, a: Anim, uncle: boolean, t: number) {
  const [ox, oy, rot] = pose(a, r);
  cx.save();
  cx.translate(x + ox, y + r * 0.9 + oy);
  cx.rotate(rot);
  cx.translate(0, -r * 0.9);
  // ears
  cx.fillStyle = "#b5713a";
  cx.beginPath();
  cx.ellipse(-r * 0.98, 4, r * 0.16, r * 0.24, 0, 0, Math.PI * 2);
  cx.ellipse(r * 0.98, 4, r * 0.16, r * 0.24, 0, 0, Math.PI * 2);
  cx.fill();
  // face
  cx.fillStyle = "#c98448";
  cx.beginPath();
  cx.ellipse(0, 0, r, r * 1.1, 0, 0, Math.PI * 2);
  cx.fill();
  if (uncle) {
    // bald top, grey sides
    cx.fillStyle = "#d9945a";
    cx.beginPath();
    cx.ellipse(-r * 0.25, -r * 0.7, r * 0.35, r * 0.14, -0.3, 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = "#cfcbe0";
    cx.beginPath();
    cx.ellipse(-r * 0.86, -r * 0.2, r * 0.18, r * 0.42, 0.2, 0, Math.PI * 2);
    cx.ellipse(r * 0.86, -r * 0.2, r * 0.18, r * 0.42, -0.2, 0, Math.PI * 2);
    cx.fill();
  } else {
    cx.fillStyle = "#1a1220";
    cx.beginPath();
    cx.ellipse(0, -r * 0.72, r * 0.98, r * 0.5, 0, Math.PI, 0);
    cx.fill();
    cx.fillRect(-r * 0.98, -r * 0.75, r * 0.3, r * 0.4);
  }
  // eyes
  const blink = Math.sin(t * 1.3 + (uncle ? 0 : 2)) > 0.97;
  cx.fillStyle = "#05040b";
  for (const sx of [-1, 1]) {
    if (blink) cx.fillRect(sx * r * 0.36 - r * 0.12, -r * 0.12, r * 0.24, 3);
    else {
      cx.beginPath();
      cx.arc(sx * r * 0.36, -r * 0.1, r * 0.09, 0, Math.PI * 2);
      cx.fill();
    }
  }
  if (uncle) {
    // glasses
    cx.strokeStyle = "#05040b";
    cx.lineWidth = 3;
    for (const sx of [-1, 1]) {
      cx.beginPath();
      cx.roundRect(sx * r * 0.36 - r * 0.24, -r * 0.27, r * 0.48, r * 0.34, 6);
      cx.stroke();
    }
    cx.beginPath();
    cx.moveTo(-r * 0.12, -r * 0.12);
    cx.lineTo(r * 0.12, -r * 0.12);
    cx.stroke();
    // eyebrows
    cx.fillStyle = "#cfcbe0";
    cx.fillRect(-r * 0.56, -r * 0.42, r * 0.38, r * 0.08);
    cx.fillRect(r * 0.18, -r * 0.42, r * 0.38, r * 0.08);
  }
  // nose
  cx.fillStyle = "#a8642e";
  cx.beginPath();
  cx.ellipse(0, r * 0.18, r * 0.12, r * 0.16, 0, 0, Math.PI * 2);
  cx.fill();
  if (uncle) {
    // the mustache
    cx.fillStyle = "#e8e4f2";
    cx.beginPath();
    cx.moveTo(0, r * 0.36);
    cx.quadraticCurveTo(-r * 0.4, r * 0.24, -r * 0.6, r * 0.5);
    cx.quadraticCurveTo(-r * 0.3, r * 0.46, 0, r * 0.48);
    cx.quadraticCurveTo(r * 0.3, r * 0.46, r * 0.6, r * 0.5);
    cx.quadraticCurveTo(r * 0.4, r * 0.24, 0, r * 0.36);
    cx.fill();
  }
  // mouth
  cx.strokeStyle = "#5a2414";
  cx.lineWidth = 3;
  cx.beginPath();
  cx.arc(0, r * 0.52, r * 0.18, 0.2 * Math.PI, 0.8 * Math.PI);
  cx.stroke();
  // tilak for uncle
  if (uncle) {
    cx.fillStyle = "#ff4d6d";
    cx.fillRect(-2, -r * 0.5, 4, r * 0.18);
  }
  cx.restore();
}

function draw(cx: CanvasRenderingContext2D, g: Game, t: number, playing: boolean) {
  const sx = g.shake > 0 ? Math.sin(t * 80) * g.shake * 10 : 0;
  cx.save();
  cx.translate(sx, 0);
  cx.fillStyle = "#1b1533";
  cx.fillRect(-12, 0, W + 24, H);
  // living room: wall calendar, sofa
  cx.fillStyle = "#241d42";
  cx.fillRect(-12, 300, W + 24, 40);
  cx.fillStyle = "#6b2d5c";
  cx.beginPath();
  cx.roundRect(40, 296, 280, 40, 10);
  cx.fill();
  cx.fillStyle = "#ece9ff";
  cx.fillRect(18, 112, 46, 54);
  cx.fillStyle = "#ff4d6d";
  cx.fillRect(18, 112, 46, 14);
  cx.font = PIXEL_FONT(12);
  cx.textAlign = "center";
  cx.textBaseline = "middle";
  cx.fillStyle = "#05040b";
  cx.fillText(String(17 + (g.round % 12)), 41, 148);
  // uncle's kurta
  cx.fillStyle = "#ece9ff";
  cx.beginPath();
  cx.roundRect(UNCLE.x - 82, UNCLE.y + 62, 164, 90, 26);
  cx.fill();
  cx.fillStyle = "#c9c6dc";
  cx.fillRect(UNCLE.x - 3, UNCLE.y + 66, 6, 50);
  drawHead(cx, UNCLE.x, UNCLE.y, UNCLE.r, g.uncle, true, t);
  // your shirt and head
  cx.fillStyle = "#22f3ff";
  cx.beginPath();
  cx.roundRect(YOU.x - 62, YOU.y + 44, 124, 62, 22);
  cx.fill();
  drawHead(cx, YOU.x, YOU.y, YOU.r, g.you, false, t);
  cx.restore();
  cx.textAlign = "center";
  cx.textBaseline = "middle";

  // speech bubble
  if (playing && g.bubble && g.phase !== "turn") {
    cx.font = "16px sans-serif";
    const tw = Math.min(300, cx.measureText(g.bubble).width + 28);
    cx.fillStyle = "#ece9ff";
    cx.beginPath();
    cx.roundRect(W / 2 - tw / 2, 40, tw, 40, 10);
    cx.fill();
    cx.beginPath();
    cx.moveTo(W / 2 - 8, 80);
    cx.lineTo(W / 2, 92);
    cx.lineTo(W / 2 + 8, 80);
    cx.fill();
    cx.fillStyle = "#05040b";
    cx.fillText(g.bubble, W / 2, 61, 290);
  }

  // what the current wobble means, while it's shown or answered
  cx.font = PIXEL_FONT(14);
  if (g.uncle.move) {
    cx.fillStyle = COLOR[g.uncle.move];
    cx.fillText(LABEL[g.uncle.move], UNCLE.x + 116, UNCLE.y - 20);
  }
  if (g.you.move) {
    cx.fillStyle = COLOR[g.you.move];
    cx.fillText(LABEL[g.you.move], YOU.x + 112, YOU.y);
  }

  // sequence dots
  const n = g.seq.length;
  const dw = Math.min(22, 300 / n);
  for (let i = 0; i < n; i++) {
    const x = W / 2 - ((n - 1) * dw) / 2 + i * dw;
    let c = "#3a3466";
    if (g.phase === "show" && i < g.idx) c = "#8f89b8";
    if (g.phase === "turn" && i < g.idx) c = COLOR[g.seq[i]];
    if (g.phase === "good") c = COLOR[g.seq[i]];
    cx.fillStyle = c;
    cx.beginPath();
    cx.arc(x, 376, Math.min(7, dw / 2 - 1), 0, Math.PI * 2);
    cx.fill();
  }

  if (playing && g.phase === "turn") {
    cx.font = PIXEL_FONT(10);
    cx.fillStyle = "#ffe14d";
    cx.fillText("YOUR TURN", W / 2, 60);
    // patience bar
    cx.fillStyle = "#3a3466";
    cx.fillRect(90, 80, 180, 5);
    cx.fillStyle = g.inputT < 1.5 ? "#ff4d6d" : "#ffe14d";
    cx.fillRect(90, 80, 180 * Math.max(0, g.inputT / 4.5), 5);
  }
  // swipe legend
  const legend: [string, string, Move, number][] = [
    ["↕", "YES", "yes", 60],
    ["↔", "NO", "no", 180],
    ["⤢", "MAYBE", "maybe", 300],
  ];
  for (const [arrow, txt, m, x] of legend) {
    cx.fillStyle = COLOR[m];
    cx.font = "bold 22px sans-serif";
    cx.fillText(arrow, x, H - 34);
    cx.font = PIXEL_FONT(8);
    cx.fillText(txt, x, H - 12);
  }
}

function classify(dx: number, dy: number): Move | null {
  if (Math.hypot(dx, dy) < 26) return null;
  const ang = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
  if (ang > 64) return "yes";
  if (ang < 26) return "no";
  return "maybe";
}

export function HeadWobble() {
  const [screen, setScreen] = useState<"title" | "play" | "over">("title");
  const [best, submitBest] = useBest("lab.wobble.best");
  const [hud, setHud] = useState({ score: 0, lives: 3, round: 0 });
  const [result, setResult] = useState<{ score: number; longest: number; best: boolean } | null>(null);
  const { wrapRef, canvasRef } = useFitCanvas(W, H);
  const gameRef = useRef<Game>(newGame());
  const playing = useRef(false);
  const hudAt = useRef(0);
  const down = useRef<[number, number] | null>(null);

  const start = useCallback(() => {
    unlock();
    gameRef.current = newGame();
    playing.current = true;
    setScreen("play");
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!playing.current || e.repeat) return;
      const m: Move | null = e.key === "ArrowUp" || e.key === "ArrowDown" ? "yes" : e.key === "ArrowLeft" || e.key === "ArrowRight" ? "no" : e.key === " " ? "maybe" : null;
      if (m) {
        e.preventDefault();
        answer(gameRef.current, m);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  useLoop((dt, now) => {
    const g = gameRef.current;
    if (playing.current) {
      step(g, dt);
      if (g.over) {
        playing.current = false;
        setResult({ score: g.score, longest: g.round, best: submitBest(g.score) });
        setScreen("over");
      }
    }
    if (now - hudAt.current > 120) {
      hudAt.current = now;
      setHud({ score: g.score, lives: g.lives, round: g.round });
    }
    const canvas = canvasRef.current;
    if (canvas) draw(ctx2d(canvas, W), g, now / 1000, playing.current);
  });

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!playing.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    down.current = toLogical(e, e.currentTarget, W, H);
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = down.current;
    down.current = null;
    if (!d || !playing.current) return;
    const [x, y] = toLogical(e, e.currentTarget, W, H);
    const m = classify(x - d[0], y - d[1]);
    if (m) answer(gameRef.current, m);
  };

  return (
    <LabShell title="HEAD WOBBLE" color="#ffe14d">
      <div className="flex h-9 shrink-0 items-center justify-between px-3 font-pixel text-[8px]">
        <span className="text-dim">
          ROUND <span className="text-ink">{hud.round + 1}</span>
        </span>
        <span className="text-dim">
          RESPECT <span className="text-red">{"♥".repeat(Math.max(0, hud.lives))}</span>
        </span>
        <span className="text-yellow">{hud.score}</span>
      </div>
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        <canvas ref={canvasRef} className="block touch-none" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => (down.current = null)} />
        {screen === "title" && (
          <TitleCard a="HEAD" b="WOBBLE" colorA="#ffe14d" colorB="#39ff88" blurb="Uncle doesn't use words. Uncle uses his head." best={best} onPlay={start}>
            <p>Uncle answers in head moves: a nod is YES, a shake is NO, and the side-to-side wobble is MAYBE. Watch his whole answer, then give it back to him in the same order.</p>
            <p>Swipe up or down to nod, left or right to shake, and diagonally to wobble. On a keyboard: arrow keys and space.</p>
            <p>He adds one more move every round and gets faster. Three wrong answers and you lose his respect for good.</p>
          </TitleCard>
        )}
        {screen === "over" && result && (
          <GameOverCard
            title="NO RESPECT"
            score={result.score}
            isBest={result.best}
            best={best}
            color="#ffe14d"
            line={`You kept up for ${result.longest} ${result.longest === 1 ? "round" : "rounds"}. Sharma's son does 20.`}
            again={start}
          />
        )}
      </div>
    </LabShell>
  );
}
