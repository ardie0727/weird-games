// Conga Crawl: the game engine. A real-time roguelike on a grid, stepped at a fixed tick.
//
// You lead a wedding conga line down the cursed basement floors of a banquet hall. Guests
// you bump into join the back of your line and fight for you on their own. The line moves
// on its own like a snake; you only steer the leader. Hits knock the last dancer off the
// line (they wander for a few seconds, so you can grab them back). Running into your own
// line snaps it there. When nobody is left behind you, hits cost the leader's Dignity.
//
// Everything here is plain data and functions, deterministic from the seed, so the bot
// playthrough script (scripts/conga-sim.ts) can run whole games without a browser.

import { Rng } from "../rng.ts";

export const TICK = 0.05; // seconds per engine tick (20 per second)
export const COLS = 15;
export const ROWS = 19;
export const EXIT = { x: 7, y: 0 };
export const ENTRY = { x: 7, y: ROWS - 1 };
export const FLOORS = 9;
export const MAX_LINE = 12;

export type Dir = 0 | 1 | 2 | 3; // up, right, down, left
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;
const opp = (d: Dir) => ((d + 2) % 4) as Dir;

export interface P {
  x: number;
  y: number;
}

// ---------- guests (your line) ----------

export type GuestKind = "aunty" | "uncle" | "dj" | "photo" | "baby" | "chef";
export const GUESTS: Record<GuestKind, { name: string; does: string; cd: number }> = {
  aunty: { name: "Ladoo Aunty", does: "Lobs ladoos at the nearest pooper.", cd: 22 },
  uncle: { name: "Dancing Uncle", does: "Dad-dance kicks anything next to him.", cd: 12 },
  dj: { name: "DJ Cousin", does: "Bass drop hurts everything close by.", cd: 40 },
  photo: { name: "Photographer", does: "Camera flash freezes poopers in place.", cd: 56 },
  baby: { name: "The Baby", does: "Does nothing. Kills score double while the baby dances.", cd: 70 },
  chef: { name: "Biryani Chef", does: "Drops scalding pots that burn poopers.", cd: 50 },
};
export const GUEST_KINDS = Object.keys(GUESTS) as GuestKind[];

export interface Member {
  kind: GuestKind;
  cd: number;
}

export interface LooseGuest extends P {
  kind: GuestKind;
  /** ticks left before a dropped dancer wanders off; -1 waits forever */
  t: number;
}

// ---------- leaders ----------

export type LeaderId = "dada" | "bride" | "horse";
export const LEADERS: Record<LeaderId, { name: string; blurb: string; dignity: number; start: GuestKind[]; every: number; unlock: string; softWalls?: boolean }> = {
  dada: { name: "Disco Dada", blurb: "Woke up under a buffet table. Brought an uncle and an aunty.", dignity: 3, start: ["uncle", "aunty"], every: 3, unlock: "" },
  bride: { name: "The Bride", blurb: "Everyone follows the bride. Starts with three guests, but only 2 Dignity.", dignity: 2, start: ["aunty", "dj", "photo"], every: 3, unlock: "Reach floor 4" },
  horse: { name: "The Wedding Horse", blurb: "Fast, sturdy, and walls do not bother it. 4 Dignity, starts alone.", dignity: 4, start: [], every: 2, unlock: "Beat the Chef of Doom", softWalls: true },
};
export const LEADER_ORDER: LeaderId[] = ["dada", "bride", "horse"];

// ---------- enemies ----------

export type EnemyKind = "mozzie" | "neighbour" | "caterer" | "rival" | "mami" | "chefboss" | "djboss";
export const ENEMIES: Record<EnemyKind, { name: string; hp: number; every: number; pts: number; size: number; boss?: boolean }> = {
  mozzie: { name: "Mosquito", hp: 1, every: 3, pts: 10, size: 1 },
  neighbour: { name: "Grumpy Neighbour", hp: 3, every: 5, pts: 25, size: 1 },
  caterer: { name: "Angry Caterer", hp: 2, every: 7, pts: 30, size: 1 },
  rival: { name: "Rival Conga", hp: 5, every: 4, pts: 60, size: 1 },
  mami: { name: "MAMI-JI", hp: 45, every: 9, pts: 1000, size: 2, boss: true },
  chefboss: { name: "CHEF OF DOOM", hp: 70, every: 8, pts: 1500, size: 2, boss: true },
  djboss: { name: "DJ ETERNAL REMIX", hp: 110, every: 999, pts: 3000, size: 2, boss: true },
};
export const BOSS_FLOOR: Record<number, EnemyKind> = { 3: "mami", 6: "chefboss", 9: "djboss" };

export interface Enemy extends P {
  id: number;
  kind: EnemyKind;
  hp: number;
  max: number;
  clock: number;
  every: number;
  px: number; // where it was before its last step, for smooth drawing
  py: number;
  stun: number;
  flee: number;
  cd: number;
  cd2: number;
  /** rival conga body, oldest last */
  tail: P[];
  ptail: P[];
  hurt: number; // ticks of hit flash
  dir: Dir;
}

// ---------- perks ----------

export type PerkId =
  | "ladoo"
  | "kick"
  | "bass"
  | "flash"
  | "plusone"
  | "grip"
  | "soft"
  | "slow"
  | "chappal"
  | "buffet"
  | "babyboom"
  | "pots"
  | "magnet"
  | "samosa";
export const PERKS: Record<PerkId, { name: string; desc: string; max: number; kind?: GuestKind }> = {
  ladoo: { name: "Extra Ghee", desc: "Aunties throw faster and ladoos hit harder.", max: 3, kind: "aunty" },
  kick: { name: "Dad Moves", desc: "Uncles kick harder and more often.", max: 3, kind: "uncle" },
  bass: { name: "Bass Boost", desc: "DJ drops reach further and hit harder.", max: 3, kind: "dj" },
  flash: { name: "Group Photo", desc: "Flashes freeze longer and sting a little.", max: 2, kind: "photo" },
  babyboom: { name: "Baby Boom", desc: "Kills with a baby in line score triple, not double.", max: 1, kind: "baby" },
  pots: { name: "Extra Spicy", desc: "Chef pots last longer and burn harder.", max: 2, kind: "chef" },
  plusone: { name: "Plus One", desc: "Every guest you pick up may bring a plus-one.", max: 2 },
  grip: { name: "Tight Grip", desc: "The first hit on each floor is shrugged off.", max: 1 },
  soft: { name: "Padded Walls", desc: "Bumping into walls and tables no longer knocks dancers off.", max: 1 },
  slow: { name: "Slow Song", desc: "The music slows down. Easier to steer.", max: 1 },
  chappal: { name: "Flying Chappal", desc: "The leader throws a slipper ahead now and then.", max: 2 },
  buffet: { name: "Second Helping", desc: "+1 max Dignity, and refill it.", max: 3 },
  magnet: { name: "Good Vibes", desc: "Dropped dancers wait twice as long to be picked up.", max: 1 },
  samosa: { name: "Samosa Rain", desc: "Poopers sometimes drop samosas (+50 points).", max: 2 },
};
export const PERK_IDS = Object.keys(PERKS) as PerkId[];

// ---------- the run ----------

export type Phase = "ready" | "play" | "perk" | "dead" | "won";

export interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ally: boolean;
  dmg: number;
  kind: "ladoo" | "plate" | "slipper" | "chappal" | "note";
  life: number;
}

export interface Hazard extends P {
  t: number; // warning ticks left
  kind: "cleaver" | "drop";
}

export interface Pot extends P {
  t: number;
}

export interface Pickup extends P {
  kind: "samosa" | "disco" | "heart";
}

export interface Spawn extends P {
  t: number;
  kind: EnemyKind;
}

export type Fx =
  | { k: "kick"; x: number; y: number }
  | { k: "ring"; x: number; y: number; r: number; color: "bass" | "flash" | "cry" }
  | { k: "pop"; x: number; y: number; text: string; tone: "good" | "bad" | "gold" }
  | { k: "boom"; x: number; y: number }
  | { k: "snd"; name: SoundName };

export type SoundName = "recruit" | "hit" | "kill" | "bonk" | "snap" | "open" | "floor" | "boss" | "dead" | "won" | "pickup" | "throw" | "bass" | "flash" | "warn" | "slam";

export interface Run {
  seed: number;
  rng: Rng;
  leader: LeaderId;
  floor: number;
  tick: number;
  phase: Phase;
  readyT: number;
  score: number;
  kills: number;
  dignity: number;
  maxDignity: number;
  // the line: body[0] is the leader; members[i] stands at body[i + 1]
  body: P[];
  prev: P[];
  members: Member[];
  dir: Dir;
  queue: Dir[];
  every: number;
  clock: number;
  stun: number;
  invuln: number;
  gripUsed: boolean;
  chappalCd: number;
  discoT: number;
  // the room
  walls: Uint8Array;
  cakes: P[];
  exitOpen: boolean;
  guests: LooseGuest[];
  enemies: Enemy[];
  spawns: Spawn[];
  toSpawn: EnemyKind[];
  spawnClock: number;
  shots: Shot[];
  hazards: Hazard[];
  pots: Pot[];
  pickups: Pickup[];
  perks: Partial<Record<PerkId, number>>;
  offer: PerkId[];
  nextId: number;
  fx: Fx[];
  beat: number; // counts leader steps, drives the dance floor lights
  bossName: string;
  bestLine: number;
  hits: number;
}

const idx = (x: number, y: number) => y * COLS + x;
const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < COLS && y < ROWS;

export function isWall(r: Run, x: number, y: number) {
  if (!inside(x, y)) return true;
  if (x === EXIT.x && y === EXIT.y) return !r.exitOpen;
  return r.walls[idx(x, y)] === 1;
}

export const lv = (r: Run, p: PerkId) => r.perks[p] ?? 0;

// ---------- setup ----------

export function newRun(seed: number, leader: LeaderId = "dada"): Run {
  const L = LEADERS[leader];
  const r: Run = {
    seed,
    rng: new Rng(seed),
    leader,
    floor: 1,
    tick: 0,
    phase: "ready",
    readyT: 30,
    score: 0,
    kills: 0,
    dignity: L.dignity,
    maxDignity: L.dignity,
    body: [],
    prev: [],
    members: L.start.map((kind) => ({ kind, cd: 10 })),
    dir: 0,
    queue: [],
    every: L.every,
    clock: 0,
    stun: 0,
    invuln: 0,
    gripUsed: false,
    chappalCd: 0,
    discoT: 0,
    walls: new Uint8Array(COLS * ROWS),
    cakes: [],
    exitOpen: false,
    guests: [],
    enemies: [],
    spawns: [],
    toSpawn: [],
    spawnClock: 0,
    shots: [],
    hazards: [],
    pots: [],
    pickups: [],
    perks: {},
    offer: [],
    nextId: 1,
    fx: [],
    beat: 0,
    bossName: "",
    bestLine: L.start.length,
    hits: 0,
  };
  buildFloor(r);
  return r;
}

function freeCells(r: Run, avoid: (x: number, y: number) => boolean = () => false): P[] {
  const out: P[] = [];
  for (let y = 1; y < ROWS - 1; y++)
    for (let x = 1; x < COLS - 1; x++) {
      if (r.walls[idx(x, y)]) continue;
      if (avoid(x, y)) continue;
      out.push({ x, y });
    }
  return out;
}

function connected(walls: Uint8Array): boolean {
  const seen = new Uint8Array(COLS * ROWS);
  const st: number[] = [idx(ENTRY.x, ROWS - 2)];
  seen[st[0]] = 1;
  let n = 0;
  while (st.length) {
    const c = st.pop()!;
    n++;
    const x = c % COLS, y = (c / COLS) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 1 || ny < 1 || nx >= COLS - 1 || ny >= ROWS - 1) continue;
      const k = idx(nx, ny);
      if (walls[k] || seen[k]) continue;
      seen[k] = 1;
      st.push(k);
    }
  }
  let total = 0;
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) if (!walls[idx(x, y)]) total++;
  return n === total;
}

const SHAPES: [number, number][] = [
  [2, 1],
  [1, 2],
  [2, 2],
  [3, 1],
  [1, 3],
  [1, 1],
];

export function buildFloor(r: Run) {
  const rng = r.rng;
  const boss = BOSS_FLOOR[r.floor];
  // the room: border walls, door gaps at the top and bottom, and banquet tables
  for (let tries = 0; tries < 60; tries++) {
    const w = new Uint8Array(COLS * ROWS);
    for (let x = 0; x < COLS; x++) {
      w[idx(x, 0)] = 1;
      w[idx(x, ROWS - 1)] = 1;
    }
    for (let y = 0; y < ROWS; y++) {
      w[idx(0, y)] = 1;
      w[idx(COLS - 1, y)] = 1;
    }
    w[idx(ENTRY.x, ENTRY.y)] = 0;
    const cakes: P[] = [];
    const n = boss ? rng.int(2, 3) : rng.int(4, 7);
    for (let i = 0; i < n; i++) {
      const [sw, sh] = rng.pick(SHAPES);
      const x = rng.int(2, COLS - 2 - sw);
      const y = rng.int(boss ? 6 : 3, ROWS - 5 - sh);
      // keep the entry lane and exit lane clear, and leave a gap round every table
      let ok = true;
      for (let yy = y - 1; yy <= y + sh && ok; yy++)
        for (let xx = x - 1; xx <= x + sw && ok; xx++) if (w[idx(xx, yy)] && xx > 0 && xx < COLS - 1 && yy > 0 && yy < ROWS - 1) ok = false;
      if (!ok) continue;
      if (x <= 7 && x + sw > 7 && (y > ROWS - 7 || y < 4)) continue;
      for (let yy = y; yy < y + sh; yy++) for (let xx = x; xx < x + sw; xx++) w[idx(xx, yy)] = 1;
      if (sw * sh === 1) cakes.push({ x, y });
    }
    if (!connected(w)) continue;
    r.walls = w;
    r.cakes = cakes;
    break;
  }
  r.exitOpen = false;
  // the line comes in through the bottom door, folded up on one cell
  const n = r.members.length;
  r.body = [{ ...ENTRY }];
  for (let i = 0; i < n; i++) r.body.push({ ...ENTRY });
  r.prev = r.body.map((p) => ({ ...p }));
  r.dir = 0;
  r.queue = [];
  r.clock = 0;
  r.stun = 0;
  r.invuln = 40;
  r.gripUsed = false;
  r.enemies = [];
  r.spawns = [];
  r.shots = [];
  r.hazards = [];
  r.pots = [];
  r.pickups = [];
  r.guests = [];
  r.phase = "ready";
  r.readyT = 30;
  r.bossName = "";
  const nearEntry = (x: number, y: number) => Math.abs(x - ENTRY.x) + Math.abs(y - ENTRY.y) < 6;
  // guests waiting to join
  const nGuests = boss ? 2 : 1 + (r.floor % 2) + (r.floor === 1 ? 1 : 0);
  const spots = rng.shuffle(freeCells(r, (x, y) => nearEntry(x, y) || y < 2));
  for (let i = 0; i < nGuests && i < spots.length; i++) r.guests.push({ ...spots[i], kind: guestRoll(r), t: -1 });
  // a box of mithai to win back Dignity on even floors
  if (r.floor % 3 === 2 && spots.length > nGuests) r.pickups.push({ ...spots[nGuests], kind: "heart" });
  if (spots.length > nGuests + 1 && rng.chance(0.6)) r.pickups.push({ ...spots[nGuests + 1], kind: "disco" });
  // who is coming to ruin the party
  r.toSpawn = [];
  const f = r.floor;
  if (boss) {
    const b = spawnEnemy(r, boss, 6, 2);
    r.bossName = ENEMIES[boss].name;
    void b;
    const adds: EnemyKind[] = boss === "mami" ? ["mozzie", "mozzie", "neighbour"] : boss === "chefboss" ? ["caterer", "neighbour", "mozzie", "mozzie"] : ["rival", "caterer", "neighbour", "mozzie", "mozzie"];
    r.toSpawn = adds;
  } else {
    const total = Math.round(6 + f * 2.2);
    const pool: EnemyKind[] = ["mozzie", "mozzie", "neighbour"];
    if (f >= 2) pool.push("caterer", "neighbour");
    if (f >= 4) pool.push("rival", "caterer");
    if (f >= 7) pool.push("rival", "neighbour");
    for (let i = 0; i < total; i++) r.toSpawn.push(rng.pick(pool));
    // a couple are already waiting when you walk in
    const far = rng.shuffle(freeCells(r, (x, y) => y > ROWS - 9));
    for (let i = 0; i < 2 && far.length > i; i++) {
      const kind = r.toSpawn.shift()!;
      spawnEnemy(r, kind, far[i].x, far[i].y);
    }
  }
  r.spawnClock = 40;
}

function guestRoll(r: Run): GuestKind {
  // babies and chefs are a little rarer
  const w: [GuestKind, number][] = [
    ["aunty", 5],
    ["uncle", 5],
    ["dj", 3],
    ["photo", 3],
    ["baby", 1.5],
    ["chef", 2.5],
  ];
  let t = r.rng.next() * w.reduce((a, b) => a + b[1], 0);
  for (const [k, n] of w) {
    t -= n;
    if (t < 0) return k;
  }
  return "aunty";
}

function spawnEnemy(r: Run, kind: EnemyKind, x: number, y: number): Enemy {
  const def = ENEMIES[kind];
  const bonus = def.boss ? 0 : Math.floor((r.floor - 1) / 2);
  const e: Enemy = {
    id: r.nextId++,
    kind,
    hp: def.hp + bonus,
    max: def.hp + bonus,
    clock: r.rng.int(0, def.every - 1),
    every: Math.max(2, def.every - (r.floor >= 7 && !def.boss ? 1 : 0)),
    px: x,
    py: y,
    x,
    y,
    stun: 0,
    flee: 0,
    cd: 30 + r.rng.int(0, 30),
    cd2: 120,
    tail: [],
    ptail: [],
    hurt: 0,
    dir: 2,
  };
  if (kind === "rival") {
    const len = 2 + Math.min(3, Math.floor(r.floor / 3));
    for (let i = 0; i < len; i++) e.tail.push({ x, y });
    e.ptail = e.tail.map((p) => ({ ...p }));
  }
  r.enemies.push(e);
  return e;
}

// ---------- input ----------

/** Queue a turn for the leader. Ignores repeats and U-turns into your own line. */
export function steer(r: Run, d: Dir) {
  const last = r.queue.length ? r.queue[r.queue.length - 1] : r.dir;
  if (d === last) return;
  if (r.members.length > 0 && d === opp(last)) return;
  if (r.queue.length >= 3) r.queue.shift();
  r.queue.push(d);
  if (r.phase === "ready") r.readyT = Math.min(r.readyT, 0);
}

// ---------- helpers ----------

function cellsOf(e: Enemy): P[] {
  const s = ENEMIES[e.kind].size;
  if (s === 1) return [{ x: e.x, y: e.y }];
  const out: P[] = [];
  for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) out.push({ x: e.x + dx, y: e.y + dy });
  return out;
}

export function enemyAt(r: Run, x: number, y: number): Enemy | null {
  for (const e of r.enemies) {
    const s = ENEMIES[e.kind].size;
    if (x >= e.x && x < e.x + s && y >= e.y && y < e.y + s) return e;
  }
  return null;
}

function rivalBodyAt(r: Run, x: number, y: number): Enemy | null {
  for (const e of r.enemies) if (e.tail.some((p) => p.x === x && p.y === y)) return e;
  return null;
}

function lineIndexAt(r: Run, x: number, y: number): number {
  for (let i = 0; i < r.body.length; i++) if (r.body[i].x === x && r.body[i].y === y) return i;
  return -1;
}

function centre(e: Enemy) {
  const s = ENEMIES[e.kind].size;
  return { x: e.x + (s - 1) / 2, y: e.y + (s - 1) / 2 };
}

function babyMult(r: Run) {
  if (!r.members.some((m) => m.kind === "baby")) return 1;
  return lv(r, "babyboom") ? 3 : 2;
}

function addScore(r: Run, n: number, x: number, y: number, tone: "good" | "gold" = "good") {
  r.score += n;
  r.fx.push({ k: "pop", x, y, text: `+${n}`, tone });
}

export function damage(r: Run, e: Enemy, n: number) {
  if (e.hp <= 0 || n <= 0) return;
  e.hp -= n;
  e.hurt = 4;
  if (e.hp > 0) return;
  const def = ENEMIES[e.kind];
  const c = centre(e);
  r.kills++;
  addScore(r, def.pts * babyMult(r), c.x, c.y, def.boss ? "gold" : "good");
  r.fx.push({ k: "boom", x: c.x, y: c.y });
  r.fx.push({ k: "snd", name: def.boss ? "won" : "kill" });
  r.enemies = r.enemies.filter((o) => o !== e);
  if (def.boss) {
    // the boss's helpers give up and go home
    for (const o of r.enemies) r.fx.push({ k: "boom", x: o.x, y: o.y });
    r.enemies = [];
    r.toSpawn = [];
    r.spawns = [];
    r.hazards = [];
    r.shots = r.shots.filter((s) => s.ally);
  } else {
    const ex = Math.round(c.x), ey = Math.round(c.y);
    const free = !isWall(r, ex, ey) && !r.pickups.some((p) => p.x === ex && p.y === ey);
    if (free && lv(r, "samosa") && r.rng.chance(0.12 * lv(r, "samosa"))) r.pickups.push({ x: ex, y: ey, kind: "samosa" });
    else if (free && r.rng.chance(0.05)) r.pickups.push({ x: ex, y: ey, kind: "samosa" });
  }
}

function dropLooseGuest(r: Run, kind: GuestKind, at: P, knock = 0) {
  const t = lv(r, "magnet") ? 140 : 70;
  let p = at;
  if (knock > 0) {
    // knocked clean off the line: they stumble a couple of cells away
    const near = freeCells(r, (x, y) => {
      const d = Math.abs(x - at.x) + Math.abs(y - at.y);
      return d < 2 || d > knock + 1 || lineIndexAt(r, x, y) >= 0 || !!enemyAt(r, x, y) || r.guests.some((g) => g.x === x && g.y === y);
    });
    if (near.length) p = r.rng.pick(near);
  }
  r.guests.push({ x: p.x, y: p.y, kind, t });
}

/** Dropped dancers drift about, dazed, until they give up and leave. */
function wander(r: Run) {
  for (const g of r.guests) {
    if (g.t <= 0) continue;
    g.t--;
    if (g.t % 9 !== 0 || r.rng.chance(0.4)) continue;
    const d = r.rng.int(0, 3);
    const x = g.x + DX[d], y = g.y + DY[d];
    if (x < 1 || y < 1 || x >= COLS - 1 || y >= ROWS - 1 || r.walls[idx(x, y)] || lineIndexAt(r, x, y) >= 0 || enemyAt(r, x, y)) continue;
    g.x = x;
    g.y = y;
  }
  r.guests = r.guests.filter((g) => g.t !== 0);
}

/** Something hit the line. The last dancer falls off, or the leader loses Dignity. */
export function hitLine(r: Run, x: number, y: number, n = 1) {
  if (r.invuln > 0 || r.phase !== "play" || r.discoT > 0) return;
  if (lv(r, "grip") && !r.gripUsed) {
    r.gripUsed = true;
    r.invuln = 16;
    r.fx.push({ k: "pop", x, y, text: "GRIP!", tone: "gold" });
    return;
  }
  r.fx.push({ k: "snd", name: "hit" });
  r.hits++;
  if (r.members.length > 0) {
    for (let i = 0; i < n && r.members.length > 0; i++) {
      const m = r.members.pop()!;
      const p = r.body.pop()!;
      dropLooseGuest(r, m.kind, p, 3);
      r.fx.push({ k: "pop", x: p.x, y: p.y, text: n > 1 ? "OOF x2" : "OOF", tone: "bad" });
    }
    r.prev.length = r.body.length;
    r.invuln = 12;
    return;
  }
  r.dignity--;
  r.invuln = 30;
  r.fx.push({ k: "pop", x: r.body[0].x, y: r.body[0].y, text: "-DIGNITY", tone: "bad" });
  if (r.dignity <= 0) {
    r.phase = "dead";
    r.fx.push({ k: "snd", name: "dead" });
  }
}

/** Multi-source BFS distance from every cell of the line, walking around walls and tables. */
function lineField(r: Run): Int16Array {
  const dist = new Int16Array(COLS * ROWS).fill(-1);
  const q: number[] = [];
  for (const p of r.body) {
    if (!inside(p.x, p.y)) continue;
    const k = idx(p.x, p.y);
    if (dist[k] === 0) continue;
    dist[k] = 0;
    q.push(k);
  }
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    const x = c % COLS, y = (c / COLS) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (!inside(nx, ny) || r.walls[idx(nx, ny)]) continue;
      const k = idx(nx, ny);
      if (dist[k] >= 0) continue;
      dist[k] = dist[c] + 1;
      q.push(k);
    }
  }
  return dist;
}

// ---------- the step ----------

export function step(r: Run) {
  r.tick++;
  if (r.phase === "ready") {
    r.readyT--;
    if (r.readyT <= 0) r.phase = "play";
    return;
  }
  if (r.phase !== "play") return;
  if (r.invuln > 0) r.invuln--;
  if (r.discoT > 0) r.discoT--;

  // the leader
  r.clock++;
  if (r.stun > 0) r.stun--;
  else if (r.clock >= r.every + lv(r, "slow")) {
    r.clock = 0;
    moveLeader(r);
    if (r.phase !== "play") return;
  }

  const field = lineField(r);
  dancers(r);
  for (const e of [...r.enemies]) if (r.enemies.includes(e)) enemyTick(r, e, field);
  shots(r);
  hazards(r);
  spawning(r);
  wander(r);
  for (const e of r.enemies) if (e.hurt > 0) e.hurt--;

  if (!r.exitOpen && r.enemies.length === 0 && r.toSpawn.length === 0 && r.spawns.length === 0) {
    r.exitOpen = true;
    r.walls[idx(EXIT.x, EXIT.y)] = 0;
    r.fx.push({ k: "snd", name: "open" });
    r.fx.push({ k: "pop", x: EXIT.x, y: EXIT.y + 1, text: "DOOR OPEN!", tone: "gold" });
  }
}

function moveLeader(r: Run) {
  while (r.queue.length) {
    const d = r.queue.shift()!;
    if (r.members.length > 0 && d === opp(r.dir)) continue;
    r.dir = d;
    break;
  }
  const head = r.body[0];
  const nx = head.x + DX[r.dir], ny = head.y + DY[r.dir];
  r.prev = r.body.map((p) => ({ ...p }));

  // leaving through the open door
  if (r.exitOpen && nx === EXIT.x && ny === EXIT.y) {
    finishFloor(r);
    return;
  }

  // headbutt a pooper
  const foe = enemyAt(r, nx, ny);
  if (foe) {
    damage(r, foe, 1);
    foe.stun = Math.max(foe.stun, 10);
    r.fx.push({ k: "kick", x: nx, y: ny });
    r.fx.push({ k: "snd", name: "bonk" });
    r.stun = 2;
    return;
  }

  // bonk into a wall, a table or a rival line
  if (isWall(r, nx, ny) || rivalBodyAt(r, nx, ny) || (ny === ENTRY.y && nx === ENTRY.x)) {
    r.fx.push({ k: "snd", name: "bonk" });
    r.fx.push({ k: "kick", x: nx, y: ny });
    // walls knock a dancer off, but never cost the leader's Dignity
    if (!(lv(r, "soft") || LEADERS[r.leader].softWalls) && r.members.length > 0) hitLine(r, head.x, head.y);
    if (r.phase !== "play") return;
    r.stun = 4;
    // turn towards whichever side is open
    const turns: Dir[] = [((r.dir + 1) % 4) as Dir, ((r.dir + 3) % 4) as Dir];
    if (r.rng.chance(0.5)) turns.reverse();
    const free = (d: Dir) => {
      const x = head.x + DX[d], y = head.y + DY[d];
      return !isWall(r, x, y) && lineIndexAt(r, x, y) < 0 && !enemyAt(r, x, y) && !(y === ENTRY.y && x === ENTRY.x);
    };
    const pick = turns.find(free) ?? turns[0];
    r.dir = pick;
    return;
  }

  // running into your own line snaps it there (the very last cell moves away, so it is safe)
  const hitAt = lineIndexAt(r, nx, ny);
  if (hitAt > 0 && hitAt < r.body.length - 1) {
    const lost = r.members.splice(hitAt - 1);
    const where = r.body.splice(hitAt);
    lost.forEach((m, i) => dropLooseGuest(r, m.kind, where[i]));
    r.prev.length = r.body.length;
    r.fx.push({ k: "snd", name: "snap" });
    r.fx.push({ k: "pop", x: nx, y: ny, text: "SNAP!", tone: "bad" });
  }

  // step
  r.body.unshift({ x: nx, y: ny });
  const tail = r.body.pop()!;
  r.beat++;

  // pick up a guest standing here
  const gi = r.guests.findIndex((g) => g.x === nx && g.y === ny);
  if (gi >= 0) {
    const g = r.guests.splice(gi, 1)[0];
    recruit(r, g.kind, tail);
    if (lv(r, "plusone") && r.rng.chance(0.25 * lv(r, "plusone")) && r.members.length < MAX_LINE) {
      recruit(r, guestRoll(r), tail);
      r.fx.push({ k: "pop", x: nx, y: ny - 1, text: "PLUS ONE!", tone: "gold" });
    }
  }
  const pi = r.pickups.findIndex((p) => p.x === nx && p.y === ny);
  if (pi >= 0) {
    const p = r.pickups.splice(pi, 1)[0];
    r.fx.push({ k: "snd", name: "pickup" });
    if (p.kind === "samosa") addScore(r, 50, nx, ny, "gold");
    else if (p.kind === "heart") {
      r.dignity = Math.min(r.maxDignity, r.dignity + 1);
      r.fx.push({ k: "pop", x: nx, y: ny, text: "+DIGNITY", tone: "gold" });
    } else {
      r.discoT = 80;
      for (const m of r.members) m.cd = 0;
      r.fx.push({ k: "pop", x: nx, y: ny, text: "DISCO FEVER!", tone: "gold" });
    }
  }

  // the leader's slipper
  if (lv(r, "chappal")) {
    if (r.chappalCd > 0) r.chappalCd--;
    else {
      r.chappalCd = 8 - lv(r, "chappal") * 2;
      r.shots.push({ x: nx, y: ny, vx: DX[r.dir] * 0.7, vy: DY[r.dir] * 0.7, ally: true, dmg: 2, kind: "chappal", life: 30 });
    }
  }
}

function recruit(r: Run, kind: GuestKind, at: P) {
  if (r.members.length >= MAX_LINE) {
    addScore(r, 40, at.x, at.y, "gold");
    return;
  }
  r.members.push({ kind, cd: 6 });
  r.body.push({ ...at });
  r.prev.push({ ...at });
  r.bestLine = Math.max(r.bestLine, r.members.length);
  r.fx.push({ k: "snd", name: "recruit" });
  r.fx.push({ k: "pop", x: r.body[0].x, y: r.body[0].y, text: GUESTS[kind].name.toUpperCase(), tone: "good" });
}

function nearestEnemy(r: Run, x: number, y: number, range: number): Enemy | null {
  let best: Enemy | null = null, bd = range * range;
  for (const e of r.enemies) {
    const c = centre(e);
    const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d <= bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

function enemiesWithin(r: Run, x: number, y: number, rad: number): Enemy[] {
  return r.enemies.filter((e) => {
    const s = ENEMIES[e.kind].size;
    // distance to the nearest cell of a big enemy
    const cx = Math.max(e.x, Math.min(x, e.x + s - 1)), cy = Math.max(e.y, Math.min(y, e.y + s - 1));
    return (cx - x) ** 2 + (cy - y) ** 2 <= rad * rad;
  });
}

function dancers(r: Run) {
  const fever = r.discoT > 0 ? 2 : 1;
  r.members.forEach((m, i) => {
    const at = r.body[i + 1];
    if (!at) return;
    m.cd -= fever;
    if (m.cd > 0) return;
    const base = GUESTS[m.kind].cd;
    switch (m.kind) {
      case "aunty": {
        const t = nearestEnemy(r, at.x, at.y, 6.5);
        if (!t) return void (m.cd = 0);
        const c = centre(t);
        const dx = c.x - at.x, dy = c.y - at.y, len = Math.hypot(dx, dy) || 1;
        r.shots.push({ x: at.x, y: at.y, vx: (dx / len) * 0.55, vy: (dy / len) * 0.55, ally: true, dmg: 1 + (lv(r, "ladoo") >= 2 ? 1 : 0), kind: "ladoo", life: 30 });
        r.fx.push({ k: "snd", name: "throw" });
        m.cd = Math.round(base * (1 - 0.18 * lv(r, "ladoo")));
        return;
      }
      case "uncle": {
        const near = enemiesWithin(r, at.x, at.y, 1.5);
        if (!near.length) return void (m.cd = 0);
        for (const e of near) damage(r, e, 2 + lv(r, "kick"));
        r.fx.push({ k: "kick", x: at.x, y: at.y });
        m.cd = base - lv(r, "kick") * 2;
        return;
      }
      case "dj": {
        const rad = 2.5 + lv(r, "bass");
        const near = enemiesWithin(r, at.x, at.y, rad);
        if (!near.length) return void (m.cd = 0);
        for (const e of near) damage(r, e, 1 + (lv(r, "bass") >= 2 ? 1 : 0));
        r.fx.push({ k: "ring", x: at.x, y: at.y, r: rad, color: "bass" });
        r.fx.push({ k: "snd", name: "bass" });
        m.cd = base;
        return;
      }
      case "photo": {
        const near = enemiesWithin(r, at.x, at.y, 3.2);
        if (!near.length) return void (m.cd = 0);
        for (const e of near) {
          e.stun = Math.max(e.stun, (ENEMIES[e.kind].boss ? 16 : 36) + lv(r, "flash") * 16);
          damage(r, e, lv(r, "flash"));
        }
        r.fx.push({ k: "ring", x: at.x, y: at.y, r: 3.2, color: "flash" });
        r.fx.push({ k: "snd", name: "flash" });
        m.cd = base;
        return;
      }
      case "baby": {
        const near = enemiesWithin(r, at.x, at.y, 3.5).filter((e) => !ENEMIES[e.kind].boss);
        if (!near.length) return void (m.cd = 0);
        for (const e of near) e.flee = 40;
        r.fx.push({ k: "ring", x: at.x, y: at.y, r: 3.5, color: "cry" });
        m.cd = base;
        return;
      }
      case "chef": {
        if (!nearestEnemy(r, at.x, at.y, 5)) return void (m.cd = 0);
        if (!r.pots.some((p) => p.x === at.x && p.y === at.y)) r.pots.push({ x: at.x, y: at.y, t: 90 + lv(r, "pots") * 40 });
        m.cd = base;
        return;
      }
    }
  });
  // pots burn whatever stands on them or next to them
  for (const p of r.pots) {
    p.t--;
    if (p.t % 8 === 0) for (const e of enemiesWithin(r, p.x, p.y, 1)) damage(r, e, 1 + (lv(r, "pots") >= 2 ? 1 : 0));
  }
  r.pots = r.pots.filter((p) => p.t > 0);
}

function canEnemyStand(r: Run, e: Enemy, x: number, y: number, fly: boolean): boolean {
  const s = ENEMIES[e.kind].size;
  for (let dy = 0; dy < s; dy++)
    for (let dx = 0; dx < s; dx++) {
      const cx = x + dx, cy = y + dy;
      if (cx < 1 || cy < 1 || cx >= COLS - 1 || cy >= ROWS - 1) return false;
      if (!fly && r.walls[idx(cx, cy)]) return false;
      const o = enemyAt(r, cx, cy);
      if (o && o !== e) return false;
      if (rivalBodyAt(r, cx, cy) && !e.tail.some((p) => p.x === cx && p.y === cy)) return false;
    }
  return true;
}

function touchesLine(r: Run, e: Enemy, x: number, y: number): P | null {
  const s = ENEMIES[e.kind].size;
  for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) if (lineIndexAt(r, x + dx, y + dy) >= 0) return { x: x + dx, y: y + dy };
  return null;
}

function enemyTick(r: Run, e: Enemy, field: Int16Array) {
  if (e.stun > 0) {
    e.stun--;
    return;
  }
  if (e.flee > 0) e.flee--;
  const head = r.body[0];
  const c = centre(e);
  const dHead = Math.hypot(c.x - head.x, c.y - head.y);

  // attacks that are not about walking
  if (e.kind === "caterer") {
    e.cd--;
    if (e.cd <= 0 && dHead < 9) {
      e.cd = 44 - Math.min(14, r.floor * 2);
      throwAt(r, c, head, 0.32, "plate");
    }
  } else if (e.kind === "mami") {
    e.cd--;
    e.cd2--;
    if (e.cd <= 0) {
      e.cd = e.hp < e.max / 2 ? 34 : 46;
      for (const a of [-0.35, 0, 0.35]) throwAt(r, c, head, 0.34, "slipper", a);
      r.fx.push({ k: "snd", name: "throw" });
    }
    if (e.cd2 <= 0) {
      e.cd2 = 130;
      queueSpawnNear(r, "mozzie", e.x - 1, e.y);
      queueSpawnNear(r, "mozzie", e.x + 2, e.y + 1);
    }
  } else if (e.kind === "chefboss") {
    e.cd--;
    e.cd2--;
    if (e.cd <= 0) {
      e.cd = e.hp < e.max / 2 ? 50 : 70;
      // cleaver slam along the leader's row or column
      const row = r.rng.chance(0.5);
      for (let i = 1; i < (row ? COLS : ROWS) - 1; i++) {
        const x = row ? i : head.x, y = row ? head.y : i;
        if (!r.walls[idx(x, y)]) r.hazards.push({ x, y, t: 26, kind: "cleaver" });
      }
      r.fx.push({ k: "snd", name: "warn" });
    }
    if (e.cd2 <= 0) {
      e.cd2 = 170;
      if (r.enemies.filter((o) => o.kind === "caterer").length < 2) queueSpawnNear(r, "caterer", e.x, e.y + 2);
    }
  } else if (e.kind === "djboss") {
    e.cd--;
    e.cd2--;
    if (e.cd <= 0) {
      e.cd = e.hp < e.max / 2 ? 46 : 62;
      // the drop: tiles light up, then blast. Some around the leader, some anywhere.
      const cells = freeCells(r);
      const pick = r.rng.shuffle(cells).slice(0, 14 + Math.floor((1 - e.hp / e.max) * 10));
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!r.walls[idx(head.x + dx, head.y + dy)] && r.rng.chance(0.55)) pick.push({ x: head.x + dx, y: head.y + dy });
      for (const p of pick) if (!r.hazards.some((h) => h.x === p.x && h.y === p.y)) r.hazards.push({ x: p.x, y: p.y, t: 28, kind: "drop" });
      r.fx.push({ k: "snd", name: "warn" });
    }
    if (e.cd2 <= 0) {
      e.cd2 = 95;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + r.tick * 0.1;
        r.shots.push({ x: c.x, y: c.y + 0.5, vx: Math.cos(a) * 0.25, vy: Math.sin(a) * 0.25, ally: false, dmg: 1, kind: "note", life: 90 });
      }
      r.fx.push({ k: "snd", name: "bass" });
      if (e.hp < e.max / 2 && !r.enemies.some((o) => o.kind === "rival") && r.rng.chance(0.4)) queueSpawnNear(r, "rival", 2, 4);
    }
    return; // the DJ never leaves the booth
  }

  e.clock++;
  if (e.clock < e.every) return;
  e.clock = 0;
  e.px = e.x;
  e.py = e.y;
  e.ptail = e.tail.map((p) => ({ ...p }));

  const fly = e.kind === "mozzie";
  const options: { d: Dir; x: number; y: number; score: number }[] = [];
  for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
    const x = e.x + DX[d], y = e.y + DY[d];
    let score: number;
    if (fly) score = Math.hypot(x - head.x, y - head.y) + r.rng.next() * 3.5;
    else {
      // big enemies use the best cell of their footprint
      let best = 999;
      const s = ENEMIES[e.kind].size;
      for (let dy = 0; dy < s; dy++)
        for (let dx = 0; dx < s; dx++) {
          const k = inside(x + dx, y + dy) ? field[idx(x + dx, y + dy)] : -1;
          if (k >= 0) best = Math.min(best, k);
        }
      score = best + r.rng.next() * 0.9;
      if (e.kind === "caterer") score = Math.abs(best - 5) + r.rng.next() * 0.9; // keep a throwing distance
      if (e.kind === "rival" && d === opp(e.dir)) score += 50;
    }
    if (e.flee > 0) score = -score;
    options.push({ d, x, y, score });
  }
  options.sort((a, b) => a.score - b.score);
  for (const o of options) {
    const hit = touchesLine(r, e, o.x, o.y);
    if (hit) {
      if (e.flee > 0) continue;
      // big and late-floor poopers knock two dancers off at once
      hitLine(r, hit.x, hit.y, ENEMIES[e.kind].boss || e.kind === "rival" || (e.kind === "neighbour" && r.floor >= 5) ? 2 : 1);
      if (e.kind === "mozzie") {
        // it bites, then buzzes off for a moment
        e.stun = 20;
      } else e.stun = 14;
      return;
    }
    if (!canEnemyStand(r, e, o.x, o.y, fly)) continue;
    if (e.kind === "rival") {
      e.tail.unshift({ x: e.x, y: e.y });
      e.tail.pop();
    }
    e.x = o.x;
    e.y = o.y;
    e.dir = o.d;
    return;
  }
}

function throwAt(r: Run, from: P, to: P, speed: number, kind: Shot["kind"], angle = 0) {
  const a = Math.atan2(to.y - from.y, to.x - from.x) + angle;
  r.shots.push({ x: from.x, y: from.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, ally: false, dmg: 1, kind, life: 80 });
}

function queueSpawnNear(r: Run, kind: EnemyKind, x: number, y: number) {
  const cells = freeCells(r, (cx, cy) => Math.abs(cx - x) + Math.abs(cy - y) > 3 || lineIndexAt(r, cx, cy) >= 0);
  if (!cells.length) return;
  const p = r.rng.pick(cells);
  r.spawns.push({ x: p.x, y: p.y, t: 24, kind });
}

function shots(r: Run) {
  for (const s of r.shots) {
    s.x += s.vx;
    s.y += s.vy;
    s.life--;
    const cx = Math.round(s.x), cy = Math.round(s.y);
    if (!inside(cx, cy) || (r.walls[idx(cx, cy)] && s.kind !== "note")) {
      s.life = 0;
      continue;
    }
    if (cx <= 0 || cy <= 0 || cx >= COLS - 1 || cy >= ROWS - 1) {
      s.life = 0;
      continue;
    }
    if (s.ally) {
      const e = enemyAt(r, cx, cy) ?? rivalBodyAt(r, cx, cy);
      if (e) {
        damage(r, e, s.dmg);
        s.life = 0;
      }
    } else if (lineIndexAt(r, cx, cy) >= 0) {
      hitLine(r, cx, cy);
      s.life = 0;
    }
  }
  r.shots = r.shots.filter((s) => s.life > 0);
}

function hazards(r: Run) {
  let slam = false;
  for (const h of r.hazards) {
    h.t--;
    if (h.t === 0) {
      slam = true;
      if (lineIndexAt(r, h.x, h.y) >= 0) hitLine(r, h.x, h.y, 2);
      // the floor attacks hurt the boss's own helpers too
      const e = enemyAt(r, h.x, h.y);
      if (e && !ENEMIES[e.kind].boss) damage(r, e, 2);
    }
  }
  if (slam) r.fx.push({ k: "snd", name: "slam" });
  r.hazards = r.hazards.filter((h) => h.t > 0);
}

function spawning(r: Run) {
  for (const s of r.spawns) s.t--;
  for (const s of r.spawns.filter((s) => s.t <= 0)) {
    if (!enemyAt(r, s.x, s.y) && lineIndexAt(r, s.x, s.y) < 0) spawnEnemy(r, s.kind, s.x, s.y);
    else r.toSpawn.push(s.kind);
  }
  r.spawns = r.spawns.filter((s) => s.t > 0);
  if (!r.toSpawn.length) return;
  r.spawnClock--;
  const alive = r.enemies.filter((e) => !ENEMIES[e.kind].boss).length + r.spawns.length;
  const cap = BOSS_FLOOR[r.floor] ? 4 : 3 + Math.ceil(r.floor * 0.6);
  if (r.spawnClock > 0 || alive >= cap) return;
  r.spawnClock = Math.max(20, 56 - r.floor * 4);
  const kind = r.toSpawn.shift()!;
  // poopers come in away from the leader
  const head = r.body[0];
  const cells = freeCells(r, (x, y) => Math.abs(x - head.x) + Math.abs(y - head.y) < 6 || lineIndexAt(r, x, y) >= 0 || !!enemyAt(r, x, y));
  if (!cells.length) return void r.toSpawn.unshift(kind);
  const p = r.rng.pick(cells);
  r.spawns.push({ x: p.x, y: p.y, t: 24, kind });
}

// ---------- between floors ----------

function finishFloor(r: Run) {
  const bonus = 100 * r.floor + r.members.length * 15;
  r.score += bonus;
  r.fx.push({ k: "snd", name: "floor" });
  if (r.floor >= FLOORS) {
    r.score += 2000 + r.dignity * 300;
    r.phase = "won";
    return;
  }
  r.offer = rollPerks(r);
  r.phase = "perk";
}

function rollPerks(r: Run): PerkId[] {
  const have = new Set(r.members.map((m) => m.kind));
  const pool = PERK_IDS.filter((p) => lv(r, p) < PERKS[p].max && !(p === "soft" && LEADERS[r.leader].softWalls));
  // perks for guests you actually have in line are much more likely
  const weighted: PerkId[] = [];
  for (const p of pool) {
    const k = PERKS[p].kind;
    const w = k ? (have.has(k) ? 4 : 1) : 2;
    for (let i = 0; i < w; i++) weighted.push(p);
  }
  const out: PerkId[] = [];
  while (out.length < 3 && weighted.length) {
    const p = r.rng.pick(weighted);
    if (!out.includes(p)) out.push(p);
    for (let i = weighted.length - 1; i >= 0; i--) if (weighted[i] === p) weighted.splice(i, 1);
  }
  return out;
}

export function choosePerk(r: Run, p: PerkId) {
  if (r.phase !== "perk" || !r.offer.includes(p)) return;
  r.perks[p] = lv(r, p) + 1;
  if (p === "buffet") {
    r.maxDignity++;
    r.dignity = r.maxDignity;
  }
  r.offer = [];
  r.floor++;
  buildFloor(r);
  if (BOSS_FLOOR[r.floor]) r.fx.push({ k: "snd", name: "boss" });
}

/** Drain the effect queue (sounds and pop-ups) for the UI. */
export function takeFx(r: Run): Fx[] {
  const f = r.fx;
  r.fx = [];
  return f;
}

// ---------- saved progress between runs ----------

export interface Meta {
  best: number;
  bestFloor: number;
  runs: number;
  wins: number;
  unlocked: LeaderId[];
}

export const newMeta = (): Meta => ({ best: 0, bestFloor: 0, runs: 0, wins: 0, unlocked: ["dada"] });

/** Record a finished run. Returns the leaders it unlocked. */
export function recordRun(m: Meta, r: Run): LeaderId[] {
  m.runs++;
  m.best = Math.max(m.best, r.score);
  const reached = r.phase === "won" ? FLOORS + 1 : r.floor;
  m.bestFloor = Math.max(m.bestFloor, Math.min(FLOORS, reached));
  if (r.phase === "won") m.wins++;
  const fresh: LeaderId[] = [];
  if (reached >= 4 && !m.unlocked.includes("bride")) fresh.push("bride");
  if (reached >= 7 && !m.unlocked.includes("horse")) fresh.push("horse");
  m.unlocked.push(...fresh);
  return fresh;
}
