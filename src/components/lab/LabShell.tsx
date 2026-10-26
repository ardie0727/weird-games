"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isMuted, onMuteChange, setMuted } from "@/lib/client/sound";

// Shared chrome for the in-development lab games: a top bar and an overlay card.

export function LabShell({ title, color, right, children }: { title: string; color: string; right?: React.ReactNode; children: React.ReactNode }) {
  const [muted, setMutedState] = useState(false);
  useEffect(() => {
    setMutedState(isMuted());
    const off = onMuteChange(setMutedState);
    return () => void off();
  }, []);
  return (
    <div className="fixed inset-0 flex select-none flex-col bg-bg" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <header className="flex h-11 shrink-0 items-center justify-between gap-2 px-3">
        <Link href="/lab" className="font-pixel text-[9px] text-dim hover:text-ink">
          ◀ LAB
        </Link>
        <div className="truncate font-pixel text-[9px] neon-soft" style={{ color }}>
          {title}
        </div>
        <div className="flex gap-3">
          <button className="font-pixel text-[9px] text-dim" onClick={() => setMuted(!muted)} aria-label={muted ? "Unmute" : "Mute"}>
            {muted ? "🔇" : "🔊"}
          </button>
          {right}
        </div>
      </header>
      {children}
    </div>
  );
}

export function Overlay({ glow = "#ff2bd6", children }: { glow?: string; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-bg/80 p-4">
      <div className="pixel-corners neon-box my-auto w-full max-w-sm bg-panel/95 p-5" style={{ ["--glow" as string]: glow }}>
        {children}
      </div>
    </div>
  );
}

export function BigButton({ onClick, color = "#ff2bd6", children }: { onClick: () => void; color?: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="mt-4 block w-full py-3 font-pixel text-[12px] text-bg active:scale-[0.98]" style={{ background: color }}>
      {children}
    </button>
  );
}
