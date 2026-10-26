"use client";

import { useCallback, useRef, useState } from "react";
import { blip, tone, unlock } from "@/lib/lab/sound";
import { GameOverCard, LabShell, PIXEL_FONT, TitleCard, ctx2d, toLogical, useBest, useFitCanvas, useLoop } from "./LabShell";

// Ghost Landlord: you haunt a six-room house and want it empty. Tenants keep
// moving in. Scare them out with creaky floorboards, flickering lights and a
// haunted ceiling fan, all paid for with ectoplasm. Tenants get used to the
// same trick, so mix them up. If a tenant stays long enough to sign the lease,
// that's a strike.

const W = 360;
const H = 600;
const ROOM_W = 112;
const ROOM_H = 160;
const RX = 12;
const RY = [56, 236];
const FAN_ROOMS = [1, 3];
const STRIKES = 3;
const LEASE = 26;

type Trick = "creak" | "lights" | "fan";
const TRICK: Record<Trick, { cost: number; power: number; label: string; color: string }> = {
  creak: { cost: 10, power: 18, label: "CREAK", color: "#c98b5a" },
  lights: { cost: 22, power: 30, label: "LIGHTS", color: "#ffe14d" },
  fan: { cost: 35, power: 48, label: "FAN", color: "#22f3ff" },
};
const TRICKS: Trick[] = ["creak", "lights", "fan"];

type Kind = "regular" | "skeptic" | "scaredy" | "grandpa";
const KIND: Record<Kind, { emoji: string; mult: Record<Trick, number>; desc: string }> = {
  regular: { emoji: "🧑", mult: { creak: 1, lights: 1, fan: 1 }, desc: "Normal levels of nervous." },
  skeptic: { emoji: "🧐", mult: { creak: 0, lights: 0.7, fan: 0.8 }, desc: "Ignores creaks. Calls everything else a draught." },
  scaredy: { emoji: "😰", mult: { creak: 1.6, lights: 1.6, fan: 1.6 }, desc: "Jumps at everything." },
  grandpa: { emoji: "👴", mult: { creak: 0, lights: 1, fan: 1.3 }, desc: "Can't hear creaks. Hates fans." },
};

interface Tenant {
  id: number;
  kind: Kind;
  room: number;
  x: number;
  tx: number;
  fear: number;
  lease: number;
  used: Record<Trick, number>;
  lastTrick: { trick: Trick; at: number } | null;
  moveIn: number;
  fleeing: number; // >0 while running out
  shake: number;
}

interface Game {
  time: number;
  tenants: Tenant[];
  ecto: number;
  selected: Trick;
  fx: { room: number; trick: Trick; t: number }[];
  ghostRoom: number;
  arriveIn: number;
  nextId: number;
  strikes: number;
  score: number;
  evicted: number;
  pops: { x: number; y: number; text: string; color: string; t: number }[];
  over: boolean;
}

function newGame(): Game {
  return { time: 0, tenants: [], ecto: 60, selected: "lights", fx: [], ghostRoom: 2, arriveIn: 1, nextId: 1, strikes: 0, score: 0, evicted: 0, pops: [], over: false };
}

const roomRect = (r: number) => ({ x: RX + (r % 3) * ROOM_W, y: RY[Math.floor(r / 3)], w: ROOM_W, h: ROOM_H });

function pickKind(time: number): Kind {
  const r = Math.random();
  if (time > 20 && r < 0.25) return "skeptic";
  if (time > 40 && r < 0.42) return "grandpa";
  if (r < 0.6) return "regular";
  return "scaredy";
}

function step(g: Game, dt: number) {
  g.time += dt;
  g.ecto = Math.min(100, g.ecto + 9 * dt);
  for (const f of g.fx) f.t += dt;
  g.fx = g.fx.filter((f) => f.t < 1.4);
  for (const p of g.pops) p.t += dt;
  g.pops = g.pops.filter((p) => p.t < 1.2);

  g.arriveIn -= dt;
  if (g.arriveIn <= 0) {
    g.arriveIn = Math.max(3.5, 10 - g.time / 15) * (0.75 + Math.random() * 0.5);
    const room = 3; // they come in the front door, ground floor left
    const rr = roomRect(room);
    g.tenants.push({ id: g.nextId++, kind: pickKind(g.time), room, x: rr.x - 20, tx: rr.x + 30, fear: 0, lease: 0, used: { creak: 0, lights: 0, fan: 0 }, lastTrick: null, moveIn: 3 + Math.random() * 3, fleeing: 0, shake: 0 });
    blip("knock", [
      [180, 0, 0.05, "square", 0.05],
      [180, 0.12, 0.05, "square", 0.05],
    ]);
  }

  for (const t of g.tenants) {
    t.shake = Math.max(0, t.shake - dt);
    if (t.fleeing > 0) {
      t.fleeing -= dt;
      t.x -= 260 * dt;
      continue;
    }
    t.fear = Math.max(0, t.fear - 2.5 * dt);
    t.lease += dt;
    // wander between rooms
    t.moveIn -= dt;
    if (t.moveIn <= 0) {
      t.moveIn = 4 + Math.random() * 5;
      t.room = Math.floor(Math.random() * 6);
      const rr = roomRect(t.room);
      t.x = rr.x + 20 + Math.random() * (rr.w - 40);
      t.tx = rr.x + 20 + Math.random() * (rr.w - 40);
    }
    t.x += Math.sign(t.tx - t.x) * Math.min(Math.abs(t.tx - t.x), 30 * dt);
    if (Math.abs(t.tx - t.x) < 1) {
      const rr = roomRect(t.room);
      t.tx = rr.x + 20 + Math.random() * (rr.w - 40);
    }
    if (t.lease >= LEASE) {
      g.strikes++;
      t.fleeing = -1; // removed below
      const rr = roomRect(t.room);
      g.pops.push({ x: rr.x + rr.w / 2, y: rr.y + 40, text: "LEASE SIGNED!", color: "#ff4d6d", t: 0 });
      blip("signed", [
        [300, 0, 0.15, "square", 0.05],
        [200, 0.15, 0.3, "square", 0.05],
      ]);
    }
  }
  g.tenants = g.tenants.filter((t) => t.fleeing === 0 ? true : t.fleeing > 0 && t.x > -40);
  if (g.strikes >= STRIKES) g.over = true;
}

function haunt(g: Game, room: number) {
  const tr = TRICK[g.selected];
  if (g.selected === "fan" && !FAN_ROOMS.includes(room)) {
    g.pops.push({ x: roomRect(room).x + ROOM_W / 2, y: roomRect(room).y + 70, text: "NO FAN HERE", color: "#8f89b8", t: 0 });
    return;
  }
  if (g.ecto < tr.cost) {
    g.pops.push({ x: roomRect(room).x + ROOM_W / 2, y: roomRect(room).y + 70, text: "LOW ECTO", color: "#8f89b8", t: 0 });
    return;
  }
  g.ecto -= tr.cost;
  g.ghostRoom = room;
  g.fx.push({ room, trick: g.selected, t: 0 });
  if (g.selected === "creak") blip("creak", [[90, 0, 0.5, "sawtooth", 0.05, 140]]);
  if (g.selected === "lights") for (let i = 0; i < 4; i++) tone(60, i * 0.12, 0.06, "square", 0.04);
  if (g.selected === "fan") blip("fan", [[120, 0, 0.9, "triangle", 0.05, 260]]);
  for (const t of g.tenants) {
    if (t.room !== room || t.fleeing) continue;
    const novelty = 1 / (1 + t.used[g.selected] * 0.6);
    const combo = t.lastTrick && t.lastTrick.trick !== g.selected && g.time - t.lastTrick.at < 3 ? 1.5 : 1;
    const gain = tr.power * KIND[t.kind].mult[g.selected] * novelty * combo;
    t.used[g.selected]++;
    t.lastTrick = { trick: g.selected, at: g.time };
    t.fear += gain;
    t.shake = 0.5;
    if (gain === 0) g.pops.push({ x: t.x, y: roomRect(room).y + 60, text: "...WHAT?", color: "#8f89b8", t: 0 });
    else if (combo > 1) g.pops.push({ x: t.x, y: roomRect(room).y + 60, text: "COMBO!", color: "#ffe14d", t: 0 });
    if (t.fear >= 100) {
      t.fleeing = 3;
      t.tx = -60;
      g.evicted++;
      const pts = 100 + Math.round((LEASE - t.lease) * 4);
      g.score += pts;
      g.pops.push({ x: t.x, y: roomRect(room).y + 40, text: `AAAH! +${pts}`, color: "#39ff88", t: 0 });
      blip("scream", [[900, 0, 0.4, "sawtooth", 0.04, 1500]]);
    }
  }
}

const TOOL_Y = 430;
const toolRect = (i: number) => ({ x: 12 + i * 114, y: TOOL_Y, w: 108, h: 70 });

export function GhostLandlord() {
  const [screen, setScreen] = useState<"title" | "play" | "over">("title");
  const [best, submitBest] = useBest("lab.ghost.best");
  const [hud, setHud] = useState({ score: 0, strikes: 0, tenants: 0 });
  const [result, setResult] = useState<{ score: number; evicted: number; best: boolean } | null>(null);
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
        setResult({ score: g.score, evicted: g.evicted, best: submitBest(g.score) });
        setScreen("over");
      }
    }
    if (now - hudAt.current > 100) {
      hudAt.current = now;
      setHud({ score: g.score, strikes: g.strikes, tenants: g.tenants.filter((t) => !t.fleeing).length });
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = ctx2d(canvas, W);
    const t = now / 1000;

    // night sky and the house outline
    cx.fillStyle = "#0b0918";
    cx.fillRect(0, 0, W, H);
    cx.fillStyle = "#2a2350";
    cx.beginPath();
    cx.moveTo(RX - 6, RY[0]);
    cx.lineTo(W / 2, 8);
    cx.lineTo(W - RX + 6, RY[0]);
    cx.fill();
    cx.fillStyle = "#ece9ff";
    cx.beginPath();
    cx.arc(320, 26, 12, 0, Math.PI * 2);
    cx.fill();

    for (let r = 0; r < 6; r++) {
      const rr = roomRect(r);
      const fx = g.fx.filter((f) => f.room === r);
      const shake = fx.some((f) => f.trick === "creak" && f.t < 0.6) ? Math.sin(t * 80) * 2 : 0;
      const dark = fx.some((f) => f.trick === "lights" && f.t < 1.1 && Math.sin(f.t * 40) > -0.2);
      cx.save();
      cx.translate(shake, 0);
      cx.fillStyle = dark ? "#05040b" : "#3a2f63";
      cx.fillRect(rr.x, rr.y, rr.w, rr.h);
      // wallpaper stripes and a lamp
      if (!dark) {
        cx.fillStyle = "rgba(255,255,255,0.03)";
        for (let x = rr.x + 6; x < rr.x + rr.w; x += 14) cx.fillRect(x, rr.y, 6, rr.h - 24);
        const glow = cx.createRadialGradient(rr.x + rr.w / 2, rr.y + 20, 2, rr.x + rr.w / 2, rr.y + 20, 90);
        glow.addColorStop(0, "rgba(255,225,77,0.25)");
        glow.addColorStop(1, "rgba(255,225,77,0)");
        cx.fillStyle = glow;
        cx.fillRect(rr.x, rr.y, rr.w, rr.h);
      }
      cx.fillStyle = dark ? "#2a2350" : "#ffe14d";
      cx.fillRect(rr.x + rr.w / 2 - 6, rr.y + 10, 12, 8);
      // floorboards
      cx.fillStyle = "#5a3b1f";
      cx.fillRect(rr.x, rr.y + rr.h - 20, rr.w, 20);
      cx.strokeStyle = "#3a2b1c";
      for (let x = rr.x + 18; x < rr.x + rr.w; x += 22) {
        cx.beginPath();
        cx.moveTo(x, rr.y + rr.h - 20);
        cx.lineTo(x, rr.y + rr.h);
        cx.stroke();
      }
      // ceiling fan
      if (FAN_ROOMS.includes(r)) {
        const spin = fx.some((f) => f.trick === "fan") ? t * 40 : t * 0.6;
        cx.strokeStyle = "#8f89b8";
        cx.lineWidth = 2;
        cx.beginPath();
        cx.moveTo(rr.x + 30, rr.y);
        cx.lineTo(rr.x + 30, rr.y + 26);
        cx.stroke();
        cx.fillStyle = "#b9b4d9";
        for (let b = 0; b < 3; b++) {
          const a = spin + (b * Math.PI * 2) / 3;
          cx.beginPath();
          cx.ellipse(rr.x + 30 + Math.cos(a) * 12, rr.y + 26, Math.abs(Math.cos(a)) * 12 + 2, 2.5, 0, 0, Math.PI * 2);
          cx.fill();
        }
        if (fx.some((f) => f.trick === "fan")) {
          cx.strokeStyle = "rgba(34,243,255,0.5)";
          for (let i = 0; i < 4; i++) {
            const yy = rr.y + 50 + i * 22 + ((t * 120) % 22);
            cx.beginPath();
            cx.moveTo(rr.x + 10, yy);
            cx.quadraticCurveTo(rr.x + rr.w / 2, yy - 10, rr.x + rr.w - 10, yy);
            cx.stroke();
          }
        }
      }
      if (fx.some((f) => f.trick === "creak" && f.t < 0.9)) {
        cx.font = PIXEL_FONT(7);
        cx.fillStyle = "#c98b5a";
        cx.textAlign = "center";
        cx.fillText("CREEEAK", rr.x + rr.w / 2, rr.y + rr.h - 28);
      }
      cx.restore();
      cx.strokeStyle = "#05040b";
      cx.lineWidth = 3;
      cx.strokeRect(rr.x, rr.y, rr.w, rr.h);
    }
    // front door
    cx.fillStyle = "#8a2340";
    cx.fillRect(RX - 6, RY[1] + ROOM_H - 70, 8, 50);

    // tenants
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    for (const tn of g.tenants) {
      const rr = roomRect(tn.room);
      const y = rr.y + rr.h - 40;
      const sx = tn.shake ? Math.sin(t * 60) * 3 : 0;
      cx.font = "28px sans-serif";
      cx.fillText(tn.fleeing ? "😱" : KIND[tn.kind].emoji, tn.x + sx, y);
      if (tn.fleeing) continue;
      // fear (green) and lease (red) bars
      cx.fillStyle = "#2a2350";
      cx.fillRect(tn.x - 16, y - 26, 32, 4);
      cx.fillRect(tn.x - 16, y - 21, 32, 3);
      cx.fillStyle = "#39ff88";
      cx.fillRect(tn.x - 16, y - 26, 32 * Math.min(1, tn.fear / 100), 4);
      cx.fillStyle = tn.lease > LEASE * 0.75 ? (Math.sin(t * 12) > 0 ? "#ff4d6d" : "#ffe14d") : "#ff4d6d";
      cx.fillRect(tn.x - 16, y - 21, 32 * (tn.lease / LEASE), 3);
    }
    // you
    const gr = roomRect(g.ghostRoom);
    cx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 3);
    cx.font = "26px sans-serif";
    cx.fillText("👻", gr.x + gr.w - 22, gr.y + 48 + Math.sin(t * 2) * 6);
    cx.globalAlpha = 1;

    // ectoplasm and tools
    cx.font = PIXEL_FONT(7);
    cx.fillStyle = "#8f89b8";
    cx.textAlign = "left";
    cx.fillText("ECTOPLASM", 12, TOOL_Y - 22);
    cx.fillStyle = "#2a2350";
    cx.fillRect(90, TOOL_Y - 27, W - 102, 8);
    cx.fillStyle = "#39ff88";
    cx.fillRect(90, TOOL_Y - 27, (W - 102) * (g.ecto / 100), 8);
    cx.textAlign = "center";
    TRICKS.forEach((k, i) => {
      const r = toolRect(i);
      const on = g.selected === k;
      const afford = g.ecto >= TRICK[k].cost;
      cx.fillStyle = on ? TRICK[k].color : "#1d1838";
      cx.globalAlpha = afford ? 1 : 0.45;
      cx.fillRect(r.x, r.y, r.w, r.h);
      cx.strokeStyle = TRICK[k].color;
      cx.lineWidth = 2;
      cx.strokeRect(r.x, r.y, r.w, r.h);
      cx.font = "22px sans-serif";
      cx.fillText(k === "creak" ? "🪵" : k === "lights" ? "💡" : "🌀", r.x + r.w / 2, r.y + 24);
      cx.font = PIXEL_FONT(8);
      cx.fillStyle = on ? "#05040b" : TRICK[k].color;
      cx.fillText(TRICK[k].label, r.x + r.w / 2, r.y + 48);
      cx.font = PIXEL_FONT(6);
      cx.fillText(`${TRICK[k].cost} ECTO`, r.x + r.w / 2, r.y + 61);
      cx.globalAlpha = 1;
    });
    cx.font = PIXEL_FONT(7);
    cx.fillStyle = "#8f89b8";
    cx.fillText("PICK A TRICK, THEN TAP A ROOM", W / 2, TOOL_Y + 92);

    cx.font = PIXEL_FONT(9);
    for (const p of g.pops) {
      cx.globalAlpha = Math.max(0, 1 - p.t / 1.2);
      cx.fillStyle = "#05040b";
      cx.fillText(p.text, p.x + 1, p.y - p.t * 22 + 1);
      cx.fillStyle = p.color;
      cx.fillText(p.text, p.x, p.y - p.t * 22);
    }
    cx.globalAlpha = 1;
  });

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gameRef.current;
    if (!playing.current) return;
    e.preventDefault();
    const [x, y] = toLogical(e, e.currentTarget, W, H);
    const ti = TRICKS.findIndex((_, i) => {
      const r = toolRect(i);
      return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    });
    if (ti >= 0) {
      g.selected = TRICKS[ti];
      blip("pick", [[660, 0, 0.04, "square", 0.03]]);
      return;
    }
    for (let r = 0; r < 6; r++) {
      const rr = roomRect(r);
      if (x >= rr.x && x <= rr.x + rr.w && y >= rr.y && y <= rr.y + rr.h) return haunt(g, r);
    }
  };

  return (
    <LabShell title="GHOST LANDLORD" color="#b26bff">
      <div className="flex h-9 shrink-0 items-center justify-between px-3 font-pixel text-[8px]">
        <span className="text-dim">
          LEASES{" "}
          {Array.from({ length: STRIKES }, (_, i) => (
            <span key={i} className={i < hud.strikes ? "text-red" : "text-line"}>
              ✖
            </span>
          ))}
        </span>
        <span className="text-dim">
          TENANTS <span className="text-ink">{hud.tenants}</span>
        </span>
        <span className="text-purple">{hud.score}</span>
      </div>
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        <canvas ref={canvasRef} className="block touch-none" onPointerDown={onDown} />
        {screen === "title" && (
          <TitleCard a="GHOST" b="LANDLORD" colorA="#b26bff" colorB="#39ff88" blurb="It's your house. You died in it. Strangers keep moving in. Get rid of them." best={best} onPlay={start}>
            <p>Pick a trick at the bottom, then tap a room: 🪵 creaky floorboards, 💡 flickering lights, or 🌀 the haunted fan (only rooms with a fan). Tricks cost ectoplasm, which refills over time.</p>
            <p>Tenants get used to the same trick, so mix them up. Two different tricks within 3 seconds is a COMBO. A full green bar sends them running.</p>
            <p>The red bar is the lease. If it fills, they sign, and three signed leases means you lose the house.</p>
            <ul className="space-y-0.5">
              {(Object.keys(KIND) as Kind[]).map((k) => (
                <li key={k}>
                  {KIND[k].emoji} {KIND[k].desc}
                </li>
              ))}
            </ul>
          </TitleCard>
        )}
        {screen === "over" && result && (
          <GameOverCard title="FULLY LET" score={result.score} isBest={result.best} best={best} color="#b26bff" line={`You scared off ${result.evicted} ${result.evicted === 1 ? "tenant" : "tenants"} before the house filled up.`} again={start} />
        )}
      </div>
    </LabShell>
  );
}
