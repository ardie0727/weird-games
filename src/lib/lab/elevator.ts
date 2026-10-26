// Elevator of Doom: pure game logic. One lift, eight floors, a stream of chaotic
// passengers. Tap a floor to send the lift there. Stops where nobody gets on or
// off make everyone inside angrier; anyone who hits 100% rage costs a star.

export const FLOORS = 8;
export const CAPACITY = 4;
export const MAX_WAITING = 4;
export const START_STARS = 5;
const SPEED = 2.8; // floors per second
const DOOR_TIME = 0.75;

export type Kind = "normal" | "suit" | "granny" | "clown" | "rocker" | "toddler";

export const KIND: Record<Kind, { emoji: string; name: string; rage: number; points: number; desc: string }> = {
  normal: { emoji: "🙂", name: "Regular", rage: 1, points: 1, desc: "Just wants their floor." },
  suit: { emoji: "🧑‍💼", name: "Suit", rage: 1.7, points: 1.6, desc: "Late for a meeting. Angers fast, tips big." },
  granny: { emoji: "👵", name: "Granny", rage: 0.5, points: 1.2, desc: "Very patient, very slow through the doors." },
  clown: { emoji: "🤡", name: "Clown", rage: 1, points: 1.3, desc: "Changes their mind about the floor mid-ride." },
  rocker: { emoji: "🎸", name: "Rocker", rage: 0.8, points: 1.3, desc: "Plays loud. Everyone else in the lift angers twice as fast." },
  toddler: { emoji: "👶", name: "Toddler", rage: 0.9, points: 1.4, desc: "Presses random buttons, so the lift stops on its own." },
};

export interface Passenger {
  id: number;
  kind: Kind;
  from: number;
  to: number;
  anger: number;
  riding: boolean;
  /** seconds until a clown changes their mind or a toddler presses a button */
  trick: number;
  tricked: boolean;
}

export type Ev =
  | { t: "deliver"; floor: number; pts: number; emoji: string }
  | { t: "wrong"; floor: number }
  | { t: "rage"; floor: number; emoji: string; riding: boolean }
  | { t: "press"; floor: number }
  | { t: "mind"; to: number }
  | { t: "ding"; floor: number }
  | { t: "board" }
  | { t: "over" };

export interface Game {
  time: number;
  pos: number;
  target: number | null;
  doors: number; // seconds left with doors open, 0 when closed
  forced: Set<number>;
  people: Passenger[];
  stars: number;
  score: number;
  combo: number;
  delivered: number;
  spawnIn: number;
  nextId: number;
  events: Ev[];
  over: boolean;
}

export function newGame(): Game {
  return { time: 0, pos: 0, target: null, doors: 0, forced: new Set(), people: [], stars: START_STARS, score: 0, combo: 1, delivered: 0, spawnIn: 1, nextId: 1, events: [], over: false };
}

export function callTo(g: Game, floor: number) {
  if (g.over) return;
  if (g.doors > 0 && floor === carFloor(g) && g.target === null) return;
  g.target = floor;
}

export const carFloor = (g: Game) => Math.round(g.pos);
export const riders = (g: Game) => g.people.filter((p) => p.riding);
export const waitingAt = (g: Game, f: number) => g.people.filter((p) => !p.riding && p.from === f);

function pickKind(time: number, rnd: () => number): Kind {
  const pool: [Kind, number][] = [
    ["normal", 5],
    ["suit", time > 10 ? 2 : 0],
    ["granny", time > 20 ? 1.5 : 0],
    ["clown", time > 35 ? 1.5 : 0],
    ["rocker", time > 50 ? 1.2 : 0],
    ["toddler", time > 65 ? 1.2 : 0],
  ];
  let r = rnd() * pool.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of pool) if ((r -= w) < 0) return k;
  return "normal";
}

function spawn(g: Game, rnd: () => number) {
  const open = [...Array(FLOORS).keys()].filter((f) => waitingAt(g, f).length < MAX_WAITING);
  if (!open.length) return;
  // ground floor is busier
  const from = rnd() < 0.3 && open.includes(0) ? 0 : open[Math.floor(rnd() * open.length)];
  let to = Math.floor(rnd() * (FLOORS - 1));
  if (to >= from) to++;
  const kind = pickKind(g.time, rnd);
  g.people.push({ id: g.nextId++, kind, from, to, anger: 0, riding: false, trick: 2 + rnd() * 3, tricked: false });
}

function openDoors(g: Game, floor: number) {
  g.pos = floor;
  g.forced.delete(floor);
  if (g.target === floor) g.target = null;
  let useful = false;
  let slow = false;
  for (const p of riders(g).filter((p) => p.to === floor)) {
    const k = KIND[p.kind];
    const pts = Math.round(50 * k.points * (1 + (100 - p.anger) / 100) * g.combo);
    g.score += pts;
    g.delivered++;
    g.events.push({ t: "deliver", floor, pts, emoji: k.emoji });
    g.people = g.people.filter((q) => q !== p);
    useful = true;
    if (p.kind === "granny") slow = true;
  }
  let room = CAPACITY - riders(g).length;
  for (const p of waitingAt(g, floor)) {
    if (room <= 0) break;
    p.riding = true;
    room--;
    useful = true;
    if (p.kind === "granny") slow = true;
    g.events.push({ t: "board" });
  }
  g.doors = DOOR_TIME + (slow ? 0.9 : 0);
  if (useful) {
    g.combo = Math.min(5, g.combo + 1);
    g.events.push({ t: "ding", floor });
  } else {
    g.combo = 1;
    for (const p of riders(g)) p.anger = Math.min(100, p.anger + 20);
    g.events.push({ t: "wrong", floor });
  }
}

export function step(g: Game, dt: number, rnd = Math.random) {
  if (g.over) return;
  g.time += dt;

  // spawns speed up from one every ~3.4s to one every ~1.2s
  g.spawnIn -= dt;
  if (g.spawnIn <= 0) {
    spawn(g, rnd);
    g.spawnIn = Math.max(1.2, 3.4 - g.time / 60) * (0.7 + rnd() * 0.6);
  }

  // anger
  const rocker = riders(g).some((p) => p.kind === "rocker");
  const ramp = 1 + g.time / 240;
  for (const p of [...g.people]) {
    const base = p.riding ? 3.2 : 4.2;
    const loud = p.riding && rocker && p.kind !== "rocker" ? 2 : 1;
    p.anger += base * KIND[p.kind].rage * loud * ramp * dt;
    if (p.anger >= 100) {
      g.people = g.people.filter((q) => q !== p);
      g.stars--;
      g.combo = 1;
      g.events.push({ t: "rage", floor: p.riding ? carFloor(g) : p.from, emoji: KIND[p.kind].emoji, riding: p.riding });
    }
    // tricks
    if (p.riding && !p.tricked && (p.kind === "clown" || p.kind === "toddler")) {
      p.trick -= dt;
      if (p.trick <= 0) {
        if (p.kind === "clown") {
          p.tricked = true;
          let to = Math.floor(rnd() * (FLOORS - 1));
          if (to >= p.to) to++;
          p.to = to;
          g.events.push({ t: "mind", to });
        } else {
          p.trick = 3.5 + rnd() * 3;
          const f = Math.floor(rnd() * FLOORS);
          if (f !== carFloor(g)) {
            g.forced.add(f);
            g.events.push({ t: "press", floor: f });
          }
        }
      }
    }
  }
  if (g.stars <= 0) {
    g.stars = 0;
    g.over = true;
    g.events.push({ t: "over" });
    return;
  }

  // doors
  if (g.doors > 0) {
    g.doors -= dt;
    if (g.doors > 0) return;
    g.doors = 0;
  }

  // movement
  const here = g.pos;
  const dest = g.target ?? nearestForced(g);
  if (dest === null) return;
  if (Math.abs(dest - here) < 1e-6) {
    openDoors(g, dest);
    return;
  }
  const dir = Math.sign(dest - here);
  let next = here + dir * SPEED * dt;
  if ((dir > 0 && next >= dest) || (dir < 0 && next <= dest)) next = dest;
  // a toddler's button stops us at any floor we pass
  const a = Math.min(here, next), b = Math.max(here, next);
  for (let f = Math.ceil(a); f <= Math.floor(b); f++) {
    if (Math.abs(f - here) < 1e-6) continue;
    if (g.forced.has(f) && f !== dest) {
      openDoors(g, f);
      return;
    }
  }
  g.pos = next;
  if (next === dest) openDoors(g, dest);
}

function nearestForced(g: Game): number | null {
  let best: number | null = null;
  for (const f of g.forced) if (best === null || Math.abs(f - g.pos) < Math.abs(best - g.pos)) best = f;
  return best;
}

export const floorLabel = (f: number) => (f === 0 ? "G" : String(f));
