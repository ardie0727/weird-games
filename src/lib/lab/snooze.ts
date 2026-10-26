// Snooze Button: pure game logic. A runaway alarm clock rolls around the
// bedroom. Tap it enough times to hit snooze before the boss calls. Each
// morning it gets faster, starts hiding under furniture and brings decoys.

export const W = 360;
export const H = 520;
export const WALL = 18;
export const CLOCK_R = 17;
const HIT_R = 34;
export const BOSS_TIME = 20;
export const EXCUSES = 3;

export interface Spot {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hide: boolean;
}

export const FURNITURE: Spot[] = [
  { name: "bed", x: 30, y: 34, w: 130, h: 180, hide: true },
  { name: "wardrobe", x: 250, y: 30, w: 92, h: 70, hide: true },
  { name: "rug", x: 120, y: 260, w: 130, h: 90, hide: false },
  { name: "desk", x: 270, y: 210, w: 72, h: 110, hide: true },
  { name: "laundry", x: 30, y: 400, w: 84, h: 70, hide: true },
  { name: "plant", x: 286, y: 440, w: 52, h: 52, hide: true },
];

export interface Clock {
  x: number;
  y: number;
  vx: number;
  vy: number;
  real: boolean;
  turnIn: number;
  boost: number;
  hidden: Spot | null;
  hideFor: number;
  hideIn: number;
  hop: number; // seconds left of a startled hop (drawn bigger)
  gone: boolean;
}

export type Ev =
  | { t: "hit"; x: number; y: number; left: number }
  | { t: "snooze"; x: number; y: number; pts: number }
  | { t: "miss"; x: number; y: number }
  | { t: "fake"; x: number; y: number }
  | { t: "flush"; x: number; y: number }
  | { t: "hide" }
  | { t: "boss" }
  | { t: "over" };

export interface Game {
  day: number;
  clocks: Clock[];
  hitsLeft: number;
  boss: number;
  excuses: number;
  score: number;
  groggy: number;
  phase: "intro" | "chase" | "won" | "called";
  phaseT: number;
  events: Ev[];
  over: boolean;
  slept: number;
}

export function dayRules(day: number) {
  return {
    speed: Math.min(230, 75 + day * 14),
    hits: day <= 2 ? 1 : day <= 5 ? 2 : 3,
    decoys: day >= 9 ? 2 : day >= 4 ? 1 : 0,
    hides: day >= 3,
  };
}

function rand(a: number, b: number, rnd: () => number) {
  return a + (b - a) * rnd();
}

function newClock(real: boolean, rnd: () => number, speed: number): Clock {
  const a = rnd() * Math.PI * 2;
  return {
    x: rand(60, W - 60, rnd),
    y: rand(120, H - 80, rnd),
    vx: Math.cos(a) * speed,
    vy: Math.sin(a) * speed,
    real,
    turnIn: rand(0.5, 1.4, rnd),
    boost: 0,
    hidden: null,
    hideFor: 0,
    hideIn: rand(2.5, 5, rnd),
    hop: 0,
    gone: false,
  };
}

export function startDay(g: Game, rnd = Math.random) {
  const r = dayRules(g.day);
  g.clocks = [newClock(true, rnd, r.speed), ...Array.from({ length: r.decoys }, () => newClock(false, rnd, r.speed))];
  g.hitsLeft = r.hits;
  g.boss = BOSS_TIME;
  g.phase = "intro";
  g.phaseT = 1.3;
}

export function newGame(rnd = Math.random): Game {
  const g: Game = { day: 1, clocks: [], hitsLeft: 1, boss: BOSS_TIME, excuses: EXCUSES, score: 0, groggy: 0, phase: "intro", phaseT: 0, events: [], over: false, slept: 0 };
  startDay(g, rnd);
  return g;
}

function flee(c: Clock, fx: number, fy: number, speed: number) {
  const dx = c.x - fx, dy = c.y - fy;
  const d = Math.hypot(dx, dy) || 1;
  c.vx = (dx / d) * speed;
  c.vy = (dy / d) * speed;
  c.boost = 0.9;
  c.hop = 0.3;
}

function centre(s: Spot): [number, number] {
  return [s.x + s.w / 2, s.y + s.h / 2];
}

export function tap(g: Game, x: number, y: number, rnd = Math.random) {
  if (g.over || g.phase !== "chase" || g.groggy > 0) return;
  const speed = dayRules(g.day).speed;
  // nearest visible clock within reach
  let hit: Clock | null = null, bestD = Infinity;
  for (const c of g.clocks) {
    if (c.gone || c.hidden) continue;
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < HIT_R && d < bestD) (hit = c), (bestD = d);
  }
  if (hit) {
    if (!hit.real) {
      hit.gone = true;
      g.boss = Math.max(0.5, g.boss - 3);
      g.events.push({ t: "fake", x: hit.x, y: hit.y });
      return;
    }
    g.hitsLeft--;
    if (g.hitsLeft <= 0) {
      const pts = 100 * g.day + Math.ceil(g.boss) * 10;
      g.score += pts;
      g.slept += 5;
      g.phase = "won";
      g.phaseT = 1.6;
      g.events.push({ t: "snooze", x: hit.x, y: hit.y, pts });
      return;
    }
    // it bounces away to somewhere else in the room
    g.events.push({ t: "hit", x: hit.x, y: hit.y, left: g.hitsLeft });
    hit.x = rand(50, W - 50, rnd);
    hit.y = rand(90, H - 60, rnd);
    flee(hit, x, y, speed * 1.4);
    return;
  }
  // hiding spot?
  for (const c of g.clocks) {
    if (!c.hidden) continue;
    const s = c.hidden;
    if (x > s.x - 8 && x < s.x + s.w + 8 && y > s.y - 8 && y < s.y + s.h + 8) {
      c.hidden = null;
      c.hideIn = rand(3, 5.5, rnd);
      flee(c, x, y, speed * 1.3);
      g.events.push({ t: "flush", x: c.x, y: c.y });
      return;
    }
  }
  // a near miss scares nearby clocks off
  for (const c of g.clocks) if (!c.gone && !c.hidden && Math.hypot(c.x - x, c.y - y) < 90) flee(c, x, y, speed * 1.5);
  g.groggy = 0.35;
  g.events.push({ t: "miss", x, y });
}

export function step(g: Game, dt: number, rnd = Math.random) {
  if (g.over) return;
  g.groggy = Math.max(0, g.groggy - dt);
  if (g.phase !== "chase") {
    g.phaseT -= dt;
    if (g.phaseT > 0) return;
    if (g.phase === "intro") g.phase = "chase";
    else if (g.phase === "won") {
      g.day++;
      startDay(g, rnd);
    } else if (g.phase === "called") {
      if (g.excuses <= 0) {
        g.over = true;
        g.events.push({ t: "over" });
      } else startDay(g, rnd);
    }
    return;
  }

  g.boss -= dt;
  if (g.boss <= 0) {
    g.boss = 0;
    g.excuses--;
    g.phase = "called";
    g.phaseT = 2;
    g.events.push({ t: "boss" });
    return;
  }

  const r = dayRules(g.day);
  for (const c of g.clocks) {
    if (c.gone) continue;
    c.hop = Math.max(0, c.hop - dt);
    if (c.hidden) {
      c.hideFor -= dt;
      if (c.hideFor <= 0) {
        c.hidden = null;
        c.hideIn = rand(3, 6, rnd);
      }
      continue;
    }
    if (r.hides) {
      c.hideIn -= dt;
      if (c.hideIn <= 0) {
        const spots = FURNITURE.filter((s) => s.hide && !g.clocks.some((o) => o.hidden === s));
        const s = spots[Math.floor(rnd() * spots.length)];
        if (s) {
          [c.x, c.y] = centre(s);
          c.hidden = s;
          c.hideFor = rand(2.2, 3.6, rnd);
          if (c.real) g.events.push({ t: "hide" });
          continue;
        }
      }
    }
    c.turnIn -= dt;
    c.boost = Math.max(0, c.boost - dt);
    if (c.turnIn <= 0) {
      const a = Math.atan2(c.vy, c.vx) + rand(-1.6, 1.6, rnd);
      const sp = r.speed * rand(0.7, 1.15, rnd);
      c.vx = Math.cos(a) * sp;
      c.vy = Math.sin(a) * sp;
      c.turnIn = rand(0.4, 1.3, rnd);
    }
    const k = c.boost > 0 ? 1.6 : 1;
    c.x += c.vx * k * dt;
    c.y += c.vy * k * dt;
    const lo = WALL + CLOCK_R, hiX = W - WALL - CLOCK_R, hiY = H - WALL - CLOCK_R;
    if (c.x < lo) (c.x = lo), (c.vx = Math.abs(c.vx));
    if (c.x > hiX) (c.x = hiX), (c.vx = -Math.abs(c.vx));
    if (c.y < lo) (c.y = lo), (c.vy = Math.abs(c.vy));
    if (c.y > hiY) (c.y = hiY), (c.vy = -Math.abs(c.vy));
  }
}
