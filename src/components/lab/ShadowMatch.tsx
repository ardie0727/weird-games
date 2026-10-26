"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { load, save } from "@/lib/client/storage";
import { blip, unlock } from "@/lib/lab/sound";
import { MOVE_ROT, allOrientations, apply, axisAngle, makeLevel, matches, mul, type Level, type M3, type Move, type V3, type Wall } from "@/lib/lab/shadow";
import { BigButton, LabShell, Overlay, PIXEL_FONT } from "./LabShell";

type Screen = "title" | "play" | "over";

const W = 360;
const H = 380;
const D = 2.6; // walls sit at -D
const E = 2.2; // room reaches +E toward the camera
const ANIM = 0.2; // seconds per quarter turn
const WALL_NAME: Record<Wall, string> = { back: "BACK WALL", floor: "FLOOR", side: "SIDE WALL" };
const BEST_KEY = "lab.shadow.best";

// camera looks into the room corner from the front-right-top
const CAM = norm([1, 0.8, 1.25]);
const RIGHT = norm([CAM[2], 0, -CAM[0]]);
const UP: V3 = cross(CAM, RIGHT);

function norm(v: V3): V3 {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const ROOM: V3[] = [];
for (const x of [-D, E]) for (const y of [-D, E]) for (const z of [-D, E]) ROOM.push([x, y, z]);
const SPAN = (() => {
  const xs = ROOM.map((p) => dot(p, RIGHT)), ys = ROOM.map((p) => -dot(p, UP));
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
})();
const SCALE = Math.min((W - 16) / (SPAN.x1 - SPAN.x0), (H - 16) / (SPAN.y1 - SPAN.y0));
const OX = W / 2 - ((SPAN.x0 + SPAN.x1) / 2) * SCALE;
const OY = H / 2 - ((SPAN.y0 + SPAN.y1) / 2) * SCALE;
const scr = (p: V3): [number, number] => [OX + dot(p, RIGHT) * SCALE, OY - dot(p, UP) * SCALE];

const FACES: { n: V3; q: V3[] }[] = [
  { n: [1, 0, 0], q: [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]] },
  { n: [-1, 0, 0], q: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0], q: [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]] },
  { n: [0, -1, 0], q: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  { n: [0, 0, 1], q: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], q: [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]] },
];

function onWall(p: V3, w: Wall): V3 {
  if (w === "back") return [p[0], p[1], -D];
  if (w === "floor") return [p[0], -D, p[2]];
  return [-D, p[1], p[2]];
}

interface Game {
  level: Level;
  m: M3;
  anim: { from: M3; move: Move; t: number } | null;
  queue: Move[];
  moves: number;
  timeLeft: number;
  score: number;
  cleared: number; // seconds since the level was cleared, or -1
  intro: number; // seconds of light-sweep intro left
  lit: boolean[];
  perfects: number;
}

function newGame(levelN = 1, score = 0, perfects = 0): Game {
  const level = makeLevel(levelN);
  return { level, m: level.start, anim: null, queue: [], moves: 0, timeLeft: level.time, score, cleared: -1, intro: 1.1, lit: level.walls.map(() => false), perfects };
}

interface Hud {
  level: number;
  time: number;
  score: number;
  moves: number;
  par: number;
  walls: Wall[];
  lit: boolean[];
}

export function ShadowMatch() {
  const [screen, setScreen] = useState<Screen>("title");
  const [hud, setHud] = useState<Hud | null>(null);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState<{ score: number; level: number; perfects: number; best: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const screenRef = useRef<Screen>("title");
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => setBest(load<number>(BEST_KEY, 0)), []);

  const start = useCallback(() => {
    unlock();
    allOrientations();
    gameRef.current = newGame();
    screenRef.current = "play";
    setScreen("play");
    setOver(null);
  }, []);

  const push = useCallback((mv: Move) => {
    const g = gameRef.current;
    if (!g || screenRef.current !== "play" || g.cleared >= 0) return;
    if (g.queue.length < 2) g.queue.push(mv);
  }, []);

  // keyboard
  useEffect(() => {
    const map: Record<string, Move> = { arrowleft: "left", a: "left", arrowright: "right", d: "right", arrowup: "up", w: "up", arrowdown: "down", s: "down", q: "rollL", e: "rollR" };
    const down = (e: KeyboardEvent) => {
      const mv = map[e.key.toLowerCase()];
      if (mv && screenRef.current === "play") {
        e.preventDefault();
        push(mv);
      } else if ((e.key === "Enter" || e.key === " ") && screenRef.current !== "play") start();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [push, start]);

  // sizing
  useEffect(() => {
    const wrap = wrapRef.current!, canvas = canvasRef.current!;
    const fit = () => {
      const s = Math.min(wrap.clientWidth / W, wrap.clientHeight / H);
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

  // loop
  useEffect(() => {
    let raf = 0, last = performance.now(), hudAt = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const g = gameRef.current;
      if (g && screenRef.current === "play") tick(g, dt);
      draw(g, now / 1000);
      if (g && now - hudAt > 100) {
        hudAt = now;
        setHud({ level: g.level.n, time: g.timeLeft, score: g.score, moves: g.moves, par: g.level.par, walls: g.level.walls, lit: g.lit });
      }
    };

    const tick = (g: Game, dt: number) => {
      if (g.intro > 0) {
        g.intro -= dt;
        return;
      }
      if (g.cleared >= 0) {
        g.cleared += dt;
        if (g.cleared > 1.4) gameRef.current = newGame(g.level.n + 1, g.score, g.perfects);
        return;
      }
      g.timeLeft -= dt;
      if (g.timeLeft <= 0) {
        g.timeLeft = 0;
        const prev = load<number>(BEST_KEY, 0);
        if (g.score > prev) save(BEST_KEY, g.score), setBest(g.score);
        setOver({ score: g.score, level: g.level.n, perfects: g.perfects, best: g.score > prev });
        screenRef.current = "over";
        setScreen("over");
        blip("over", [[300, 0, 0.25, "sawtooth", 0.05, 80]]);
        return;
      }
      if (!g.anim && g.queue.length) {
        g.anim = { from: g.m, move: g.queue.shift()!, t: 0 };
        g.moves++;
        blip("turn", [[220, 0, 0.06, "triangle", 0.05, 330]]);
      }
      if (g.anim) {
        g.anim.t += dt / ANIM;
        if (g.anim.t >= 1) {
          g.m = mul(MOVE_ROT[g.anim.move].m, g.anim.from);
          g.anim = null;
          const was = g.lit;
          g.lit = matches(g.level.cells, g.m, g.level.target, g.level.walls);
          if (g.lit.some((l, i) => l && !was[i]) && !g.lit.every(Boolean)) blip("part", [[660, 0, 0.08, "square", 0.03]]);
          if (g.lit.every(Boolean)) {
            const perfect = g.moves <= g.level.par;
            const pts = 100 * g.level.n + Math.ceil(g.timeLeft) * 5 + (perfect ? 150 : 0);
            g.score += pts;
            if (perfect) g.perfects++;
            g.cleared = 0;
            g.queue = [];
            setToast(perfect ? `PERFECT! +${pts}` : `MATCH! +${pts}`);
            setTimeout(() => setToast(null), 1300);
            blip("win", [
              [523, 0, 0.1, "square", 0.04],
              [659, 0.09, 0.1, "square", 0.04],
              [784, 0.18, 0.18, "square", 0.04],
            ]);
          }
        }
      }
    };

    const draw = (g: Game | null, t: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const cx = canvas.getContext("2d")!;
      const k = canvas.width / W;
      cx.setTransform(k, 0, 0, k, 0, 0);
      cx.fillStyle = "#05040b";
      cx.fillRect(0, 0, W, H);

      const level = g?.level;
      const walls: Wall[] = level?.walls ?? ["back"];
      const intro = g ? Math.max(0, g.intro) : 0;
      const lightOn = (w: Wall) => walls.includes(w) && (!g || intro < 0.6 || Math.sin(t * 40) > 0);

      // room
      const poly = (pts: V3[], fill: string | null, stroke?: string, dash?: number[]) => {
        cx.beginPath();
        pts.forEach((p, i) => {
          const [x, y] = scr(p);
          if (i) cx.lineTo(x, y);
          else cx.moveTo(x, y);
        });
        cx.closePath();
        if (fill) (cx.fillStyle = fill), cx.fill();
        if (stroke) {
          cx.setLineDash(dash ?? []);
          cx.strokeStyle = stroke;
          cx.stroke();
          cx.setLineDash([]);
        }
      };
      const wallQuad: Record<Wall, V3[]> = {
        back: [[-D, -D, -D], [E, -D, -D], [E, E, -D], [-D, E, -D]],
        floor: [[-D, -D, -D], [-D, -D, E], [E, -D, E], [E, -D, -D]],
        side: [[-D, -D, -D], [-D, E, -D], [-D, E, E], [-D, -D, E]],
      };
      for (const w of ["back", "side", "floor"] as Wall[]) {
        const on = lightOn(w);
        poly(wallQuad[w], on ? "#3a2f63" : "#120d24", "#2a2350");
        if (on) {
          // warm pool of light
          const c = scr(onWall([0, 0, 0], w));
          const grad = cx.createRadialGradient(c[0], c[1], 4, c[0], c[1], 120);
          grad.addColorStop(0, "rgba(255,225,77,0.22)");
          grad.addColorStop(1, "rgba(255,225,77,0)");
          cx.save();
          poly(wallQuad[w], null);
          cx.clip();
          cx.fillStyle = grad;
          cx.fillRect(0, 0, W, H);
          cx.restore();
        }
      }
      // floor grid
      cx.lineWidth = 1;
      for (let i = -D + 1; i < E; i += 1) {
        cx.strokeStyle = "rgba(255,43,214,0.12)";
        cx.beginPath();
        cx.moveTo(...scr([i, -D, -D]));
        cx.lineTo(...scr([i, -D, E]));
        cx.moveTo(...scr([-D, -D, i]));
        cx.lineTo(...scr([E, -D, i]));
        cx.stroke();
      }
      if (!g || !level) return;

      // current orientation, mid-turn if animating
      let m = g.m;
      if (g.anim) {
        const e = 1 - Math.pow(1 - Math.min(1, g.anim.t), 3);
        const r = MOVE_ROT[g.anim.move];
        m = mul(axisAngle(r.axis, (r.sign * Math.PI * e) / 2), g.anim.from);
      }
      const has = new Set(level.cells.map((c) => c.join(",")));

      for (let wi = 0; wi < walls.length; wi++) {
        const w = walls[wi];
        if (!lightOn(w)) continue;
        // target outline, then the actual shadow, then the outline again on top
        const tgt = level.cells.map((c) => apply(level.target, c));
        const cellQuad = (c: V3): V3[] => {
          const h = 0.5;
          if (w === "back") return [[c[0] - h, c[1] - h, 0], [c[0] + h, c[1] - h, 0], [c[0] + h, c[1] + h, 0], [c[0] - h, c[1] + h, 0]].map((p) => onWall(p as V3, w));
          if (w === "floor") return [[c[0] - h, 0, c[2] - h], [c[0] + h, 0, c[2] - h], [c[0] + h, 0, c[2] + h], [c[0] - h, 0, c[2] + h]].map((p) => onWall(p as V3, w));
          return [[0, c[1] - h, c[2] - h], [0, c[1] + h, c[2] - h], [0, c[1] + h, c[2] + h], [0, c[1] - h, c[2] + h]].map((p) => onWall(p as V3, w));
        };
        const done = g.lit[wi];
        for (const c of tgt) poly(cellQuad(c), done ? "rgba(57,255,136,0.35)" : "rgba(255,43,214,0.22)");
        for (const c of level.cells)
          for (const f of FACES) {
            const pts = f.q.map((q) => onWall(apply(m, [c[0] + q[0] / 2, c[1] + q[1] / 2, c[2] + q[2] / 2]), w));
            poly(pts, "#07050f");
          }
        cx.lineWidth = 1.5;
        const pulse = 0.55 + 0.45 * Math.sin(t * 5);
        for (const c of tgt) poly(cellQuad(c), null, done ? "#39ff88" : `rgba(255,43,214,${pulse})`, done ? [] : [3, 3]);
        cx.lineWidth = 1;
      }

      // the object
      const faces: { pts: [number, number][]; depth: number; shade: number }[] = [];
      for (const c of level.cells)
        for (const f of FACES) {
          if (has.has([c[0] + f.n[0], c[1] + f.n[1], c[2] + f.n[2]].join(","))) continue;
          const n = apply(m, f.n);
          const facing = dot(n, CAM);
          if (facing <= 0.001) continue;
          const center = apply(m, [c[0] + f.n[0] / 2, c[1] + f.n[1] / 2, c[2] + f.n[2] / 2]);
          faces.push({
            pts: f.q.map((q) => scr(apply(m, [c[0] + q[0] / 2, c[1] + q[1] / 2, c[2] + q[2] / 2]))),
            depth: dot(center, CAM),
            shade: 0.45 + 0.55 * Math.max(0, dot(n, norm([0.4, 1, 0.6]))),
          });
        }
      faces.sort((a, b) => a.depth - b.depth);
      const won = g.cleared >= 0;
      for (const f of faces) {
        cx.beginPath();
        f.pts.forEach(([x, y], i) => (i ? cx.lineTo(x, y) : cx.moveTo(x, y)));
        cx.closePath();
        const [r, gg, b] = won ? [57, 255, 136] : [34, 243, 255];
        cx.fillStyle = `rgb(${Math.round(r * f.shade * 0.85)},${Math.round(gg * f.shade * 0.85)},${Math.round(b * f.shade * 0.85)})`;
        cx.fill();
        cx.strokeStyle = "#05040b";
        cx.lineWidth = 1.2;
        cx.stroke();
      }

      if (g.intro > 0 && screenRef.current === "play") {
        cx.textAlign = "center";
        cx.font = PIXEL_FONT(14);
        cx.fillStyle = "#ffe14d";
        cx.fillText(`LEVEL ${level.n}`, W / 2, 40);
        cx.font = PIXEL_FONT(8);
        cx.fillStyle = "#ece9ff";
        cx.fillText(`LIGHT ON: ${walls.map((w) => WALL_NAME[w]).join(" + ")}`, W / 2, 60);
      }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onDown = (e: React.PointerEvent) => {
    swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onUp = (e: React.PointerEvent) => {
    const s = swipe.current;
    if (!s || s.id !== e.pointerId) return;
    swipe.current = null;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
    if (Math.abs(dx) > Math.abs(dy)) push(dx > 0 ? "right" : "left");
    else push(dy > 0 ? "down" : "up");
  };

  const pad: [Move, string, string][] = [
    ["rollL", "⟲", "Roll left"],
    ["left", "◀", "Turn left"],
    ["up", "▲", "Tip back"],
    ["down", "▼", "Tip forward"],
    ["right", "▶", "Turn right"],
    ["rollR", "⟳", "Roll right"],
  ];

  return (
    <LabShell title="SHADOW MATCH" color="#22f3ff">
      <div className="flex h-9 shrink-0 items-center justify-between px-3 font-pixel text-[8px]">
        <span className="text-dim">
          LV <span className="text-ink">{hud?.level ?? 1}</span>
        </span>
        <span className={hud && hud.time < 8 ? "text-red blink" : "text-yellow"}>⏱ {Math.ceil(hud?.time ?? 0)}</span>
        <span className="text-dim">
          MOVES <span className="text-ink">{hud?.moves ?? 0}</span>/<span className="text-cyan">{hud?.par ?? 0}</span>
        </span>
        <span className="text-pink">{hud?.score ?? 0}</span>
      </div>
      <div className="flex h-6 shrink-0 items-center justify-center gap-2 font-pixel text-[7px]">
        {(hud?.walls ?? []).map((w, i) => (
          <span key={w} className={hud!.lit[i] ? "text-green" : "text-dim"}>
            {hud!.lit[i] ? "■" : "□"} {WALL_NAME[w]}
          </span>
        ))}
      </div>
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => (swipe.current = null)}>
        <canvas ref={canvasRef} className="block touch-none" />
        {toast && <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 whitespace-nowrap font-pixel text-[13px] text-green neon">{toast}</div>}
        {screen === "title" && (
          <Overlay glow="#22f3ff">
            <div className="text-center font-pixel text-[20px] leading-snug">
              <span className="text-cyan neon">SHADOW</span> <span className="text-yellow neon">MATCH</span>
            </div>
            <p className="mt-3 text-center text-[19px] text-ink/85">A lamp throws a strange object&apos;s shadow on the wall. Turn the object until its shadow fills the pink outline.</p>
            {best > 0 && <div className="mt-3 text-center font-pixel text-[9px] text-yellow">BEST {best}</div>}
            <BigButton onClick={start} color="#22f3ff">
              ▶ PLAY
            </BigButton>
            <div className="mt-4 border-t border-line pt-3 text-[16px] leading-snug text-dim">
              <p>Swipe the object or use the buttons to turn it a quarter at a time. ⟲ ⟳ roll it like a steering wheel.</p>
              <p className="mt-1">The light moves to a new wall every level. From level 4 there are two lights, and from level 9 all three walls must match.</p>
              <p className="mt-1">Beat the clock. Match in par moves for a PERFECT bonus.</p>
              <p className="mt-1">Keyboard: arrows or WASD, Q/E to roll.</p>
            </div>
          </Overlay>
        )}
        {screen === "over" && over && (
          <Overlay glow="#22f3ff">
            <div className="text-center font-pixel text-[16px] text-red neon">LIGHTS OUT</div>
            <div className="mt-4 text-center font-pixel text-[28px] text-yellow neon">{over.score}</div>
            {over.best && <div className="mt-2 text-center font-pixel text-[9px] text-green blink">NEW BEST!</div>}
            <p className="mt-3 text-center text-[19px] text-ink/85">
              Reached level {over.level} with {over.perfects} perfect {over.perfects === 1 ? "match" : "matches"}.
            </p>
            <div className="mt-1 text-center font-pixel text-[8px] text-dim">BEST {best}</div>
            <BigButton onClick={start} color="#22f3ff">
              ▶ AGAIN
            </BigButton>
          </Overlay>
        )}
      </div>
      <nav className="grid h-16 shrink-0 grid-cols-6 gap-1 px-2 pb-2" aria-label="Turn the object">
        {pad.map(([mv, label, name]) => (
          <button
            key={mv}
            aria-label={name}
            onPointerDown={(e) => {
              e.preventDefault();
              push(mv);
            }}
            className="touch-none border-2 border-line bg-panel font-pixel text-[18px] text-cyan active:border-cyan active:bg-cab"
          >
            {label}
          </button>
        ))}
      </nav>
    </LabShell>
  );
}
