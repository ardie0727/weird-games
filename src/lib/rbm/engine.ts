// Rubber Bullet Man: the whole game simulation. No DOM here, so it can run in tests.
// The arena is a fixed 360x600 world; the component scales it to the screen.
//
// Three modes share this one simulation:
//  - classic: one player against waves (the original game)
//  - coop:    up to four players against waves that scale with the team
//  - brawl:   free-for-all, players (and bots) shoot each other; KOs score points
// In online games the host runs this and sends snapshots; see net.ts.

export const W = 360;
export const H = 600;

export type Mode = "classic" | "coop" | "brawl";
export type BulletKind = "bouncer" | "piercer" | "splitter" | "boomerang" | "glue" | "seeker" | "bomb";
export type EnemyType = "blob" | "baby" | "dasher" | "shooter" | "mama" | "brute" | "fuse" | "mirror" | "boss" | "queen";
export type PowerKind = "shield" | "rapid" | "triple";
export type PickupKind = BulletKind | PowerKind | "heart";

export interface BulletInfo {
  name: string;
  color: string;
  desc: string;
  speed: number;
  r: number;
  bounces: number;
  cooldown: number;
}

export const BULLETS: Record<BulletKind, BulletInfo> = {
  bouncer: { name: "Bouncer", color: "#ff4d6d", desc: "Bounces off walls and ricochets off enemies. Unlimited.", speed: 330, r: 5, bounces: 5, cooldown: 0.28 },
  piercer: { name: "Piercer", color: "#22f3ff", desc: "Ghosts through the first enemy, then hits the next one for double damage.", speed: 430, r: 4, bounces: 3, cooldown: 0.4 },
  splitter: { name: "Splitter", color: "#ffe14d", desc: "Pops into three on its first hit or bounce.", speed: 300, r: 6, bounces: 4, cooldown: 0.4 },
  boomerang: { name: "Boomerang", color: "#39ff88", desc: "Cuts through everything and comes back. Catch it to keep it. Never hurts you.", speed: 360, r: 6, bounces: 99, cooldown: 0.5 },
  glue: { name: "Glue", color: "#b26bff", desc: "Freezes the enemy it hits and everyone near it.", speed: 300, r: 6, bounces: 3, cooldown: 0.4 },
  seeker: { name: "Seeker", color: "#ff2bd6", desc: "Curves toward the nearest enemy and hunts down up to three.", speed: 250, r: 5, bounces: 3, cooldown: 0.35 },
  bomb: { name: "Bomb", color: "#f4f1ff", desc: "Blows up on the first enemy or its third bounce. Big blast. Don't stand in it.", speed: 220, r: 7, bounces: 3, cooldown: 0.6 },
};

export const KINDS: BulletKind[] = ["bouncer", "piercer", "splitter", "boomerang", "glue", "seeker", "bomb"];
const SPECIALS = KINDS.slice(1);

export const POWERS: Record<PowerKind, { name: string; color: string; letter: string; desc: string }> = {
  shield: { name: "Shield", color: "#22f3ff", letter: "S", desc: "A bubble that eats the next hit." },
  rapid: { name: "Rapid", color: "#ffe14d", letter: "R", desc: "Double fire rate for 8 seconds." },
  triple: { name: "Triple", color: "#39ff88", letter: "3", desc: "Three-way shots for 8 seconds." },
};
export const POWER_KINDS: PowerKind[] = ["shield", "rapid", "triple"];
const POWER_TIME = 8;

export const BLAST_R = 58;

export const ENEMY_TYPES: EnemyType[] = ["blob", "baby", "dasher", "shooter", "mama", "brute", "fuse", "mirror", "boss", "queen"];
export const PICKUP_KINDS: PickupKind[] = [...KINDS, ...POWER_KINDS, "heart"];

const ENEMY: Record<EnemyType, { r: number; hp: number; pts: number; speed: number; color: string }> = {
  blob: { r: 11, hp: 1, pts: 100, speed: 46, color: "#39ff88" },
  baby: { r: 7, hp: 1, pts: 50, speed: 72, color: "#8dffb9" },
  dasher: { r: 10, hp: 1, pts: 150, speed: 270, color: "#ff8a3d" },
  shooter: { r: 11, hp: 2, pts: 200, speed: 55, color: "#22f3ff" },
  mama: { r: 15, hp: 2, pts: 150, speed: 34, color: "#b26bff" },
  brute: { r: 18, hp: 4, pts: 300, speed: 30, color: "#ff4d6d" },
  fuse: { r: 10, hp: 1, pts: 175, speed: 64, color: "#9aa0b8" },
  mirror: { r: 13, hp: 2, pts: 250, speed: 40, color: "#d9dcff" },
  boss: { r: 30, hp: 12, pts: 2000, speed: 80, color: "#ffe14d" },
  queen: { r: 28, hp: 14, pts: 2500, speed: 60, color: "#ff77e9" },
};
export const enemyColor = (t: EnemyType) => ENEMY[t].color;
export const enemyRadius = (t: EnemyType) => ENEMY[t].r;
export const isBoss = (t: EnemyType) => t === "boss" || t === "queen";
/** Half-width of a mirror's shield, in radians. */
export const MIRROR_ARC = 1.1;

/** Body colours by seat: the original yellow man first. */
export const PLAYER_COLORS = ["#ffe14d", "#22f3ff", "#39ff88", "#ff8a3d"];
export const MAX_PLAYERS = 4;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Bumper {
  x: number;
  y: number;
  r: number;
  flash: number;
}

export interface Blast {
  x: number;
  y: number;
  r: number;
  t: number;
}

export interface Bullet {
  id: number;
  kind: BulletKind;
  owner: "player" | "enemy";
  /** Id of the player who fired it; -1 for enemy pellets. */
  pid: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  bounces: number;
  maxBounces: number;
  walls: number; // wall bounces so far, for bank-shot bonus
  kills: number; // kills so far, for the chain multiplier
  age: number;
  life: number;
  phased: boolean;
  mini: boolean;
  ignore: number[];
  dead: boolean;
}

export interface Enemy {
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  maxHp: number;
  state: number; // 0 wait/aim, 1 dash (dasher) / lit (fuse) / spiral (queen)
  t: number;
  fire: number;
  face: number; // shield angle (mirror), spiral angle (queen)
  frozen: number;
  flash: number;
  dead: boolean;
}

export interface Pickup {
  x: number;
  y: number;
  kind: PickupKind;
  t: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  color: string;
  size: number;
}

export interface Pop {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
}

export interface Warning {
  x: number;
  y: number;
  type: EnemyType;
  t: number;
}

export type Sound = "shoot" | "bounce" | "hit" | "kill" | "hurt" | "pickup" | "wave" | "over" | "catch" | "chain" | "freeze" | "boom" | "boing" | "power" | "shield";
export const SOUNDS: Sound[] = ["shoot", "bounce", "hit", "kill", "hurt", "pickup", "wave", "over", "catch", "chain", "freeze", "boom", "boing", "power", "shield"];

/** A visual effect, recorded so a network host can replay it on its guests' screens. */
export type Fx = { k: "b"; x: number; y: number; c: string; n: number; s: number } | { k: "p"; x: number; y: number; text: string; c: string };

export interface Bot {
  think: number;
  strafe: number;
  strafeT: number;
  err: number;
  lastX: number;
  lastY: number;
  tvx: number;
  tvy: number;
  target: number;
}

export interface Player {
  id: number;
  slot: number;
  name: string;
  color: string;
  x: number;
  y: number;
  r: number;
  aimX: number;
  aimY: number;
  invuln: number;
  cooldown: number;
  walk: number;
  hearts: number;
  ammo: Record<BulletKind, number>;
  selected: BulletKind;
  power: { shield: boolean; rapid: number; triple: number };
  frozen: number;
  score: number;
  kills: number;
  bestChain: number;
  /** Knocked out: waiting for the next wave (co-op) or a respawn (brawl). */
  down: boolean;
  respawn: number;
  /** Brawl: points (a KO is 1, a bank-shot KO 2, an own goal -1), KOs dealt, times KO'd. */
  points: number;
  kos: number;
  falls: number;
  bot: Bot | null;
  /** Bumped whenever the host moves this player by force (respawn), so a guest snaps to it. */
  tp: number;
  /** Shots asked for over the network, and a short window to fire one in. */
  fireSeq: number;
  queued: number;
}

export interface BrawlState {
  target: number;
  timeLeft: number;
  countdown: number;
  dropT: number;
  /** Winner's player id, -1 for a draw, null while playing. */
  winner: number | null;
}

export interface Game {
  mode: Mode;
  time: number;
  wave: number;
  /** Team score (classic and co-op). */
  score: number;
  kills: number;
  bestChain: number;
  players: Player[];
  bullets: Bullet[];
  enemies: Enemy[];
  warnings: Warning[];
  pickups: Pickup[];
  particles: Particle[];
  pops: Pop[];
  layout: number;
  obstacles: Rect[];
  bumpers: Bumper[];
  blasts: Blast[];
  queue: EnemyType[];
  spawnT: number;
  interT: number;
  banner: { text: string; sub: string; t: number } | null;
  shake: number;
  over: boolean;
  nextId: number;
  sounds: Sound[];
  /** When set (on a network host), effects are also recorded here to send to guests. */
  fx: Fx[] | null;
  brawl: BrawlState | null;
}

export interface Input {
  moveX: number;
  moveY: number;
  /** Aim direction (any length); zero keeps the last aim. */
  aimX: number;
  aimY: number;
  fire: boolean;
  /** Switch to this bullet, if there's ammo for it. */
  select?: BulletKind;
  /** A network guest moves itself; the host takes its position as given. */
  pos?: { x: number; y: number; walk: number };
  /** A network guest's running count of shots asked for (taps). */
  shots?: number;
  /** The last forced move (respawn) the guest has seen; until it has, its position is ignored. */
  tp?: number;
}

export interface Seat {
  name: string;
  bot?: boolean;
}

export const MAX_HEARTS = 3;
const PLAYER_SPEED = 150;
export const PLAYER_R = 9;
export const BRAWL_TARGET = 7;
export const BRAWL_TIME = 180;
const RESPAWN = 2.4;
const FREEZE_PLAYER = 1.4;
const BRAWL_AMMO = (): Record<BulletKind, number> => ({ bouncer: Infinity, piercer: 1, splitter: 1, boomerang: 0, glue: 0, seeker: 0, bomb: 0 });

interface Layout {
  rects: Rect[];
  bumpers?: { x: number; y: number; r: number }[];
}

// Arenas rotate every third wave. Bumpers are pinball pads: they speed your bullets up and
// don't use up a bounce.
export const LAYOUTS: Layout[] = [
  { rects: [] },
  {
    rects: [
      { x: 70, y: 200, w: 44, h: 44 },
      { x: 246, y: 200, w: 44, h: 44 },
    ],
  },
  {
    rects: [],
    bumpers: [
      { x: 95, y: 210, r: 17 },
      { x: 265, y: 210, r: 17 },
      { x: 180, y: 320, r: 20 },
    ],
  },
  {
    rects: [
      { x: 120, y: 270, w: 120, h: 18 },
      { x: 30, y: 140, w: 18, h: 70 },
      { x: 312, y: 140, w: 18, h: 70 },
    ],
  },
  {
    rects: [
      { x: 60, y: 150, w: 36, h: 36 },
      { x: 264, y: 150, w: 36, h: 36 },
      { x: 60, y: 360, w: 36, h: 36 },
      { x: 264, y: 360, w: 36, h: 36 },
    ],
  },
  {
    rects: [
      { x: 40, y: 300, w: 80, h: 16 },
      { x: 240, y: 300, w: 80, h: 16 },
    ],
    bumpers: [
      { x: 180, y: 150, r: 18 },
      { x: 70, y: 180, r: 13 },
      { x: 290, y: 180, r: 13 },
      { x: 180, y: 380, r: 15 },
    ],
  },
  {
    rects: [
      { x: 162, y: 120, w: 36, h: 120 },
      { x: 40, y: 330, w: 90, h: 18 },
      { x: 230, y: 330, w: 90, h: 18 },
    ],
  },
  // Brawl-only arenas: symmetric top and bottom, lots of cover and bank angles.
  {
    rects: [
      { x: 60, y: 200, w: 70, h: 16 },
      { x: 230, y: 384, w: 70, h: 16 },
      { x: 230, y: 200, w: 16, h: 60 },
      { x: 114, y: 340, w: 16, h: 60 },
    ],
    bumpers: [{ x: 180, y: 300, r: 20 }],
  },
  {
    rects: [
      { x: 150, y: 130, w: 60, h: 16 },
      { x: 150, y: 454, w: 60, h: 16 },
      { x: 40, y: 292, w: 60, h: 16 },
      { x: 260, y: 292, w: 60, h: 16 },
    ],
    bumpers: [
      { x: 100, y: 200, r: 14 },
      { x: 260, y: 400, r: 14 },
      { x: 260, y: 200, r: 14 },
      { x: 100, y: 400, r: 14 },
    ],
  },
];
/** Arenas picked for a brawl: the ones with cover. */
export const BRAWL_LAYOUTS = [3, 4, 5, 6, 7, 8];

/** Player spawn spots for a brawl, corners first. */
const BRAWL_SPAWNS = [
  { x: 50, y: 70 },
  { x: 310, y: 530 },
  { x: 310, y: 70 },
  { x: 50, y: 530 },
  { x: 180, y: 70 },
  { x: 180, y: 530 },
  { x: 40, y: 300 },
  { x: 320, y: 300 },
];

const startAmmo = (): Record<BulletKind, number> => ({ bouncer: Infinity, piercer: 3, splitter: 2, boomerang: 1, glue: 1, seeker: 2, bomb: 1 });

function makePlayer(g: Game, slot: number, seat: Seat): Player {
  return {
    id: g.nextId++,
    slot,
    name: seat.name,
    color: PLAYER_COLORS[slot % PLAYER_COLORS.length],
    x: W / 2,
    y: H - 90,
    r: PLAYER_R,
    aimX: 0,
    aimY: -1,
    invuln: 0,
    cooldown: 0,
    walk: 0,
    hearts: MAX_HEARTS,
    ammo: g.mode === "brawl" ? BRAWL_AMMO() : startAmmo(),
    selected: "bouncer",
    power: { shield: false, rapid: 0, triple: 0 },
    frozen: 0,
    score: 0,
    kills: 0,
    bestChain: 0,
    down: false,
    respawn: 0,
    points: 0,
    kos: 0,
    falls: 0,
    bot: seat.bot ? { think: 0.5 + Math.random(), strafe: 1, strafeT: 0, err: 0, lastX: 0, lastY: 0, tvx: 0, tvy: 0, target: -1 } : null,
    tp: 0,
    fireSeq: 0,
    queued: 0,
  };
}

/**
 * A fresh game. With no arguments it's the original one-player game. Seats are filled in
 * order, so the first seat (the host, online) is player 1.
 */
export function newGame(mode: Mode = "classic", seats: Seat[] = [{ name: "YOU" }], layout?: number): Game {
  const g: Game = {
    mode,
    time: 0,
    wave: 0,
    score: 0,
    kills: 0,
    bestChain: 0,
    players: [],
    bullets: [],
    enemies: [],
    warnings: [],
    pickups: [],
    particles: [],
    pops: [],
    layout: 0,
    obstacles: [],
    bumpers: [],
    blasts: [],
    queue: [],
    spawnT: 0,
    interT: 0.6,
    banner: null,
    shake: 0,
    over: false,
    nextId: 1,
    sounds: [],
    fx: null,
    brawl: null,
  };
  const list = mode === "classic" ? seats.slice(0, 1) : seats.slice(0, MAX_PLAYERS);
  list.forEach((s, i) => g.players.push(makePlayer(g, i, s)));
  if (mode === "brawl") {
    setLayout(g, layout ?? BRAWL_LAYOUTS[Math.floor(Math.random() * BRAWL_LAYOUTS.length)]);
    g.brawl = { target: BRAWL_TARGET, timeLeft: BRAWL_TIME, countdown: 3, dropT: 1.5, winner: null };
    g.players.forEach((p, i) => {
      const s = BRAWL_SPAWNS[i];
      p.x = s.x;
      p.y = s.y;
      p.aimX = W / 2 - s.x;
      p.aimY = H / 2 - s.y;
      collideWorld(g, p);
    });
    g.interT = 0;
  } else {
    const n = g.players.length;
    g.players.forEach((p, i) => (p.x = W / 2 + (i - (n - 1) / 2) * 44));
  }
  return g;
}

export function setLayout(g: Game, i: number) {
  const lay = LAYOUTS[i % LAYOUTS.length];
  g.layout = i % LAYOUTS.length;
  g.obstacles = lay.rects;
  g.bumpers = (lay.bumpers ?? []).map((b) => ({ ...b, flash: 0 }));
}

export const playerById = (g: Game, id: number) => g.players.find((p) => p.id === id) ?? null;

/** The nearest player who is still standing, for enemies to chase and look at. */
export function nearestPlayer(g: Game, x: number, y: number, except = -1): Player | null {
  let best: Player | null = null;
  let bd = Infinity;
  for (const p of g.players) {
    if (p.down || p.id === except) continue;
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bd) (bd = d), (best = p);
  }
  return best;
}

/** Take a player out of the game (they left an online room). */
export function removePlayer(g: Game, id: number) {
  g.players = g.players.filter((p) => p.id !== id);
  if (g.over) return;
  if (!g.players.length) g.over = true;
  else if (g.mode === "brawl" && g.players.length < 2) endBrawl(g);
  else if (g.mode !== "brawl" && g.players.every((p) => p.down)) {
    g.over = true;
    g.sounds.push("over");
  }
}

// ---------- geometry ----------

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Circle vs rectangle: the push-out normal and depth, or null when apart. */
export function circleRect(x: number, y: number, r: number, o: Rect): { nx: number; ny: number; pen: number } | null {
  const cx = clamp(x, o.x, o.x + o.w);
  const cy = clamp(y, o.y, o.y + o.h);
  const dx = x - cx;
  const dy = y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r) return null;
  if (d2 === 0) {
    const l = x - o.x, rr = o.x + o.w - x, t = y - o.y, b = o.y + o.h - y;
    const m = Math.min(l, rr, t, b);
    if (m === l) return { nx: -1, ny: 0, pen: l + r };
    if (m === rr) return { nx: 1, ny: 0, pen: rr + r };
    if (m === t) return { nx: 0, ny: -1, pen: t + r };
    return { nx: 0, ny: 1, pen: b + r };
  }
  const d = Math.sqrt(d2);
  return { nx: dx / d, ny: dy / d, pen: r - d };
}

function reflect(o: { vx: number; vy: number }, nx: number, ny: number): boolean {
  const dot = o.vx * nx + o.vy * ny;
  if (dot >= 0) return false;
  o.vx -= 2 * dot * nx;
  o.vy -= 2 * dot * ny;
  return true;
}

/** Keep a circle inside the arena and out of obstacles. Returns the last wall normal hit, if any. */
export function collideWorld(g: Pick<Game, "obstacles" | "bumpers">, o: { x: number; y: number; r: number }): { nx: number; ny: number; bumper?: Bumper } | null {
  let hit: { nx: number; ny: number; bumper?: Bumper } | null = null;
  if (o.x < o.r) (o.x = o.r), (hit = { nx: 1, ny: 0 });
  if (o.x > W - o.r) (o.x = W - o.r), (hit = { nx: -1, ny: 0 });
  if (o.y < o.r) (o.y = o.r), (hit = { nx: 0, ny: 1 });
  if (o.y > H - o.r) (o.y = H - o.r), (hit = { nx: 0, ny: -1 });
  for (const ob of g.obstacles) {
    const c = circleRect(o.x, o.y, o.r, ob);
    if (c) {
      o.x += c.nx * c.pen;
      o.y += c.ny * c.pen;
      hit = { nx: c.nx, ny: c.ny };
    }
  }
  for (const bp of g.bumpers) {
    const dx = o.x - bp.x, dy = o.y - bp.y;
    const min = bp.r + o.r;
    const d2 = dx * dx + dy * dy;
    if (d2 < min * min) {
      const d = Math.sqrt(d2);
      const nx = d ? dx / d : 0, ny = d ? dy / d : -1;
      o.x = bp.x + nx * min;
      o.y = bp.y + ny * min;
      hit = { nx, ny, bumper: bp };
    }
  }
  return hit;
}

/** Where a shot would go: points along its path, reflecting off walls and obstacles. */
export function predictPath(g: Pick<Game, "obstacles" | "bumpers">, x: number, y: number, dx: number, dy: number, r: number, length = 320, maxBounces = 2): { x: number; y: number }[] {
  const len = Math.hypot(dx, dy) || 1;
  const o = { x, y, r, vx: dx / len, vy: dy / len };
  const pts = [{ x, y }];
  let bounces = 0;
  for (let travelled = 0; travelled < length; travelled += 4) {
    o.x += o.vx * 4;
    o.y += o.vy * 4;
    const hit = collideWorld(g, o);
    if (hit && reflect(o, hit.nx, hit.ny)) {
      pts.push({ x: o.x, y: o.y });
      if (++bounces > maxBounces) return pts;
    }
  }
  pts.push({ x: o.x, y: o.y });
  return pts;
}

/** Move a player by stick input, the same way on the host and on a guest's own screen. */
export function movePlayer(g: Pick<Game, "obstacles" | "bumpers">, p: { x: number; y: number; r: number; walk: number }, mx: number, my: number, dt: number) {
  const ml = Math.hypot(mx, my);
  if (ml > 0.05) {
    const s = Math.min(1, ml) / ml;
    p.x += mx * s * PLAYER_SPEED * dt;
    p.y += my * s * PLAYER_SPEED * dt;
    p.walk += dt * 10;
  }
  collideWorld(g, p);
}

// ---------- spawning ----------

const COST: Partial<Record<EnemyType, number>> = { blob: 1, dasher: 2, shooter: 3, mama: 3, brute: 4, fuse: 2, mirror: 3 };
const UNLOCK: Partial<Record<EnemyType, number>> = { blob: 1, dasher: 2, shooter: 3, mama: 4, brute: 6, fuse: 7, mirror: 8 };

/** Bosses take turns: the Rubber King on waves 5, 15, 25..., the Bubble Queen on 10, 20, 30... */
export const bossFor = (n: number): EnemyType => ((n / 5) % 2 === 1 ? "boss" : "queen");

/** A wave's enemies. A co-op team of more than one gets a bigger budget. */
export function buildWave(n: number, rnd = Math.random, players = 1): EnemyType[] {
  const team = 1 + 0.6 * (Math.max(1, players) - 1);
  if (n % 5 === 0) {
    const out: EnemyType[] = [bossFor(n)];
    for (let i = 0; i < Math.round((n / 5 + 1) * team); i++) out.push("blob");
    return out;
  }
  let budget = Math.round((3 + Math.floor(n * 2.2)) * team);
  const pool = (Object.keys(COST) as EnemyType[]).filter((t) => (UNLOCK[t] ?? 99) <= n);
  const out: EnemyType[] = [];
  // Each new type shows up at least once on the wave it unlocks.
  const fresh = pool.find((t) => UNLOCK[t] === n);
  if (fresh) {
    out.push(fresh);
    budget -= COST[fresh]!;
  }
  while (budget > 0) {
    const ok = pool.filter((t) => COST[t]! <= budget);
    if (!ok.length) break;
    const t = ok[Math.floor(rnd() * ok.length)];
    out.push(t);
    budget -= COST[t]!;
  }
  return out;
}

function startWave(g: Game) {
  g.wave++;
  if (g.wave > 1 && g.wave % 3 === 1) {
    setLayout(g, Math.floor(g.wave / 3) % 7);
    for (const p of g.players) collideWorld(g, p);
  }
  g.queue = buildWave(g.wave, Math.random, g.players.length);
  g.spawnT = 0.4;
  const boss = g.wave % 5 === 0;
  g.banner = { text: boss ? "BOSS WAVE" : `WAVE ${g.wave}`, sub: boss ? (bossFor(g.wave) === "boss" ? "THE RUBBER KING" : "THE BUBBLE QUEEN") : "", t: 1.8 };
  g.sounds.push("wave");
}

function farFromPlayers(g: Game, x: number, y: number, min: number) {
  return g.players.every((p) => p.down || Math.hypot(x - p.x, y - p.y) >= min);
}

function spawnPoint(g: Game, r: number): { x: number; y: number } {
  for (let i = 0; i < 40; i++) {
    const side = Math.floor(Math.random() * 4);
    const x = side === 0 ? r + 4 : side === 1 ? W - r - 4 : r + Math.random() * (W - 2 * r);
    // the top strip is kept clear for the score and hearts
    const y = side === 2 ? 34 + r : side === 3 ? H - r - 4 : 34 + r + Math.random() * (H - 38 - 2 * r);
    if (!farFromPlayers(g, x, y, i < 30 ? 150 : 90)) continue;
    if (g.obstacles.some((o) => circleRect(x, y, r + 4, o))) continue;
    if (g.bumpers.some((b) => Math.hypot(x - b.x, y - b.y) < b.r + r + 4)) continue;
    return { x, y };
  }
  return { x: W / 2, y: 30 };
}

/** A free spot in the arena: clear of walls and bumpers, and at least `min` from every player. */
function freeSpot(g: Game, r: number, min: number): { x: number; y: number } {
  for (let i = 0; i < 40; i++) {
    const x = 20 + Math.random() * (W - 40);
    const y = 50 + Math.random() * (H - 80);
    if (!farFromPlayers(g, x, y, i < 30 ? min : 0)) continue;
    if (g.obstacles.some((o) => circleRect(x, y, r + 6, o))) continue;
    if (g.bumpers.some((b) => Math.hypot(x - b.x, y - b.y) < b.r + r + 6)) continue;
    return { x, y };
  }
  return { x: W / 2, y: H / 2 };
}

function makeEnemy(g: Game, type: EnemyType, x: number, y: number): Enemy {
  const d = ENEMY[type];
  const big = isBoss(type);
  const team = 1 + 0.5 * (g.players.length - 1);
  const hp = big ? Math.round((d.hp + g.wave) * team) : d.hp;
  const a = Math.random() * Math.PI * 2;
  const near = nearestPlayer(g, x, y);
  return {
    id: g.nextId++,
    type,
    x,
    y,
    vx: big ? Math.cos(a) * d.speed : 0,
    vy: big ? Math.abs(Math.sin(a)) * d.speed + 20 : 0,
    r: d.r,
    hp,
    maxHp: hp,
    state: 0,
    t: 0.8 + Math.random() * 0.8,
    fire: 1.5 + Math.random() * 1.5,
    face: near ? Math.atan2(near.y - y, near.x - x) : Math.PI / 2,
    frozen: 0,
    flash: 0,
    dead: false,
  };
}

// ---------- effects ----------

/** Particles flying out of a point. Exported so a network guest can replay the host's. */
export function burst(g: Game, x: number, y: number, color: string, n: number, speed = 120) {
  if (g.fx) g.fx.push({ k: "b", x, y, c: color, n, s: speed });
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + Math.random() * 0.9);
    g.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: 0.35 + Math.random() * 0.35, color, size: 2 + Math.random() * 2 });
  }
}

export function pop(g: Game, x: number, y: number, text: string, color = "#ffe14d") {
  if (g.fx) g.fx.push({ k: "p", x, y, text, c: color });
  g.pops.push({ x, y, text, color, t: 0 });
}

/** Particles, pop-up text, blasts and the like: the parts that keep moving after game over. */
export function stepEffects(g: Game, dt: number) {
  for (const pt of g.particles) {
    pt.t += dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.92;
    pt.vy *= 0.92;
  }
  g.particles = g.particles.filter((pt) => pt.t < pt.life);
  for (const pp of g.pops) (pp.t += dt), (pp.y -= 26 * dt);
  g.pops = g.pops.filter((pp) => pp.t < 1);
  g.shake = Math.max(0, g.shake - dt * 40);
  for (const bl of g.blasts) bl.t += dt;
  g.blasts = g.blasts.filter((bl) => bl.t < 0.4);
  for (const bp of g.bumpers) bp.flash -= dt;
  if (g.banner && (g.banner.t -= dt) <= 0) g.banner = null;
}

// ---------- shooting ----------

function makeBullet(g: Game, kind: BulletKind, owner: Bullet["owner"], pid: number, x: number, y: number, vx: number, vy: number, mini = false): Bullet {
  const info = BULLETS[kind];
  return {
    id: g.nextId++,
    kind,
    owner,
    pid,
    x,
    y,
    vx,
    vy,
    r: mini ? 3 : owner === "enemy" ? 5 : info.r,
    bounces: 0,
    maxBounces: mini ? 1 : owner === "enemy" ? 1 : info.bounces,
    walls: 0,
    kills: 0,
    age: 0,
    life: owner === "enemy" ? 5 : kind === "boomerang" ? 4 : kind === "bomb" ? 2.6 : 6,
    phased: false,
    mini,
    ignore: [],
    dead: false,
  };
}

/** Returns true when a shot went out. */
function shoot(g: Game, p: Player): boolean {
  if (p.cooldown > 0 || p.down || p.frozen > 0) return false;
  if (g.brawl && g.brawl.countdown > 0) return false;
  let kind = p.selected;
  if (p.ammo[kind] <= 0) kind = p.selected = "bouncer";
  const info = BULLETS[kind];
  const len = Math.hypot(p.aimX, p.aimY) || 1;
  const dx = p.aimX / len, dy = p.aimY / len;
  // Triple shot fans out everything except the catchable boomerang and the bomb.
  const spread = p.power.triple > 0 && kind !== "boomerang" && kind !== "bomb" ? [-0.22, 0, 0.22] : [0];
  for (const da of spread) {
    const c = Math.cos(da), s = Math.sin(da);
    const ux = dx * c - dy * s, uy = dx * s + dy * c;
    const b = makeBullet(g, kind, "player", p.id, p.x + ux * (p.r + 6), p.y + uy * (p.r + 6), ux * info.speed, uy * info.speed);
    // Fired point-blank into a wall: start it at the player so it bounces cleanly.
    if (collideWorld(g, { x: b.x, y: b.y, r: b.r })) (b.x = p.x), (b.y = p.y);
    g.bullets.push(b);
  }
  p.cooldown = info.cooldown * (p.power.rapid > 0 ? 0.5 : 1);
  if (kind !== "bouncer") {
    p.ammo[kind]--;
    if (p.ammo[kind] <= 0) p.selected = "bouncer";
  }
  g.sounds.push("shoot");
  return true;
}

function enemyShot(g: Game, x: number, y: number, angle: number, speed: number) {
  g.bullets.push(makeBullet(g, "bouncer", "enemy", -1, x, y, Math.cos(angle) * speed, Math.sin(angle) * speed));
}

// ---------- damage ----------

interface HurtFrom {
  /** The player whose bullet or blast it was. */
  from?: number;
  bank?: boolean;
  dmg?: number;
}

function hurtPlayer(g: Game, p: Player, by: string, src: HurtFrom = {}) {
  if (p.invuln > 0 || g.over || p.down) return;
  if (p.power.shield) {
    p.power.shield = false;
    p.invuln = 1;
    g.shake = 6;
    burst(g, p.x, p.y, POWERS.shield.color, 20, 150);
    pop(g, p.x, p.y - 18, "SHIELD POPPED", POWERS.shield.color);
    g.sounds.push("shield");
    return;
  }
  p.hearts -= src.dmg ?? 1;
  p.invuln = 1.4;
  g.shake = 10;
  burst(g, p.x, p.y, "#ffe14d", 18, 160);
  pop(g, p.x, p.y - 18, by, "#ff4d6d");
  g.sounds.push("hurt");
  if (p.hearts > 0) return;
  p.hearts = 0;
  burst(g, p.x, p.y, "#ff4d6d", 40, 220);
  if (g.mode === "brawl") return knockOut(g, p, src);
  p.down = true;
  if (g.players.every((q) => q.down)) {
    g.over = true;
    g.sounds.push("over");
  } else pop(g, p.x, p.y - 30, "DOWN! BACK NEXT WAVE", "#ece9ff");
}

function knockOut(g: Game, p: Player, src: HurtFrom) {
  const br = g.brawl!;
  p.down = true;
  p.respawn = RESPAWN;
  p.falls++;
  p.frozen = 0;
  p.power = { shield: false, rapid: 0, triple: 0 };
  g.shake = 14;
  const killer = src.from !== undefined && src.from !== p.id ? playerById(g, src.from) : null;
  if (killer) {
    const pts = src.bank ? 2 : 1;
    killer.points += pts;
    killer.kos++;
    pop(g, p.x, p.y - 30, src.bank ? `BANK KO! ${killer.name} +2` : `KO! ${killer.name} +1`, killer.color);
    if (killer.points >= br.target) endBrawl(g);
  } else {
    p.points = Math.max(0, p.points - 1);
    pop(g, p.x, p.y - 30, "OWN GOAL! -1", "#ff4d6d");
  }
}

function endBrawl(g: Game) {
  const br = g.brawl!;
  if (br.winner !== null) return;
  const top = Math.max(...g.players.map((p) => p.points));
  const leaders = g.players.filter((p) => p.points === top);
  br.winner = leaders.length === 1 ? leaders[0].id : -1;
  g.over = true;
  g.sounds.push("over");
  const w = playerById(g, br.winner);
  g.banner = { text: w ? `${w.name} WINS!` : "DRAW!", sub: w ? `${w.points} POINTS` : "", t: 5 };
}

function respawnPlayer(g: Game, p: Player) {
  // the spawn spot furthest from everyone still standing
  let best = BRAWL_SPAWNS[0];
  let bd = -1;
  for (const s of BRAWL_SPAWNS) {
    let d = Infinity;
    for (const q of g.players) if (q !== p && !q.down) d = Math.min(d, Math.hypot(q.x - s.x, q.y - s.y));
    for (const b of g.bullets) d = Math.min(d, Math.hypot(b.x - s.x, b.y - s.y) * 2);
    if (d > bd) (bd = d), (best = s);
  }
  p.x = best.x;
  p.y = best.y;
  collideWorld(g, p);
  p.down = false;
  p.hearts = MAX_HEARTS;
  p.invuln = 1.6;
  p.ammo = BRAWL_AMMO();
  p.selected = "bouncer";
  p.tp++;
  burst(g, p.x, p.y, p.color, 16, 120);
}

function damageEnemy(g: Game, e: Enemy, dmg: number, b: Bullet | null) {
  if (e.dead) return;
  e.hp -= dmg;
  e.flash = 0.1;
  g.sounds.push("hit");
  if (e.hp > 0) return;
  e.dead = true;
  g.kills++;
  const base = ENEMY[e.type].pts;
  let mult = 1;
  let label = "";
  const shooter = b ? playerById(g, b.pid) : null;
  if (b) {
    b.kills++;
    mult = Math.min(8, 2 ** (b.kills - 1));
    if (b.kills > 1) {
      label = `CHAIN x${mult}`;
      g.sounds.push("chain");
    }
    g.bestChain = Math.max(g.bestChain, b.kills);
    if (shooter) shooter.bestChain = Math.max(shooter.bestChain, b.kills);
    if (b.walls > 0) {
      mult *= 1.5;
      label = label ? `BANK ${label}` : "BANK SHOT";
    }
  }
  const pts = Math.round(base * mult);
  g.score += pts;
  if (shooter) {
    shooter.score += pts;
    shooter.kills++;
  }
  pop(g, e.x, e.y - e.r - 4, label ? `${label} +${pts}` : `+${pts}`, label ? "#ffe14d" : "#ece9ff");
  burst(g, e.x, e.y, ENEMY[e.type].color, isBoss(e.type) ? 60 : 14, isBoss(e.type) ? 240 : 140);
  g.sounds.push("kill");
  if (isBoss(e.type)) g.shake = 14;
  if (e.type === "fuse") explode(g, e.x, e.y, BLAST_R, b, "KABOOM!");
  if (e.type === "mama") {
    for (const s of [-1, 1]) {
      const kid = makeEnemy(g, "baby", e.x + s * 8, e.y);
      kid.vx = s * 120;
      g.enemies.push(kid);
    }
  }
  // Drops: specials keep the game interesting; hearts are rare.
  const roll = Math.random();
  if (isBoss(e.type)) {
    g.pickups.push({ x: e.x, y: e.y, kind: "heart", t: 0 });
    g.pickups.push({ x: e.x + 20, y: e.y, kind: randomSpecial(), t: 0 });
    g.pickups.push({ x: e.x - 20, y: e.y, kind: randomPower(), t: 0 });
  } else if (roll < 0.05) g.pickups.push({ x: e.x, y: e.y, kind: "heart", t: 0 });
  else if (roll < 0.24) g.pickups.push({ x: e.x, y: e.y, kind: randomSpecial(), t: 0 });
  else if (roll < 0.31) g.pickups.push({ x: e.x, y: e.y, kind: randomPower(), t: 0 });
}

const randomSpecial = () => SPECIALS[Math.floor(Math.random() * SPECIALS.length)];
const randomPower = () => POWER_KINDS[Math.floor(Math.random() * POWER_KINDS.length)];

/** A blast hurts every enemy in range (shields don't help) and every player standing in it. */
function explode(g: Game, x: number, y: number, radius: number, b: Bullet | null, by: string) {
  g.blasts.push({ x, y, r: radius, t: 0 });
  burst(g, x, y, "#ff8a3d", 26, 200);
  burst(g, x, y, "#ffe14d", 14, 120);
  g.shake = Math.max(g.shake, 8);
  g.sounds.push("boom");
  for (const e of [...g.enemies]) {
    if (!e.dead && Math.hypot(e.x - x, e.y - y) < radius + e.r) damageEnemy(g, e, 2, b);
  }
  for (const p of g.players) {
    if (!p.down && Math.hypot(p.x - x, p.y - y) < radius + p.r - 4) hurtPlayer(g, p, by, { from: b?.pid });
  }
}

function split(g: Game, b: Bullet) {
  const sp = Math.hypot(b.vx, b.vy);
  const a = Math.atan2(b.vy, b.vx);
  for (const da of [-0.45, 0, 0.45]) {
    const s = makeBullet(g, "bouncer", "player", b.pid, b.x, b.y, Math.cos(a + da) * sp, Math.sin(a + da) * sp, true);
    s.ignore = [...b.ignore];
    s.kills = b.kills;
    s.walls = b.walls;
    s.age = 0.2;
    g.bullets.push(s);
  }
  burst(g, b.x, b.y, BULLETS.splitter.color, 8, 90);
  b.dead = true;
}

/** A bullet hit a bumper: faster, no bounce used up, and it counts as a bank shot. */
function bumped(g: Game, b: Bullet, bp: Bumper) {
  bp.flash = 0.15;
  b.walls++;
  const sp = Math.hypot(b.vx, b.vy);
  const cap = BULLETS[b.kind].speed * 1.7;
  const k = Math.min(1.18, cap / sp);
  if (k > 1) (b.vx *= k), (b.vy *= k);
  if (g.mode !== "brawl") g.score += 10;
  g.sounds.push("boing");
  burst(g, b.x, b.y, "#ff2bd6", 4, 80);
  if (b.kind === "splitter" && !b.mini) split(g, b);
}

/** A bullet bounced off something solid. */
function bounced(g: Game, b: Bullet, wall: boolean) {
  b.bounces++;
  if (wall) b.walls++;
  if (b.kind === "splitter" && !b.mini) return split(g, b);
  if (b.kind === "bomb" && b.owner === "player" && b.bounces >= b.maxBounces) {
    b.dead = true;
    return explode(g, b.x, b.y, BLAST_R, b, "KABOOM!");
  }
  if (b.bounces > b.maxBounces) {
    b.dead = true;
    burst(g, b.x, b.y, b.owner === "enemy" ? "#ff8a3d" : BULLETS[b.kind].color, 4, 60);
  } else g.sounds.push("bounce");
}

/** Bounce a bullet off something round (an enemy or a player). */
function ricochet(g: Game, b: Bullet, o: { x: number; y: number; r: number }) {
  const dx = b.x - o.x, dy = b.y - o.y;
  const d = Math.hypot(dx, dy) || 1;
  reflect(b, dx / d, dy / d);
  b.x = o.x + (dx / d) * (o.r + b.r + 1);
  b.y = o.y + (dy / d) * (o.r + b.r + 1);
  bounced(g, b, false);
}

function hitEnemy(g: Game, b: Bullet, e: Enemy) {
  const sp = Math.hypot(b.vx, b.vy) || 1;
  const kx = b.vx / sp, ky = b.vy / sp;
  // Mirrors block anything that hits their shield from the front, unless they're glued.
  // Piercers slip past, boomerangs cut through, and bombs go off anyway.
  if (e.type === "mirror" && e.frozen <= 0 && b.kind !== "piercer" && b.kind !== "boomerang" && b.kind !== "bomb") {
    const ang = Math.atan2(b.y - e.y, b.x - e.x);
    const diff = Math.abs(((ang - e.face + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (diff < MIRROR_ARC) {
      const nx = Math.cos(ang), ny = Math.sin(ang);
      reflect(b, nx, ny);
      b.x = e.x + nx * (e.r + b.r + 5);
      b.y = e.y + ny * (e.r + b.r + 5);
      burst(g, b.x, b.y, "#ffffff", 5, 90);
      e.flash = 0.06;
      if (b.mini) b.dead = true;
      else bounced(g, b, false);
      return;
    }
  }
  b.ignore.push(e.id);
  switch (b.kind) {
    case "bouncer":
      damageEnemy(g, e, 1, b);
      if (b.mini) b.dead = true;
      else ricochet(g, b, e);
      break;
    case "piercer":
      if (!b.phased) {
        b.phased = true;
        burst(g, e.x, e.y, BULLETS.piercer.color, 5, 60);
      } else {
        damageEnemy(g, e, 2, b);
        b.dead = true;
      }
      break;
    case "splitter":
      damageEnemy(g, e, 1, b);
      split(g, b);
      break;
    case "boomerang":
      damageEnemy(g, e, 1, b);
      break;
    case "glue":
      for (const o of g.enemies) {
        if (Math.hypot(o.x - e.x, o.y - e.y) < e.r + o.r + 40) o.frozen = isBoss(o.type) ? 1.5 : 3.5;
      }
      damageEnemy(g, e, 1, b);
      burst(g, e.x, e.y, BULLETS.glue.color, 16, 100);
      g.sounds.push("freeze");
      b.dead = true;
      break;
    case "seeker":
      damageEnemy(g, e, 1, b);
      ricochet(g, b, e);
      break;
    case "bomb":
      b.dead = true;
      explode(g, b.x, b.y, BLAST_R, b, "KABOOM!");
      break;
  }
  // Brutes are so rubbery everything bounces off them.
  if (e.type === "brute" && !b.dead && b.kind !== "boomerang" && b.kind !== "piercer" && b.kind !== "seeker") ricochet(g, b, e);
  // big ones get knocked back along the shot
  if (e.type === "brute" || isBoss(e.type)) {
    e.x += kx * 4;
    e.y += ky * 4;
  }
}

/** Brawl: someone else's bullet hit a player. Each bullet does its own thing, as on enemies. */
function hitPlayer(g: Game, b: Bullet, q: Player) {
  b.ignore.push(q.id);
  const src: HurtFrom = { from: b.pid, bank: b.walls > 0 };
  const label = src.bank ? "BANK SHOT!" : "HIT!";
  switch (b.kind) {
    case "bouncer":
      hurtPlayer(g, q, label, src);
      if (b.mini) b.dead = true;
      else ricochet(g, b, q);
      break;
    case "piercer":
      if (!b.phased) {
        b.phased = true;
        burst(g, q.x, q.y, BULLETS.piercer.color, 5, 60);
      } else {
        hurtPlayer(g, q, "PIERCED!", { ...src, dmg: 2 });
        b.dead = true;
      }
      break;
    case "splitter":
      hurtPlayer(g, q, label, src);
      split(g, b);
      break;
    case "boomerang":
      hurtPlayer(g, q, label, src);
      break;
    case "glue":
      if (!q.power.shield) {
        q.frozen = FREEZE_PLAYER;
        pop(g, q.x, q.y - 18, "STUCK!", BULLETS.glue.color);
      } else hurtPlayer(g, q, label, src); // the shield eats it
      burst(g, q.x, q.y, BULLETS.glue.color, 16, 100);
      g.sounds.push("freeze");
      b.dead = true;
      break;
    case "seeker":
      hurtPlayer(g, q, label, src);
      ricochet(g, b, q);
      break;
    case "bomb":
      b.dead = true;
      explode(g, b.x, b.y, BLAST_R, b, "KABOOM!");
      break;
  }
}

// ---------- step ----------

const NO_INPUT: Input = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false };

/**
 * Advance the game. Pass one Input for a one-player game, or inputs keyed by player id.
 * Bots make up their own; players with no input stand still.
 */
export function step(g: Game, inputs: Input | Record<number, Input>, dt: number) {
  g.sounds.length = 0;
  dt = Math.min(dt, 1 / 30);
  g.time += dt;
  const byId: Record<number, Input> = "moveX" in inputs ? { [g.players[0]?.id ?? 0]: inputs as Input } : (inputs as Record<number, Input>);

  // effects keep animating after game over
  stepEffects(g, dt);
  if (g.over) return;

  if (g.brawl) stepBrawl(g, dt);

  // players
  for (const p of g.players) {
    const input = p.bot ? botInput(g, p, dt) : (byId[p.id] ?? NO_INPUT);
    p.cooldown -= dt;
    p.invuln -= dt;
    p.power.rapid = Math.max(0, p.power.rapid - dt);
    p.power.triple = Math.max(0, p.power.triple - dt);
    if (p.down) {
      if (g.mode === "brawl" && (p.respawn -= dt) <= 0) respawnPlayer(g, p);
      continue;
    }
    if (input.select && p.ammo[input.select] > 0) p.selected = input.select;
    if (input.shots !== undefined && input.shots > p.fireSeq) {
      p.fireSeq = input.shots;
      p.queued = 0.4;
    }
    p.queued -= dt;
    if (p.frozen > 0) {
      p.frozen -= dt;
      continue;
    }
    if (input.pos && (input.tp === undefined || input.tp === p.tp)) {
      p.x = input.pos.x;
      p.y = input.pos.y;
      p.walk = input.pos.walk;
      collideWorld(g, p);
    } else if (!input.pos) movePlayer(g, p, input.moveX, input.moveY, dt);
    if (Math.hypot(input.aimX, input.aimY) > 0.01) (p.aimX = input.aimX), (p.aimY = input.aimY);
    if ((input.fire || p.queued > 0) && shoot(g, p)) p.queued = 0;
  }

  // waves
  if (g.mode !== "brawl") {
    if (g.interT > 0) {
      g.interT -= dt;
      if (g.interT <= 0) startWave(g);
    } else if (g.queue.length) {
      g.spawnT -= dt;
      if (g.spawnT <= 0) {
        const type = g.queue.shift()!;
        const at = spawnPoint(g, ENEMY[type].r);
        g.warnings.push({ ...at, type, t: 0.9 });
        g.spawnT = Math.max(0.35, 1.1 - g.wave * 0.05) / (1 + 0.3 * (g.players.length - 1));
      }
    }
    for (const w of g.warnings) {
      w.t -= dt;
      if (w.t <= 0) g.enemies.push(makeEnemy(g, w.type, w.x, w.y));
    }
    g.warnings = g.warnings.filter((w) => w.t > 0);
  }

  updateEnemies(g, dt);
  updateBullets(g, dt);
  updatePickups(g, dt);

  // wave cleared
  if (g.mode !== "brawl" && !g.over && g.interT <= 0 && !g.queue.length && !g.warnings.length && !g.enemies.length) {
    if (g.wave > 0) {
      const bonus = 100 * g.wave;
      g.score += bonus;
      g.banner = { text: "CLEAR!", sub: `+${bonus}`, t: 1.4 };
      for (const p of g.players) if (!p.down && g.wave % 5 === 0 && p.hearts < MAX_HEARTS) p.hearts++;
      reviveDowned(g);
    }
    g.interT = g.wave === 0 ? 0.6 : 2;
    // enemy pellets fizzle between waves
    g.bullets = g.bullets.filter((b) => b.owner === "player");
  }
}

/** Co-op: teammates who went down come back for the next wave, next to someone still standing. */
function reviveDowned(g: Game) {
  const up = g.players.filter((p) => !p.down);
  if (!up.length) return;
  for (const p of g.players) {
    if (!p.down) continue;
    const buddy = up[Math.floor(Math.random() * up.length)];
    p.x = buddy.x + (Math.random() < 0.5 ? -26 : 26);
    p.y = buddy.y;
    collideWorld(g, p);
    p.down = false;
    p.hearts = 2;
    p.invuln = 2;
    p.tp++;
    burst(g, p.x, p.y, p.color, 16, 120);
    pop(g, p.x, p.y - 18, "BACK IN!", p.color);
  }
}

function stepBrawl(g: Game, dt: number) {
  const br = g.brawl!;
  if (br.countdown > 0) {
    const before = Math.ceil(br.countdown);
    br.countdown -= dt;
    const now = Math.ceil(br.countdown);
    if (br.countdown <= 0) {
      g.banner = { text: "BRAWL!", sub: `FIRST TO ${br.target}`, t: 1.2 };
      g.sounds.push("wave");
    } else if (now !== before || !g.banner) {
      g.banner = { text: String(now), sub: "GET READY", t: 1 };
      g.sounds.push("bounce");
    }
    return;
  }
  br.timeLeft -= dt;
  if (br.timeLeft <= 0) {
    br.timeLeft = 0;
    return endBrawl(g);
  }
  // supply drops keep the specials coming
  br.dropT -= dt;
  if (br.dropT <= 0) {
    br.dropT = 3 + Math.random() * 1.5;
    if (g.pickups.length < 2 + g.players.length) {
      const roll = Math.random();
      const kind: PickupKind = roll < 0.66 ? randomSpecial() : roll < 0.9 ? randomPower() : "heart";
      const at = freeSpot(g, 12, 70);
      g.pickups.push({ ...at, kind, t: 0 });
    }
  }
}

function updatePickups(g: Game, dt: number) {
  for (const pk of g.pickups) {
    pk.t += dt;
    if (pk.t >= 99) continue;
    for (const p of g.players) {
      if (p.down || Math.hypot(pk.x - p.x, pk.y - p.y) >= p.r + 12) continue;
      pk.t = 99;
      g.sounds.push("pickup");
      if (pk.kind === "heart") {
        const full = p.hearts >= MAX_HEARTS;
        if (!full) p.hearts++;
        else if (g.mode !== "brawl") g.score += 250;
        pop(g, pk.x, pk.y - 12, !full ? "+1 HEART" : g.mode === "brawl" ? "FULL" : "+250", "#ff4d6d");
      } else if (pk.kind === "shield" || pk.kind === "rapid" || pk.kind === "triple") {
        if (pk.kind === "shield") p.power.shield = true;
        else p.power[pk.kind] = POWER_TIME;
        g.sounds.push("power");
        pop(g, pk.x, pk.y - 12, POWERS[pk.kind].name.toUpperCase() + "!", POWERS[pk.kind].color);
      } else {
        const n = pk.kind === "glue" || pk.kind === "boomerang" || pk.kind === "bomb" ? 2 : 3;
        p.ammo[pk.kind] += n;
        pop(g, pk.x, pk.y - 12, `+${n} ${BULLETS[pk.kind].name.toUpperCase()}`, BULLETS[pk.kind].color);
      }
      break;
    }
  }
  g.pickups = g.pickups.filter((pk) => pk.t < (g.mode === "brawl" ? 12 : 9));
}

function updateEnemies(g: Game, dt: number) {
  for (const e of g.enemies) {
    e.flash -= dt;
    if (e.frozen > 0) {
      e.frozen -= dt;
      continue;
    }
    const p = nearestPlayer(g, e.x, e.y);
    // nobody left standing: just drift to a stop
    const tx = p ? p.x : e.x, ty = p ? p.y : e.y;
    const dx = tx - e.x, dy = ty - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const sp = p ? ENEMY[e.type].speed : 0;
    switch (e.type) {
      case "blob":
      case "baby":
      case "mama":
      case "brute":
      case "mirror": {
        // ease toward a chase velocity so knockbacks and splits feel springy
        const k = Math.min(1, dt * 4);
        e.vx += ((dx / d) * sp - e.vx) * k;
        e.vy += ((dy / d) * sp - e.vy) * k;
        if (e.type === "mirror") {
          // the shield swings round slowly, so you can get behind it
          const want = Math.atan2(dy, dx);
          const diff = ((want - e.face + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          e.face += clamp(diff, -1.5 * dt, 1.5 * dt);
        }
        break;
      }
      case "fuse":
        if (e.state === 0) {
          const k = Math.min(1, dt * 4);
          e.vx += ((dx / d) * sp - e.vx) * k;
          e.vy += ((dy / d) * sp - e.vy) * k;
          if (p && d < 60) (e.state = 1), (e.t = 0.8);
        } else {
          e.vx *= 0.8;
          e.vy *= 0.8;
          e.t -= dt;
          if (e.t <= 0) {
            e.dead = true;
            explode(g, e.x, e.y, BLAST_R, null, "KABOOM!");
          }
        }
        break;
      case "queen":
        // spiral of pellets, then a pause where she blows a couple of baby bubbles
        if (e.state === 0) {
          e.t -= dt;
          if (e.t <= 0) {
            e.state = 1;
            e.t = 1.6;
            const kids = g.enemies.filter((o) => o.type === "baby" && !o.dead).length;
            if (kids < 6)
              for (const s of [-1, 1]) {
                const kid = makeEnemy(g, "baby", e.x + s * 20, e.y);
                kid.vx = s * 140;
                g.enemies.push(kid);
              }
          }
        } else {
          e.t -= dt;
          e.fire -= dt;
          if (e.fire <= 0) {
            e.fire = 0.13;
            e.face += 0.45;
            for (const off of [0, Math.PI]) enemyShot(g, e.x, e.y, e.face + off, 115);
          }
          if (e.t <= 0) (e.state = 0), (e.t = Math.max(1.6, 2.8 - g.wave * 0.03));
        }
        break;
      case "dasher":
        e.t -= dt;
        if (e.state === 0) {
          e.vx *= 0.85;
          e.vy *= 0.85;
          if (e.t > 0.45) e.fire = Math.atan2(dy, dx); // aim, then lock for the last moment
          if (e.t <= 0) {
            e.state = 1;
            e.t = 0.6;
            e.vx = Math.cos(e.fire) * ENEMY.dasher.speed;
            e.vy = Math.sin(e.fire) * ENEMY.dasher.speed;
          }
        } else if (e.t <= 0) {
          e.state = 0;
          e.t = 1 + Math.random() * 0.6;
        }
        break;
      case "shooter": {
        const want = d > 190 ? 1 : d < 140 ? -1 : 0;
        const k = Math.min(1, dt * 3);
        e.vx += ((dx / d) * sp * want + (-dy / d) * sp * 0.6 - e.vx) * k;
        e.vy += ((dy / d) * sp * want + (dx / d) * sp * 0.6 - e.vy) * k;
        e.fire -= dt;
        if (e.fire <= 0 && p) {
          e.fire = 2.4 + Math.random();
          enemyShot(g, e.x, e.y, Math.atan2(dy, dx), 150);
        }
        break;
      }
      case "boss":
        e.fire -= dt;
        if (e.fire <= 0) {
          e.fire = Math.max(1.8, 3.4 - g.wave * 0.05);
          const n = 10;
          const off = Math.random();
          for (let i = 0; i < n; i++) enemyShot(g, e.x, e.y, ((i + off) / n) * Math.PI * 2, 120);
          g.shake = Math.max(g.shake, 4);
        }
        break;
    }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    const hit = collideWorld(g, e);
    if (hit && (isBoss(e.type) || (e.type === "dasher" && e.state === 1))) reflect(e, hit.nx, hit.ny);
  }
  // keep enemies from stacking up
  const es = g.enemies;
  for (let i = 0; i < es.length; i++)
    for (let j = i + 1; j < es.length; j++) {
      const a = es[i], b = es[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const min = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 < min * min && d2 > 0) {
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const wa = isBoss(a.type) ? 0 : 1, wb = isBoss(b.type) ? 0 : 1;
        a.x -= (dx / d) * push * wa;
        a.y -= (dy / d) * push * wa;
        b.x += (dx / d) * push * wb;
        b.y += (dy / d) * push * wb;
      }
    }
  for (const e of es) {
    if (e.dead || e.frozen > 0) continue;
    for (const p of g.players) {
      if (!p.down && Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.r - 2) hurtPlayer(g, p, "OUCH!");
    }
  }
  g.enemies = es.filter((e) => !e.dead);
}

function updateBullets(g: Game, dt: number) {
  const SUB = 3;
  const h = dt / SUB;
  const brawl = g.mode === "brawl";
  for (const b of g.bullets) {
    b.age += dt;
    if (b.age > b.life) {
      b.dead = true;
      if (b.kind === "bomb" && b.owner === "player") explode(g, b.x, b.y, BLAST_R, b, "KABOOM!");
      continue;
    }
    const me = b.owner === "player" ? playerById(g, b.pid) : null;
    if (b.kind === "seeker" && b.owner === "player" && b.age > 0.12) {
      let target: { x: number; y: number } | null = null;
      let bestD = 260;
      const consider = (o: { id: number; x: number; y: number }) => {
        if (b.ignore.includes(o.id)) return;
        const d = Math.hypot(o.x - b.x, o.y - b.y);
        if (d < bestD) (bestD = d), (target = o);
      };
      for (const e of g.enemies) if (!e.dead) consider(e);
      // in a brawl, seekers hunt the other players
      if (brawl) for (const q of g.players) if (!q.down && q.id !== b.pid && q.invuln <= 0) consider(q);
      if (target) {
        const tg = target as { x: number; y: number };
        const sp = Math.hypot(b.vx, b.vy);
        const cur = Math.atan2(b.vy, b.vx);
        const want = Math.atan2(tg.y - b.y, tg.x - b.x);
        const diff = ((want - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        // turn harder up close so it can't end up orbiting its target
        const rate = Math.max(4, (2.2 * sp) / bestD);
        const a = cur + clamp(diff, -rate * dt, rate * dt);
        b.vx = Math.cos(a) * sp;
        b.vy = Math.sin(a) * sp;
      }
    }
    if (b.kind === "boomerang" && b.age > 0.45 && me) {
      const dx = me.x - b.x, dy = me.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      b.vx += (dx / d) * 1100 * dt;
      b.vy += (dy / d) * 1100 * dt;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 380) (b.vx *= 380 / sp), (b.vy *= 380 / sp);
      if (d < me.r + b.r + 6 && !me.down) {
        b.dead = true;
        me.ammo.boomerang++;
        g.sounds.push("catch");
        pop(g, me.x, me.y - 18, "CAUGHT!", BULLETS.boomerang.color);
      }
    }
    for (let s = 0; s < SUB && !b.dead; s++) {
      b.x += b.vx * h;
      b.y += b.vy * h;
      const hit = collideWorld(g, b);
      if (hit && reflect(b, hit.nx, hit.ny)) {
        if (hit.bumper && b.owner === "player") bumped(g, b, hit.bumper);
        else bounced(g, b, true);
      }
      if (b.dead) break;
      if (b.owner === "player") {
        for (const e of g.enemies) {
          if (e.dead || b.ignore.includes(e.id)) continue;
          if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) {
            hitEnemy(g, b, e);
            if (b.dead) break;
          }
        }
      }
      if (b.dead) break;
      for (const q of g.players) {
        if (q.down || q.invuln > 0 || b.ignore.includes(q.id)) continue;
        if (Math.hypot(q.x - b.x, q.y - b.y) >= q.r + b.r - 1) continue;
        if (b.owner === "enemy") {
          b.dead = true;
          hurtPlayer(g, q, "HIT!");
        } else if (b.pid === q.id) {
          // Your own rubber comes back for you once it has bounced (or after a moment).
          if (b.kind === "boomerang" || (b.bounces === 0 && b.age <= 0.6)) continue;
          b.dead = true;
          if (b.kind === "bomb") explode(g, b.x, b.y, BLAST_R, b, "KABOOM!");
          else hurtPlayer(g, q, "OWN GOAL!", { from: q.id });
        } else if (brawl) hitPlayer(g, b, q);
        // co-op: a teammate's bullets pass straight through you
        if (b.dead) break;
      }
    }
  }
  g.bullets = g.bullets.filter((b) => !b.dead);
}

// ---------- bots ----------

/** A brawl bot: keeps its distance, strafes, dodges what's coming and grabs nearby pickups. */
function botInput(g: Game, p: Player, dt: number): Input {
  const br = p.bot!;
  br.think -= dt;
  br.strafeT -= dt;
  if (br.strafeT <= 0) {
    br.strafe = Math.random() < 0.5 ? -1 : 1;
    br.strafeT = 0.8 + Math.random() * 1.8;
  }
  const tgt = nearestPlayer(g, p.x, p.y, p.id);
  let mx = 0, my = 0;
  let td = Infinity;
  if (tgt) {
    if (br.target !== tgt.id) (br.target = tgt.id), (br.lastX = tgt.x), (br.lastY = tgt.y), (br.tvx = 0), (br.tvy = 0);
    // track the target's speed, for leading shots
    if (dt > 0) {
      const k = Math.min(1, dt * 6);
      br.tvx += ((tgt.x - br.lastX) / dt - br.tvx) * k;
      br.tvy += ((tgt.y - br.lastY) / dt - br.tvy) * k;
    }
    br.lastX = tgt.x;
    br.lastY = tgt.y;
    const dx = tgt.x - p.x, dy = tgt.y - p.y;
    td = Math.hypot(dx, dy) || 1;
    const want = td > 220 ? 1 : td < 120 ? -1 : 0;
    mx = (dx / td) * want + (-dy / td) * br.strafe * 0.8;
    my = (dy / td) * want + (dx / td) * br.strafe * 0.8;
  } else {
    mx = (W / 2 - p.x) / 100;
    my = (H / 2 - p.y) / 100;
  }
  // grab a pickup if one's close
  let pk: Pickup | null = null;
  let pd = 150;
  for (const k of g.pickups) {
    if (k.t >= 99) continue;
    const d = Math.hypot(k.x - p.x, k.y - p.y);
    if (d < pd) (pd = d), (pk = k);
  }
  if (pk) {
    const near = pk as Pickup;
    mx = mx * 0.3 + ((near.x - p.x) / pd) * 1.2;
    my = my * 0.3 + ((near.y - p.y) / pd) * 1.2;
  }
  // dodge bullets that are about to pass close by
  for (const b of g.bullets) {
    const mine = b.pid === p.id;
    if (mine && (b.kind === "boomerang" || (b.bounces === 0 && b.age <= 0.5))) continue;
    const rx = b.x - p.x, ry = b.y - p.y;
    const v2 = b.vx * b.vx + b.vy * b.vy || 1;
    const t = -(rx * b.vx + ry * b.vy) / v2;
    if (t < 0 || t > 0.45) continue;
    const cx = rx + b.vx * t, cy = ry + b.vy * t;
    const cd = Math.hypot(cx, cy);
    if (cd > p.r + b.r + 16) continue;
    // step sideways, away from where it'll pass
    const sx = cd > 0.5 ? -cx / cd : -b.vy / Math.sqrt(v2), sy = cd > 0.5 ? -cy / cd : b.vx / Math.sqrt(v2);
    mx += sx * 2.2;
    my += sy * 2.2;
  }
  // stay off the walls
  if (p.x < 30) mx += 0.8;
  if (p.x > W - 30) mx -= 0.8;
  if (p.y < 40) my += 0.8;
  if (p.y > H - 30) my -= 0.8;

  let ax = p.aimX, ay = p.aimY;
  let fire = false;
  let select: BulletKind | undefined;
  if (tgt) {
    const sp = BULLETS[p.selected].speed;
    const tt = Math.min(0.8, td / sp);
    const lx = tgt.x + br.tvx * tt * 0.8, ly = tgt.y + br.tvy * tt * 0.8;
    const a = Math.atan2(ly - p.y, lx - p.x) + br.err;
    ax = Math.cos(a);
    ay = Math.sin(a);
    if (br.think <= 0) {
      br.think = 0.2 + Math.random() * 0.35;
      br.err = (Math.random() - 0.5) * 0.6;
      // don't fire point-blank into cover, and hold fire while the target is respawn-proof
      const blocked = g.obstacles.some((o) => circleRect(p.x + ax * 16, p.y + ay * 16, 6, o));
      fire = td < 340 && tgt.invuln <= 0 && !blocked && Math.random() < 0.8;
      if (fire && p.selected === "bouncer" && Math.random() < 0.3) {
        const owned = SPECIALS.filter((k) => p.ammo[k] > 0 && !(k === "bomb" && td < 110));
        if (owned.length) select = owned[Math.floor(Math.random() * owned.length)];
      }
    }
  }
  return { moveX: mx, moveY: my, aimX: ax, aimY: ay, fire, select };
}

// ---------- joining mid-game ----------

/**
 * Someone joined an online game that's already running. Co-op: they drop in beside a
 * teammate. Brawl: they spawn somewhere quiet with no points.
 */
export function addPlayer(g: Game, seat: Seat): Player | null {
  if (g.players.length >= MAX_PLAYERS) return null;
  const used = new Set(g.players.map((p) => p.slot));
  let slot = 0;
  while (used.has(slot)) slot++;
  const p = makePlayer(g, slot, seat);
  g.players.push(p);
  if (g.mode === "brawl") {
    respawnPlayer(g, p);
  } else {
    const buddy = g.players.find((q) => q !== p && !q.down);
    if (buddy) {
      p.x = buddy.x + 26;
      p.y = buddy.y;
    }
    collideWorld(g, p);
    p.invuln = 2;
    p.tp++;
  }
  pop(g, p.x, p.y - 18, `${p.name} JOINED!`, p.color);
  return p;
}
