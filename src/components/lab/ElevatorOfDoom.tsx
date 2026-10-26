"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { load, save } from "@/lib/client/storage";
import { CAPACITY, FLOORS, KIND, START_STARS, callTo, carFloor, floorLabel, newGame, riders, step, waitingAt, type Game, type Kind, type Passenger } from "@/lib/lab/elevator";
import { blip, unlock } from "@/lib/lab/sound";
import { BigButton, LabShell, Overlay } from "./LabShell";

type Screen = "title" | "play" | "over";

interface Pop {
  id: number;
  floor: number;
  text: string;
  color: string;
  at: number;
}

const BEST_KEY = "lab.elevator.best";
const FLOOR_LIST = [...Array(FLOORS).keys()].reverse();

function angerColor(a: number) {
  return a < 40 ? "#39ff88" : a < 70 ? "#ffe14d" : "#ff4d6d";
}

function Person({ p, small }: { p: Passenger; small?: boolean }) {
  const mad = p.anger > 70;
  return (
    <div className={`relative flex flex-col items-center ${mad ? "shake" : ""}`} style={{ width: small ? 24 : 28 }}>
      <span className="font-pixel text-[7px] leading-none" style={{ color: mad ? "#ff4d6d" : "#22f3ff" }}>
        {floorLabel(p.to)}
      </span>
      <span className={small ? "text-[17px] leading-tight" : "text-[19px] leading-tight"}>{KIND[p.kind].emoji}</span>
      {mad && <span className="absolute -right-1 -top-1 text-[10px]">💢</span>}
      <span className="block h-[3px] w-full bg-line">
        <span className="block h-full" style={{ width: `${Math.min(100, p.anger)}%`, background: angerColor(p.anger) }} />
      </span>
    </div>
  );
}

export function ElevatorOfDoom() {
  const [screen, setScreen] = useState<Screen>("title");
  const [, setFrame] = useState(0);
  const [best, setBest] = useState(0);
  const [pops, setPops] = useState<Pop[]>([]);
  const [paused, setPaused] = useState(false);
  const gameRef = useRef<Game>(newGame());
  const screenRef = useRef<Screen>("title");
  const pausedRef = useRef(false);
  const popId = useRef(0);
  const [result, setResult] = useState<{ score: number; delivered: number; time: number; best: boolean } | null>(null);

  useEffect(() => setBest(load<number>(BEST_KEY, 0)), []);

  const start = useCallback(() => {
    unlock();
    gameRef.current = newGame();
    screenRef.current = "play";
    pausedRef.current = false;
    setPaused(false);
    setScreen("play");
    setPops([]);
    setResult(null);
  }, []);

  const pause = (p: boolean) => {
    pausedRef.current = p;
    setPaused(p);
  };

  useEffect(() => {
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (screenRef.current !== "play" || pausedRef.current) return;
      const g = gameRef.current;
      step(g, dt);
      const add: Omit<Pop, "id" | "at">[] = [];
      for (const e of g.events) {
        switch (e.t) {
          case "deliver":
            add.push({ floor: e.floor, text: `${e.emoji} +${e.pts}`, color: "#39ff88" });
            blip("deliver", [
              [880, 0, 0.08, "square", 0.035],
              [1175, 0.07, 0.12, "square", 0.035],
            ]);
            break;
          case "ding":
            blip("ding", [[1046, 0, 0.25, "sine", 0.06]]);
            break;
          case "board":
            blip("board", [[440, 0, 0.05, "triangle", 0.04]]);
            break;
          case "wrong":
            add.push({ floor: e.floor, text: "WRONG FLOOR!", color: "#ff4d6d" });
            blip("wrong", [[180, 0, 0.3, "sawtooth", 0.05, 90]]);
            break;
          case "rage":
            add.push({ floor: e.floor, text: e.riding ? `${e.emoji} CLIMBS OUT THE HATCH` : `${e.emoji} TAKES THE STAIRS`, color: "#ff2bd6" });
            blip("rage", [
              [140, 0, 0.18, "sawtooth", 0.06],
              [110, 0.16, 0.25, "sawtooth", 0.06],
            ]);
            break;
          case "press":
            add.push({ floor: e.floor, text: `👶 PRESSED ${floorLabel(e.floor)}`, color: "#ffe14d" });
            blip("press", [[1500, 0, 0.04, "square", 0.03]]);
            break;
          case "mind":
            add.push({ floor: carFloor(g), text: `🤡 NOW WANTS ${floorLabel(e.to)}`, color: "#b26bff" });
            blip("mind", [
              [600, 0, 0.08, "square", 0.03, 900],
              [900, 0.08, 0.08, "square", 0.03, 500],
            ]);
            break;
          case "over": {
            const prev = load<number>(BEST_KEY, 0);
            if (g.score > prev) save(BEST_KEY, g.score), setBest(g.score);
            setResult({ score: g.score, delivered: g.delivered, time: g.time, best: g.score > prev });
            screenRef.current = "over";
            setScreen("over");
            break;
          }
        }
      }
      g.events = [];
      if (add.length) setPops((ps) => [...ps.filter((p) => now - p.at < 1100), ...add.map((p) => ({ ...p, id: ++popId.current, at: now }))]);
      setFrame((f) => (f + 1) % 1e6);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // drop old popups
  useEffect(() => {
    if (!pops.length) return;
    const id = setTimeout(() => setPops((ps) => ps.filter((p) => performance.now() - p.at < 1100)), 1150);
    return () => clearTimeout(id);
  }, [pops]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (screenRef.current !== "play") {
        if (e.key === "Enter" || e.key === " ") start();
        return;
      }
      if (e.key === "Escape" || e.key.toLowerCase() === "p") return pause(!pausedRef.current);
      const k = e.key.toLowerCase() === "g" ? 0 : Number(e.key);
      if (Number.isInteger(k) && k >= 0 && k < FLOORS) callTo(gameRef.current, k);
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [start]);

  const g = gameRef.current;
  const inCar = riders(g);
  const carTop = ((FLOORS - 1 - g.pos) / FLOORS) * 100;
  const open = g.doors > 0;

  return (
    <LabShell
      title="ELEVATOR OF DOOM"
      color="#ff8a3d"
      right={
        screen === "play" && (
          <button className="font-pixel text-[9px] text-cyan" onClick={() => pause(!paused)}>
            {paused ? "▶" : "II"}
          </button>
        )
      }
    >
      <div className="flex h-9 shrink-0 items-center justify-between px-3 font-pixel text-[8px]">
        <span className="text-[12px] tracking-tight">
          {Array.from({ length: START_STARS }, (_, i) => (
            <span key={i} className={i < g.stars ? "text-yellow" : "text-line"}>
              ★
            </span>
          ))}
        </span>
        <span className="text-dim">
          COMBO <span className="text-green">x{g.combo}</span>
        </span>
        <span className="text-dim">
          LIFT <span className="text-ink">{inCar.length}</span>/{CAPACITY}
        </span>
        <span className="text-orange">{g.score}</span>
      </div>

      <div className="relative mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-2 pb-2">
        <div className="relative flex min-h-0 flex-1 flex-col border-2 border-line bg-panel">
          {FLOOR_LIST.map((f) => {
            const waiting = waitingAt(g, f);
            const target = g.target === f;
            const forced = g.forced.has(f);
            const dropping = inCar.some((p) => p.to === f);
            return (
              <button
                key={f}
                onPointerDown={(e) => {
                  e.preventDefault();
                  unlock();
                  callTo(g, f);
                }}
                className={`relative flex min-h-0 flex-1 touch-none items-stretch border-b border-line/70 text-left last:border-b-0 ${target ? "bg-orange/10" : ""}`}
                aria-label={`Send the lift to floor ${floorLabel(f)}`}
              >
                <div className="flex w-9 shrink-0 flex-col items-center justify-center border-r border-line/70">
                  <span className={`font-pixel text-[11px] ${target ? "text-orange neon-soft" : dropping ? "text-cyan" : "text-dim"}`}>{floorLabel(f)}</span>
                  {forced && <span className="text-[9px] leading-none">👶</span>}
                </div>
                <div className="w-[120px] shrink-0 border-r border-dashed border-line/70" />
                <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden px-1">
                  {waiting.map((p) => (
                    <Person key={p.id} p={p} />
                  ))}
                </div>
              </button>
            );
          })}

          {/* the lift */}
          <div className="pointer-events-none absolute left-9 w-[120px] px-1 py-[3px] transition-none" style={{ top: `${carTop}%`, height: `${100 / FLOORS}%` }}>
            <div className="relative flex h-full items-center justify-center gap-0.5 overflow-hidden border-2 bg-cab" style={{ borderColor: open ? "#39ff88" : "#ff8a3d", boxShadow: `0 0 10px ${open ? "#39ff88" : "#ff8a3d"}66` }}>
              {inCar.map((p) => (
                <Person key={p.id} p={p} small />
              ))}
              {!open && (
                <>
                  <div className="absolute inset-y-0 left-0 w-1/2 border-r border-bg bg-[#2b2147]/55" />
                  <div className="absolute inset-y-0 right-0 w-1/2 bg-[#2b2147]/55" />
                </>
              )}
            </div>
            <div className="absolute -top-[100vh] left-1/2 h-[100vh] w-px bg-dim/40" />
          </div>

          {pops.map((p) => (
            <div
              key={p.id}
              className="pop pointer-events-none absolute left-1/2 z-10 whitespace-nowrap font-pixel text-[9px]"
              style={{ top: `${((FLOORS - 1 - p.floor) / FLOORS) * 100 + 2}%`, color: p.color, textShadow: "0 0 6px #000, 0 0 2px #000" }}
            >
              {p.text}
            </div>
          ))}
        </div>

        {screen === "title" && (
          <Overlay glow="#ff8a3d">
            <div className="text-center font-pixel text-[18px] leading-snug">
              <span className="text-orange neon">ELEVATOR</span>
              <br />
              <span className="text-pink neon">OF DOOM</span>
            </div>
            <p className="mt-3 text-center text-[19px] text-ink/85">You run the lift. Everyone wants a different floor, and nobody is patient.</p>
            {best > 0 && <div className="mt-3 text-center font-pixel text-[9px] text-yellow">BEST {best}</div>}
            <BigButton onClick={start} color="#ff8a3d">
              ▶ START SHIFT
            </BigButton>
            <ul className="mt-4 space-y-1 text-[16px] leading-tight">
              {(Object.keys(KIND) as Kind[]).map((k) => (
                <li key={k}>
                  <span className="mr-1">{KIND[k].emoji}</span>
                  <b className="font-normal text-orange">{KIND[k].name}:</b> <span className="text-ink/80">{KIND[k].desc}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 border-t border-line pt-3 text-[16px] leading-snug text-dim">
              <p>Tap a floor to send the lift. The number over each head is where they want to go. Stopping where nobody gets on or off is a WRONG FLOOR and makes riders angrier.</p>
              <p className="mt-1">Anyone who hits full rage costs a ★. Lose all five and you&apos;re fired. Useful stops in a row build a combo.</p>
            </div>
          </Overlay>
        )}
        {screen === "play" && paused && (
          <Overlay glow="#ff8a3d">
            <div className="text-center font-pixel text-[18px] text-yellow neon">PAUSED</div>
            <BigButton onClick={() => pause(false)} color="#ff8a3d">
              ▶ RESUME
            </BigButton>
          </Overlay>
        )}
        {screen === "over" && result && (
          <Overlay glow="#ff8a3d">
            <div className="text-center font-pixel text-[16px] text-red neon">YOU&apos;RE FIRED</div>
            <div className="mt-4 text-center font-pixel text-[28px] text-orange neon">{result.score}</div>
            {result.best && <div className="mt-2 text-center font-pixel text-[9px] text-green blink">NEW BEST!</div>}
            <p className="mt-3 text-center text-[19px] text-ink/85">
              You delivered {result.delivered} {result.delivered === 1 ? "passenger" : "passengers"} in {Math.floor(result.time / 60)}:
              {String(Math.floor(result.time % 60)).padStart(2, "0")}.
            </p>
            <div className="mt-1 text-center font-pixel text-[8px] text-dim">BEST {best}</div>
            <BigButton onClick={start} color="#ff8a3d">
              ▶ NEXT SHIFT
            </BigButton>
          </Overlay>
        )}
      </div>
    </LabShell>
  );
}
