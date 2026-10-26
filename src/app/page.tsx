import Link from "next/link";

const GAMES = [
  {
    href: "/query-arcade",
    name: "Query Arcade",
    tag: "SQL · PySpark",
    blurb: "A fast retro arcade for data people. Real SQL in your browser, 7 modes, daily datasets and global high scores.",
    color: "#ff2bd6",
    icon: "🕹️",
    live: true,
  },
  {
    href: "/daily-weird",
    name: "Daily Weird Guess",
    tag: "1 FACT · 2 CHOICES · DAILY",
    blurb: "One absurd fact a day and two answers. Guess right to keep your streak alive and climb the streak board.",
    color: "#22f3ff",
    icon: "🦩",
    live: true,
  },
  {
    href: "/rubber-bullet-man",
    name: "Rubber Bullet Man",
    tag: "ARENA · TRICK SHOTS",
    blurb: "Every bullet bounces, including back at you. Bank shots, chain kills and a Rubber King boss.",
    color: "#ffe14d",
    icon: "🔫",
    live: true,
  },
  { href: "#", name: "Coming soon", tag: "???", blurb: "Another weird game is on its way.", color: "#2a2350", icon: "❔", live: false },
];

export default function Hub() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-[radial-gradient(ellipse_at_top,#1b1040_0%,#05040b_65%)]">
      <div className="stars absolute inset-0" aria-hidden />
      <main className="relative z-10 mx-auto max-w-3xl px-4 py-12">
        <div className="text-center">
          <div className="font-pixel text-[9px] tracking-[0.35em] text-dim">INSERT CURIOSITY</div>
          <h1 className="mt-4 font-pixel text-[34px] leading-tight sm:text-[48px]">
            <span className="text-yellow neon">WEIRD</span> <span className="text-pink neon">GAMES</span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[21px] text-ink/80">Odd little games that run in your browser. Free to play, no sign-up.</p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {GAMES.map((g) =>
            g.live ? (
              <Link key={g.name} href={g.href} className="pixel-corners neon-box block bg-panel/90 p-5 transition-transform active:scale-[0.98]" style={{ ["--glow" as string]: g.color }}>
                <div className="text-4xl">{g.icon}</div>
                <div className="mt-3 font-pixel text-[14px] neon-soft" style={{ color: g.color }}>
                  {g.name.toUpperCase()}
                </div>
                <div className="mt-1 font-pixel text-[8px] text-cyan">{g.tag}</div>
                <p className="mt-3 text-[19px] text-ink/80">{g.blurb}</p>
                <div className="mt-4 font-pixel text-[10px] text-yellow blink">▶ PLAY</div>
              </Link>
            ) : (
              // Secret door: the Coming Soon card quietly links to the unlisted lab, styled exactly like a plain card.
              <Link key={g.name} href="/lab" prefetch={false} className="pixel-corners block cursor-default border-2 border-dashed border-line p-5 opacity-60">
                <div className="text-4xl">{g.icon}</div>
                <div className="mt-3 font-pixel text-[14px] text-dim">{g.name.toUpperCase()}</div>
                <p className="mt-3 text-[19px] text-dim">{g.blurb}</p>
              </Link>
            ),
          )}
        </div>
        <p className="mt-12 text-center text-[16px] text-dim">© 2026 Weird Games</p>
      </main>
      <div className="crt-overlay" aria-hidden />
    </div>
  );
}
