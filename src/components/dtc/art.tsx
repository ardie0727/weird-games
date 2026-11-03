// Down the Couch: every character and background is drawn here as inline SVG.
import type { ReactNode } from "react";

// ---------- shared gradients (rendered once by <ArtDefs/>) ----------
export function ArtDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        <radialGradient id="g-penny" cx="38%" cy="32%" r="70%">
          <stop offset="0" stopColor="#ffcf9e" />
          <stop offset=".45" stopColor="#d77a3e" />
          <stop offset="1" stopColor="#7e3a17" />
        </radialGradient>
        <radialGradient id="g-button" cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#9fe0da" />
          <stop offset=".55" stopColor="#3f9c9a" />
          <stop offset="1" stopColor="#1f5e63" />
        </radialGradient>
        <linearGradient id="g-key" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff0a8" />
          <stop offset=".5" stopColor="#d9a93a" />
          <stop offset="1" stopColor="#8a5e14" />
        </linearGradient>
        <linearGradient id="g-pick" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff9ad5" />
          <stop offset=".6" stopColor="#ff3d9a" />
          <stop offset="1" stopColor="#b3176b" />
        </linearGradient>
        <linearGradient id="g-rust" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e08a4a" />
          <stop offset="1" stopColor="#7a3412" />
        </linearGradient>
        <linearGradient id="g-steel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#eef2f6" />
          <stop offset=".5" stopColor="#9aa6b2" />
          <stop offset="1" stopColor="#56606c" />
        </linearGradient>
        <radialGradient id="g-glass" cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".95" />
          <stop offset=".3" stopColor="#7fd6ff" />
          <stop offset=".7" stopColor="#2a6fd6" />
          <stop offset="1" stopColor="#173a7a" />
        </radialGradient>
        <radialGradient id="g-soap" cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".4" stopColor="#c9f2ff" />
          <stop offset="1" stopColor="#6fb8e0" />
        </radialGradient>
        <linearGradient id="g-red" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff6b6b" />
          <stop offset="1" stopColor="#a8202f" />
        </linearGradient>
        <linearGradient id="g-dino" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fe08a" />
          <stop offset="1" stopColor="#2f8a45" />
        </linearGradient>
        <linearGradient id="g-remote" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2b2633" />
          <stop offset=".5" stopColor="#4a4456" />
          <stop offset="1" stopColor="#2b2633" />
        </linearGradient>
        <linearGradient id="g-vac" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff5d7a" />
          <stop offset="1" stopColor="#8a1a3a" />
        </linearGradient>
        <radialGradient id="g-fur" cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor="#f4d9b8" />
          <stop offset="1" stopColor="#c08a5c" />
        </radialGradient>
        <radialGradient id="g-marble" cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".35" stopColor="#9be7ff" />
          <stop offset="1" stopColor="#1d5f9a" />
        </radialGradient>
      </defs>
    </svg>
  );
}

// ---------- helpers ----------
const Eye = ({ x, y, r = 9, look = 2 }: { x: number; y: number; r?: number; look?: number }) => (
  <g className="dtc-blink">
    <ellipse cx={x} cy={y} rx={r} ry={r * 1.2} fill="#fff" />
    <circle cx={x + look} cy={y + 1} r={r * 0.55} fill="#1b1220" />
    <circle cx={x + look + r * 0.25} cy={y - r * 0.3} r={r * 0.2} fill="#fff" />
  </g>
);
const Glow = ({ x, y, rx = 10, ry = 7, c = "#ff4d4d" }: { x: number; y: number; rx?: number; ry?: number; c?: string }) => (
  <g className="dtc-blink">
    <ellipse cx={x} cy={y} rx={rx * 2} ry={ry * 2} fill={c} opacity=".15" />
    <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={c} />
    <circle cx={x} cy={y} r={Math.min(rx, ry) * 0.5} fill="#fff3a0" />
  </g>
);
const Legs = ({ c, y, spread = 30, cx = 100 }: { c: string; y: number; spread?: number; cx?: number }) => (
  <>
    <g stroke={c} strokeWidth="6" strokeLinecap="round" fill="none">
      <path d={`M${cx - spread * 0.5} ${y} l -6 26`} />
      <path d={`M${cx + spread * 0.5} ${y} l 6 26`} />
    </g>
    <g fill={c}>
      <ellipse cx={cx - spread * 0.5 - 8} cy={y + 27} rx="11" ry="5" />
      <ellipse cx={cx + spread * 0.5 + 8} cy={y + 27} rx="11" ry="5" />
    </g>
  </>
);
const Arms = ({ c, y, w }: { c: string; y: number; w: number }) => (
  <g stroke={c} strokeWidth="6" strokeLinecap="round" fill="none">
    <path d={`M${100 - w} ${y} q -18 6 -22 24`} />
    <path d={`M${100 + w} ${y} q 18 6 22 24`} />
  </g>
);
const Shadow = ({ rx = 52 }: { rx?: number }) => <ellipse cx="100" cy="196" rx={rx} ry="7" fill="#000" opacity=".3" />;
const Sparkle = ({ x, y, s = 1, d = 0 }: { x: number; y: number; s?: number; d?: number }) => (
  <path
    className="dtc-twinkle"
    style={{ animationDelay: `${d}s` }}
    d={`M${x} ${y - 10 * s} l${4 * s} ${10 * s} ${10 * s} ${4 * s} ${-10 * s} ${4 * s} ${-4 * s} ${10 * s} ${-4 * s} ${-10 * s} ${-10 * s} ${-4 * s} ${10 * s} ${-4 * s}z`}
    fill="#fff6c2"
  />
);

function fuzz(cx: number, cy: number, r: number, n: number, col: string, seed: number): ReactNode[] {
  let s = seed;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const out: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = r * (0.55 + rnd() * 0.5);
    const len = 8 + rnd() * 14;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr * 0.9;
    out.push(
      <path
        key={i}
        d={`M${x.toFixed(1)} ${y.toFixed(1)} l${(Math.cos(a) * len).toFixed(1)} ${(Math.sin(a) * len).toFixed(1)}`}
        stroke={col}
        strokeWidth={(2 + rnd() * 2).toFixed(1)}
        strokeLinecap="round"
        opacity={(0.5 + rnd() * 0.5).toFixed(2)}
      />,
    );
  }
  return out;
}

// ---------- heroes ----------
function Penny() {
  return (
    <>
      <Shadow />
      <Legs c="#4a2410" y={150} />
      <Arms c="#4a2410" y={112} w={52} />
      <circle cx="100" cy="100" r="58" fill="#6b2f12" />
      <circle cx="100" cy="97" r="56" fill="url(#g-penny)" />
      <circle cx="100" cy="97" r="45" fill="none" stroke="#8a4320" strokeWidth="3" strokeDasharray="3 5" opacity=".7" />
      <path d="M70 70 l14 6 M128 128 l8 -12 M60 112 l10 4" stroke="#7a3a1a" strokeWidth="2.5" opacity=".6" />
      <Eye x={84} y={92} />
      <Eye x={116} y={92} />
      <path d="M90 116 q10 9 20 0" stroke="#4a2410" strokeWidth="4" fill="none" strokeLinecap="round" />
      <ellipse cx="74" cy="110" rx="7" ry="4" fill="#ff8f7a" opacity=".5" />
      <ellipse cx="126" cy="110" rx="7" ry="4" fill="#ff8f7a" opacity=".5" />
      <path d="M68 62 q16 -16 40 -14" stroke="#fff3d8" strokeWidth="6" fill="none" strokeLinecap="round" opacity=".7" />
      <Sparkle x={154} y={50} />
      <Sparkle x={44} y={144} s={0.7} d={-0.8} />
    </>
  );
}

function ButtonHero() {
  return (
    <>
      <Shadow />
      <Legs c="#16393d" y={152} spread={34} />
      <Arms c="#16393d" y={112} w={54} />
      <g transform="rotate(25 160 110)">
        <rect x="156" y="60" width="6" height="90" rx="3" fill="#dfe6ea" />
        <ellipse cx="159" cy="68" rx="2" ry="5" fill="#1b1220" />
        <path d="M156 150 l3 12 3 -12z" fill="#dfe6ea" />
      </g>
      <circle cx="100" cy="100" r="60" fill="#1a4a4e" />
      <circle cx="100" cy="97" r="58" fill="url(#g-button)" />
      <circle cx="100" cy="97" r="44" fill="none" stroke="#1f5e63" strokeWidth="5" opacity=".5" />
      <g fill="#173e42">
        <circle cx="86" cy="118" r="5" />
        <circle cx="114" cy="118" r="5" />
        <circle cx="86" cy="138" r="4" />
        <circle cx="114" cy="138" r="4" />
      </g>
      <Eye x={84} y={84} r={10} look={1} />
      <Eye x={116} y={84} r={10} look={1} />
      <path d="M93 104 q7 5 14 0" stroke="#16393d" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M46 128 q54 26 108 0 l-4 14 q-50 22 -100 0z" fill="#d94b4b" />
      <path d="M50 132 q50 22 100 0" stroke="#ff8a7a" strokeWidth="2" fill="none" strokeDasharray="5 5" />
      <path d="M138 138 q10 22 2 44 l12 -3 q6 -20 -2 -42z" fill="#c23c3c" />
      <path d="M66 58 q14 -12 34 -12" stroke="#e6fffb" strokeWidth="5" fill="none" strokeLinecap="round" opacity=".6" />
    </>
  );
}

function KeyHero() {
  return (
    <>
      <Shadow />
      <ellipse cx="100" cy="22" rx="30" ry="9" fill="none" stroke="#c9ced6" strokeWidth="5" />
      <ellipse cx="100" cy="20" rx="30" ry="9" fill="none" stroke="#f2f5f8" strokeWidth="2" opacity=".7" />
      <Arms c="#5a3c0c" y={92} w={42} />
      <circle cx="100" cy="78" r="46" fill="#6e4a0e" />
      <circle cx="100" cy="75" r="44" fill="url(#g-key)" />
      <circle cx="100" cy="50" r="9" fill="#2a1a20" />
      <rect x="88" y="112" width="24" height="62" rx="6" fill="url(#g-key)" stroke="#6e4a0e" strokeWidth="3" />
      <path d="M112 140 h16 v10 h-8 v8 h8 v10 h-16z" fill="url(#g-key)" stroke="#6e4a0e" strokeWidth="3" strokeLinejoin="round" />
      <g stroke="#5a3c0c" strokeWidth="6" strokeLinecap="round">
        <path d="M92 172 l-8 20" />
        <path d="M108 172 l8 20" />
      </g>
      <g fill="#5a3c0c">
        <ellipse cx="80" cy="193" rx="10" ry="5" />
        <ellipse cx="120" cy="193" rx="10" ry="5" />
      </g>
      <Eye x={85} y={80} look={-1} />
      <Eye x={115} y={80} look={-1} />
      <path d="M92 100 q8 -4 16 0" stroke="#5a3c0c" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M70 52 q8 -14 24 -18" stroke="#fffbe0" strokeWidth="5" fill="none" strokeLinecap="round" opacity=".7" />
    </>
  );
}

function PickHero() {
  return (
    <>
      <Shadow />
      <g className="dtc-trail">
        <path d="M18 70 h40 M8 98 h48 M22 126 h34" stroke="#ff7ac2" strokeWidth="6" strokeLinecap="round" opacity=".5" />
      </g>
      <Legs c="#6b0f40" y={152} />
      <Arms c="#6b0f40" y={98} w={50} />
      <path d="M100 172 C 60 140, 34 90, 46 60 C 56 34, 144 34, 154 60 C 166 90, 140 140, 100 172Z" fill="#7d0f4a" transform="translate(0 4)" />
      <path d="M100 172 C 60 140, 34 90, 46 60 C 56 34, 144 34, 154 60 C 166 90, 140 140, 100 172Z" fill="url(#g-pick)" />
      <path d="M60 58 q30 -16 60 -12" stroke="#ffe1f2" strokeWidth="6" fill="none" strokeLinecap="round" opacity=".7" />
      <path d="M58 82 h84" stroke="#1b1220" strokeWidth="5" />
      <path d="M62 80 h30 q2 22 -14 22 q-16 0 -16 -22z" fill="#1b1220" />
      <path d="M108 80 h30 q0 22 -16 22 q-16 0 -14 -22z" fill="#1b1220" />
      <path d="M68 84 l10 0 M114 84 l10 0" stroke="#9be7ff" strokeWidth="3" strokeLinecap="round" opacity=".8" />
      <path d="M86 118 q14 10 30 -2" stroke="#6b0f40" strokeWidth="4" fill="none" strokeLinecap="round" />
    </>
  );
}

// ---------- Cushions ----------
function DustBunny({ crown = false }: { crown?: boolean }) {
  return (
    <>
      <Shadow />
      <g className="dtc-ears">
        <path d="M70 70 q-14 -50 4 -58 q16 6 10 58z" fill="#8d8494" />
        <path d="M118 68 q4 -52 22 -54 q12 10 -6 58z" fill="#8d8494" />
        {fuzz(76, 40, 14, 18, "#a59cad", 3)}
        {fuzz(130, 40, 14, 18, "#a59cad", 7)}
      </g>
      <ellipse cx="100" cy="130" rx="62" ry="54" fill="#6f6677" />
      {fuzz(100, 130, 56, 140, "#9d94a6", crown ? 11 : 5)}
      {fuzz(100, 130, 40, 60, "#b8b0c0", crown ? 13 : 9)}
      <Glow x={80} y={122} rx={11} ry={8} />
      <Glow x={120} y={122} rx={11} ry={8} />
      <path d="M84 150 l6 -6 6 6 6 -6 6 6 6 -6 6 6" stroke="#2a1e2e" strokeWidth="4" fill="none" strokeLinejoin="round" />
      {crown && (
        <>
          <path d="M72 78 l8 -26 14 18 6 -24 6 24 14 -18 8 26z" fill="#f2b84b" stroke="#8a5a14" strokeWidth="3" strokeLinejoin="round" />
          <circle cx="100" cy="70" r="5" fill="#e8566c" />
          <circle cx="80" cy="60" r="3" fill="#7fd6ff" />
          <circle cx="120" cy="60" r="3" fill="#7fd6ff" />
          <path d="M40 150 q-10 30 10 40 M160 150 q10 30 -10 40" stroke="#c94b8a" strokeWidth="6" fill="none" strokeLinecap="round" />
        </>
      )}
    </>
  );
}

function CrumbGolem() {
  return (
    <>
      <Shadow />
      <g fill="#c98f4a" stroke="#6e4317" strokeWidth="3" strokeLinejoin="round">
        <path d="M50 188 l6 -34 22 -4 4 38z" />
        <path d="M118 188 l2 -38 22 4 6 34z" />
        <path d="M30 120 l14 -24 22 6 -6 30 -24 4z" />
        <path d="M170 120 l-14 -24 -22 6 6 30 24 4z" />
        <path d="M56 160 l-6 -54 26 -20 50 0 24 22 -6 52 -40 8z" fill="#e0aa62" />
        <path d="M70 92 l4 -40 24 -12 30 10 6 40 -30 10z" fill="#d79c55" />
      </g>
      <g fill="#fff4d6" opacity=".5">
        <circle cx="80" cy="120" r="3" />
        <circle cx="120" cy="140" r="2.5" />
        <circle cx="96" cy="64" r="2.5" />
        <circle cx="140" cy="118" r="2" />
      </g>
      <path d="M60 104 q30 10 80 -2 l2 10 q-6 10 -10 0 q-10 14 -16 2 q-14 10 -20 -2 q-12 12 -18 0 q-10 8 -16 -4z" fill="#c2253f" />
      <path d="M68 108 q20 6 40 2" stroke="#ff7d92" strokeWidth="3" fill="none" strokeLinecap="round" />
      <g className="dtc-blink">
        <circle cx="88" cy="70" r="7" fill="#ffd36b" />
        <circle cx="114" cy="70" r="7" fill="#ffd36b" />
      </g>
      <path d="M90 86 h22" stroke="#6e4317" strokeWidth="4" strokeLinecap="round" />
    </>
  );
}

function Earbud() {
  return (
    <>
      <Shadow />
      <path d="M120 140 C 150 170, 190 150, 176 120 S 140 90, 170 70" stroke="#e9e6ee" strokeWidth="7" fill="none" strokeLinecap="round" />
      <rect x="94" y="110" width="30" height="62" rx="14" fill="#f4f2f7" stroke="#9b95a6" strokeWidth="3" transform="rotate(-18 109 140)" />
      <circle cx="86" cy="96" r="44" fill="#c9c4d2" />
      <circle cx="84" cy="92" r="42" fill="#f6f4fa" />
      <ellipse cx="72" cy="88" rx="22" ry="20" fill="#3b3346" />
      <g fill="#5d5469">
        <circle cx="64" cy="82" r="2" />
        <circle cx="72" cy="80" r="2" />
        <circle cx="80" cy="84" r="2" />
        <circle cx="66" cy="92" r="2" />
        <circle cx="76" cy="94" r="2" />
      </g>
      <g stroke="#9be7ff" strokeWidth="4" fill="none" strokeLinecap="round" className="dtc-trail">
        <path d="M38 70 q-14 18 0 36" />
        <path d="M26 60 q-22 28 0 56" />
      </g>
      <g className="dtc-blink">
        <circle cx="104" cy="74" r="6" fill="#1b1220" />
        <circle cx="116" cy="84" r="5" fill="#1b1220" />
      </g>
      <path d="M96 106 q10 6 18 -2" stroke="#1b1220" strokeWidth="3.5" fill="none" strokeLinecap="round" />
    </>
  );
}

function HairTie() {
  return (
    <>
      <Shadow rx={46} />
      <ellipse cx="100" cy="120" rx="58" ry="52" fill="none" stroke="#5a1840" strokeWidth="30" />
      <ellipse cx="100" cy="116" rx="58" ry="52" fill="none" stroke="#c23f8a" strokeWidth="26" />
      <ellipse cx="100" cy="116" rx="58" ry="52" fill="none" stroke="#ff8cc6" strokeWidth="4" strokeDasharray="10 12" opacity=".7" />
      <rect x="86" y="54" width="28" height="22" rx="5" fill="#f2b84b" stroke="#8a5a14" strokeWidth="3" />
      <Eye x={78} y={112} r={9} />
      <Eye x={122} y={112} r={9} />
      <path d="M84 138 q16 -10 32 0" stroke="#3a0f2a" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M70 98 l16 6 M130 98 l-16 6" stroke="#3a0f2a" strokeWidth="4" strokeLinecap="round" />
    </>
  );
}

function SockGremlin() {
  return (
    <>
      <Shadow rx={60} />
      <path d="M60 30 q-8 60 0 100 q4 50 50 56 q50 4 62 -30 q10 -30 -30 -40 q-20 -6 -22 -30 l-2 -60z" fill="#6b5a8a" />
      <path d="M60 30 q-8 60 0 100 q4 50 50 56 q50 4 62 -30 q10 -30 -30 -40 q-20 -6 -22 -30 l-2 -60z" fill="none" stroke="#3a2f52" strokeWidth="4" />
      <path d="M58 30 h62 v16 h-62z" fill="#d94b4b" />
      <path d="M58 52 h62 v8 h-62z" fill="#d94b4b" opacity=".8" />
      <g stroke="#8d7bb0" strokeWidth="3" opacity=".6">
        <path d="M70 70 v80 M84 70 v90 M98 70 v100" />
      </g>
      <ellipse cx="150" cy="160" rx="18" ry="14" fill="#8a7aa6" />
      <circle cx="140" cy="136" r="6" fill="#3a2f52" />
      <Glow x={78} y={96} rx={9} ry={7} c="#a6ff4d" />
      <Glow x={106} y={96} rx={9} ry={7} c="#a6ff4d" />
      <path d="M70 120 q20 18 44 0 l-6 10 -6 -6 -6 8 -6 -8 -6 8 -6 -6z" fill="#1b1220" />
      <g className="dtc-trail" stroke="#a6ff4d" strokeWidth="3" fill="none" opacity=".6">
        <path d="M40 60 q-10 -10 0 -20 q10 -10 0 -20" />
        <path d="M150 50 q-10 -10 0 -20 q10 -10 0 -20" />
      </g>
    </>
  );
}

// ---------- Springs ----------
function RustMite() {
  return (
    <>
      <Shadow rx={48} />
      <g stroke="#5a2408" strokeWidth="5" strokeLinecap="round" fill="none">
        <path d="M60 140 l-24 20 -6 20 M70 150 l-14 30 M130 150 l14 30 M140 140 l24 20 6 20" />
      </g>
      <ellipse cx="100" cy="130" rx="54" ry="40" fill="url(#g-rust)" />
      <g fill="#5a2408" opacity=".5">
        <circle cx="76" cy="122" r="6" />
        <circle cx="120" cy="140" r="8" />
        <circle cx="132" cy="114" r="4" />
      </g>
      <circle cx="100" cy="96" r="28" fill="#c2652a" />
      <path d="M86 74 q-10 -24 -24 -30 M114 74 q10 -24 24 -30" stroke="#5a2408" strokeWidth="4" fill="none" strokeLinecap="round" />
      <Glow x={90} y={94} rx={6} ry={6} c="#ffde59" />
      <Glow x={110} y={94} rx={6} ry={6} c="#ffde59" />
      <path d="M88 112 l6 6 6 -6 6 6 6 -6" stroke="#2a1006" strokeWidth="3" fill="none" />
    </>
  );
}

function CoilSnake() {
  return (
    <>
      <Shadow />
      {[0, 1, 2, 3, 4].map((i) => (
        <ellipse key={i} cx={100} cy={180 - i * 22} rx={44 - i * 3} ry="12" fill="none" stroke={i % 2 ? "#9aa6b2" : "#c6d0da"} strokeWidth="9" />
      ))}
      <ellipse cx="100" cy="70" rx="40" ry="30" fill="url(#g-steel)" />
      <path d="M100 92 q-6 14 -2 22 l4 -10 4 10 q4 -8 -2 -22" fill="#e8566c" />
      <Eye x={84} y={64} r={8} />
      <Eye x={116} y={64} r={8} />
      <path d="M78 50 l14 6 M122 50 l-14 6" stroke="#2a2f36" strokeWidth="4" strokeLinecap="round" />
    </>
  );
}

function BottlecapCrab() {
  return (
    <>
      <Shadow rx={60} />
      <g stroke="#a8202f" strokeWidth="6" strokeLinecap="round" fill="none">
        <path d="M54 150 l-20 30 M66 156 l-10 32 M134 156 l10 32 M146 150 l20 30" />
      </g>
      <path d="M40 100 q-26 -20 -14 -48 q10 -10 22 0 l-8 14 12 4 q6 20 -12 30z" fill="url(#g-red)" />
      <path d="M160 100 q26 -20 14 -48 q-10 -10 -22 0 l8 14 -12 4 q-6 20 12 30z" fill="url(#g-red)" />
      <ellipse cx="100" cy="140" rx="56" ry="30" fill="#a8202f" />
      <path d="M44 120 l8 -14 8 10 8 -14 8 10 8 -14 8 10 8 -14 8 10 8 -14 8 10 8 -14 8 10 8 14 -112 0z" fill="url(#g-steel)" stroke="#56606c" strokeWidth="2" />
      <ellipse cx="100" cy="116" rx="50" ry="14" fill="#d94b4b" />
      <text x="100" y="121" textAnchor="middle" fontSize="12" fontWeight="900" fill="#fff" opacity=".8" fontFamily="sans-serif">
        FIZZ
      </text>
      <path d="M84 130 v-20 M116 130 v-20" stroke="#a8202f" strokeWidth="4" />
      <Eye x={84} y={102} r={8} />
      <Eye x={116} y={102} r={8} />
      <path d="M90 152 q10 -6 20 0" stroke="#5a0f18" strokeWidth="4" fill="none" strokeLinecap="round" />
    </>
  );
}

function Paperclip() {
  const clip = (x: number, y: number, rot: number, c: string) => (
    <path
      transform={`rotate(${rot} ${x} ${y})`}
      d={`M${x - 10} ${y + 30} v-44 a10 10 0 0 1 20 0 v52 a14 14 0 0 1 -28 0 v-46`}
      fill="none"
      stroke={c}
      strokeWidth="6"
      strokeLinecap="round"
    />
  );
  return (
    <>
      <Shadow />
      {clip(60, 130, -20, "#9aa6b2")}
      {clip(140, 130, 20, "#9aa6b2")}
      {clip(100, 90, 0, "#c6d0da")}
      <circle cx="100" cy="74" r="20" fill="#56606c" />
      <Glow x={93} y={72} rx={5} ry={5} c="#7fd6ff" />
      <Glow x={107} y={72} rx={5} ry={5} c="#7fd6ff" />
    </>
  );
}

function RustySpring() {
  return (
    <>
      <Shadow rx={60} />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <path key={i} d={`M40 ${186 - i * 20} q60 -18 120 0 q-60 12 -120 0`} fill="none" stroke={i % 2 ? "#a8521f" : "#d9793a"} strokeWidth="10" strokeLinecap="round" />
      ))}
      <circle cx="100" cy="46" r="34" fill="url(#g-rust)" />
      <g fill="#5a2408" opacity=".5">
        <circle cx="86" cy="34" r="5" />
        <circle cx="118" cy="56" r="4" />
      </g>
      <Glow x={86} y={46} rx={8} ry={6} c="#ff9b3d" />
      <Glow x={114} y={46} rx={8} ry={6} c="#ff9b3d" />
      <path d="M84 64 h32" stroke="#2a1006" strokeWidth="4" strokeLinecap="round" />
      <path d="M78 34 l14 6 M122 34 l-14 6" stroke="#2a1006" strokeWidth="4" strokeLinecap="round" />
    </>
  );
}

function Remote() {
  return (
    <>
      <Shadow rx={56} />
      <rect x="54" y="14" width="92" height="180" rx="30" fill="#17141c" />
      <rect x="58" y="10" width="92" height="180" rx="30" fill="url(#g-remote)" />
      <rect x="74" y="28" width="60" height="34" rx="8" fill="#0d1c14" />
      <g className="dtc-blink">
        <path d="M82 40 l10 6 -10 6z M126 40 l-10 6 10 6z" fill="#ff4d4d" />
      </g>
      <path d="M86 56 h36" stroke="#ff4d4d" strokeWidth="3" />
      <circle cx="104" cy="88" r="16" fill="#e8566c" />
      <circle cx="104" cy="88" r="7" fill="#7a1a2f" />
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={76 + c * 20} y={116 + r * 20} width="14" height="12" rx="4" fill="#6b6478" />),
      )}
      <circle cx="80" cy="102" r="5" fill="#4dd47a" />
      <circle cx="128" cy="102" r="5" fill="#ffd36b" />
      <path d="M66 24 q10 -8 24 -8" stroke="#9a94a6" strokeWidth="4" fill="none" strokeLinecap="round" opacity=".6" />
    </>
  );
}

// ---------- Underfloor ----------
function GlowMoth() {
  return (
    <>
      <Shadow rx={40} />
      <g className="dtc-ears">
        <path d="M100 100 q-70 -70 -84 -20 q-6 40 84 40z" fill="#5b5f2a" />
        <path d="M100 100 q70 -70 84 -20 q6 40 -84 40z" fill="#5b5f2a" />
        <path d="M100 110 q-60 10 -60 40 q20 20 60 -20z" fill="#4a4d22" />
        <path d="M100 110 q60 10 60 40 q-20 20 -60 -20z" fill="#4a4d22" />
        <circle cx="54" cy="76" r="12" fill="#d8ff6b" opacity=".85" />
        <circle cx="146" cy="76" r="12" fill="#d8ff6b" opacity=".85" />
        <circle cx="54" cy="76" r="22" fill="#d8ff6b" opacity=".15" />
        <circle cx="146" cy="76" r="22" fill="#d8ff6b" opacity=".15" />
      </g>
      <ellipse cx="100" cy="116" rx="16" ry="40" fill="#8a7d4a" />
      <path d="M92 82 q-14 -30 -26 -30 M108 82 q14 -30 26 -30" stroke="#8a7d4a" strokeWidth="3" fill="none" />
      <Eye x={92} y={92} r={6} look={0} />
      <Eye x={108} y={92} r={6} look={0} />
    </>
  );
}

function BrickKnight() {
  const stud = (x: number, y: number) => <ellipse key={`${x}${y}`} cx={x} cy={y} rx="7" ry="3" fill="#ff8a8a" />;
  return (
    <>
      <Shadow />
      <rect x="64" y="150" width="30" height="40" rx="3" fill="#2a5fc2" />
      <rect x="106" y="150" width="30" height="40" rx="3" fill="#2a5fc2" />
      <rect x="56" y="88" width="88" height="66" rx="6" fill="url(#g-red)" />
      {stud(74, 88)}
      {stud(100, 88)}
      {stud(126, 88)}
      <rect x="70" y="36" width="60" height="54" rx="10" fill="#ffd34d" />
      <rect x="66" y="30" width="68" height="26" rx="6" fill="#9aa6b2" />
      <rect x="74" y="54" width="52" height="10" rx="3" fill="#56606c" />
      <circle cx="88" cy="72" r="5" fill="#1b1220" />
      <circle cx="112" cy="72" r="5" fill="#1b1220" />
      <path d="M90 82 q10 -4 20 0" stroke="#1b1220" strokeWidth="3" fill="none" />
      <path d="M150 40 l6 120" stroke="#c6d0da" strokeWidth="6" strokeLinecap="round" />
      <path d="M146 40 l10 -26 4 28z" fill="#eef2f6" />
      <path d="M30 100 h34 v40 q-17 20 -34 0z" fill="#56606c" stroke="#2a2f36" strokeWidth="3" />
      <path d="M47 104 v32 M34 118 h26" stroke="#ffd34d" strokeWidth="4" />
    </>
  );
}

function RollingMarble() {
  return (
    <>
      <Shadow rx={50} />
      <g className="dtc-trail" stroke="#9be7ff" strokeWidth="5" strokeLinecap="round" opacity=".5">
        <path d="M160 110 h30 M164 130 h24 M160 150 h30" />
      </g>
      <g className="dtc-spin">
        <circle cx="100" cy="130" r="56" fill="url(#g-marble)" />
        <path d="M60 110 q30 -10 40 20 q10 30 40 20" stroke="#ff6bb0" strokeWidth="10" fill="none" opacity=".8" />
        <path d="M70 160 q20 -30 60 -40" stroke="#ffd36b" strokeWidth="6" fill="none" opacity=".7" />
      </g>
      <ellipse cx="82" cy="100" rx="16" ry="10" fill="#fff" opacity=".6" />
      <Eye x={88} y={128} r={9} look={-3} />
      <Eye x={116} y={128} r={9} look={-3} />
      <path d="M84 114 l14 6 M120 114 l-14 6" stroke="#0f2a4a" strokeWidth="4" strokeLinecap="round" />
    </>
  );
}

function LeakyBattery() {
  return (
    <>
      <Shadow rx={44} />
      <path d="M56 186 q-6 -10 10 -12 q30 -4 30 6 q0 8 -40 6z" fill="#b8ff4d" opacity=".7" />
      <rect x="62" y="46" width="76" height="140" rx="12" fill="#1b1a20" />
      <rect x="62" y="46" width="76" height="60" rx="12" fill="#e8b84d" />
      <rect x="62" y="96" width="76" height="10" fill="#e8b84d" />
      <rect x="86" y="32" width="28" height="16" rx="4" fill="#c6d0da" />
      <text x="100" y="160" textAnchor="middle" fontSize="28" fontWeight="900" fill="#e8b84d" fontFamily="sans-serif">
        +
      </text>
      <path d="M130 120 q10 10 4 30" stroke="#b8ff4d" strokeWidth="6" fill="none" strokeLinecap="round" />
      <Glow x={86} y={74} rx={7} ry={7} c="#ff9b3d" />
      <Glow x={114} y={74} rx={7} ry={7} c="#ff9b3d" />
      <path d="M86 92 q14 8 28 0" stroke="#1b1a20" strokeWidth="4" fill="none" />
      <g className="dtc-twinkle" fill="#fff6a0">
        <path d="M150 50 l-10 16 h8 l-6 16 16 -20 h-8 l6 -12z" />
      </g>
    </>
  );
}

function PlasticDino() {
  return (
    <>
      <Shadow rx={66} />
      <path d="M150 130 q40 0 46 -30 q-20 20 -50 14z" fill="url(#g-dino)" />
      <rect x="66" y="150" width="20" height="38" rx="6" fill="#2f8a45" />
      <rect x="116" y="150" width="20" height="38" rx="6" fill="#2f8a45" />
      <ellipse cx="104" cy="130" rx="52" ry="38" fill="url(#g-dino)" />
      <path d="M70 100 l8 -16 8 14 8 -18 8 16 8 -18 8 16 8 -14 8 16" fill="#ffd34d" stroke="#8a6a14" strokeWidth="2" />
      <path d="M60 110 q-30 -30 -14 -70 q20 -20 50 -6 q14 10 6 30 q-8 20 -30 20z" fill="url(#g-dino)" />
      <path d="M40 60 q20 6 50 -4" stroke="#1b4a26" strokeWidth="3" fill="none" />
      <path d="M44 62 l6 8 6 -8 6 8 6 -8 6 8 6 -8" fill="#fff" />
      <circle cx="74" cy="44" r="8" fill="#fff" />
      <circle cx="76" cy="45" r="4" fill="#1b1220" />
      <path d="M64 34 l18 4" stroke="#1b4a26" strokeWidth="4" strokeLinecap="round" />
      <path d="M86 140 q-10 10 -20 6" stroke="#2f8a45" strokeWidth="8" strokeLinecap="round" fill="none" />
    </>
  );
}

function CatsPaw() {
  return (
    <>
      <path d="M40 0 q-10 80 10 130 l100 0 q20 -50 10 -130z" fill="url(#g-fur)" />
      <g stroke="#a8724a" strokeWidth="3" opacity=".5">
        <path d="M60 10 v60 M100 0 v70 M140 10 v60" />
      </g>
      <ellipse cx="100" cy="140" rx="70" ry="48" fill="url(#g-fur)" />
      <ellipse cx="100" cy="152" rx="30" ry="22" fill="#ff9fb8" />
      <ellipse cx="54" cy="122" rx="14" ry="16" fill="#ff9fb8" />
      <ellipse cx="82" cy="108" rx="14" ry="16" fill="#ff9fb8" />
      <ellipse cx="118" cy="108" rx="14" ry="16" fill="#ff9fb8" />
      <ellipse cx="146" cy="122" rx="14" ry="16" fill="#ff9fb8" />
      <g fill="#f4f2f7" className="dtc-claws">
        <path d="M50 160 l-6 30 12 -24z" />
        <path d="M80 172 l-2 26 10 -24z" />
        <path d="M120 172 l2 26 -10 -24z" />
        <path d="M150 160 l6 30 -12 -24z" />
      </g>
    </>
  );
}

// ---------- Drain ----------
function HairClog() {
  return (
    <>
      <Shadow rx={60} />
      <ellipse cx="100" cy="130" rx="66" ry="56" fill="#2a2420" />
      {fuzz(100, 130, 60, 120, "#5a4a3a", 21)}
      {fuzz(100, 128, 46, 70, "#7a6248", 23)}
      <g fill="none" stroke="#3a3028" strokeWidth="3" opacity=".8">
        <path d="M40 120 q60 -40 120 10" />
        <path d="M44 150 q50 30 112 -10" />
      </g>
      <ellipse cx="70" cy="160" rx="10" ry="6" fill="#b8e0ff" opacity=".6" />
      <Glow x={84} y={122} rx={8} ry={6} c="#b8ff4d" />
      <Glow x={118} y={120} rx={8} ry={6} c="#b8ff4d" />
      <path d="M86 146 q16 -8 30 0" stroke="#100c08" strokeWidth="4" fill="none" />
    </>
  );
}

function SoapSlime({ small = false }: { small?: boolean }) {
  return (
    <>
      <Shadow rx={small ? 40 : 60} />
      <path d="M36 186 q-8 -70 30 -110 q34 -30 68 0 q38 40 30 110z" fill="url(#g-soap)" opacity=".95" />
      <path d="M36 186 h128" stroke="#6fb8e0" strokeWidth="6" strokeLinecap="round" />
      <circle cx="70" cy="70" r="12" fill="url(#g-soap)" stroke="#9dd8f0" strokeWidth="2" />
      <circle cx="140" cy="60" r="8" fill="url(#g-soap)" stroke="#9dd8f0" strokeWidth="2" />
      <circle cx="120" cy="40" r="5" fill="url(#g-soap)" stroke="#9dd8f0" strokeWidth="2" />
      <ellipse cx="72" cy="100" rx="14" ry="8" fill="#fff" opacity=".8" />
      <Eye x={84} y={128} r={9} look={0} />
      <Eye x={116} y={128} r={9} look={0} />
      <path d="M90 154 q10 8 20 0" stroke="#2a6f9a" strokeWidth="4" fill="none" strokeLinecap="round" />
    </>
  );
}

function Drip() {
  return (
    <>
      <Shadow rx={36} />
      <path d="M100 30 q-50 80 -50 110 a50 50 0 0 0 100 0 q0 -30 -50 -110z" fill="url(#g-glass)" />
      <ellipse cx="80" cy="118" rx="10" ry="18" fill="#fff" opacity=".55" />
      <Eye x={88} y={138} r={8} look={1} />
      <Eye x={114} y={138} r={8} look={1} />
      <path d="M92 162 q8 4 16 0" stroke="#173a7a" strokeWidth="3" fill="none" strokeLinecap="round" />
    </>
  );
}

function DrainRat() {
  return (
    <>
      <Shadow rx={60} />
      <path d="M150 160 q40 0 40 -30 q0 -20 -16 -20" stroke="#d98a9a" strokeWidth="6" fill="none" strokeLinecap="round" />
      <ellipse cx="104" cy="140" rx="56" ry="40" fill="#6a6470" />
      {fuzz(104, 140, 48, 60, "#837c8a", 31)}
      <path d="M60 120 q-30 -6 -40 14 q14 12 44 6z" fill="#6a6470" />
      <circle cx="64" cy="98" r="16" fill="#8a8292" />
      <circle cx="64" cy="98" r="9" fill="#d98a9a" />
      <circle cx="20" cy="134" r="5" fill="#d98a9a" />
      <Glow x={46} y={122} rx={5} ry={5} c="#ff4d4d" />
      <path d="M24 140 l6 6 M30 140 l6 6" stroke="#fff" strokeWidth="3" />
      <rect x="120" y="96" width="30" height="20" rx="4" fill="#e0aa62" transform="rotate(-20 135 106)" />
      <rect x="70" y="170" width="12" height="18" rx="4" fill="#5a5460" />
      <rect x="126" y="170" width="12" height="18" rx="4" fill="#5a5460" />
    </>
  );
}

function Toothbrush() {
  return (
    <>
      <Shadow rx={50} />
      <rect x="86" y="70" width="28" height="120" rx="12" fill="#4dc2b8" />
      <rect x="92" y="80" width="8" height="100" rx="4" fill="#9af0e6" opacity=".6" />
      <rect x="62" y="20" width="76" height="50" rx="10" fill="#e9e6ee" />
      <g stroke="#ffffff" strokeWidth="5" strokeLinecap="round">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <path key={i} d={`M${68 + i * 10.5} 22 v-18`} />
        ))}
      </g>
      <g stroke="#7fd6ff" strokeWidth="5" strokeLinecap="round" opacity=".8">
        {[0, 2, 4, 6].map((i) => (
          <path key={i} d={`M${68 + i * 10.5} 18 v-12`} />
        ))}
      </g>
      <Glow x={84} y={46} rx={7} ry={6} c="#ff4d4d" />
      <Glow x={116} y={46} rx={7} ry={6} c="#ff4d4d" />
      <path d="M86 62 h28" stroke="#56606c" strokeWidth="4" strokeLinecap="round" />
      <Arms c="#2f8a80" y={110} w={14} />
    </>
  );
}

function Vacuum() {
  return (
    <>
      <Shadow rx={80} />
      <rect x="40" y="70" width="120" height="110" rx="36" fill="url(#g-vac)" />
      <rect x="54" y="84" width="92" height="40" rx="18" fill="#2b2633" />
      <g className="dtc-spin-slow">
        <circle cx="100" cy="104" r="16" fill="none" stroke="#ff9fb0" strokeWidth="4" strokeDasharray="8 6" />
      </g>
      <Glow x={72} y={104} rx={10} ry={8} c="#ffde59" />
      <Glow x={128} y={104} rx={10} ry={8} c="#ffde59" />
      <path d="M60 148 h80" stroke="#5a0f22" strokeWidth="8" strokeLinecap="round" />
      <g fill="#f4f2f7">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <path key={i} d={`M${64 + i * 13} 144 l6 10 6 -10z`} />
        ))}
      </g>
      <circle cx="60" cy="182" r="14" fill="#2b2633" />
      <circle cx="140" cy="182" r="14" fill="#2b2633" />
      <circle cx="60" cy="182" r="5" fill="#9a94a6" />
      <circle cx="140" cy="182" r="5" fill="#9a94a6" />
      <path d="M150 80 q40 -30 30 -76" stroke="#2b2633" strokeWidth="18" fill="none" strokeLinecap="round" />
      <path d="M150 80 q40 -30 30 -76" stroke="#4a4456" strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray="4 8" />
      <rect x="66" y="50" width="68" height="24" rx="10" fill="#c23c5a" />
    </>
  );
}

const SPRITES: Record<string, () => ReactNode> = {
  penny: Penny,
  button: ButtonHero,
  key: KeyHero,
  pick: PickHero,
  "dust-bunny": () => <DustBunny />,
  "queen-bunny": () => <DustBunny crown />,
  "crumb-golem": CrumbGolem,
  earbud: Earbud,
  "hair-tie": HairTie,
  "sock-gremlin": SockGremlin,
  "rust-mite": RustMite,
  "coil-snake": CoilSnake,
  "bottlecap-crab": BottlecapCrab,
  paperclip: Paperclip,
  "rusty-spring": RustySpring,
  remote: Remote,
  "glow-moth": GlowMoth,
  "lego-knight": BrickKnight,
  marble: RollingMarble,
  battery: LeakyBattery,
  "plastic-dino": PlasticDino,
  "cats-paw": CatsPaw,
  "hair-clog": HairClog,
  "soap-slime": () => <SoapSlime />,
  "mini-slime": () => <SoapSlime small />,
  drip: Drip,
  "drain-rat": DrainRat,
  toothbrush: Toothbrush,
  vacuum: Vacuum,
};

export function Sprite({ id, className, flip }: { id: string; className?: string; flip?: boolean }) {
  const S = SPRITES[id];
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden style={{ overflow: "visible" }}>
      <g transform={flip ? "translate(200 0) scale(-1 1)" : undefined}>{S ? <S /> : <circle cx="100" cy="100" r="50" fill="#888" />}</g>
    </svg>
  );
}

// ---------- backgrounds ----------
export function AreaBg({ area }: { area: number }) {
  return (
    <svg className="dtc-bg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMax slice" aria-hidden>
      {area === 0 && <Cushions />}
      {area === 1 && <Springs />}
      {area === 2 && <Underfloor />}
      {area === 3 && <Drain />}
    </svg>
  );
}

function Cushions() {
  return (
    <>
      <defs>
        <radialGradient id="bg0-lamp" cx="70%" cy="-5%" r="75%">
          <stop offset="0" stopColor="#ffd98a" stopOpacity=".95" />
          <stop offset=".35" stopColor="#d9824a" stopOpacity=".45" />
          <stop offset="1" stopColor="#2a0f22" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bg0-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a1630" />
          <stop offset="1" stopColor="#1a0a18" />
        </linearGradient>
        <linearGradient id="bg0-v1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6e2848" />
          <stop offset="1" stopColor="#3a1229" />
        </linearGradient>
        <linearGradient id="bg0-v2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#93365c" />
          <stop offset="1" stopColor="#521a38" />
        </linearGradient>
        <linearGradient id="bg0-v3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b8466f" />
          <stop offset=".5" stopColor="#7e2a4c" />
          <stop offset="1" stopColor="#4a1630" />
        </linearGradient>
      </defs>
      <rect width="1600" height="1000" fill="url(#bg0-sky)" />
      <path d="M-50 520 Q 120 300 420 330 Q 640 350 720 470 Q 820 290 1120 300 Q 1420 310 1660 480 L1660 1000 L-50 1000Z" fill="url(#bg0-v1)" />
      <path d="M-50 520 Q 120 300 420 330 Q 640 350 720 470 Q 820 290 1120 300 Q 1420 310 1660 480" fill="none" stroke="#c4708f" strokeOpacity=".35" strokeWidth="5" strokeDasharray="18 14" />
      <path d="M-50 650 Q 200 470 560 520 Q 760 550 820 640 Q 960 500 1250 520 Q 1500 540 1660 640 L1660 1000 L-50 1000Z" fill="url(#bg0-v2)" />
      <path d="M-50 650 Q 200 470 560 520 Q 760 550 820 640 Q 960 500 1250 520 Q 1500 540 1660 640" fill="none" stroke="#e08aab" strokeOpacity=".45" strokeWidth="6" strokeDasharray="22 16" />
      <g fill="#3a1229">
        <circle cx="330" cy="610" r="13" />
        <circle cx="1180" cy="600" r="13" />
      </g>
      <g fill="none" stroke="#3a1229" strokeOpacity=".6" strokeWidth="4">
        <path d="M330 610 q -60 -20 -110 10" />
        <path d="M330 610 q 60 -25 120 0" />
        <path d="M1180 600 q -60 -20 -110 10" />
        <path d="M1180 600 q 60 -25 120 0" />
      </g>
      <path d="M-50 1000 L-50 760 Q 400 690 800 730 Q 1200 690 1660 760 L1660 1000Z" fill="url(#bg0-v3)" />
      <path d="M-50 760 Q 400 690 800 730 Q 1200 690 1660 760" fill="none" stroke="#ffc0d4" strokeOpacity=".5" strokeWidth="7" strokeDasharray="26 18" />
      <rect className="dtc-lampglow" width="1600" height="1000" fill="url(#bg0-lamp)" />
      <g opacity=".9">
        <rect x="90" y="830" width="120" height="30" rx="6" fill="#d8c6a8" transform="rotate(-12 150 845)" />
        <path d="M1440 860 q 30 -40 70 -10 q 20 18 -10 30 q -40 10 -60 -20z" fill="#e7d070" opacity=".8" />
      </g>
    </>
  );
}

function coil(x: number, y: number, h: number, w: number, c: string, k: string) {
  const n = Math.floor(h / 26);
  return (
    <g key={k}>
      {Array.from({ length: n }, (_, i) => (
        <ellipse key={i} cx={x} cy={y - i * 26} rx={w} ry={w * 0.28} fill="none" stroke={c} strokeWidth={w * 0.16} />
      ))}
    </g>
  );
}

function Springs() {
  return (
    <>
      <defs>
        <linearGradient id="bg1-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0e2426" />
          <stop offset="1" stopColor="#1d1410" />
        </linearGradient>
        <radialGradient id="bg1-glow" cx="30%" cy="10%" r="70%">
          <stop offset="0" stopColor="#4ad0c0" stopOpacity=".35" />
          <stop offset="1" stopColor="#0e2426" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bg1-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5a3420" />
          <stop offset="1" stopColor="#24130b" />
        </linearGradient>
      </defs>
      <rect width="1600" height="1000" fill="url(#bg1-sky)" />
      <rect width="1600" height="1000" fill="url(#bg1-glow)" />
      {/* far webbing straps */}
      <g stroke="#2a3a36" strokeWidth="40" opacity=".7">
        <path d="M-50 140 L1650 220" />
        <path d="M-50 300 L1650 240" />
      </g>
      {/* far coils */}
      <g opacity=".45">
        {[120, 380, 640, 900, 1160, 1420].map((x, i) => coil(x, 720, 520, 40, "#3d6b66", `f${i}`))}
      </g>
      <g opacity=".8">
        {[40, 300, 1280, 1540].map((x, i) => coil(x, 820, 600, 62, i % 2 ? "#a8521f" : "#c8742e", `m${i}`))}
      </g>
      <path d="M-50 1000 L-50 780 Q 800 700 1650 780 L1650 1000Z" fill="url(#bg1-floor)" />
      <path d="M-50 780 Q 800 700 1650 780" fill="none" stroke="#d9793a" strokeOpacity=".5" strokeWidth="6" strokeDasharray="20 16" />
      <g fill="#e8b84d" opacity=".7">
        <circle cx="260" cy="860" r="10" />
        <circle cx="1300" cy="880" r="7" />
        <rect x="1100" y="840" width="40" height="8" rx="3" transform="rotate(20 1120 844)" />
      </g>
    </>
  );
}

function Underfloor() {
  const stars = [
    [150, 140], [420, 90], [700, 170], [980, 80], [1250, 150], [1480, 100], [300, 300], [860, 260], [1380, 300],
  ];
  return (
    <>
      <defs>
        <linearGradient id="bg2-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#120c1c" />
          <stop offset="1" stopColor="#1e140e" />
        </linearGradient>
        <linearGradient id="bg2-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a3020" />
          <stop offset="1" stopColor="#1a0f08" />
        </linearGradient>
      </defs>
      <rect width="1600" height="1000" fill="url(#bg2-sky)" />
      {/* floorboards overhead */}
      <g stroke="#2a1c12" strokeWidth="6">
        {Array.from({ length: 9 }, (_, i) => (
          <path key={i} d={`M${i * 200 - 40} 0 L${i * 200 + 60} 420`} opacity=".7" />
        ))}
      </g>
      {stars.map(([x, y], i) => (
        <g key={i} className="dtc-twinkle" style={{ animationDelay: `${-i * 0.37}s`, animationDuration: "3s" }}>
          <path
            transform={`translate(${x} ${y}) scale(${1 + (i % 3) * 0.4})`}
            d="M0 -16 L5 -5 L16 -4 L7 4 L10 16 L0 9 L-10 16 L-7 4 L-16 -4 L-5 -5Z"
            fill="#d8ff6b"
          />
          <circle cx={x} cy={y} r={34 + (i % 3) * 10} fill="#d8ff6b" opacity=".08" />
        </g>
      ))}
      {/* ruined brick castle */}
      <g opacity=".55" transform="translate(1040 420)">
        <rect x="0" y="80" width="360" height="220" fill="#7a2a3a" />
        <rect x="-20" y="0" width="80" height="300" fill="#8a3242" />
        <rect x="300" y="30" width="80" height="270" fill="#8a3242" />
        {[0, 1, 2].map((i) => (
          <rect key={i} x={-20 + i * 30} y={-20} width="20" height="20" fill="#8a3242" />
        ))}
        <rect x="140" y="160" width="80" height="140" rx="40" fill="#1a0f08" />
      </g>
      <g opacity=".5" transform="translate(140 520)">
        <rect x="0" y="0" width="90" height="90" rx="8" fill="#2a5fc2" transform="rotate(-14)" />
        <text x="30" y="60" fontSize="54" fontWeight="900" fill="#e9e6ee" fontFamily="sans-serif" transform="rotate(-14)">
          A
        </text>
      </g>
      <path d="M-50 1000 L-50 760 L1650 760 L1650 1000Z" fill="url(#bg2-floor)" />
      <g stroke="#2a1a10" strokeWidth="4">
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} d={`M${i * 150} 760 L${i * 150 - 80} 1000`} />
        ))}
        <path d="M-50 840 H1650" />
      </g>
    </>
  );
}

function Drain() {
  return (
    <>
      <defs>
        <linearGradient id="bg3-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0c1a2a" />
          <stop offset="1" stopColor="#06101a" />
        </linearGradient>
        <linearGradient id="bg3-beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ff5d7a" stopOpacity="0" />
          <stop offset=".5" stopColor="#ff9fb0" stopOpacity=".28" />
          <stop offset="1" stopColor="#ff5d7a" stopOpacity="0" />
        </linearGradient>
        <pattern id="bg3-tile" width="120" height="120" patternUnits="userSpaceOnUse">
          <rect width="120" height="120" fill="#1a3048" />
          <rect x="4" y="4" width="112" height="112" rx="6" fill="#22405e" />
          <rect x="10" y="10" width="40" height="10" rx="5" fill="#ffffff" opacity=".05" />
        </pattern>
      </defs>
      <rect width="1600" height="1000" fill="url(#bg3-sky)" />
      <rect width="1600" height="700" fill="url(#bg3-tile)" opacity=".55" />
      {/* pipes */}
      <g opacity=".7">
        <rect x="60" y="0" width="56" height="760" fill="#3a4654" />
        <rect x="72" y="0" width="10" height="760" fill="#56606c" />
        <rect x="50" y="220" width="76" height="22" rx="6" fill="#56606c" />
        <rect x="1490" y="0" width="64" height="760" fill="#3a4654" />
        <rect x="1504" y="0" width="12" height="760" fill="#56606c" />
        <rect x="1480" y="320" width="84" height="22" rx="6" fill="#56606c" />
      </g>
      {/* drips */}
      {[260, 600, 980, 1350].map((x, i) => (
        <path key={i} className="dtc-drip" style={{ animationDelay: `${-i * 0.7}s` }} d={`M${x} 40 q-10 18 0 24 q10 -6 0 -24z`} fill="#9dd8f0" />
      ))}
      {/* vacuum searchlight */}
      <rect className="dtc-sweep" x="-400" y="0" width="500" height="1000" fill="url(#bg3-beam)" />
      <path d="M-50 1000 L-50 740 Q 800 700 1650 740 L1650 1000Z" fill="#0e1e2e" />
      <path d="M-50 740 Q 800 700 1650 740" fill="none" stroke="#6fb8e0" strokeOpacity=".4" strokeWidth="5" />
      <ellipse cx="800" cy="880" rx="140" ry="36" fill="#05080c" />
      <g stroke="#2a3a4a" strokeWidth="8">
        <path d="M700 880 h200 M720 866 h160 M720 894 h160" />
      </g>
      <ellipse cx="400" cy="820" rx="120" ry="16" fill="#6fb8e0" opacity=".18" />
    </>
  );
}

export function DrawerBg() {
  return (
    <svg className="dtc-bg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="dr-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5a3a24" />
          <stop offset="1" stopColor="#2e1c10" />
        </linearGradient>
        <radialGradient id="dr-light" cx="50%" cy="0%" r="80%">
          <stop offset="0" stopColor="#ffd98a" stopOpacity=".5" />
          <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1600" height="1000" fill="url(#dr-wood)" />
      <g stroke="#3a2414" strokeWidth="3" opacity=".6">
        {Array.from({ length: 14 }, (_, i) => (
          <path key={i} d={`M0 ${i * 76 + 20} q400 ${i % 2 ? 14 : -14} 800 0 t800 0`} fill="none" />
        ))}
      </g>
      <rect width="1600" height="1000" fill="url(#dr-light)" />
      {/* clutter */}
      <g opacity=".75">
        <rect x="80" y="760" width="260" height="40" rx="10" fill="#e8b84d" transform="rotate(-8 210 780)" />
        <circle cx="1420" cy="820" r="70" fill="none" stroke="#c6d0da" strokeWidth="14" />
        <rect x="1180" y="120" width="40" height="200" rx="10" fill="#d94b4b" transform="rotate(30 1200 220)" />
        <rect x="140" y="140" width="160" height="90" rx="10" fill="#f4f2f7" transform="rotate(-6 220 185)" />
        <path d="M160 170 h120 M160 190 h90" stroke="#9a94a6" strokeWidth="6" transform="rotate(-6 220 185)" />
        <circle cx="1500" cy="300" r="30" fill="#e08a4c" />
        <path d="M60 480 q60 -40 120 0 t120 0" stroke="#ff8cc6" strokeWidth="12" fill="none" />
      </g>
    </svg>
  );
}
