"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { blip, tone, unlock } from "@/lib/lab/sound";
import { GameOverCard, LabShell, PIXEL_FONT, TitleCard, ctx2d, toLogical, useBest, useFitCanvas, useLoop } from "./LabShell";

// Honk Orchestra: you're stuck in a jam where every vehicle's horn is a
// different note. Notes fall toward the six vehicles; honk each one as its
// note reaches the line and the jam plays a tune. Missed notes and random
// honking make the drivers angrier. Each song is faster than the last.

const W = 360;
const H = 600;
const LANES = 6;
const LW = W / LANES;
const HIT_Y = 452;
const TOP_Y = 40;
const PERFECT = 0.07;
const GOOD = 0.14;

const NOTE = ["C", "D", "E", "F", "G", "A"];
const FREQ = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0];
const RIDES = ["🛺", "🚗", "🚕", "🚌", "🚚", "🏍️"];
const LANE_COLOR = ["#ff4d6d", "#ff8a3d", "#ffe14d", "#39ff88", "#22f3ff", "#b26bff"];

// [note, beats]
type Song = { name: string; notes: [string, number][] };
const SONGS: Song[] = [
  {
    name: "MARY HAD A LITTLE LAMB",
    notes: [["E", 1], ["D", 1], ["C", 1], ["D", 1], ["E", 1], ["E", 1], ["E", 2], ["D", 1], ["D", 1], ["D", 2], ["E", 1], ["G", 1], ["G", 2], ["E", 1], ["D", 1], ["C", 1], ["D", 1], ["E", 1], ["E", 1], ["E", 1], ["E", 1], ["D", 1], ["D", 1], ["E", 1], ["D", 1], ["C", 3]],
  },
  {
    name: "TWINKLE TWINKLE",
    notes: [["C", 1], ["C", 1], ["G", 1], ["G", 1], ["A", 1], ["A", 1], ["G", 2], ["F", 1], ["F", 1], ["E", 1], ["E", 1], ["D", 1], ["D", 1], ["C", 2], ["G", 1], ["G", 1], ["F", 1], ["F", 1], ["E", 1], ["E", 1], ["D", 2], ["G", 1], ["G", 1], ["F", 1], ["F", 1], ["E", 1], ["E", 1], ["D", 2], ["C", 1], ["C", 1], ["G", 1], ["G", 1], ["A", 1], ["A", 1], ["G", 2], ["F", 1], ["F", 1], ["E", 1], ["E", 1], ["D", 1], ["D", 1], ["C", 3]],
  },
  {
    name: "ODE TO JOY",
    notes: [["E", 1], ["E", 1], ["F", 1], ["G", 1], ["G", 1], ["F", 1], ["E", 1], ["D", 1], ["C", 1], ["C", 1], ["D", 1], ["E", 1], ["E", 1.5], ["D", 0.5], ["D", 2], ["E", 1], ["E", 1], ["F", 1], ["G", 1], ["G", 1], ["F", 1], ["E", 1], ["D", 1], ["C", 1], ["C", 1], ["D", 1], ["E", 1], ["D", 1.5], ["C", 0.5], ["C", 3]],
  },
  {
    name: "JINGLE BELLS",
    notes: [["E", 1], ["E", 1], ["E", 2], ["E", 1], ["E", 1], ["E", 2], ["E", 1], ["G", 1], ["C", 1.5], ["D", 0.5], ["E", 4], ["F", 1], ["F", 1], ["F", 1.5], ["F", 0.5], ["F", 1], ["E", 1], ["E", 1], ["E", 0.5], ["E", 0.5], ["E", 1], ["D", 1], ["D", 1], ["E", 1], ["D", 2], ["G", 2]],
  },
];

interface Note {
  lane: number;
  at: number; // seconds into the song
  hit: boolean;
  missed: boolean;
}

interface Game {
  songIdx: number;
  loop: number;
  notes: Note[];
  clock: number;
  travel: number;
  end: number;
  rage: number;
  score: number;
  combo: number;
  bestCombo: number;
  hits: number;
  flash: number[];
  pops: { lane: number; text: string; color: string; t: number }[];
  phase: "intro" | "play" | "done";
  phaseT: number;
  over: boolean;
}

function loadSong(g: Game) {
  const song = SONGS[g.songIdx % SONGS.length];
  const bpm = 92 + g.songIdx * 10;
  const beat = 60 / bpm;
  let at = 2;
  g.notes = song.notes.map(([n, b]) => {
    const note = { lane: NOTE.indexOf(n), at, hit: false, missed: false };
    at += b * beat;
    return note;
  });
  g.end = at + 1;
  g.clock = 0;
  g.travel = Math.max(1.05, 1.7 - g.songIdx * 0.1);
  g.phase = "intro";
  g.phaseT = 1.6;
}

function newGame(): Game {
  const g = { songIdx: 0, loop: 0, notes: [], clock: 0, travel: 1.7, end: 0, rage: 0, score: 0, combo: 0, bestCombo: 0, hits: 0, flash: new Array(LANES).fill(0), pops: [], phase: "intro", phaseT: 0, over: false } as Game;
  loadSong(g);
  return g;
}

function honk(lane: number, good: boolean) {
  const f = FREQ[lane];
  // two slightly detuned squares sound like a cheap horn
  tone(f, 0, 0.22, "square", good ? 0.05 : 0.03);
  tone(f * 1.01, 0, 0.22, "sawtooth", good ? 0.025 : 0.015);
}

function step(g: Game, dt: number) {
  for (const p of g.pops) p.t += dt;
  g.pops = g.pops.filter((p) => p.t < 0.8);
  g.flash = g.flash.map((f) => Math.max(0, f - dt * 4));
  if (g.phase !== "play") {
    g.phaseT -= dt;
    if (g.phaseT > 0) return;
    if (g.phase === "intro") g.phase = "play";
    else {
      g.songIdx++;
      loadSong(g);
    }
    return;
  }
  g.clock += dt;
  for (const n of g.notes) {
    if (!n.hit && !n.missed && g.clock - n.at > GOOD) {
      n.missed = true;
      g.combo = 0;
      g.rage = Math.min(100, g.rage + 12);
      g.pops.push({ lane: n.lane, text: "MISS", color: "#ff4d6d", t: 0 });
    }
  }
  g.rage = Math.max(0, g.rage - dt * 1.5);
  if (g.rage >= 100) {
    g.over = true;
    blip("rage", [
      [200, 0, 0.6, "sawtooth", 0.05],
      [210, 0, 0.6, "sawtooth", 0.05],
      [190, 0, 0.6, "square", 0.04],
    ]);
    return;
  }
  if (g.clock > g.end) {
    const bonus = 200 + g.songIdx * 100;
    g.score += bonus;
    g.phase = "done";
    g.phaseT = 2.2;
    g.pops.push({ lane: 2.5, text: `ENCORE! +${bonus}`, color: "#ffe14d", t: 0 });
  }
}

function press(g: Game, lane: number) {
  if (g.phase !== "play") return;
  g.flash[lane] = 1;
  // closest unhit note in this lane
  let best: Note | null = null, bd = Infinity;
  for (const n of g.notes) {
    if (n.lane !== lane || n.hit || n.missed) continue;
    const d = Math.abs(g.clock - n.at);
    if (d < bd) (bd = d), (best = n);
  }
  if (best && bd <= GOOD) {
    best.hit = true;
    g.combo++;
    g.hits++;
    g.bestCombo = Math.max(g.bestCombo, g.combo);
    const perfect = bd <= PERFECT;
    const pts = (perfect ? 20 : 10) * (1 + Math.floor(g.combo / 8));
    g.score += pts;
    g.rage = Math.max(0, g.rage - 4);
    g.pops.push({ lane, text: perfect ? "PERFECT" : "GOOD", color: perfect ? "#39ff88" : "#22f3ff", t: 0 });
    honk(lane, true);
  } else {
    // honking for no reason
    g.combo = 0;
    g.rage = Math.min(100, g.rage + 5);
    g.pops.push({ lane, text: "HONK?!", color: "#ff8a3d", t: 0 });
    honk(lane, false);
  }
}

export function HonkOrchestra() {
  const [screen, setScreen] = useState<"title" | "play" | "over">("title");
  const [best, submitBest] = useBest("lab.honk.best");
  const [hud, setHud] = useState({ score: 0, rage: 0, combo: 0, song: SONGS[0].name });
  const [result, setResult] = useState<{ score: number; songs: number; bestCombo: number; best: boolean } | null>(null);
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
    const keys = "sdfjkl";
    const k = (e: KeyboardEvent) => {
      const i = keys.indexOf(e.key.toLowerCase());
      if (i >= 0 && playing.current && !e.repeat) press(gameRef.current, i);
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
        setResult({ score: g.score, songs: g.songIdx, bestCombo: g.bestCombo, best: submitBest(g.score) });
        setScreen("over");
      }
    }
    if (now - hudAt.current > 100) {
      hudAt.current = now;
      setHud({ score: g.score, rage: g.rage, combo: g.combo, song: SONGS[g.songIdx % SONGS.length].name });
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = ctx2d(canvas, W);
    const t = now / 1000;

    cx.fillStyle = "#120d24";
    cx.fillRect(0, 0, W, H);
    // lanes
    for (let i = 0; i < LANES; i++) {
      cx.fillStyle = i % 2 ? "#17122c" : "#1b1533";
      cx.fillRect(i * LW, 0, LW, HIT_Y + 20);
      if (g.flash[i] > 0) {
        cx.fillStyle = LANE_COLOR[i];
        cx.globalAlpha = g.flash[i] * 0.25;
        cx.fillRect(i * LW, 0, LW, HIT_Y + 20);
        cx.globalAlpha = 1;
      }
    }
    // hit line
    cx.fillStyle = "#ece9ff";
    cx.fillRect(0, HIT_Y - 1, W, 2);
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    // falling notes
    for (const n of g.notes) {
      if (n.hit) continue;
      const p = 1 - (n.at - g.clock) / g.travel;
      if (p < 0 || p > 1.3) continue;
      const y = TOP_Y + (HIT_Y - TOP_Y) * p;
      const x = n.lane * LW + LW / 2;
      cx.fillStyle = n.missed ? "#3a3466" : LANE_COLOR[n.lane];
      cx.beginPath();
      cx.roundRect(x - LW / 2 + 8, y - 11, LW - 16, 22, 11);
      cx.fill();
      cx.font = PIXEL_FONT(9);
      cx.fillStyle = "#05040b";
      cx.fillText(NOTE[n.lane], x, y + 1);
    }
    // the jam: one vehicle per lane, bouncing when it honks
    cx.fillStyle = "#26233a";
    cx.fillRect(0, HIT_Y + 20, W, H - HIT_Y - 20);
    cx.fillStyle = "#ffe14d";
    for (let x = 6; x < W; x += 40) cx.fillRect(x, H - 16, 20, 3);
    for (let i = 0; i < LANES; i++) {
      const x = i * LW + LW / 2;
      const bounce = g.flash[i] * 8;
      cx.font = "40px sans-serif";
      cx.fillText(RIDES[i], x, HIT_Y + 66 - bounce);
      cx.font = PIXEL_FONT(8);
      cx.fillStyle = LANE_COLOR[i];
      cx.fillText(NOTE[i], x, H - 32);
      if (g.flash[i] > 0.5) {
        cx.strokeStyle = LANE_COLOR[i];
        cx.lineWidth = 2;
        for (let r = 0; r < 2; r++) {
          cx.beginPath();
          cx.arc(x, HIT_Y + 52, 26 + r * 8 + (1 - g.flash[i]) * 16, -Math.PI * 0.8, -Math.PI * 0.2);
          cx.stroke();
        }
      }
      cx.fillStyle = "#ffe14d";
    }
    // drivers' rage shows as red haze
    if (g.rage > 40) {
      cx.fillStyle = `rgba(255,77,109,${((g.rage - 40) / 60) * 0.25})`;
      cx.fillRect(0, 0, W, H);
    }
    cx.font = PIXEL_FONT(8);
    for (const p of g.pops) {
      cx.globalAlpha = 1 - p.t / 0.8;
      cx.fillStyle = p.color;
      cx.fillText(p.text, p.lane * LW + LW / 2, HIT_Y - 24 - p.t * 30);
    }
    cx.globalAlpha = 1;
    if (g.phase === "intro" && playing.current) {
      cx.fillStyle = "rgba(5,4,11,0.8)";
      cx.fillRect(0, 170, W, 80);
      cx.font = PIXEL_FONT(9);
      cx.fillStyle = "#8f89b8";
      cx.fillText(`SONG ${g.songIdx + 1}`, W / 2, 192);
      cx.font = PIXEL_FONT(12);
      cx.fillStyle = "#ffe14d";
      cx.fillText(SONGS[g.songIdx % SONGS.length].name, W / 2, 220 + Math.sin(t * 4));
    }
  });

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!playing.current) return;
    e.preventDefault();
    const [x] = toLogical(e, e.currentTarget, W, H);
    press(gameRef.current, Math.max(0, Math.min(LANES - 1, Math.floor(x / LW))));
  };

  return (
    <LabShell title="HONK ORCHESTRA" color="#ffe14d">
      <div className="flex h-9 shrink-0 items-center gap-3 px-3 font-pixel text-[8px]">
        <span className="text-dim">RAGE</span>
        <div className="h-2 flex-1 bg-line">
          <div className="h-full" style={{ width: `${hud.rage}%`, background: hud.rage > 70 ? "#ff4d6d" : "#ff8a3d" }} />
        </div>
        <span className="text-dim">
          x<span className="text-green">{hud.combo}</span>
        </span>
        <span className="text-yellow">{hud.score}</span>
      </div>
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        <canvas ref={canvasRef} className="block touch-none" onPointerDown={onDown} />
        {screen === "title" && (
          <TitleCard a="HONK" b="ORCHESTRA" colorA="#ffe14d" colorB="#ff4d6d" blurb="Stuck in traffic? Every horn here is a different note. Conduct the jam." best={best} onPlay={start}>
            <p>Notes fall down six lanes. Tap a lane (anywhere in its column) as its note crosses the white line to honk that vehicle&apos;s horn and play the tune. On a keyboard, use S D F J K L.</p>
            <p>Missed notes and random honking raise the drivers&apos; RAGE, and good hits calm them down. If RAGE fills, the jam turns ugly.</p>
            <p>Songs: Mary Had a Little Lamb, Twinkle Twinkle, Ode to Joy and Jingle Bells. Each one is faster than the last.</p>
          </TitleCard>
        )}
        {screen === "over" && result && (
          <GameOverCard
            title="ROAD RAGE"
            score={result.score}
            isBest={result.best}
            best={best}
            color="#ffe14d"
            line={`You finished ${result.songs} ${result.songs === 1 ? "song" : "songs"} with a best streak of ${result.bestCombo}.`}
            again={start}
          />
        )}
      </div>
    </LabShell>
  );
}
