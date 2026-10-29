"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { isMuted, onMuteChange, setMuted } from "@/lib/client/sound";
import { cleanName, getPlayer, load, save, setPlayerName } from "@/lib/client/storage";
import {
  BLAST_R,
  BULLETS,
  H,
  KINDS,
  MAX_HEARTS,
  MIRROR_ARC,
  POWERS,
  POWER_KINDS,
  W,
  enemyColor,
  isBoss,
  newGame,
  predictPath,
  step,
  type BulletKind,
  type Game,
  type Input,
} from "@/lib/rbm/engine";
import { play, unlock } from "@/lib/rbm/sound";

type Screen = "title" | "play" | "over";

interface Result {
  score: number;
  wave: number;
  kills: number;
  bestChain: number;
  timeMs: number;
  best: boolean;
}

interface Row {
  name: string;
  score: number;
  wave: number;
  kills: number;
}

interface Stick {
  id: number | null;
  ox: number;
  oy: number;
  x: number;
  y: number;
  t0: number;
}

const STICK = 46; // css px for a full push
const DEAD = 12;

const newStick = (): Stick => ({ id: null, ox: 0, oy: 0, x: 0, y: 0, t0: 0 });

export function RubberBulletMan() {
  const [screen, setScreen] = useState<Screen>("title");
  const [paused, setPaused] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [hud, setHud] = useState<{ selected: BulletKind; ammo: Record<BulletKind, number> }>({ selected: "bouncer", ammo: newGame().ammo });
  const [result, setResult] = useState<Result | null>(null);
  const [best, setBest] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game>(newGame());
  const screenRef = useRef<Screen>("title");
  const pausedRef = useRef(false);
  const scaleRef = useRef(1);
  const ctl = useRef({
    keys: new Set<string>(),
    move: newStick(),
    aim: newStick(),
    mouse: { x: 0, y: 0, down: false, active: false },
    pending: null as { x: number; y: number; t: number } | null,
  });

  useEffect(() => {
    setBest(load<number>("rbm.best", 0));
    setMutedState(isMuted());
    const off = onMuteChange(setMutedState);
    return () => void off();
  }, []);

  const setPause = useCallback((p: boolean) => {
    pausedRef.current = p;
    setPaused(p);
  }, []);

  const start = useCallback(() => {
    unlock();
    gameRef.current = newGame();
    ctl.current.pending = null;
    ctl.current.move = newStick();
    ctl.current.aim = newStick();
    screenRef.current = "play";
    setScreen("play");
    setResult(null);
    setPause(false);
  }, [setPause]);

  const select = useCallback((k: BulletKind) => {
    const g = gameRef.current;
    if (g.ammo[k] > 0) g.selected = k;
  }, []);

  // ---------- sizing ----------
  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const fit = () => {
      const s = Math.min(wrap.clientWidth / W, wrap.clientHeight / H);
      scaleRef.current = s;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.width = `${Math.floor(W * s)}px`;
      canvas.style.height = `${Math.floor(H * s)}px`;
      canvas.width = Math.floor(W * s * dpr);
      canvas.height = Math.floor(H * s * dpr);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // ---------- keyboard ----------
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      if (screenRef.current === "play") {
        if (k === "escape" || k === "p") return setPause(!pausedRef.current);
        const n = Number(k);
        if (n >= 1 && n <= KINDS.length) select(KINDS[n - 1]);
        if (k === "q" || k === "e") {
          const g = gameRef.current;
          const owned = KINDS.filter((x) => g.ammo[x] > 0);
          const i = owned.indexOf(g.selected);
          g.selected = owned[(i + (k === "e" ? 1 : owned.length - 1)) % owned.length];
        }
        if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
      } else if ((k === "enter" || k === " ") && screenRef.current === "title") {
        e.preventDefault();
        start();
      }
      ctl.current.keys.add(k);
    };
    const up = (e: KeyboardEvent) => ctl.current.keys.delete(e.key.toLowerCase());
    const blur = () => {
      ctl.current.keys.clear();
      ctl.current.mouse.down = false;
      if (screenRef.current === "play") setPause(true);
    };
    const vis = () => document.hidden && blur();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [select, setPause, start]);

  // ---------- pointer (touch twin-stick, mouse aim) ----------
  useEffect(() => {
    const canvas = canvasRef.current!;
    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width };
    };
    const c = ctl.current;
    const onDown = (e: PointerEvent) => {
      if (screenRef.current !== "play" || pausedRef.current) return;
      unlock();
      e.preventDefault();
      const p = local(e);
      if (e.pointerType === "mouse") {
        c.mouse = { x: p.x, y: p.y, down: e.button === 0, active: true };
        return;
      }
      canvas.setPointerCapture(e.pointerId);
      const s = p.x < p.w / 2 ? c.move : c.aim;
      if (s.id !== null) return;
      Object.assign(s, { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y, t0: performance.now() });
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      if (e.pointerType === "mouse") {
        c.mouse.x = p.x;
        c.mouse.y = p.y;
        c.mouse.active = true;
        return;
      }
      for (const s of [c.move, c.aim]) if (s.id === e.pointerId) (s.x = p.x), (s.y = p.y);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === "mouse") {
        c.mouse.down = false;
        return;
      }
      if (c.move.id === e.pointerId) c.move = newStick();
      if (c.aim.id === e.pointerId) {
        const a = c.aim;
        const dx = a.x - a.ox, dy = a.y - a.oy;
        if (e.type === "pointerup" && screenRef.current === "play") {
          if (Math.hypot(dx, dy) > DEAD) c.pending = { x: dx, y: dy, t: 0.4 };
          else if (performance.now() - a.t0 < 300) {
            // quick tap: snap at the nearest enemy
            const g = gameRef.current;
            let bestD = Infinity;
            let aim = { x: g.player.aimX, y: g.player.aimY };
            for (const en of g.enemies) {
              const d = Math.hypot(en.x - g.player.x, en.y - g.player.y);
              if (d < bestD) (bestD = d), (aim = { x: en.x - g.player.x, y: en.y - g.player.y });
            }
            c.pending = { ...aim, t: 0.4 };
          }
        }
        c.aim = newStick();
      }
    };
    const noMenu = (e: Event) => e.preventDefault();
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("contextmenu", noMenu);
    window.addEventListener("pointerup", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("contextmenu", noMenu);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  // ---------- loop ----------
  useEffect(() => {
    const canvas = canvasRef.current!;
    const cx = canvas.getContext("2d")!;
    const fontVar = getComputedStyle(document.documentElement).getPropertyValue("--font-press").trim();
    const font = (px: number) => `${px}px ${fontVar || "monospace"}`;
    let raf = 0;
    let lastT = performance.now();
    let hudKey = "";
    let overAt = 0;

    const readInput = (g: Game, dt: number): Input => {
      const c = ctl.current;
      const k = c.keys;
      let mx = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
      let my = (k.has("s") || k.has("arrowdown") ? 1 : 0) - (k.has("w") || k.has("arrowup") ? 1 : 0);
      if (c.move.id !== null) {
        mx += (c.move.x - c.move.ox) / STICK;
        my += (c.move.y - c.move.oy) / STICK;
      }
      let ax = 0, ay = 0;
      let fire = c.mouse.down || k.has(" ");
      const s = scaleRef.current;
      if (c.aim.id !== null && Math.hypot(c.aim.x - c.aim.ox, c.aim.y - c.aim.oy) > DEAD) {
        ax = c.aim.x - c.aim.ox;
        ay = c.aim.y - c.aim.oy;
      } else if (c.mouse.active) {
        ax = c.mouse.x / s - g.player.x;
        ay = c.mouse.y / s - g.player.y;
      }
      if (c.pending) {
        c.pending.t -= dt;
        ax = c.pending.x;
        ay = c.pending.y;
        if (g.player.cooldown <= 0) {
          fire = true;
          c.pending = null;
        } else if (c.pending.t <= 0) c.pending = null;
      }
      return { moveX: mx, moveY: my, aimX: ax, aimY: ay, fire };
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      const g = gameRef.current;
      const playing = screenRef.current === "play";
      if (playing && !pausedRef.current) {
        step(g, readInput(g, dt), dt);
        for (const snd of g.sounds) play(snd);
        const key = g.selected + KINDS.map((x) => g.ammo[x]).join(",");
        if (key !== hudKey) {
          hudKey = key;
          setHud({ selected: g.selected, ammo: { ...g.ammo } });
        }
        if (g.over) {
          overAt ||= now;
          if (now - overAt > 1300) {
            overAt = 0;
            const prev = load<number>("rbm.best", 0);
            const isBest = g.score > prev;
            if (isBest) save("rbm.best", g.score);
            setBest(Math.max(prev, g.score));
            setResult({ score: g.score, wave: Math.max(1, g.wave), kills: g.kills, bestChain: g.bestChain, timeMs: Math.round(g.time * 1000), best: isBest && g.score > 0 });
            screenRef.current = "over";
            setScreen("over");
          }
        }
      } else if (!playing && g.over) {
        // let the last explosion finish behind the game-over card
        step(g, { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false }, dt);
      }
      draw(cx, canvas, g, font);
    };

    const draw = (cx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, g: Game, font: (px: number) => string) => {
      const s = canvas.width / W;
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.fillStyle = "#07051a";
      cx.fillRect(0, 0, canvas.width, canvas.height);
      const sh = g.shake;
      cx.setTransform(s, 0, 0, s, sh ? (Math.random() - 0.5) * sh * s : 0, sh ? (Math.random() - 0.5) * sh * s : 0);
      const t = g.time;

      // floor grid
      cx.strokeStyle = "rgba(42,35,80,0.55)";
      cx.lineWidth = 1;
      cx.beginPath();
      for (let x = 30; x < W; x += 30) cx.moveTo(x, 0), cx.lineTo(x, H);
      for (let y = 30; y < H; y += 30) cx.moveTo(0, y), cx.lineTo(W, y);
      cx.stroke();
      cx.strokeStyle = "#22f3ff";
      cx.lineWidth = 3;
      cx.strokeRect(1.5, 1.5, W - 3, H - 3);

      for (const o of g.obstacles) {
        cx.fillStyle = "#1b1440";
        cx.fillRect(o.x, o.y, o.w, o.h);
        cx.strokeStyle = "#22f3ff";
        cx.lineWidth = 2;
        cx.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2);
      }

      // pinball bumpers
      for (const bp of g.bumpers) {
        const lit = bp.flash > 0;
        cx.fillStyle = lit ? "#ff2bd6" : "#2a0f3a";
        cx.beginPath();
        cx.arc(bp.x, bp.y, lit ? bp.r + 2 : bp.r, 0, Math.PI * 2);
        cx.fill();
        cx.strokeStyle = "#ff2bd6";
        cx.lineWidth = 3;
        cx.stroke();
        cx.fillStyle = lit ? "#fff" : "#ff2bd6";
        cx.beginPath();
        cx.arc(bp.x, bp.y, bp.r * 0.35, 0, Math.PI * 2);
        cx.fill();
      }

      // spawn warnings
      for (const w of g.warnings) {
        if (Math.floor(w.t * 10) % 2) continue;
        cx.strokeStyle = enemyColor(w.type);
        cx.lineWidth = 2;
        const r = isBoss(w.type) ? 30 : 12;
        cx.beginPath();
        cx.arc(w.x, w.y, r, 0, Math.PI * 2);
        cx.stroke();
        cx.font = font(10);
        cx.fillStyle = enemyColor(w.type);
        cx.textAlign = "center";
        cx.textBaseline = "middle";
        cx.fillText("!", w.x, w.y + 1);
      }

      // pickups
      for (const pk of g.pickups) {
        if (pk.t > 6 && Math.floor(pk.t * 8) % 2) continue;
        const y = pk.y + Math.sin(pk.t * 5) * 2;
        if (pk.kind === "heart") drawHeart(cx, pk.x, y, 7, "#ff4d6d");
        else if (pk.kind === "shield" || pk.kind === "rapid" || pk.kind === "triple") {
          const pw = POWERS[pk.kind];
          cx.fillStyle = pw.color;
          cx.globalAlpha = 0.25 + Math.sin(pk.t * 8) * 0.1;
          cx.beginPath();
          cx.arc(pk.x, y, 12, 0, Math.PI * 2);
          cx.fill();
          cx.globalAlpha = 1;
          cx.strokeStyle = pw.color;
          cx.lineWidth = 2;
          cx.beginPath();
          cx.arc(pk.x, y, 8, 0, Math.PI * 2);
          cx.stroke();
          cx.fillStyle = pw.color;
          cx.font = font(8);
          cx.textAlign = "center";
          cx.textBaseline = "middle";
          cx.fillText(pw.letter, pk.x + 0.5, y + 1);
        } else {
          cx.fillStyle = BULLETS[pk.kind].color;
          cx.globalAlpha = 0.25;
          cx.beginPath();
          cx.arc(pk.x, y, 11, 0, Math.PI * 2);
          cx.fill();
          cx.globalAlpha = 1;
          cx.strokeStyle = BULLETS[pk.kind].color;
          cx.lineWidth = 2;
          cx.strokeRect(pk.x - 7, y - 7, 14, 14);
          cx.font = font(8);
          cx.textAlign = "center";
          cx.textBaseline = "middle";
          cx.fillText(BULLETS[pk.kind].name[0], pk.x + 0.5, y + 1);
        }
      }

      // enemies
      const p = g.player;
      for (const e of g.enemies) {
        const col = enemyColor(e.type);
        if (e.type === "dasher" && e.state === 0 && e.t < 0.6) {
          cx.strokeStyle = "rgba(255,138,61,0.5)";
          cx.setLineDash([4, 4]);
          cx.lineWidth = 2;
          cx.beginPath();
          cx.moveTo(e.x, e.y);
          cx.lineTo(e.x + Math.cos(e.fire) * 160, e.y + Math.sin(e.fire) * 160);
          cx.stroke();
          cx.setLineDash([]);
        }
        const squish = 1 + Math.sin(t * 9 + e.id) * 0.06;
        cx.fillStyle = e.flash > 0 ? "#ffffff" : e.frozen > 0 ? "#6c4aa8" : col;
        cx.beginPath();
        cx.ellipse(e.x, e.y, e.r * squish, e.r / squish, 0, 0, Math.PI * 2);
        cx.fill();
        if (e.type === "brute") {
          cx.strokeStyle = "#ffd0da";
          cx.lineWidth = 2;
          cx.stroke();
        }
        if (e.type === "shooter") {
          const a = Math.atan2(p.y - e.y, p.x - e.x);
          cx.strokeStyle = col;
          cx.lineWidth = 4;
          cx.beginPath();
          cx.moveTo(e.x, e.y);
          cx.lineTo(e.x + Math.cos(a) * (e.r + 6), e.y + Math.sin(a) * (e.r + 6));
          cx.stroke();
        }
        if (e.type === "boss") {
          cx.fillStyle = "#ff2bd6";
          cx.beginPath();
          cx.moveTo(e.x - 16, e.y - 24);
          cx.lineTo(e.x - 16, e.y - 38);
          cx.lineTo(e.x - 8, e.y - 30);
          cx.lineTo(e.x, e.y - 40);
          cx.lineTo(e.x + 8, e.y - 30);
          cx.lineTo(e.x + 16, e.y - 38);
          cx.lineTo(e.x + 16, e.y - 24);
          cx.fill();
        }
        if (e.type === "queen") {
          cx.fillStyle = "#ffe14d";
          for (let i = -2; i <= 2; i++) {
            cx.beginPath();
            cx.arc(e.x + i * 7, e.y - 27 - (2 - Math.abs(i)) * 3, 3, 0, Math.PI * 2);
            cx.fill();
          }
          // a bubble wand
          cx.strokeStyle = "#ece9ff";
          cx.lineWidth = 2;
          cx.beginPath();
          cx.moveTo(e.x + 24, e.y + 6);
          cx.lineTo(e.x + 34, e.y - 10);
          cx.stroke();
          cx.beginPath();
          cx.arc(e.x + 37, e.y - 15, 5, 0, Math.PI * 2);
          cx.stroke();
        }
        if (e.type === "fuse") {
          const lit = e.state === 1;
          const tipX = e.x + 4, tipY = e.y - e.r - 6;
          cx.strokeStyle = "#c9b38a";
          cx.lineWidth = 2;
          cx.beginPath();
          cx.moveTo(e.x + 1, e.y - e.r + 1);
          cx.quadraticCurveTo(e.x + 6, e.y - e.r - 2, tipX, tipY);
          cx.stroke();
          cx.fillStyle = Math.floor(t * 20) % 2 ? "#ffe14d" : "#ff8a3d";
          cx.beginPath();
          cx.arc(tipX, tipY, lit ? 3.5 : 2, 0, Math.PI * 2);
          cx.fill();
          if (lit) {
            cx.strokeStyle = "rgba(255,77,109,0.7)";
            cx.setLineDash([4, 4]);
            cx.lineWidth = 1.5;
            cx.beginPath();
            cx.arc(e.x, e.y, BLAST_R, 0, Math.PI * 2);
            cx.stroke();
            cx.setLineDash([]);
            if (Math.floor(e.t * 12) % 2) {
              cx.fillStyle = "#ff4d6d";
              cx.beginPath();
              cx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
              cx.fill();
            }
          }
        }
        if (e.type === "mirror") {
          cx.strokeStyle = e.frozen > 0 ? "#5a5480" : "#ffffff";
          cx.lineWidth = 4;
          cx.lineCap = "round";
          cx.beginPath();
          cx.arc(e.x, e.y, e.r + 5, e.face - MIRROR_ARC, e.face + MIRROR_ARC);
          cx.stroke();
          cx.lineCap = "butt";
        }
        // eyes follow you
        const a = Math.atan2(p.y - e.y, p.x - e.x);
        const er = Math.max(2, e.r * 0.28);
        for (const side of [-1, 1]) {
          const ex = e.x + Math.cos(a + side * 0.6) * e.r * 0.45;
          const ey = e.y + Math.sin(a + side * 0.6) * e.r * 0.45;
          cx.fillStyle = "#05040b";
          cx.beginPath();
          cx.arc(ex, ey, er, 0, Math.PI * 2);
          cx.fill();
          cx.fillStyle = "#fff";
          cx.fillRect(ex + Math.cos(a) * er * 0.4 - 1, ey + Math.sin(a) * er * 0.4 - 1, 2, 2);
        }
        if (e.frozen > 0) {
          cx.strokeStyle = "#b26bff";
          cx.lineWidth = 2;
          cx.strokeRect(e.x - e.r - 3, e.y - e.r - 3, (e.r + 3) * 2, (e.r + 3) * 2);
        }
        if (e.maxHp > 1) {
          const wv = e.r * 2;
          cx.fillStyle = "#2a2350";
          cx.fillRect(e.x - wv / 2, e.y + e.r + 4, wv, 3);
          cx.fillStyle = col;
          cx.fillRect(e.x - wv / 2, e.y + e.r + 4, (wv * Math.max(0, e.hp)) / e.maxHp, 3);
        }
      }

      // aim preview (touch aim stick or mouse)
      const c = ctl.current;
      const aiming = c.aim.id !== null && Math.hypot(c.aim.x - c.aim.ox, c.aim.y - c.aim.oy) > DEAD;
      if (screenRef.current === "play" && !g.over && (aiming || c.mouse.active)) {
        const kind = g.ammo[g.selected] > 0 ? g.selected : "bouncer";
        const pts = predictPath(g, p.x, p.y, p.aimX, p.aimY, BULLETS[kind].r, aiming ? 360 : 140, aiming ? 2 : 1);
        cx.strokeStyle = BULLETS[kind].color;
        cx.globalAlpha = aiming ? 0.8 : 0.35;
        cx.lineWidth = 1.5;
        cx.setLineDash([5, 5]);
        cx.lineDashOffset = -t * 30;
        cx.beginPath();
        pts.forEach((q, i) => (i ? cx.lineTo(q.x, q.y) : cx.moveTo(q.x, q.y)));
        cx.stroke();
        cx.setLineDash([]);
        cx.globalAlpha = 1;
      }

      // bullets
      for (const b of g.bullets) {
        const col = b.owner === "enemy" ? "#ff8a3d" : BULLETS[b.kind].color;
        cx.strokeStyle = col;
        cx.globalAlpha = 0.35;
        cx.lineWidth = b.r * 1.4;
        cx.beginPath();
        cx.moveTo(b.x - b.vx * 0.04, b.y - b.vy * 0.04);
        cx.lineTo(b.x, b.y);
        cx.stroke();
        cx.globalAlpha = 0.25;
        cx.fillStyle = col;
        cx.beginPath();
        cx.arc(b.x, b.y, b.r * 2, 0, Math.PI * 2);
        cx.fill();
        cx.globalAlpha = 1;
        if (b.kind === "bomb" && b.owner === "player") {
          cx.fillStyle = "#1b1440";
          cx.beginPath();
          cx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          cx.fill();
          cx.strokeStyle = col;
          cx.lineWidth = 2;
          cx.stroke();
          cx.fillStyle = Math.floor(b.age * 16) % 2 ? "#ffe14d" : "#ff4d6d";
          cx.beginPath();
          cx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
          cx.fill();
        } else if (b.kind === "boomerang") {
          cx.save();
          cx.translate(b.x, b.y);
          cx.rotate(b.age * 18);
          cx.fillRect(-b.r, -2, b.r * 2, 4);
          cx.fillRect(-2, -b.r, 4, b.r * 2);
          cx.restore();
        } else {
          cx.beginPath();
          cx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          cx.fill();
          cx.fillStyle = "#fff";
          cx.beginPath();
          cx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.35, 0, Math.PI * 2);
          cx.fill();
        }
        if (b.kind === "piercer" && b.phased) {
          cx.strokeStyle = "#fff";
          cx.lineWidth = 1;
          cx.beginPath();
          cx.arc(b.x, b.y, b.r + 3, 0, Math.PI * 2);
          cx.stroke();
        }
      }

      // the man
      if (!g.over && !(p.invuln > 0 && Math.floor(p.invuln * 12) % 2)) {
        const len = Math.hypot(p.aimX, p.aimY) || 1;
        const ax = p.aimX / len, ay = p.aimY / len;
        const bob = Math.sin(p.walk) * 1.5;
        cx.fillStyle = "#3a2a00";
        cx.beginPath();
        cx.ellipse(p.x, p.y + p.r + 2, p.r, 3, 0, 0, Math.PI * 2);
        cx.fill();
        cx.strokeStyle = BULLETS[g.ammo[g.selected] > 0 ? g.selected : "bouncer"].color;
        cx.lineWidth = 5;
        cx.lineCap = "round";
        cx.beginPath();
        cx.moveTo(p.x + ax * 4, p.y + ay * 4 + bob);
        cx.lineTo(p.x + ax * (p.r + 8), p.y + ay * (p.r + 8) + bob);
        cx.stroke();
        cx.lineCap = "butt";
        cx.fillStyle = "#ffe14d";
        cx.beginPath();
        cx.arc(p.x, p.y + bob, p.r, 0, Math.PI * 2);
        cx.fill();
        cx.fillStyle = "#ff2bd6";
        cx.fillRect(p.x - p.r, p.y - 3 + bob, p.r * 2, 3); // headband
        cx.fillStyle = "#05040b";
        for (const side of [-1, 1]) cx.fillRect(p.x + ax * 3 + side * -ay * 3.5 - 1.5, p.y + ay * 3 + side * ax * 3.5 + bob, 3, 3);
      }

      for (const bl of g.blasts) {
        const k = bl.t / 0.4;
        cx.globalAlpha = 0.5 * (1 - k);
        cx.fillStyle = "#ff8a3d";
        cx.beginPath();
        cx.arc(bl.x, bl.y, bl.r * (0.4 + k * 0.6), 0, Math.PI * 2);
        cx.fill();
        cx.globalAlpha = 1 - k;
        cx.strokeStyle = "#ffe14d";
        cx.lineWidth = 3;
        cx.stroke();
        cx.globalAlpha = 1;
      }

      if (!g.over && g.power.shield) {
        cx.strokeStyle = POWERS.shield.color;
        cx.globalAlpha = 0.55 + Math.sin(t * 6) * 0.2;
        cx.lineWidth = 2;
        cx.beginPath();
        cx.arc(p.x, p.y, p.r + 7, 0, Math.PI * 2);
        cx.stroke();
        cx.globalAlpha = 0.12;
        cx.fillStyle = POWERS.shield.color;
        cx.fill();
        cx.globalAlpha = 1;
      }

      for (const pt of g.particles) {
        cx.globalAlpha = 1 - pt.t / pt.life;
        cx.fillStyle = pt.color;
        cx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
      }
      cx.globalAlpha = 1;
      cx.textAlign = "center";
      cx.textBaseline = "middle";
      for (const pp of g.pops) {
        cx.globalAlpha = Math.min(1, 2 - pp.t * 2);
        cx.font = font(7);
        cx.fillStyle = "#05040b";
        cx.fillText(pp.text, pp.x + 1, pp.y + 1);
        cx.fillStyle = pp.color;
        cx.fillText(pp.text, pp.x, pp.y);
      }
      cx.globalAlpha = 1;

      // HUD
      cx.setTransform(s, 0, 0, s, 0, 0);
      if (screenRef.current !== "title") {
        cx.textBaseline = "top";
        cx.font = font(10);
        cx.textAlign = "left";
        cx.fillStyle = "#ffe14d";
        cx.fillText(String(g.score).padStart(6, "0"), 10, 10);
        cx.textAlign = "center";
        cx.fillStyle = "#22f3ff";
        cx.font = font(8);
        cx.fillText(`WAVE ${Math.max(1, g.wave)}`, W / 2, 12);
        for (let i = 0; i < MAX_HEARTS; i++) drawHeart(cx, W - 16 - i * 18, 16, 6, i < g.hearts ? "#ff4d6d" : "#2a2350");
        // active power-ups, under the score
        cx.font = font(7);
        cx.textAlign = "left";
        let px = 10;
        for (const k of POWER_KINDS) {
          const on = k === "shield" ? g.power.shield : g.power[k] > 0;
          if (!on) continue;
          const left = k === "shield" ? 0 : g.power[k];
          if (left > 0 && left < 2 && Math.floor(left * 8) % 2) continue;
          const label = k === "shield" ? POWERS[k].name.toUpperCase() : `${POWERS[k].name.toUpperCase()} ${Math.ceil(left)}`;
          cx.fillStyle = POWERS[k].color;
          cx.fillText(label, px, 26);
          px += cx.measureText(label).width + 8;
        }
      }
      if (g.banner && screenRef.current === "play") {
        cx.textAlign = "center";
        cx.textBaseline = "middle";
        cx.font = font(22);
        cx.fillStyle = "#05040b";
        cx.fillText(g.banner.text, W / 2 + 2, H * 0.38 + 2);
        cx.fillStyle = g.banner.text === "BOSS WAVE" ? "#ff2bd6" : "#ffe14d";
        cx.fillText(g.banner.text, W / 2, H * 0.38);
        if (g.banner.sub) {
          cx.font = font(10);
          cx.fillStyle = "#ece9ff";
          cx.fillText(g.banner.sub, W / 2, H * 0.38 + 28);
        }
      }

      // thumb sticks, in screen pixels
      const dpr = canvas.width / (W * scaleRef.current);
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const [st, col] of [
        [c.move, "#ece9ff"],
        [c.aim, BULLETS[g.selected].color],
      ] as const) {
        if (st.id === null) continue;
        let dx = st.x - st.ox, dy = st.y - st.oy;
        const d = Math.hypot(dx, dy);
        if (d > STICK) (dx *= STICK / d), (dy *= STICK / d);
        cx.globalAlpha = 0.18;
        cx.fillStyle = col;
        cx.beginPath();
        cx.arc(st.ox, st.oy, STICK, 0, Math.PI * 2);
        cx.fill();
        cx.globalAlpha = 0.6;
        cx.beginPath();
        cx.arc(st.ox + dx, st.oy + dy, 20, 0, Math.PI * 2);
        cx.fill();
        cx.globalAlpha = 1;
      }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const g = gameRef.current;

  return (
    <div className="fixed inset-0 flex select-none flex-col bg-bg" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <header className="flex h-11 shrink-0 items-center justify-between px-3">
        <Link href="/" className="font-pixel text-[9px] text-dim hover:text-ink">
          ◀ HUB
        </Link>
        <div className="font-pixel text-[9px] text-pink neon-soft">RUBBER BULLET MAN</div>
        <div className="flex gap-3">
          <button className="font-pixel text-[9px] text-dim" onClick={() => setMuted(!muted)} aria-label={muted ? "Unmute" : "Mute"}>
            {muted ? "🔇" : "🔊"}
          </button>
          {screen === "play" && (
            <button className="font-pixel text-[9px] text-cyan" onClick={() => setPause(!paused)}>
              {paused ? "▶" : "II"}
            </button>
          )}
        </div>
      </header>

      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center">
        <canvas ref={canvasRef} className="block touch-none" />

        {screen === "title" && (
          <Overlay>
            <Title best={best} onPlay={start} />
          </Overlay>
        )}
        {screen === "play" && paused && (
          <Overlay>
            <div className="text-center">
              <div className="font-pixel text-[18px] text-yellow neon">PAUSED</div>
              <button onClick={() => setPause(false)} className="mt-6 block w-full bg-pink px-6 py-3 font-pixel text-[11px] text-bg">
                ▶ RESUME
              </button>
              <button
                onClick={() => {
                  screenRef.current = "title";
                  setScreen("title");
                  setPause(false);
                  gameRef.current = newGame();
                }}
                className="mt-3 block w-full border-2 border-line px-6 py-3 font-pixel text-[10px] text-dim"
              >
                QUIT
              </button>
            </div>
          </Overlay>
        )}
        {screen === "over" && result && (
          <Overlay>
            <GameOver result={result} best={best} onAgain={start} />
          </Overlay>
        )}
      </div>

      <nav className="grid h-16 shrink-0 grid-cols-7 gap-1 px-2 pb-1" aria-label="Bullets">
        {KINDS.map((k, i) => {
          const n = hud.ammo[k];
          const on = hud.selected === k;
          const info = BULLETS[k];
          return (
            <button
              key={k}
              onPointerDown={(e) => {
                e.preventDefault();
                select(k);
                setHud({ selected: g.selected, ammo: { ...g.ammo } });
              }}
              disabled={n <= 0}
              className="flex touch-none flex-col items-center justify-center border-2 bg-panel transition-opacity disabled:opacity-30"
              style={{ borderColor: on ? info.color : "#2a2350", boxShadow: on ? `0 0 10px ${info.color}` : undefined }}
              title={`${info.name} (${i + 1}): ${info.desc}`}
            >
              <span className="block h-3 w-3 rounded-full" style={{ background: info.color }} />
              <span className="mt-1 font-pixel text-[5.5px] sm:text-[8px]" style={{ color: on ? info.color : "#8f89b8" }}>
                {info.name.toUpperCase()}
              </span>
              <span className="font-pixel text-[7px] text-ink">{n === Infinity ? "∞" : n}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function drawHeart(cx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  cx.fillStyle = color;
  cx.beginPath();
  cx.moveTo(x, y + s);
  cx.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.6, y - s * 1.4, x, y - s * 0.4);
  cx.bezierCurveTo(x + s * 0.6, y - s * 1.4, x + s * 1.6, y - s * 0.2, x, y + s);
  cx.fill();
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-bg/80 p-4">
      <div className="pixel-corners neon-box my-auto w-full max-w-sm bg-panel/95 p-5" style={{ ["--glow" as string]: "#ff2bd6" }}>
        {children}
      </div>
    </div>
  );
}

function Title({ best, onPlay }: { best: number; onPlay: () => void }) {
  const [board, setBoard] = useState(false);
  return (
    <div>
      <div className="text-center">
        <div className="font-pixel text-[20px] leading-snug">
          <span className="text-yellow neon">RUBBER</span>
          <br />
          <span className="text-pink neon">BULLET MAN</span>
        </div>
        <p className="mt-3 text-[19px] text-ink/85">Every bullet bounces. Including back at you.</p>
      </div>
      {best > 0 && <div className="mt-3 text-center font-pixel text-[9px] text-yellow">BEST {best}</div>}
      <button onClick={onPlay} className="mt-4 block w-full bg-pink py-3 font-pixel text-[12px] text-bg active:scale-[0.98]">
        ▶ PLAY
      </button>
      <button onClick={() => setBoard(!board)} className="mt-2 block w-full border-2 border-line py-2.5 font-pixel text-[9px] text-cyan">
        {board ? "HOW TO PLAY" : "HIGH SCORES"}
      </button>
      {board ? (
        <Leaderboard />
      ) : (
        <>
          <ul className="mt-4 space-y-1.5 text-[17px] leading-tight">
            {KINDS.map((k) => (
              <li key={k} className="flex gap-2">
                <span className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: BULLETS[k].color }} />
                <span>
                  <b className="font-normal" style={{ color: BULLETS[k].color }}>
                    {BULLETS[k].name}:
                  </b>{" "}
                  <span className="text-ink/80">{BULLETS[k].desc}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-line pt-3 text-[16px] leading-snug text-dim">
            <p>
              <b className="font-normal text-cyan">Phone:</b> left thumb moves. Right thumb drags to aim (with a bounce preview) and fires on release. A quick tap
              on the right snaps a shot at the nearest enemy.
            </p>
            <p className="mt-1">
              <b className="font-normal text-cyan">Keyboard:</b> WASD to move, mouse to aim, click to shoot, 1-7 or Q/E to switch bullets.
            </p>
            <p className="mt-1">
              Once your bullet has bounced, it can hit <i>you</i>. Kill several enemies with one bullet for a chain multiplier, and off a wall for a bank-shot
              bonus. Pink bumpers speed your bullets up for free.
            </p>
            <p className="mt-1">
              <b className="font-normal text-cyan">Power-ups:</b>{" "}
              {POWER_KINDS.map((k, i) => (
                <span key={k}>
                  {i > 0 && " "}
                  <span style={{ color: POWERS[k].color }}>{POWERS[k].name}</span>: {POWERS[k].desc}
                </span>
              ))}
            </p>
            <p className="mt-1">
              <b className="font-normal text-cyan">Watch out for:</b> Fuses that light up and blow up next to you, Mirrors that bounce shots off their shield
              (hit them from behind, glue them, or use a Piercer or Bomb), and a new boss, the Bubble Queen, on wave 10.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function GameOver({ result, best, onAgain }: { result: Result; best: number; onAgain: () => void }) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "local" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [rank, setRank] = useState<number | null>(null);
  const [boardKey, setBoardKey] = useState(0);
  const sent = useRef(false);

  const submit = useCallback(
    async (n: string) => {
      if (sent.current || result.score <= 0) return;
      sent.current = true;
      setStatus("saving");
      const player = getPlayer();
      saveLocal({ name: n, score: result.score, wave: result.wave, kills: result.kills });
      try {
        const res = await fetch("/api/rbm/scores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId: player.id, name: n, score: result.score, wave: result.wave, kills: result.kills, bestChain: result.bestChain, timeMs: result.timeMs }),
        });
        const data = (await res.json()) as { online?: boolean; rank?: number; error?: string };
        if (!res.ok) {
          setStatus("error");
          setMsg(data.error ?? "Couldn't save the score.");
        } else if (data.online) {
          setStatus("saved");
          setRank(data.rank ?? null);
        } else setStatus("local");
      } catch {
        setStatus("local");
      }
      setBoardKey((k) => k + 1);
    },
    [result],
  );

  useEffect(() => {
    const n = getPlayer().name;
    setName(n);
    if (n.length >= 2) void submit(n);
  }, [submit]);

  return (
    <div className="text-center">
      <div className="font-pixel text-[18px] text-red neon">GAME OVER</div>
      <div className="mt-4 font-pixel text-[26px] text-yellow neon">{result.score}</div>
      {result.best && <div className="mt-2 font-pixel text-[9px] text-green blink">NEW BEST!</div>}
      <div className="mt-3 grid grid-cols-3 gap-2 text-[17px]">
        <Stat label="WAVE" value={result.wave} />
        <Stat label="KILLS" value={result.kills} />
        <Stat label="CHAIN" value={result.bestChain > 1 ? `x${result.bestChain}` : "-"} />
      </div>
      <div className="mt-2 text-[16px] text-dim">Best: {best}</div>

      {result.score > 0 && status === "idle" && (
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = cleanName(name);
            if (n.length < 2) return;
            setPlayerName(n);
            void submit(n);
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(cleanName(e.target.value))}
            placeholder="YOUR NAME"
            maxLength={12}
            className="min-w-0 flex-1 border-2 border-line bg-bg px-2 py-2 font-pixel text-[10px] text-ink outline-none focus:border-cyan"
          />
          <button className="bg-cyan px-3 font-pixel text-[9px] text-bg">SAVE</button>
        </form>
      )}
      {status === "saving" && <div className="mt-3 text-[16px] text-dim">Saving…</div>}
      {status === "saved" && <div className="mt-3 text-[16px] text-green">Saved{rank ? `: #${rank} today` : ""}!</div>}
      {status === "local" && <div className="mt-3 text-[16px] text-dim">Saved on this device.</div>}
      {status === "error" && <div className="mt-3 text-[16px] text-red">{msg}</div>}

      <Leaderboard key={boardKey} />

      <button onClick={onAgain} className="mt-4 block w-full bg-pink py-3 font-pixel text-[12px] text-bg active:scale-[0.98]">
        ▶ PLAY AGAIN
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-2 border-line py-1.5">
      <div className="font-pixel text-[7px] text-dim">{label}</div>
      <div className="mt-1 font-pixel text-[11px] text-ink">{value}</div>
    </div>
  );
}

function saveLocal(r: Row) {
  const rows = load<Row[]>("rbm.local", []);
  rows.push(r);
  rows.sort((a, b) => b.score - a.score);
  save("rbm.local", rows.slice(0, 10));
}

function Leaderboard() {
  const [period, setPeriod] = useState<"daily" | "all">("daily");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let live = true;
    setRows(null);
    fetch(`/api/rbm/scores?period=${period}`)
      .then((r) => r.json() as Promise<{ online: boolean; rows: Row[] }>)
      .then((d) => {
        if (!live) return;
        setOnline(d.online);
        setRows(d.online ? d.rows : load<Row[]>("rbm.local", []));
      })
      .catch(() => {
        if (!live) return;
        setOnline(false);
        setRows(load<Row[]>("rbm.local", []));
      });
    return () => {
      live = false;
    };
  }, [period]);

  return (
    <div className="mt-4 text-left">
      <div className="flex gap-2">
        {(["daily", "all"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 border-2 py-1.5 font-pixel text-[8px] ${period === p ? "border-cyan text-cyan" : "border-line text-dim"}`}
          >
            {p === "daily" ? "TODAY" : "ALL TIME"}
          </button>
        ))}
      </div>
      {!online && <div className="mt-2 text-[15px] text-dim">Offline board (this device only).</div>}
      <ol className="mt-2 max-h-48 space-y-0.5 overflow-y-auto text-[17px]">
        {rows === null && <li className="text-dim">Loading…</li>}
        {rows?.length === 0 && <li className="text-dim">No scores yet. Be the first!</li>}
        {rows?.map((r, i) => (
          <li key={i} className="flex justify-between gap-2">
            <span className="truncate">
              <span className="text-dim">{String(i + 1).padStart(2, " ")}.</span> {r.name}
            </span>
            <span className="shrink-0 text-yellow">
              {r.score} <span className="text-dim">w{r.wave}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
