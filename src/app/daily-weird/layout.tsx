import type { Metadata } from "next";
import Link from "next/link";
import { MuteButton } from "@/components/qa/Cabinet";

export const metadata: Metadata = {
  title: "Daily Weird Guess",
  description: "One absurd fact a day, two choices. Keep your streak alive and climb the board.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[radial-gradient(ellipse_at_top,#0f2a3a_0%,#05040b_60%)]">
      <div className="stars absolute inset-0" aria-hidden />
      <div className="crt-flicker relative z-10 mx-auto flex min-h-dvh w-full max-w-xl flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b-2 border-cyan/50 bg-bg/85 px-4 py-2 backdrop-blur-sm" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
          <Link href="/" className="font-pixel text-[8px] text-dim hover:text-ink">
            ◀ WEIRD GAMES
          </Link>
          <Link href="/daily-weird" className="font-pixel text-[10px] text-cyan neon-soft">
            DAILY<span className="text-yellow">WEIRD</span>
          </Link>
          <MuteButton />
        </header>
        <main className="flex-1 px-4 pb-10 pt-5" style={{ paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))" }}>
          {children}
        </main>
      </div>
      <div className="crt-overlay" aria-hidden />
    </div>
  );
}
