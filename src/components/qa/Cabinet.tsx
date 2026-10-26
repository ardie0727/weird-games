"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { isMuted, onMuteChange, setMuted, sfx, unlockAudio } from "@/lib/client/sound";

export function MuteButton() {
  const [m, setM] = useState(false);
  useEffect(() => {
    setM(isMuted());
    return onMuteChange(setM) as () => void;
  }, []);
  return (
    <button
      type="button"
      onClick={() => {
        unlockAudio();
        setMuted(!m);
        if (m) sfx("click");
      }}
      className="font-pixel text-[9px] px-2 py-1.5 border border-line text-dim hover:text-ink"
      aria-label={m ? "Unmute sound" : "Mute sound"}
      aria-pressed={m}
    >
      {m ? "🔇 OFF" : "🔊 ON"}
    </button>
  );
}

export function Cabinet({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[radial-gradient(ellipse_at_top,#1b1040_0%,#05040b_60%)]">
      <div className="crt-flicker relative z-10 mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b-2 border-pink/50 bg-bg/85 px-4 py-2 backdrop-blur-sm" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
          <Link href="/" className="font-pixel text-[8px] text-dim hover:text-ink">
            ◀ WEIRD GAMES
          </Link>
          <Link href="/query-arcade" className="font-pixel text-[10px] text-pink neon-soft">
            QUERY<span className="text-cyan">ARCADE</span>
          </Link>
          <MuteButton />
        </header>
        <main className="flex-1 px-4 pb-10 pt-4" style={{ paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))" }}>
          {children}
        </main>
      </div>
      <div className="crt-overlay" aria-hidden />
    </div>
  );
}
