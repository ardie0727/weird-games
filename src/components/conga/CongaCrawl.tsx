"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BOSS_FLOOR, COLS, DX, DY, ENEMIES, ENTRY, EXIT, FLOORS, GUESTS, LEADER_ORDER, LEADERS, PERKS, ROWS, TICK, choosePerk, lv, newMeta, newRun, recordRun, steer, step, takeFx, type Dir, type Enemy, type Fx, type GuestKind, type LeaderId, type Meta, type PerkId, type Run, type SoundName } from "@/lib/conga/engine";
import { load, save } from "@/lib/client/storage";
import { currentTheme } from "@/lib/client/theme";
import { blip, unlock } from "@/lib/lab/sound";
import { BigButton, LabShell, Overlay, PIXEL_FONT, ctx2d, useFitCanvas, useLoop } from "@/components/lab/LabShell";
import { sprite, type Team, type Theme } from "./sprites";

// Conga Crawl: lead a wedding conga line down nine cursed floors of a banquet hall.
// The engine lives in src/lib/conga/engine.ts; this file draws it and reads your thumbs.

const CELL = 24;
const W = COLS * CELL;
const H = ROWS * CELL;
const META_KEY = "cc.meta";
const PINK = "#ff2bd6";
const GOLD = "#ffe14d";
const CYAN = "#22f3ff";

const PAL = {
  dark: {
    floorA: "#0d0a1c",
    floorB: "#151030",
    lights: ["#ff2bd6", "#22f3ff", "#ffe14d", "#39ff88", "#b26bff"],
    lightAlpha: 0.14,
    wall: "#241d47",
    wallEdge: "#ff2bd6",
    cloth: "#2f2763",
    clothEdge: "#22f3ff",
    clothStripe: "#3d3480",
    door: "#39ff88",
    doorShut: "#5a4f8f",
    ink: "#ece9ff",
    dim: "#8f89b8",
    link: "rgba(34,243,255,0.55)",
    warn: "#ff4d6d",
    drop: "#ff2bd6",
    shadow: "rgba(0,0,0,0.45)",
  },
  light: {
    floorA: "#fffaf0",
    floorB: "#f1e6cf",
    lights: ["#ff7ab8", "#5fd3e0", "#ffd75e", "#7be3a0", "#c7a2ff"],
    lightAlpha: 0.3,
    wall: "#d6c7aa",
    wallEdge: "#141210",
    cloth: "#ffffff",
    clothEdge: "#141210",
    clothStripe: "#f3b7c8",
    door: "#13824a",
    doorShut: "#8c7d64",
    ink: "#141210",
    dim: "#6f6352",
    link: "rgba(20,18,16,0.45)",
    warn: "#d22d4b",
    drop: "#c21aa0",
    shadow: "rgba(20,18,16,0.18)",
  },
};

type Pal = (typeof PAL)["dark"];

interface Live {
  k: Fx["k"];
  x: number;
  y: number;
  t0: number;
  text?: string;
  tone?: string;
  r?: number;
  color?: string;
}

// ---------- sound ----------

function sound(name: SoundName | "beat", floor = 1, beat = 0) {
  switch (name) {
    case "beat": {
      // the conga: da-da-da-da-da-DA, hey!
      const root = 98 * Math.pow(2, ((floor - 1) % 5) / 12);
      const steps = [0, 0, 7, 7, 0, 0, 7, 10];
      const f = root * Math.pow(2, steps[beat % 8] / 12);
      const notes: [number, number, number, OscillatorType?, number?, number?][] = [[f, 0, 0.11, "triangle", 0.09]];
      if (beat % 8 === 5) notes.push([f * 4, 0, 0.06, "square", 0.02]);
      if (beat % 8 === 7) notes.push([f * 3, 0, 0.09, "square", 0.025, f * 4]);
      return blip("beat", notes);
    }
    case "recruit":
      return blip(name, [[660, 0, 0.06], [880, 0.06, 0.07], [1320, 0.12, 0.1]]);
    case "hit":
      return blip(name, [[240, 0, 0.18, "sawtooth", 0.05, 110]]);
    case "kill":
      return blip(name, [[880, 0, 0.04, "square", 0.03], [1320, 0.04, 0.06, "square", 0.03]]);
    case "bonk":
      return blip(name, [[150, 0, 0.08, "square", 0.05, 90]]);
    case "snap":
      return blip(name, [[420, 0, 0.1, "sawtooth", 0.05, 150], [300, 0.1, 0.16, "sawtooth", 0.05, 100]]);
    case "open":
      return blip(name, [[523, 0, 0.08], [659, 0.08, 0.08], [784, 0.16, 0.08], [1047, 0.24, 0.16]]);
    case "floor":
      return blip(name, [[784, 0, 0.08], [988, 0.08, 0.08], [1175, 0.16, 0.08], [1568, 0.24, 0.2]]);
    case "boss":
      return blip(name, [[110, 0, 0.3, "sawtooth", 0.06], [104, 0.3, 0.3, "sawtooth", 0.06], [98, 0.6, 0.5, "sawtooth", 0.06]]);
    case "dead":
      return blip(name, [[523, 0, 0.18], [415, 0.18, 0.18], [330, 0.36, 0.18], [262, 0.54, 0.4]]);
    case "won":
      return blip(name, [[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.12], [784, 0.42, 0.1], [1047, 0.52, 0.3]]);
    case "pickup":
      return blip(name, [[1046, 0, 0.05], [1568, 0.05, 0.1]]);
    case "throw":
      return blip(name, [[700, 0, 0.04, "triangle", 0.025, 420]]);
    case "bass":
      return blip(name, [[90, 0, 0.22, "sine", 0.14, 45]]);
    case "flash":
      return blip(name, [[2200, 0, 0.05, "square", 0.02, 3200]]);
    case "warn":
      return blip(name, [[880, 0, 0.07, "square", 0.03], [880, 0.14, 0.07, "square", 0.03]]);
    case "slam":
      return blip(name, [[80, 0, 0.22, "sawtooth", 0.08, 40]]);
  }
}

// ---------- drawing ----------

const SPR = 30; // 10px sprite canvas drawn at 3x, centred on a 24px cell

function drawSprite(cx: CanvasRenderingContext2D, name: string, team: Team, theme: Theme, x: number, y: number, scale = 1, white = false) {
  const s = SPR * scale;
  cx.drawImage(sprite(name, team, theme, white), Math.round(x - s / 2), Math.round(y - s / 2), s, s);
}

const cxOf = (x: number) => x * CELL + CELL / 2;

function drawRoom(cx: CanvasRenderingContext2D, r: Run, P: Pal, theme: Theme, now: number) {
  // the dance floor, with tiles lighting up to the beat
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      cx.fillStyle = (x + y) % 2 ? P.floorA : P.floorB;
      cx.fillRect(x * CELL, y * CELL, CELL, CELL);
      let h = (x * 374761393 + y * 668265263 + r.beat * 2246822519) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      if (((h ^ (h >>> 16)) >>> 0) % 13 === 0) {
        cx.globalAlpha = P.lightAlpha;
        cx.fillStyle = P.lights[(x + y + r.beat) % P.lights.length];
        cx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
        cx.globalAlpha = 1;
      }
    }
  // walls and banquet tables
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      if (!r.walls[y * COLS + x]) continue;
      const border = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
      if (border) {
        cx.fillStyle = P.wall;
        cx.fillRect(x * CELL, y * CELL, CELL, CELL);
        cx.fillStyle = P.wallEdge;
        cx.globalAlpha = 0.5;
        if (y === 0) cx.fillRect(x * CELL, CELL - 2, CELL, 2);
        if (y === ROWS - 1) cx.fillRect(x * CELL, y * CELL, CELL, 2);
        if (x === 0) cx.fillRect(CELL - 2, y * CELL, 2, CELL);
        if (x === COLS - 1) cx.fillRect(x * CELL, y * CELL, 2, CELL);
        cx.globalAlpha = 1;
      } else {
        cx.fillStyle = P.cloth;
        cx.fillRect(x * CELL, y * CELL, CELL, CELL);
        cx.fillStyle = P.clothStripe;
        for (let i = 0; i < CELL; i += 8) cx.fillRect(x * CELL + i, y * CELL, 4, CELL);
        cx.fillStyle = P.clothEdge;
        const k = (dx: number, dy: number) => r.walls[(y + dy) * COLS + x + dx] && !(x + dx === 0 || y + dy === 0 || x + dx === COLS - 1 || y + dy === ROWS - 1);
        if (!k(0, -1)) cx.fillRect(x * CELL, y * CELL, CELL, 2);
        if (!k(0, 1)) {
          cx.fillRect(x * CELL, y * CELL + CELL - 2, CELL, 2);
          // tablecloth fringe
          for (let i = 2; i < CELL; i += 6) cx.fillRect(x * CELL + i, y * CELL + CELL, 2, 3);
        }
        if (!k(-1, 0)) cx.fillRect(x * CELL, y * CELL, 2, CELL);
        if (!k(1, 0)) cx.fillRect(x * CELL + CELL - 2, y * CELL, 2, CELL);
      }
    }
  for (const c of r.cakes) drawSprite(cx, "cake", "item", theme, cxOf(c.x), cxOf(c.y));
  // the exit door at the top, the way in at the bottom
  const ex = EXIT.x * CELL, ey = EXIT.y * CELL;
  if (r.exitOpen) {
    const pulse = 0.6 + 0.4 * Math.sin(now / 160);
    cx.fillStyle = P.door;
    cx.globalAlpha = pulse;
    cx.fillRect(ex + 2, ey, CELL - 4, CELL);
    cx.globalAlpha = 1;
    cx.fillStyle = P.floorA;
    cx.font = PIXEL_FONT(10);
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    cx.fillText("▲", ex + CELL / 2, ey + CELL / 2 + 1);
  } else {
    cx.fillStyle = P.doorShut;
    cx.fillRect(ex + 3, ey + 3, CELL - 6, CELL - 4);
    cx.fillStyle = P.wallEdge;
    cx.fillRect(ex + CELL / 2 - 1, ey + 8, 2, 8);
  }
  cx.fillStyle = P.floorB;
  cx.fillRect(ENTRY.x * CELL + 3, ENTRY.y * CELL, CELL - 6, CELL);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function drawEnemy(cx: CanvasRenderingContext2D, e: Enemy, frac: number, theme: Theme, P: Pal, now: number) {
  const def = ENEMIES[e.kind];
  const t = e.kind === "djboss" ? 1 : Math.min(1, (e.clock + frac) / e.every);
  const s = def.size;
  const x = lerp(e.px, e.x, e.stun > 0 ? 1 : t) * CELL + (s * CELL) / 2;
  const y = lerp(e.py, e.y, e.stun > 0 ? 1 : t) * CELL + (s * CELL) / 2;
  const team: Team = def.boss ? "boss" : "enemy";
  const hop = e.stun > 0 ? 0 : Math.abs(Math.sin(now / 120 + e.id)) * 2;
  // rival conga dancers behind their leader
  for (let i = e.tail.length - 1; i >= 0; i--) {
    const a = e.ptail[i] ?? e.tail[i], b = e.tail[i];
    drawSprite(cx, "rival", "enemy", theme, lerp(a.x, b.x, t) * CELL + CELL / 2, lerp(a.y, b.y, t) * CELL + CELL / 2 - Math.abs(Math.sin(now / 120 + i)) * 2, 0.85);
  }
  cx.fillStyle = P.shadow;
  cx.fillRect(x - (s * CELL) / 3, y + (s * CELL) / 2 - 5, (s * CELL * 2) / 3, 3);
  drawSprite(cx, e.kind, team, theme, x, y - hop, s * (def.boss ? 1.05 : 1), e.hurt > 0);
  if (e.kind === "djboss") {
    // the booth
    cx.fillStyle = P.wall;
    cx.fillRect(e.x * CELL - 10, (e.y + 2) * CELL - 10, 2 * CELL + 20, 12);
    cx.fillStyle = P.lights[Math.floor(now / 200) % P.lights.length];
    cx.fillRect(e.x * CELL - 6, (e.y + 2) * CELL - 6, 2 * CELL + 12, 3);
  }
  if (e.stun > 0) {
    cx.fillStyle = GOLD;
    cx.font = PIXEL_FONT(7);
    cx.textAlign = "center";
    cx.fillText("z", x + 9, y - 12 - (Math.floor(now / 200) % 2) * 2);
  }
  if (!def.boss && e.max > 1 && e.hp < e.max) {
    cx.fillStyle = P.shadow;
    cx.fillRect(x - 9, y - 16, 18, 3);
    cx.fillStyle = P.warn;
    cx.fillRect(x - 9, y - 16, (18 * e.hp) / e.max, 3);
  }
}

function draw(cx: CanvasRenderingContext2D, r: Run, frac: number, theme: Theme, now: number, live: Live[]) {
  const P = PAL[theme];
  cx.imageSmoothingEnabled = false;
  drawRoom(cx, r, P, theme, now);

  // telegraphed floor attacks
  for (const h of r.hazards) {
    const on = h.t < 10 || Math.floor(now / 90) % 2 === 0;
    cx.globalAlpha = on ? 0.55 : 0.25;
    cx.fillStyle = h.kind === "cleaver" ? P.warn : P.drop;
    cx.fillRect(h.x * CELL + 2, h.y * CELL + 2, CELL - 4, CELL - 4);
    cx.globalAlpha = 1;
  }
  // chef pots
  for (const p of r.pots) drawSprite(cx, "pot", "item", theme, cxOf(p.x), cxOf(p.y) + 1, 0.8);
  // incoming poopers
  for (const s of r.spawns) {
    cx.fillStyle = P.warn;
    cx.font = PIXEL_FONT(12);
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    if (Math.floor(now / 120) % 2) cx.fillText("!", cxOf(s.x), cxOf(s.y));
    cx.strokeStyle = P.warn;
    cx.lineWidth = 2;
    const k = 4 + (s.t / 24) * 8;
    cx.strokeRect(cxOf(s.x) - k, cxOf(s.y) - k, k * 2, k * 2);
  }
  // pickups
  for (const p of r.pickups) drawSprite(cx, p.kind, "item", theme, cxOf(p.x), cxOf(p.y) - Math.abs(Math.sin(now / 250 + p.x)) * 3, 0.8);
  // guests waiting to join, and dropped dancers about to wander off
  for (const g of r.guests) {
    if (g.t > 0 && g.t < 30 && Math.floor(now / 100) % 2) continue;
    const wave = Math.sin(now / 180 + g.x * 2) * 2;
    drawSprite(cx, g.kind, "guest", theme, cxOf(g.x) + wave, cxOf(g.y));
    if (g.t < 0) {
      cx.fillStyle = theme === "dark" ? "#39ff88" : "#13824a";
      cx.font = PIXEL_FONT(7);
      cx.textAlign = "center";
      cx.fillText("JOIN", cxOf(g.x), g.y * CELL - 8);
    }
  }
  for (const e of r.enemies) drawEnemy(cx, e, frac, theme, P, now);

  // the conga line, back to front, holding shoulders
  const pts = r.body.map((b, i) => {
    const a = r.prev[i] ?? b;
    const hop = Math.abs(Math.sin((frac + i * 0.5) * Math.PI)) * 3;
    return { x: lerp(a.x, b.x, frac) * CELL + CELL / 2, y: lerp(a.y, b.y, frac) * CELL + CELL / 2, hop };
  });
  cx.strokeStyle = P.link;
  cx.lineWidth = 3;
  cx.beginPath();
  pts.forEach((p, i) => (i ? cx.lineTo(p.x, p.y + 2) : cx.moveTo(p.x, p.y + 2)));
  cx.stroke();
  const blink = r.invuln > 0 && r.phase === "play" && Math.floor(now / 80) % 2 === 0;
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    if (blink) cx.globalAlpha = 0.45;
    cx.fillStyle = P.shadow;
    cx.fillRect(p.x - 8, p.y + 10, 16, 3);
    if (i === 0) drawSprite(cx, r.leader, "leader", theme, p.x, p.y - p.hop, 1.05);
    else drawSprite(cx, r.members[i - 1].kind, "line", theme, p.x, p.y - p.hop);
    cx.globalAlpha = 1;
  }
  if (r.discoT > 0) {
    cx.strokeStyle = P.lights[Math.floor(now / 80) % P.lights.length];
    cx.lineWidth = 2;
    for (const p of pts) cx.strokeRect(p.x - 13, p.y - 13, 26, 26);
  }
  // where the leader is heading (and the next queued turn), so steering is readable on a phone
  if (r.phase === "play" || r.phase === "ready") {
    const head = r.body[0];
    const d = r.queue.length ? r.queue[0] : r.dir;
    const ax = cxOf(head.x + DX[d] * 0.85), ay = cxOf(head.y + DY[d] * 0.85);
    cx.fillStyle = theme === "dark" ? GOLD : "#a86f00";
    cx.globalAlpha = 0.8;
    cx.beginPath();
    const s = 5;
    const fx = DX[d], fy = DY[d];
    cx.moveTo(ax + fx * s, ay + fy * s);
    cx.lineTo(ax - fy * s - fx * 2, ay + fx * s - fy * 2);
    cx.lineTo(ax + fy * s - fx * 2, ay - fx * s - fy * 2);
    cx.closePath();
    cx.fill();
    cx.globalAlpha = 1;
  }

  // flying things
  for (const s of r.shots) {
    const x = s.x * CELL + CELL / 2 + s.vx * CELL * frac, y = s.y * CELL + CELL / 2 + s.vy * CELL * frac;
    if (s.kind === "ladoo") {
      cx.fillStyle = "#ffb52e";
      cx.beginPath();
      cx.arc(x, y, 4, 0, Math.PI * 2);
      cx.fill();
      cx.fillStyle = "#fff3b0";
      cx.fillRect(x - 2, y - 2, 2, 2);
    } else if (s.kind === "plate") {
      cx.fillStyle = "#ffffff";
      cx.strokeStyle = P.warn;
      cx.lineWidth = 2;
      cx.beginPath();
      cx.ellipse(x, y, 6, 4, now / 80, 0, Math.PI * 2);
      cx.fill();
      cx.stroke();
    } else if (s.kind === "slipper" || s.kind === "chappal") {
      cx.save();
      cx.translate(x, y);
      cx.rotate(now / 70);
      cx.fillStyle = s.kind === "slipper" ? "#b26bff" : "#7a4a24";
      cx.fillRect(-5, -3, 10, 6);
      cx.fillStyle = s.ally ? GOLD : P.warn;
      cx.fillRect(-1, -3, 2, 6);
      cx.restore();
    } else {
      cx.fillStyle = P.drop;
      cx.font = PIXEL_FONT(10);
      cx.textAlign = "center";
      cx.textBaseline = "middle";
      cx.fillText("♪", x, y);
    }
  }

  // short-lived effects
  for (const f of live) {
    const age = now - f.t0;
    if (f.k === "ring") {
      const t = age / 400;
      cx.globalAlpha = Math.max(0, 1 - t);
      cx.strokeStyle = f.color === "bass" ? PINK : f.color === "flash" ? (theme === "dark" ? "#ffffff" : GOLD) : CYAN;
      cx.lineWidth = 3;
      cx.beginPath();
      cx.arc(cxOf(f.x), cxOf(f.y), (f.r ?? 2) * CELL * Math.min(1, t * 1.6), 0, Math.PI * 2);
      cx.stroke();
      if (f.color === "flash" && age < 90) {
        cx.globalAlpha = 0.25 * (1 - age / 90);
        cx.fillStyle = "#ffffff";
        cx.fillRect(0, 0, W, H);
      }
      cx.globalAlpha = 1;
    } else if (f.k === "kick") {
      const t = age / 250;
      cx.globalAlpha = Math.max(0, 1 - t);
      cx.fillStyle = GOLD;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        cx.fillRect(cxOf(f.x) + Math.cos(a) * (6 + t * 12) - 2, cxOf(f.y) + Math.sin(a) * (6 + t * 12) - 2, 4, 4);
      }
      cx.globalAlpha = 1;
    } else if (f.k === "boom") {
      const t = age / 450;
      cx.globalAlpha = Math.max(0, 1 - t);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + k;
        cx.fillStyle = P.lights[k % P.lights.length];
        const d = 4 + t * 22 * (0.6 + (k % 3) * 0.25);
        cx.fillRect(cxOf(f.x) + Math.cos(a) * d - 2, cxOf(f.y) + Math.sin(a) * d - 2, 4, 4);
      }
      cx.globalAlpha = 1;
    } else if (f.k === "pop") {
      const t = age / 900;
      cx.globalAlpha = Math.max(0, 1 - t * t);
      cx.font = PIXEL_FONT(f.text && f.text.length > 8 ? 7 : 9);
      cx.textAlign = "center";
      cx.textBaseline = "middle";
      const x = Math.max(40, Math.min(W - 40, cxOf(f.x))), y = cxOf(f.y) - 14 - t * 22;
      cx.fillStyle = P.shadow;
      cx.fillText(f.text ?? "", x + 1, y + 1);
      cx.fillStyle = f.tone === "bad" ? P.warn : f.tone === "gold" ? (theme === "dark" ? GOLD : "#a86f00") : theme === "dark" ? "#39ff88" : "#13824a";
      cx.fillText(f.text ?? "", x, y);
      cx.globalAlpha = 1;
    }
  }

  // "get ready" card on the floor itself
  if (r.phase === "ready") {
    cx.fillStyle = theme === "dark" ? "rgba(5,4,11,0.72)" : "rgba(255,250,240,0.8)";
    cx.fillRect(0, H / 2 - 52, W, 92);
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    cx.font = PIXEL_FONT(16);
    const boss = BOSS_FLOOR[r.floor];
    cx.fillStyle = boss ? (theme === "dark" ? PINK : "#c21aa0") : theme === "dark" ? GOLD : "#a86f00";
    cx.fillText(boss ? ENEMIES[boss].name : `FLOOR ${r.floor}`, W / 2, H / 2 - 24);
    cx.font = PIXEL_FONT(8);
    cx.fillStyle = P.ink;
    cx.fillText(boss ? `BOSS · FLOOR ${r.floor} OF ${FLOORS}` : "CLEAR THE POOPERS, THEN THE DOOR OPENS", W / 2, H / 2 + 2);
    cx.fillStyle = P.dim;
    if (Math.floor(now / 400) % 2) cx.fillText("SWIPE OR PRESS AN ARROW TO DANCE", W / 2, H / 2 + 22);
  }
}

// ---------- UI ----------

interface Hud {
  floor: number;
  score: number;
  line: number;
  dignity: number;
  maxDignity: number;
  boss: { name: string; pct: number } | null;
}

function hudOf(r: Run): Hud {
  const b = r.enemies.find((e) => ENEMIES[e.kind].boss);
  return { floor: r.floor, score: r.score, line: r.members.length, dignity: r.dignity, maxDignity: r.maxDignity, boss: b ? { name: ENEMIES[b.kind].name, pct: Math.max(0, b.hp / b.max) } : null };
}

const SPRITE_ICON: Record<GuestKind, string> = { aunty: "🍬", uncle: "🕺", dj: "🎧", photo: "📸", baby: "👶", chef: "🍲" };

export function CongaCrawl() {
  const { wrapRef, canvasRef } = useFitCanvas(W, H);
  const runRef = useRef<Run | null>(null);
  const accRef = useRef(0);
  const liveRef = useRef<Live[]>([]);
  const [meta, setMeta] = useState<Meta>(newMeta);
  const [leader, setLeader] = useState<LeaderId>("dada");
  const [screen, setScreen] = useState<"title" | "game">("title");
  const [phase, setPhase] = useState<Run["phase"]>("ready");
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState<Hud | null>(null);
  const [result, setResult] = useState<{ unlocked: LeaderId[]; best: boolean } | null>(null);
  const [touch, setTouch] = useState(false);
  const hudKey = useRef("");
  const attract = useRef<Run | null>(null);

  useEffect(() => {
    const m = { ...newMeta(), ...load<Partial<Meta>>(META_KEY, {}) };
    setMeta(m);
    setLeader(load<LeaderId>("cc.leader", "dada"));
    setTouch(window.matchMedia?.("(pointer: coarse)").matches ?? false);
  }, []);

  const start = useCallback(
    (who: LeaderId) => {
      unlock();
      const pick = meta.unlocked.includes(who) ? who : "dada";
      save("cc.leader", pick);
      runRef.current = newRun((Date.now() ^ (Math.random() * 1e9)) >>> 0, pick);
      accRef.current = 0;
      liveRef.current = [];
      setResult(null);
      setPaused(false);
      setPhase("ready");
      setScreen("game");
      sound("open");
    },
    [meta],
  );

  const finish = useCallback((r: Run) => {
    const m = { ...newMeta(), ...load<Partial<Meta>>(META_KEY, {}) };
    const wasBest = r.score > m.best;
    const unlocked = recordRun(m, r);
    save(META_KEY, m);
    setMeta(m);
    setResult({ unlocked, best: wasBest });
  }, []);

  // the game clock
  useLoop((dt, now) => {
    const canvas = canvasRef.current;
    const r = runRef.current;
    if (!canvas) return;
    const cx = ctx2d(canvas, W);
    const theme: Theme = currentTheme();
    if (!r || screen !== "game") {
      // attract mode: an empty dance floor behind the title card
      const demo = (attract.current ??= newRun(7, "dada"));
      demo.beat = Math.floor(now / 400);
      draw(cx, demo, 0, theme, now, []);
      return;
    }
    if (!paused && (r.phase === "play" || r.phase === "ready")) {
      accRef.current += dt;
      while (accRef.current >= TICK) {
        accRef.current -= TICK;
        const beat = r.beat;
        step(r);
        if (r.beat !== beat) sound("beat", r.floor, r.beat);
        for (const f of takeFx(r)) {
          if (f.k === "snd") sound(f.name);
          else liveRef.current.push({ ...f, t0: now } as Live);
        }
        if (r.phase !== "play" && r.phase !== "ready") break;
      }
    }
    liveRef.current = liveRef.current.filter((f) => now - f.t0 < 900);
    const frac = r.phase === "play" && !paused && r.stun <= 0 ? Math.min(1, (r.clock + accRef.current / TICK) / (r.every + lv(r, "slow"))) : 1;
    draw(cx, r, frac, theme, now, liveRef.current);
    // keep React in step only when something on the HUD or the phase changes
    const h = hudOf(r);
    const key = JSON.stringify(h) + r.phase;
    if (key !== hudKey.current) {
      hudKey.current = key;
      setHud(h);
      if (r.phase !== phase) {
        setPhase(r.phase);
        if (r.phase === "dead" || r.phase === "won") finish(r);
      }
    }
  });
  // dev-only handle for screenshot scripts
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") (window as unknown as { __cc: unknown }).__cc = { runRef, choosePerk };
  }, []);

  // keyboard
  useEffect(() => {
    const keys: Record<string, Dir> = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
    const down = (e: KeyboardEvent) => {
      const r = runRef.current;
      if (screen === "title") {
        if (e.code === "Space" || e.code === "Enter") {
          e.preventDefault();
          start(leader);
        }
        return;
      }
      if (!r) return;
      if (e.code in keys) {
        e.preventDefault();
        if (!paused) steer(r, keys[e.code]);
        return;
      }
      if ((e.code === "KeyP" || e.code === "Escape") && (r.phase === "play" || r.phase === "ready")) setPaused((p) => !p);
      if (r.phase === "perk" && ["Digit1", "Digit2", "Digit3"].includes(e.code)) {
        const p = r.offer[Number(e.code.slice(-1)) - 1];
        if (p) pickPerk(p);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  });

  // pause when the tab is hidden
  useEffect(() => {
    const vis = () => {
      if (document.hidden && runRef.current && (runRef.current.phase === "play" || runRef.current.phase === "ready")) setPaused(true);
    };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, []);

  // swipes: a turn fires as soon as the thumb has moved far enough, and you can chain them
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    unlock();
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onMove = (e: React.PointerEvent) => {
    const s = swipe.current;
    const r = runRef.current;
    if (!s || s.id !== e.pointerId || !r || paused) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
    const d: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
    steer(r, d);
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onUp = () => {
    swipe.current = null;
  };

  const pickPerk = (p: PerkId) => {
    const r = runRef.current;
    if (!r) return;
    choosePerk(r, p);
    sound("pickup");
    accRef.current = 0;
    setPhase(r.phase);
  };

  const r = runRef.current;
  const pauseBtn =
    screen === "game" && (phase === "play" || phase === "ready") ? (
      <button className="font-pixel text-[9px] text-dim" onClick={() => setPaused((p) => !p)} aria-label={paused ? "Resume" : "Pause"}>
        {paused ? "▶" : "❚❚"}
      </button>
    ) : null;

  return (
    <LabShell title="CONGA CRAWL" color={PINK} right={pauseBtn}>
      {/* HUD */}
      <div className="mx-auto flex h-9 w-full max-w-xl shrink-0 items-center justify-between gap-2 px-3 font-pixel text-[8px]">
        {screen === "game" && hud ? (
          <>
            <div className="text-yellow">
              FLOOR {hud.floor}/{FLOORS}
            </div>
            <div className="flex items-center gap-1" aria-label={`Dignity ${hud.dignity} of ${hud.maxDignity}`}>
              <span className="text-dim">DIGNITY</span>
              {Array.from({ length: hud.maxDignity }, (_, i) => (
                <span key={i} className={`inline-block h-2.5 w-2.5 ${i < hud.dignity ? "bg-pink" : "border border-line"}`} />
              ))}
            </div>
            <div className="text-cyan">LINE {hud.line}</div>
            <div className="text-ink">{hud.score}</div>
          </>
        ) : (
          <div className="w-full text-center text-dim">BEST {meta.best} · DEEPEST FLOOR {meta.bestFloor}</div>
        )}
      </div>
      {screen === "game" && hud?.boss && (
        <div className="mx-auto mb-1 w-full max-w-xl shrink-0 px-3">
          <div className="mb-0.5 text-center font-pixel text-[7px] text-pink">{hud.boss.name}</div>
          <div className="h-1.5 w-full border border-line">
            <div className="h-full bg-pink transition-[width]" style={{ width: `${hud.boss.pct * 100}%` }} />
          </div>
        </div>
      )}
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-2" style={{ touchAction: "none" }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <canvas ref={canvasRef} className="block" style={{ imageRendering: "pixelated" }} />

        {screen === "title" && (
          <Overlay glow={PINK}>
            <div className="text-center font-pixel text-[20px] leading-snug">
              <span className="text-pink neon">CONGA</span> <span className="text-yellow neon">CRAWL</span>
            </div>
            <p className="mt-3 text-center text-[19px] leading-snug text-ink/85">The wedding is cursed and the party is nine floors down. Lead a conga line through it. Guests you bump into join the line and fight for you.</p>
            <div className="mt-4 grid gap-2">
              {LEADER_ORDER.map((id) => {
                const L = LEADERS[id];
                const open = meta.unlocked.includes(id);
                return (
                  <button
                    key={id}
                    disabled={!open}
                    onClick={() => setLeader(id)}
                    className={`border-2 px-3 py-2 text-left ${leader === id && open ? "border-pink bg-pink/10" : "border-line"} ${open ? "" : "opacity-50"}`}
                  >
                    <div className="font-pixel text-[9px] text-yellow">{open ? L.name.toUpperCase() : `🔒 ${L.unlock.toUpperCase()}`}</div>
                    {open && <div className="mt-1 text-[16px] leading-tight text-ink/80">{L.blurb}</div>}
                  </button>
                );
              })}
            </div>
            <BigButton onClick={() => start(leader)} color={PINK}>
              ▶ START THE CONGA
            </BigButton>
            <div className="mt-4 space-y-1 border-t border-line pt-3 text-[16px] leading-snug text-dim">
              <p>{touch ? "Swipe anywhere to steer the leader." : "Arrow keys or WASD steer the leader. P pauses."} The line follows by itself.</p>
              <p>Getting hit knocks the last dancer off. Grab them back before they wander away. Hit with nobody behind you and you lose Dignity.</p>
              <p>Running into your own line snaps it there. Bumping a wall or table knocks a dancer off too.</p>
              <p className="pt-1">
                {Object.entries(GUESTS)
                  .map(([k, g]) => `${SPRITE_ICON[k as GuestKind]} ${g.name}: ${g.does}`)
                  .join("  ")}
              </p>
            </div>
          </Overlay>
        )}

        {screen === "game" && paused && (phase === "play" || phase === "ready") && (
          <Overlay glow={CYAN}>
            <div className="text-center font-pixel text-[16px] text-cyan neon">PAUSED</div>
            <p className="mt-3 text-center text-[18px] text-ink/80">The conga waits, mid-kick.</p>
            <BigButton onClick={() => setPaused(false)} color={CYAN}>
              ▶ KEEP DANCING
            </BigButton>
            <button className="mt-3 block w-full py-2 font-pixel text-[9px] text-dim" onClick={() => setScreen("title")}>
              QUIT TO TITLE
            </button>
          </Overlay>
        )}

        {screen === "game" && r && phase === "perk" && (
          <Overlay glow={GOLD}>
            <div className="text-center font-pixel text-[13px] text-yellow neon">FLOOR {r.floor} CLEARED!</div>
            <p className="mt-2 text-center text-[18px] text-ink/80">The band plays a new move. Pick one.</p>
            <div className="mt-3 grid gap-2">
              {r.offer.map((p, i) => (
                <button key={p} onClick={() => pickPerk(p)} className="border-2 border-line px-3 py-2 text-left hover:border-yellow active:scale-[0.98]">
                  <div className="font-pixel text-[9px] text-yellow">
                    {!touch && <span className="text-dim">{i + 1} </span>}
                    {PERKS[p].name.toUpperCase()}
                    {lv(r, p) > 0 && <span className="text-cyan"> LV{lv(r, p) + 1}</span>}
                  </div>
                  <div className="mt-1 text-[16px] leading-tight text-ink/80">{PERKS[p].desc}</div>
                </button>
              ))}
            </div>
            {BOSS_FLOOR[r.floor + 1] && <p className="mt-3 text-center font-pixel text-[8px] text-pink blink">BOSS NEXT: {ENEMIES[BOSS_FLOOR[r.floor + 1]].name}</p>}
          </Overlay>
        )}

        {screen === "game" && r && (phase === "dead" || phase === "won") && (
          <Overlay glow={phase === "won" ? GOLD : PINK}>
            <div className={`text-center font-pixel text-[15px] leading-snug neon ${phase === "won" ? "text-yellow" : "text-red"}`}>{phase === "won" ? "THE WEDDING IS SAVED!" : "THE PARTY'S OVER"}</div>
            <p className="mt-2 text-center text-[18px] text-ink/80">
              {phase === "won" ? "The DJ finally plays a slow song. Everyone goes home happy." : r.floor >= 7 ? "So close to the DJ booth. The aunties will talk about this for years." : r.floor >= 4 ? "Not bad. Your line made it further than the buffet." : "Your dignity has left the building."}
            </p>
            <div className="mt-4 text-center font-pixel text-[26px] text-pink neon">{r.score}</div>
            {result?.best && <div className="mt-1 text-center font-pixel text-[9px] text-yellow blink">NEW BEST!</div>}
            <div className="mt-3 grid grid-cols-3 gap-2 text-center font-pixel text-[7px] text-dim">
              <div>
                <div className="text-[12px] text-yellow">{phase === "won" ? FLOORS : r.floor}</div>FLOOR
              </div>
              <div>
                <div className="text-[12px] text-cyan">{r.bestLine}</div>LONGEST LINE
              </div>
              <div>
                <div className="text-[12px] text-green">{r.kills}</div>POOPERS
              </div>
            </div>
            {result?.unlocked.map((id) => (
              <div key={id} className="mt-3 text-center font-pixel text-[8px] text-green">
                UNLOCKED: {LEADERS[id].name.toUpperCase()}
              </div>
            ))}
            <BigButton onClick={() => start(leader)} color={PINK}>
              ▶ DANCE AGAIN
            </BigButton>
            <button className="mt-3 block w-full py-2 font-pixel text-[9px] text-dim" onClick={() => setScreen("title")}>
              CHANGE LEADER
            </button>
          </Overlay>
        )}
      </div>
      {screen === "game" && phase === "play" && !paused && (
        <div className="shrink-0 pb-1 text-center font-pixel text-[7px] text-dim">{touch ? "SWIPE TO STEER" : "ARROWS / WASD TO STEER · P TO PAUSE"}</div>
      )}
    </LabShell>
  );
}
