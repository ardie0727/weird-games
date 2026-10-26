import Link from "next/link";

const LAB = [
  {
    href: "/lab/shadow-match",
    name: "Shadow Match",
    tag: "PUZZLE · 3D",
    blurb: "A lamp throws a strange object's shadow on the wall. Turn it until the shadow fills the outline. The light keeps moving.",
    color: "#22f3ff",
    icon: "🔦",
  },
  {
    href: "/lab/elevator-of-doom",
    name: "Elevator of Doom",
    tag: "TAP · CHAOS",
    blurb: "Run the lift for impatient suits, slow grannies, mind-changing clowns and a toddler who presses every button.",
    color: "#ff8a3d",
    icon: "🛗",
  },
  {
    href: "/lab/snooze-button",
    name: "Snooze Button",
    tag: "CATCH · REFLEX",
    blurb: "Your alarm clock grew legs. Catch it and hit snooze before your boss calls. It hides, it fakes, it runs.",
    color: "#39ff88",
    icon: "⏰",
  },
  {
    href: "/lab/sock-matcher",
    name: "Sock Matcher",
    tag: "PAIRS · PANIC",
    blurb: "A washing machine spits socks onto the floor. Drag twins together before the pile buries you.",
    color: "#ff2bd6",
    icon: "🧦",
  },
  {
    href: "/lab/pigeon-air-traffic",
    name: "Pigeon Air Traffic",
    tag: "DRAW · DON'T CRASH",
    blurb: "Draw flight paths so pigeons land on the right part of the statue without flying into each other.",
    color: "#8f89b8",
    icon: "🐦",
  },
  {
    href: "/lab/traffic-signal-god",
    name: "Traffic Signal God",
    tag: "TAP · JUNCTION",
    blurb: "Flip the lights at a four-way junction. Avoid crashes and gridlock while auto-rickshaws ignore half your reds.",
    color: "#39ff88",
    icon: "🚦",
  },
  {
    href: "/lab/balloon-doctor",
    name: "Balloon Doctor",
    tag: "TILT · PATCH",
    blurb: "A leaky balloon drifts up a cactus canyon. Tap holes to patch them and tilt to steer. Every leak is a tiny jet.",
    color: "#ff2bd6",
    icon: "🎈",
  },
  {
    href: "/lab/dabbawala-rush",
    name: "Dabbawala Rush",
    tag: "SORT · TRAINS",
    blurb: "Sort colour-coded tiffins onto the right local train before it pulls out. Lunch for the whole city depends on it.",
    color: "#ffe14d",
    icon: "🍱",
  },
  {
    href: "/lab/fridge-tetris",
    name: "Fridge Tetris",
    tag: "FIT · BEFORE IT SHUTS",
    blurb: "Squeeze oddly shaped leftovers into the fridge, around shelves and mystery jars, before the door swings shut.",
    color: "#22f3ff",
    icon: "🧊",
  },
  {
    href: "/lab/mosquito-bat",
    name: "Mosquito Bat",
    tag: "SWING · ZAP",
    blurb: "Swing an electric racket at mosquitoes diving for a sleeper. Every wave they get better at dodging.",
    color: "#22f3ff",
    icon: "🦟",
  },
  {
    href: "/lab/queue-jumper",
    name: "Queue Jumper",
    tag: "SNEAK · DONT GET CAUGHT",
    blurb: "Squeeze forward in a ticket queue while the aunty behind you is busy with her phone.",
    color: "#ffe14d",
    icon: "🧍",
  },
  {
    href: "/lab/tiffin-stack",
    name: "Tiffin Stack",
    tag: "STACK · BALANCE",
    blurb: "Drop steel tiffin boxes onto a tower riding a wobbly scooter, and steer to keep it from toppling.",
    color: "#ffe14d",
    icon: "🛵",
  },
  {
    href: "/lab/ghost-landlord",
    name: "Ghost Landlord",
    tag: "HAUNT · EVICT",
    blurb: "You are the ghost. Scare tenants out with creaks, flickering lights and a haunted fan before they sign the lease.",
    color: "#b26bff",
    icon: "👻",
  },
  {
    href: "/lab/cloud-sculptor",
    name: "Cloud Sculptor",
    tag: "SHAPE · BEAT THE WIND",
    blurb: "Push a drifting cloud around until it looks like the target animal, before the wind tears it apart.",
    color: "#22f3ff",
    icon: "☁️",
  },
  {
    href: "/lab/power-cut",
    name: "Power Cut",
    tag: "MEMORY · IN THE DARK",
    blurb: "The lights keep going out. Memorise the room in the flashes and reach the fuse box without stubbing a toe.",
    color: "#ffe14d",
    icon: "🔌",
  },
];

export default function Lab() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-[radial-gradient(ellipse_at_top,#1b1040_0%,#05040b_65%)]">
      <div className="stars absolute inset-0" aria-hidden />
      <main className="relative z-10 mx-auto max-w-3xl px-4 py-10">
        <Link href="/" className="font-pixel text-[9px] text-dim hover:text-ink">
          ◀ HUB
        </Link>
        <div className="mt-6 text-center">
          <div className="font-pixel text-[9px] tracking-[0.35em] text-red blink">● RESTRICTED AREA</div>
          <h1 className="mt-4 font-pixel text-[28px] leading-tight sm:text-[40px]">
            <span className="text-green neon">THE</span> <span className="text-cyan neon">LAB</span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[21px] text-ink/80">You found the secret door. These games are still in development, so expect rough edges.</p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {LAB.map((g) => (
            <Link key={g.href} href={g.href} className="pixel-corners neon-box block bg-panel/90 p-5 transition-transform active:scale-[0.98]" style={{ ["--glow" as string]: g.color }}>
              <div className="flex items-start justify-between">
                <div className="text-4xl">{g.icon}</div>
                <div className="border border-yellow/60 px-1.5 py-1 font-pixel text-[7px] text-yellow">IN DEV</div>
              </div>
              <div className="mt-3 font-pixel text-[14px] neon-soft" style={{ color: g.color }}>
                {g.name.toUpperCase()}
              </div>
              <div className="mt-1 font-pixel text-[8px] text-cyan">{g.tag}</div>
              <p className="mt-3 text-[19px] text-ink/80">{g.blurb}</p>
              <div className="mt-4 font-pixel text-[10px] text-yellow blink">▶ TEST</div>
            </Link>
          ))}
        </div>
        <p className="mt-12 text-center text-[16px] text-dim">Shh. This page isn&apos;t listed anywhere.</p>
      </main>
      <div className="crt-overlay" aria-hidden />
    </div>
  );
}
