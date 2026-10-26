"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { load, save } from "@/lib/client/storage";
import { blip, tone, unlock } from "@/lib/lab/sound";
import { BOSS_TIME, CLOCK_R, EXCUSES, FURNITURE, H, W, WALL, dayRules, newGame, step, tap, type Clock, type Game, type Spot } from "@/lib/lab/snooze";
import { BigButton, LabShell, Overlay } from "./LabShell";

type Screen = "title" | "play" | "over";

interface Pop {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
}

const BEST_KEY = "lab.snooze.best";
const EXCUSE_LINES = ["My cat unplugged the router.", "I was stuck in the lift.", "My alarm clock ran away. Really."];

export function SnoozeButton() {
  const [screen, setScreen] = useState<Screen>("title");
  const [best, setBest] = useState(0);
  const [hud, setHud] = useState({ day: 1, boss: BOSS_TIME, excuses: EXCUSES, score: 0, hits: 1, maxHits: 1 });
  const [result, setResult] = useState<{ score: number; days: number; slept: number; best: boolean } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game>(newGame());
  const screenRef = useRef<Screen>("title");
  const pops = useRef<Pop[]>([]);
  const scale = useRef(1);

  useEffect(() => setBest(load<number>(BEST_KEY, 0)), []);

  const start = useCallback(() => {
    unlock();
    gameRef.current = newGame();
    pops.current = [];
    screenRef.current = "play";
    setScreen("play");
    setResult(null);
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (screenRef.current !== "play" && (e.key === "Enter" || e.key === " ")) start();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [start]);

  useEffect(() => {
    const wrap = wrapRef.current!, canvas = canvasRef.current!;
    const fit = () => {
      const s = Math.min(wrap.clientWidth / W, wrap.clientHeight / H);
      scale.current = s;
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

  useEffect(() => {
    let raf = 0, last = performance.now(), hudAt = 0, ringAt = 0, ringHi = false;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const g = gameRef.current;
      const playing = screenRef.current === "play";
      if (playing) {
        step(g, dt);
        handle(g);
        // the alarm itself
        if (g.phase === "chase" && now - ringAt > 140) {
          ringAt = now;
          ringHi = !ringHi;
          const real = g.clocks.find((c) => c.real)!;
          tone(ringHi ? 1760 : 1480, 0, 0.09, "square", real.hidden ? 0.01 : 0.018);
        }
      }
      for (const p of pops.current) p.t += dt;
      pops.current = pops.current.filter((p) => p.t < 1);
      draw(g, now / 1000, playing);
      if (now - hudAt > 100) {
        hudAt = now;
        setHud({ day: g.day, boss: g.boss, excuses: g.excuses, score: g.score, hits: g.hitsLeft, maxHits: dayRules(g.day).hits });
      }
    };

    const pop = (x: number, y: number, text: string, color: string) => pops.current.push({ x, y, text, color, t: 0 });

    const handle = (g: Game) => {
      for (const e of g.events) {
        switch (e.t) {
          case "hit":
            pop(e.x, e.y, `BONK! ${e.left} MORE`, "#ffe14d");
            blip("hit", [[300, 0, 0.12, "square", 0.05, 120]]);
            break;
          case "snooze":
            pop(e.x, e.y, `SNOOZE +${e.pts}`, "#39ff88");
            blip("snooze", [
              [392, 0, 0.12, "triangle", 0.05],
              [330, 0.12, 0.12, "triangle", 0.05],
              [262, 0.24, 0.3, "triangle", 0.05],
            ]);
            break;
          case "miss":
            pop(e.x, e.y, "MISS", "#8f89b8");
            blip("miss", [[160, 0, 0.08, "sine", 0.05]]);
            break;
          case "fake":
            pop(e.x, e.y, "FAKE! -3s", "#ff4d6d");
            blip("fake", [[200, 0, 0.2, "sawtooth", 0.05, 100]]);
            break;
          case "flush":
            pop(e.x, e.y, "FOUND YOU!", "#22f3ff");
            blip("flush", [[500, 0, 0.1, "square", 0.04, 1000]]);
            break;
          case "boss":
            blip("boss", [
              [880, 0, 0.15, "sine", 0.06],
              [660, 0.2, 0.15, "sine", 0.06],
              [880, 0.4, 0.15, "sine", 0.06],
              [660, 0.6, 0.15, "sine", 0.06],
            ]);
            break;
          case "over": {
            const prev = load<number>(BEST_KEY, 0);
            if (g.score > prev) save(BEST_KEY, g.score), setBest(g.score);
            setResult({ score: g.score, days: g.day - 1, slept: g.slept, best: g.score > prev });
            screenRef.current = "over";
            setScreen("over");
            break;
          }
        }
      }
      g.events = [];
    };

    const draw = (g: Game, t: number, playing: boolean) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const cx = canvas.getContext("2d")!;
      const k = canvas.width / W;
      cx.setTransform(k, 0, 0, k, 0, 0);

      // floorboards
      cx.fillStyle = "#1a1230";
      cx.fillRect(0, 0, W, H);
      cx.strokeStyle = "#231a40";
      cx.lineWidth = 1;
      for (let y = WALL; y < H; y += 26) {
        cx.beginPath();
        cx.moveTo(0, y);
        cx.lineTo(W, y);
        cx.stroke();
        for (let x = ((y / 26) % 2) * 60; x < W; x += 120) {
          cx.beginPath();
          cx.moveTo(x, y);
          cx.lineTo(x, y + 26);
          cx.stroke();
        }
      }
      // walls
      cx.fillStyle = "#2a2350";
      cx.fillRect(0, 0, W, WALL);
      cx.fillRect(0, H - WALL, W, WALL);
      cx.fillRect(0, 0, WALL, H);
      cx.fillRect(W - WALL, 0, WALL, H);
      // window light
      cx.fillStyle = "rgba(255,225,77,0.08)";
      cx.beginPath();
      cx.moveTo(180, WALL);
      cx.lineTo(240, WALL);
      cx.lineTo(300, 200);
      cx.lineTo(150, 200);
      cx.fill();
      cx.fillStyle = "#ffe14d";
      cx.fillRect(180, 4, 60, 8);

      const shake = (s: Spot) => {
        const hiding = g.clocks.some((c) => c.hidden === s && !c.gone);
        return hiding ? Math.sin(t * 60) * 1.5 : 0;
      };
      for (const s of FURNITURE) drawSpot(cx, s, shake(s));

      // hidden clocks ring through the furniture
      for (const c of g.clocks) {
        if (!c.hidden || c.gone || !c.real || g.phase !== "chase") continue;
        drawWaves(cx, c.x, c.y, t, "#ffe14d", 0.8);
      }
      for (const c of g.clocks) if (!c.hidden && !c.gone) drawClock(cx, c, t, g.phase === "chase" && c.real, g.phase === "won" && c.real);

      // groggy blur
      if (g.groggy > 0) {
        cx.fillStyle = `rgba(5,4,11,${g.groggy})`;
        cx.fillRect(0, 0, W, H);
      }

      // pops
      cx.textAlign = "center";
      cx.textBaseline = "middle";
      for (const p of pops.current) {
        cx.globalAlpha = 1 - p.t;
        cx.font = "10px var(--font-press), monospace";
        cx.fillStyle = "#05040b";
        cx.fillText(p.text, p.x + 1, p.y - 26 - p.t * 30 + 1);
        cx.fillStyle = p.color;
        cx.fillText(p.text, p.x, p.y - 26 - p.t * 30);
      }
      cx.globalAlpha = 1;

      if (!playing) return;
      const banner = (a: string, b: string, col: string) => {
        cx.fillStyle = "rgba(5,4,11,0.75)";
        cx.fillRect(0, H / 2 - 44, W, 80);
        cx.font = "16px var(--font-press), monospace";
        cx.fillStyle = col;
        cx.fillText(a, W / 2, H / 2 - 16);
        cx.font = "8px var(--font-press), monospace";
        cx.fillStyle = "#ece9ff";
        cx.fillText(b, W / 2, H / 2 + 12);
      };
      if (g.phase === "intro") {
        const r = dayRules(g.day);
        const extra = [r.hits > 1 ? `${r.hits} BONKS TO SNOOZE` : "1 BONK TO SNOOZE", r.decoys ? `${r.decoys} DECOY${r.decoys > 1 ? "S" : ""}` : "", r.hides ? "IT HIDES" : ""].filter(Boolean).join(" · ");
        banner(`MORNING ${g.day}`, extra, "#ffe14d");
      } else if (g.phase === "won") banner("ZZZ...", "+5 MINUTES OF SLEEP", "#39ff88");
      else if (g.phase === "called") banner("📞 BOSS CALLING", g.excuses > 0 ? `"${EXCUSE_LINES[EXCUSES - g.excuses - 1]}"` : "NO EXCUSES LEFT", "#ff4d6d");
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (screenRef.current !== "play") return;
    e.preventDefault();
    unlock();
    const r = e.currentTarget.getBoundingClientRect();
    tap(gameRef.current, ((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H);
  };

  const bossPct = (hud.boss / BOSS_TIME) * 100;

  return (
    <LabShell title="SNOOZE BUTTON" color="#39ff88">
      <div className="flex h-9 shrink-0 items-center justify-between px-3 font-pixel text-[8px]">
        <span className="text-dim">
          DAY <span className="text-ink">{hud.day}</span>
        </span>
        <span className="text-dim" title="Excuses left">
          EXCUSES{" "}
          {Array.from({ length: EXCUSES }, (_, i) => (
            <span key={i} className={i < hud.excuses ? "text-yellow" : "text-line"}>
              ●
            </span>
          ))}
        </span>
        <span className="text-dim">
          BONKS{" "}
          {Array.from({ length: hud.maxHits }, (_, i) => (
            <span key={i} className={i < hud.hits ? "text-pink" : "text-line"}>
              ■
            </span>
          ))}
        </span>
        <span className="text-green">{hud.score}</span>
      </div>
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center">
        <canvas ref={canvasRef} className="block touch-none" onPointerDown={onDown} />
        {screen === "title" && (
          <Overlay glow="#39ff88">
            <div className="text-center font-pixel text-[20px] leading-snug">
              <span className="text-green neon">SNOOZE</span>
              <br />
              <span className="text-yellow neon">BUTTON</span>
            </div>
            <p className="mt-3 text-center text-[19px] text-ink/85">Your alarm clock grew legs and ran off, still ringing. Catch it and hit snooze before your boss calls.</p>
            {best > 0 && <div className="mt-3 text-center font-pixel text-[9px] text-yellow">BEST {best}</div>}
            <BigButton onClick={start} color="#39ff88">
              ▶ WAKE UP
            </BigButton>
            <div className="mt-4 border-t border-line pt-3 text-[16px] leading-snug text-dim">
              <p>Tap the clock to bonk it. Later mornings need two or three bonks, and it bounces away after each one.</p>
              <p className="mt-1">From morning 3 it hides under furniture. Look for the shaking and the ring waves, then tap the furniture to flush it out.</p>
              <p className="mt-1">From morning 4 there are decoys. Only the real one has ring waves. Tapping a fake costs 3 seconds.</p>
              <p className="mt-1">Missing makes you groggy for a moment. Run out of time and you burn one of your {EXCUSES} excuses.</p>
            </div>
          </Overlay>
        )}
        {screen === "over" && result && (
          <Overlay glow="#39ff88">
            <div className="text-center font-pixel text-[16px] text-red neon">YOU&apos;RE LATE</div>
            <div className="mt-4 text-center font-pixel text-[28px] text-green neon">{result.score}</div>
            {result.best && <div className="mt-2 text-center font-pixel text-[9px] text-yellow blink">NEW BEST!</div>}
            <p className="mt-3 text-center text-[19px] text-ink/85">
              You survived {result.days} {result.days === 1 ? "morning" : "mornings"} and stole {result.slept} extra minutes of sleep.
            </p>
            <div className="mt-1 text-center font-pixel text-[8px] text-dim">BEST {best}</div>
            <BigButton onClick={start} color="#39ff88">
              ▶ TRY TOMORROW
            </BigButton>
          </Overlay>
        )}
      </div>
      <div className="flex h-12 shrink-0 items-center gap-2 px-3 pb-2">
        <span className={`text-[22px] ${hud.boss < 6 && screen === "play" ? "shake" : ""}`}>📱</span>
        <div className="flex-1">
          <div className="font-pixel text-[7px] text-dim">BOSS CALLS IN {Math.ceil(hud.boss)}s</div>
          <div className="mt-1 h-2 w-full bg-line">
            <div className="h-full transition-[width] duration-100" style={{ width: `${bossPct}%`, background: bossPct < 30 ? "#ff4d6d" : bossPct < 60 ? "#ffe14d" : "#39ff88" }} />
          </div>
        </div>
      </div>
    </LabShell>
  );
}

function drawSpot(cx: CanvasRenderingContext2D, s: Spot, dx: number) {
  const x = s.x + dx, y = s.y;
  cx.save();
  switch (s.name) {
    case "bed":
      cx.fillStyle = "#3b2a6b";
      cx.fillRect(x, y, s.w, s.h);
      cx.fillStyle = "#ece9ff";
      cx.fillRect(x + 12, y + 10, s.w - 24, 34); // pillow
      cx.fillStyle = "#ff2bd6";
      cx.fillRect(x, y + 60, s.w, s.h - 60); // duvet
      cx.fillStyle = "#c21fa4";
      for (let i = 0; i < 4; i++) cx.fillRect(x, y + 74 + i * 26, s.w, 6);
      break;
    case "wardrobe":
      cx.fillStyle = "#5a3b1f";
      cx.fillRect(x, y, s.w, s.h);
      cx.strokeStyle = "#2e1d0e";
      cx.lineWidth = 2;
      cx.beginPath();
      cx.moveTo(x + s.w / 2, y + 4);
      cx.lineTo(x + s.w / 2, y + s.h - 4);
      cx.stroke();
      cx.fillStyle = "#ffe14d";
      cx.fillRect(x + s.w / 2 - 8, y + s.h / 2, 4, 4);
      cx.fillRect(x + s.w / 2 + 4, y + s.h / 2, 4, 4);
      break;
    case "rug":
      cx.fillStyle = "#123f4a";
      cx.fillRect(x, y, s.w, s.h);
      cx.strokeStyle = "#22f3ff";
      cx.globalAlpha = 0.5;
      cx.strokeRect(x + 8, y + 8, s.w - 16, s.h - 16);
      break;
    case "desk":
      cx.fillStyle = "#4a3320";
      cx.fillRect(x, y, s.w, s.h);
      cx.fillStyle = "#0c0919";
      cx.fillRect(x + 12, y + 20, s.w - 24, 40); // laptop
      cx.fillStyle = "#22f3ff";
      cx.globalAlpha = 0.5;
      cx.fillRect(x + 16, y + 24, s.w - 32, 32);
      break;
    case "laundry":
      for (const [ox, oy, r, col] of [
        [24, 40, 26, "#ff8a3d"],
        [52, 30, 24, "#22f3ff"],
        [40, 18, 18, "#b26bff"],
        [60, 52, 18, "#ffe14d"],
      ] as const) {
        cx.fillStyle = col;
        cx.globalAlpha = 0.85;
        cx.beginPath();
        cx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        cx.fill();
      }
      break;
    case "plant":
      cx.fillStyle = "#8a4b2a";
      cx.beginPath();
      cx.arc(x + s.w / 2, y + s.h / 2, 18, 0, Math.PI * 2);
      cx.fill();
      cx.fillStyle = "#39ff88";
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        cx.beginPath();
        cx.ellipse(x + s.w / 2 + Math.cos(a) * 14, y + s.h / 2 + Math.sin(a) * 14, 14, 6, a, 0, Math.PI * 2);
        cx.fill();
      }
      break;
  }
  cx.restore();
}

function drawWaves(cx: CanvasRenderingContext2D, x: number, y: number, t: number, color: string, alpha: number) {
  cx.strokeStyle = color;
  cx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const f = (t * 1.8 + i / 3) % 1;
    cx.globalAlpha = (1 - f) * alpha;
    cx.beginPath();
    cx.arc(x, y, CLOCK_R + 4 + f * 26, -Math.PI * 0.85, -Math.PI * 0.15);
    cx.stroke();
    cx.beginPath();
    cx.arc(x, y, CLOCK_R + 4 + f * 26, Math.PI * 0.15, Math.PI * 0.85);
    cx.stroke();
  }
  cx.globalAlpha = 1;
}

function drawClock(cx: CanvasRenderingContext2D, c: Clock, t: number, ringing: boolean, asleep: boolean) {
  const wob = asleep ? 0 : Math.sin(t * 50 + c.x) * 0.12;
  const s = 1 + c.hop * 0.8;
  if (ringing) drawWaves(cx, c.x, c.y, t, "#ffe14d", 1);
  cx.save();
  cx.translate(c.x, c.y);
  cx.rotate(wob);
  cx.scale(s, s);
  // shadow
  cx.fillStyle = "rgba(0,0,0,0.35)";
  cx.beginPath();
  cx.ellipse(2, CLOCK_R + 2, CLOCK_R, 5, 0, 0, Math.PI * 2);
  cx.fill();
  // legs, scurrying
  cx.strokeStyle = "#ece9ff";
  cx.lineWidth = 2;
  const leg = asleep ? 0 : Math.sin(t * 30) * 5;
  cx.beginPath();
  cx.moveTo(-8, CLOCK_R - 4);
  cx.lineTo(-10 + leg, CLOCK_R + 6);
  cx.moveTo(8, CLOCK_R - 4);
  cx.lineTo(10 - leg, CLOCK_R + 6);
  cx.stroke();
  // bells
  cx.fillStyle = "#ffe14d";
  for (const sx of [-1, 1]) {
    cx.beginPath();
    cx.arc(sx * 11, -CLOCK_R + 1, 7, Math.PI, 0);
    cx.fill();
  }
  // body
  cx.fillStyle = "#ff4d6d";
  cx.beginPath();
  cx.arc(0, 0, CLOCK_R, 0, Math.PI * 2);
  cx.fill();
  cx.fillStyle = "#ece9ff";
  cx.beginPath();
  cx.arc(0, 0, CLOCK_R - 4, 0, Math.PI * 2);
  cx.fill();
  // hands
  cx.strokeStyle = "#05040b";
  cx.lineWidth = 2;
  const a = asleep ? -Math.PI / 2 : t * 6;
  cx.beginPath();
  cx.moveTo(0, 0);
  cx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9);
  cx.moveTo(0, 0);
  cx.lineTo(Math.cos(a / 12) * 6, Math.sin(a / 12) * 6);
  cx.stroke();
  cx.restore();
  if (asleep) {
    cx.fillStyle = "#39ff88";
    cx.font = "10px var(--font-press), monospace";
    cx.fillText("z", c.x + 16, c.y - 22 - ((t * 20) % 10));
  }
}
