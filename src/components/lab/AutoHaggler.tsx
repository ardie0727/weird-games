"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { blip, unlock } from "@/lib/lab/sound";
import { GameOverCard, LabShell, TitleCard, useBest } from "./LabShell";

// Auto Haggler: every rickshaw driver quotes double. Read his face, make
// offers, fake a walk-away, and get the fare down. Push too hard, or take too
// long, and he drives off. Three drivers lost and you're walking home.

type Persona = { name: string; patience: number; give: number; floor: number; drain: number; bluff: boolean; rain: boolean; hello: string };
const PERSONAS: Persona[] = [
  { name: "Grumpy Gupta", patience: 65, give: 0.35, floor: 1.0, drain: 5, bluff: false, rain: false, hello: "Kahan? Jaldi bolo." },
  { name: "Chatty Chacha", patience: 120, give: 0.18, floor: 1.15, drain: 3, bluff: false, rain: false, hello: "Arre beta! Aao aao, kahan jaana hai?" },
  { name: "Smooth Salim", patience: 95, give: 0.3, floor: 0.92, drain: 4, bluff: true, rain: false, hello: "Best rate, best ride, sir." },
  { name: "Rainy Raju", patience: 70, give: 0.25, floor: 1.4, drain: 5, bluff: false, rain: true, hello: "Baarish hai saab. Rate alag hai." },
  { name: "Meter Mama", patience: 80, give: 0.28, floor: 1.05, drain: 4, bluff: false, rain: false, hello: "Meter? Meter kharab hai." },
];

const PLACES = ["the station", "Andheri", "the mall", "Koramangala", "the airport", "Connaught Place", "your aunt's house", "the hospital", "Bandra", "Old City"];

const INSULTED = ["Petrol ka rate pata hai?", "Itne mein toh cycle bhi nahi milegi.", "Mazaak kar rahe ho kya?", "Bhaiya, ghar pe khaana bhi khaana hai.", "Doosra auto dekh lo."];
const COUNTER = ["Achha chalo, {p}.", "Last price {p}.", "Aapke liye {p}.", "{p}, isse kam nahi.", "Theek hai, {p}. Final."];
const CALLBACK = ["Arre ruko ruko! {p} de do.", "Achha suno… {p}?", "Saab! {p} final, aao."];
const GONE = ["Jao phir. 🛺💨", "Mera time waste mat karo.", "Bas. Main chala."];
const DEAL = ["Chalo, baitho.", "Theek hai, baitho.", "Aaj ka pehla customer ho, chalo."];

interface Ride {
  persona: Persona;
  place: string;
  fair: number;
  quote: number;
  ask: number;
  floor: number;
  mood: number;
  walked: boolean;
  said: string;
  log: { who: "you" | "him"; text: string }[];
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const r10 = (n: number) => Math.round(n / 10) * 10;
const fill = (s: string, p: number) => s.replace("{p}", `₹${p}`);

function newRide(n: number): Ride {
  const persona = n === 0 ? PERSONAS[1] : pick(PERSONAS);
  const fair = r10(70 + Math.random() * 160);
  const quote = r10(fair * (1.7 + Math.random() * 1.1) * (persona.rain ? 1.3 : 1));
  const floor = r10(fair * persona.floor * (0.95 + Math.random() * 0.1));
  return { persona, place: pick(PLACES), fair, quote, ask: quote, floor, mood: persona.patience, walked: false, said: `${persona.hello} ₹${quote}.`, log: [] };
}

// fixed first ride so the server render matches the client; play() deals a real one
function demoRide(): Ride {
  const persona = PERSONAS[1];
  return { persona, place: PLACES[0], fair: 120, quote: 260, ask: 260, floor: 130, mood: persona.patience, walked: false, said: `${persona.hello} ₹260.`, log: [] };
}

function face(r: Ride) {
  // a bluffer looks angrier than he is
  const m = r.persona.bluff ? r.mood - 25 : r.mood;
  return m > 85 ? "😄" : m > 60 ? "🙂" : m > 38 ? "😐" : m > 18 ? "😒" : "😠";
}

type Outcome = { kind: "deal"; paid: number } | { kind: "gone" } | null;

function offer(r: Ride, x: number): Outcome {
  if (x >= r.ask) {
    r.said = pick(DEAL);
    return { kind: "deal", paid: r.ask };
  }
  const gap = (r.floor - x) / r.floor;
  if (gap > 0) {
    r.mood -= 14 + gap * 90;
    if (r.mood <= 0) {
      r.said = pick(GONE);
      return { kind: "gone" };
    }
    r.said = pick(INSULTED);
    r.ask = Math.max(r.floor, r10(r.ask - (r.ask - r.floor) * r.persona.give * 0.5));
    return null;
  }
  // a fair-ish offer: he comes down, and takes it if you're close enough
  r.mood -= 8;
  if (r.ask - x <= 20 || r.mood < 30 || x >= r.floor * 1.15) {
    r.said = pick(DEAL);
    return { kind: "deal", paid: x };
  }
  r.ask = Math.max(x + 10, r10(r.ask - (r.ask - x) * (r.persona.give + 0.25)));
  r.said = fill(pick(COUNTER), r.ask);
  if (r.mood <= 0) {
    r.said = pick(GONE);
    return { kind: "gone" };
  }
  return null;
}

function walkAway(r: Ride): Outcome {
  // only works once, and only while he's still in a decent mood
  if (r.walked || r.mood < 45 || r.ask <= r.floor) {
    r.said = pick(GONE);
    return { kind: "gone" };
  }
  r.walked = true;
  r.mood -= 25;
  r.ask = Math.max(r.floor, r10(r.ask * 0.78));
  r.said = fill(pick(CALLBACK), r.ask);
  return null;
}

export function AutoHaggler() {
  const [screen, setScreen] = useState<"title" | "play" | "over">("title");
  const [best, submitBest] = useBest("lab.haggler.best");
  const [ride, setRide] = useState<Ride>(demoRide);
  const [, force] = useState(0);
  const [bid, setBid] = useState(130);
  const [stats, setStats] = useState({ rides: 0, lost: 0, saved: 0, n: 0 });
  const [flash, setFlash] = useState<{ text: string; good: boolean } | null>(null);
  const [result, setResult] = useState<{ score: number; rides: number; best: boolean } | null>(null);
  const busy = useRef(false);
  const statsRef = useRef(stats);
  statsRef.current = stats;

  const next = useCallback((n: number) => {
    const r = newRide(n);
    setRide(r);
    setBid(r10(r.quote * 0.5));
    busy.current = false;
  }, []);

  const start = useCallback(() => {
    unlock();
    setStats({ rides: 0, lost: 0, saved: 0, n: 0 });
    setFlash(null);
    next(0);
    setScreen("play");
  }, [next]);

  const settle = useCallback(
    (o: Outcome, r: Ride) => {
      if (!o) {
        force((k) => k + 1);
        return;
      }
      busy.current = true;
      const s = { ...statsRef.current, n: statsRef.current.n + 1 };
      if (o.kind === "deal") {
        const saved = r.quote - o.paid;
        const bonus = o.paid <= r.fair ? 25 : 0;
        s.rides++;
        s.saved += saved + bonus;
        setFlash({ text: `PAID ₹${o.paid} · SAVED ₹${saved}${bonus ? " · STEAL! +25" : ""}`, good: true });
        blip("deal", [
          [523, 0, 0.08, "square", 0.04],
          [784, 0.08, 0.15, "square", 0.04],
        ]);
      } else {
        s.lost++;
        setFlash({ text: `${r.persona.name.toUpperCase()} DROVE OFF`, good: false });
        blip("gone", [[300, 0, 0.4, "sawtooth", 0.04, 90]]);
      }
      setStats(s);
      force((k) => k + 1);
      setTimeout(() => {
        setFlash(null);
        if (s.lost >= 3) {
          setResult({ score: s.saved, rides: s.rides, best: submitBest(s.saved) });
          setScreen("over");
        } else next(s.n);
      }, 1500);
    },
    [next, submitBest],
  );

  // his patience drains while you think
  useEffect(() => {
    if (screen !== "play") return;
    const id = setInterval(() => {
      if (busy.current) return;
      ride.mood -= ride.persona.drain * 0.25;
      if (ride.mood <= 0) {
        ride.said = "Sochte raho. Main chala.";
        settle({ kind: "gone" }, ride);
      } else force((k) => k + 1);
    }, 250);
    return () => clearInterval(id);
  }, [screen, ride, settle]);

  const doOffer = () => {
    if (busy.current) return;
    blip("tap", [[440, 0, 0.05, "square", 0.03]]);
    ride.log.push({ who: "you", text: `₹${bid}?` });
    settle(offer(ride, bid), ride);
  };
  const doWalk = () => {
    if (busy.current) return;
    ride.log.push({ who: "you", text: "Rehne do. *walks away*" });
    settle(walkAway(ride), ride);
  };
  const doAccept = () => {
    if (busy.current) return;
    ride.log.push({ who: "you", text: "Theek hai." });
    ride.said = pick(DEAL);
    settle({ kind: "deal", paid: ride.ask }, ride);
  };

  const max = ride.ask;
  const step = (d: number) => setBid((b) => Math.max(10, Math.min(max, b + d)));

  return (
    <LabShell title="AUTO HAGGLER" color="#ffe14d">
      <div className="flex h-9 shrink-0 items-center justify-between px-3 font-pixel text-[8px]">
        <span className="text-dim">
          RIDES <span className="text-ink">{stats.rides}</span>
        </span>
        <span className="text-dim">
          LOST <span className="text-red">{"🛺".repeat(stats.lost)}</span>
          <span className="opacity-30">{"🛺".repeat(3 - stats.lost)}</span>
        </span>
        <span className="text-yellow">₹{stats.saved}</span>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 pb-4">
        <div className={`relative mt-2 w-full max-w-sm overflow-hidden rounded-sm border border-line p-4 ${ride.persona.rain ? "bg-[#14203a]" : "bg-panel"}`}>
          {ride.persona.rain && <div className="pointer-events-none absolute inset-0 animate-pulse text-[12px] leading-3 text-cyan/30">{"╱ ".repeat(300)}</div>}
          <div className="relative flex items-end justify-between">
            <div>
              <div className="font-pixel text-[9px] text-cyan">{ride.persona.name.toUpperCase()}</div>
              <div className="mt-1 text-[16px] text-dim">To {ride.place}</div>
            </div>
            <div className="text-right">
              <div className="font-pixel text-[7px] text-dim">ASKING</div>
              <div className="font-pixel text-[16px] text-yellow neon-soft">₹{ride.ask}</div>
            </div>
          </div>
          <div className="relative mt-3 flex items-center gap-3">
            <div className="relative text-[64px] leading-none">
              🛺
              <span className="absolute -right-3 -top-3 text-[40px] transition-transform" style={{ transform: ride.mood < 25 ? `rotate(${Math.sin(Date.now() / 60) * 8}deg)` : undefined }}>
                {face(ride)}
              </span>
            </div>
            <div className="relative flex-1 rounded-lg bg-ink px-3 py-2 text-[18px] leading-snug text-bg">
              {ride.said}
              <span className="absolute -left-2 top-4 h-0 w-0 border-y-[6px] border-r-[8px] border-y-transparent border-r-ink" />
            </div>
          </div>
          {ride.log.length > 0 && <div className="relative mt-2 text-right text-[15px] text-dim">You: {ride.log[ride.log.length - 1].text}</div>}
        </div>

        <div className="mt-4 w-full max-w-sm">
          <div className="flex items-center justify-between font-pixel text-[9px] text-dim">
            <span>YOUR OFFER</span>
            <span className="text-[18px] text-green neon-soft">₹{Math.min(bid, max)}</span>
          </div>
          <input type="range" min={10} max={max} step={10} value={Math.min(bid, max)} onChange={(e) => setBid(+e.target.value)} className="mt-2 w-full accent-[#39ff88]" disabled={screen !== "play"} />
          <div className="mt-2 grid grid-cols-4 gap-2 font-pixel text-[9px]">
            {[-50, -10, 10, 50].map((d) => (
              <button key={d} onClick={() => step(d)} className="border border-line py-2 text-ink active:scale-95">
                {d > 0 ? `+${d}` : d}
              </button>
            ))}
          </div>
          <button onClick={doOffer} className="mt-3 block w-full bg-green py-3 font-pixel text-[11px] text-bg active:scale-[0.98]">
            OFFER ₹{Math.min(bid, max)}
          </button>
          <div className="mt-2 grid grid-cols-2 gap-2 font-pixel text-[9px]">
            <button onClick={doWalk} className="border border-orange py-3 text-orange active:scale-95">
              🚶 WALK AWAY
            </button>
            <button onClick={doAccept} className="border border-yellow py-3 text-yellow active:scale-95">
              PAY ₹{ride.ask}
            </button>
          </div>
        </div>

        {flash && (
          <div className="absolute inset-x-4 top-1/3 z-10 mx-auto max-w-sm border-2 bg-bg/95 px-3 py-4 text-center font-pixel text-[10px] leading-relaxed" style={{ borderColor: flash.good ? "#39ff88" : "#ff4d6d", color: flash.good ? "#39ff88" : "#ff4d6d" }}>
            {flash.text}
          </div>
        )}

        {screen === "title" && (
          <TitleCard a="AUTO" b="HAGGLER" colorA="#ffe14d" colorB="#39ff88" blurb="Every rickshaw driver quotes double. Bring it down without making him drive off." best={best} onPlay={start}>
            <p>Make an offer. Too low and he&apos;s insulted. His face is your only clue to how close he is to leaving.</p>
            <p>Walking away works once, while he&apos;s still in a good mood. He also gets bored if you take too long.</p>
            <p>You score what you save. Pay at or under the fair price for a bonus. Lose three autos and you walk home.</p>
          </TitleCard>
        )}
        {screen === "over" && result && (
          <GameOverCard title="WALKING HOME" score={result.score} isBest={result.best} best={best} color="#ffe14d" line={`You got ${result.rides} rides and saved ₹${result.score} before every auto in town knew your face.`} again={start} />
        )}
      </div>
    </LabShell>
  );
}
