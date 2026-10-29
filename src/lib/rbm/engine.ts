// Rubber Bullet Man: the whole game simulation. No DOM here, so it can run in tests.
// The arena is a fixed 360x600 world; the component scales it to the screen.

export const W = 360;
export const H = 600;

export type BulletKind = "bouncer" | "piercer" | "splitter" | "boomerang" | "glue" | "seeker" | "bomb";
export type EnemyType = "blob" | "baby" | "dasher" | "shooter" | "mama" | "brute" | "fuse" | "mirror" | "boss" | "queen";
export type PowerKind = "shield" | "rapid" | "triple";

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
export const isBoss = (t: EnemyType) => t === "boss" || t === "queen";
/** Half-width of a mirror's shield, in radians. */
export const MIRROR_ARC = 1.1;

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
  kind: BulletKind | PowerKind | "heart";
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

export interface Game {
  time: number;
  wave: number;
  score: number;
  kills: number;
  bestChain: number;
  hearts: number;
  player: { x: number; y: number; r: number; aimX: number; aimY: number; invuln: number; cooldown: number; walk: number };
  bullets: Bullet[];
  enemies: Enemy[];
  warnings: Warning[];
  pickups: Pickup[];
  particles: Particle[];
  pops: Pop[];
  obstacles: Rect[];
  bumpers: Bumper[];
  blasts: Blast[];
  power: { shield: boolean; rapid: number; triple: number };
  ammo: Record<BulletKind, number>;
  selected: BulletKind;
  queue: EnemyType[];
  spawnT: number;
  interT: number;
  banner: { text: string; sub: string; t: number } | null;
  shake: number;
  over: boolean;
  nextId: number;
  sounds: Sound[];
}

export interface Input {
  moveX: number;
  moveY: number;
  /** Aim direction (any length); zero keeps the last aim. */
  aimX: number;
  aimY: number;
  fire: boolean;
}

export const MAX_HEARTS = 3;
const PLAYER_SPEED = 150;

interface Layout {
  rects: Rect[];
  bumpers?: { x: number; y: number; r: number }[];
}

// Arenas rotate every third wave. Bumpers are pinball pads: they speed your bullets up and
// don't use up a bounce.
const LAYOUTS: Layout[] = [
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
];

export function newGame(): Game {
  const g: Game = {
    time: 0,
    wave: 0,
    score: 0,
    kills: 0,
    bestChain: 0,
    hearts: MAX_HEARTS,
    player: { x: W / 2, y: H - 90, r: 9, aimX: 0, aimY: -1, invuln: 0, cooldown: 0, walk: 0 },
    bullets: [],
    enemies: [],
    warnings: [],
    pickups: [],
    particles: [],
    pops: [],
    obstacles: [],
    bumpers: [],
    blasts: [],
    power: { shield: false, rapid: 0, triple: 0 },
    ammo: { bouncer: Infinity, piercer: 3, splitter: 2, boomerang: 1, glue: 1, seeker: 2, bomb: 1 },
    selected: "bouncer",
    queue: [],
    spawnT: 0,
    interT: 0.6,
    banner: null,
    shake: 0,
    over: false,
    nextId: 1,
    sounds: [],
  };
  return g;
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
function collideWorld(g: Game, o: { x: number; y: number; r: number }): { nx: number; ny: number; bumper?: Bumper } | null {
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
export function predictPath(g: Game, x: number, y: number, dx: number, dy: number, r: number, length = 320, maxBounces = 2): { x: number; y: number }[] {
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

// ---------- spawning ----------

const COST: Partial<Record<EnemyType, number>> = { blob: 1, dasher: 2, shooter: 3, mama: 3, brute: 4, fuse: 2, mirror: 3 };
const UNLOCK: Partial<Record<EnemyType, number>> = { blob: 1, dasher: 2, shooter: 3, mama: 4, brute: 6, fuse: 7, mirror: 8 };

/** Bosses take turns: the Rubber King on waves 5, 15, 25..., the Bubble Queen on 10, 20, 30... */
export const bossFor = (n: number): EnemyType => ((n / 5) % 2 === 1 ? "boss" : "queen");

export function buildWave(n: number, rnd = Math.random): EnemyType[] {
  if (n % 5 === 0) {
    const out: EnemyType[] = [bossFor(n)];
    for (let i = 0; i < n / 5 + 1; i++) out.push("blob");
    return out;
  }
  let budget = 3 + Math.floor(n * 2.2);
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
    const lay = LAYOUTS[Math.floor(g.wave / 3) % LAYOUTS.length];
    g.obstacles = lay.rects;
    g.bumpers = (lay.bumpers ?? []).map((b) => ({ ...b, flash: 0 }));
    collideWorld(g, g.player);
  }
  g.queue = buildWave(g.wave);
  g.spawnT = 0.4;
  const boss = g.wave % 5 === 0;
  g.banner = { text: boss ? "BOSS WAVE" : `WAVE ${g.wave}`, sub: boss ? (bossFor(g.wave) === "boss" ? "THE RUBBER KING" : "THE BUBBLE QUEEN") : "", t: 1.8 };
  g.sounds.push("wave");
}

function spawnPoint(g: Game, r: number): { x: number; y: number } {
  for (let i = 0; i < 40; i++) {
    const side = Math.floor(Math.random() * 4);
    const x = side === 0 ? r + 4 : side === 1 ? W - r - 4 : r + Math.random() * (W - 2 * r);
    // the top strip is kept clear for the score and hearts
    const y = side === 2 ? 34 + r : side === 3 ? H - r - 4 : 34 + r + Math.random() * (H - 38 - 2 * r);
    if (Math.hypot(x - g.player.x, y - g.player.y) < 150) continue;
    if (g.obstacles.some((o) => circleRect(x, y, r + 4, o))) continue;
    if (g.bumpers.some((b) => Math.hypot(x - b.x, y - b.y) < b.r + r + 4)) continue;
    return { x, y };
  }
  return { x: W / 2, y: 30 };
}

function makeEnemy(g: Game, type: EnemyType, x: number, y: number): Enemy {
  const d = ENEMY[type];
  const big = isBoss(type);
  const hp = big ? d.hp + g.wave : d.hp;
  const a = Math.random() * Math.PI * 2;
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
    face: Math.atan2(g.player.y - y, g.player.x - x),
    frozen: 0,
    flash: 0,
    dead: false,
  };
}

// ---------- effects ----------

function burst(g: Game, x: number, y: number, color: string, n: number, speed = 120) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + Math.random() * 0.9);
    g.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: 0.35 + Math.random() * 0.35, color, size: 2 + Math.random() * 2 });
  }
}

function pop(g: Game, x: number, y: number, text: string, color = "#ffe14d") {
  g.pops.push({ x, y, text, color, t: 0 });
}

// ---------- shooting ----------

function makeBullet(g: Game, kind: BulletKind, owner: Bullet["owner"], x: number, y: number, vx: number, vy: number, mini = false): Bullet {
  const info = BULLETS[kind];
  return {
    id: g.nextId++,
    kind,
    owner,
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

function shoot(g: Game) {
  const p = g.player;
  if (p.cooldown > 0) return;
  let kind = g.selected;
  if (g.ammo[kind] <= 0) kind = g.selected = "bouncer";
  const info = BULLETS[kind];
  const len = Math.hypot(p.aimX, p.aimY) || 1;
  const dx = p.aimX / len, dy = p.aimY / len;
  // Triple shot fans out everything except the catchable boomerang and the bomb.
  const spread = g.power.triple > 0 && kind !== "boomerang" && kind !== "bomb" ? [-0.22, 0, 0.22] : [0];
  for (const da of spread) {
    const c = Math.cos(da), s = Math.sin(da);
    const ux = dx * c - dy * s, uy = dx * s + dy * c;
    const b = makeBullet(g, kind, "player", p.x + ux * (p.r + 6), p.y + uy * (p.r + 6), ux * info.speed, uy * info.speed);
    // Fired point-blank into a wall: start it at the player so it bounces cleanly.
    if (collideWorld(g, { x: b.x, y: b.y, r: b.r })) (b.x = p.x), (b.y = p.y);
    g.bullets.push(b);
  }
  p.cooldown = info.cooldown * (g.power.rapid > 0 ? 0.5 : 1);
  if (kind !== "bouncer") {
    g.ammo[kind]--;
    if (g.ammo[kind] <= 0) g.selected = "bouncer";
  }
  g.sounds.push("shoot");
}

function enemyShot(g: Game, x: number, y: number, angle: number, speed: number) {
  g.bullets.push(makeBullet(g, "bouncer", "enemy", x, y, Math.cos(angle) * speed, Math.sin(angle) * speed));
}

// ---------- damage ----------

function hurtPlayer(g: Game, by: string) {
  const p = g.player;
  if (p.invuln > 0 || g.over) return;
  if (g.power.shield) {
    g.power.shield = false;
    p.invuln = 1;
    g.shake = 6;
    burst(g, p.x, p.y, POWERS.shield.color, 20, 150);
    pop(g, p.x, p.y - 18, "SHIELD POPPED", POWERS.shield.color);
    g.sounds.push("shield");
    return;
  }
  g.hearts--;
  p.invuln = 1.4;
  g.shake = 10;
  burst(g, p.x, p.y, "#ffe14d", 18, 160);
  pop(g, p.x, p.y - 18, by, "#ff4d6d");
  g.sounds.push("hurt");
  if (g.hearts <= 0) {
    g.over = true;
    g.sounds.push("over");
    burst(g, p.x, p.y, "#ff4d6d", 40, 220);
  }
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
  if (b) {
    b.kills++;
    mult = Math.min(8, 2 ** (b.kills - 1));
    if (b.kills > 1) {
      label = `CHAIN x${mult}`;
      g.sounds.push("chain");
    }
    g.bestChain = Math.max(g.bestChain, b.kills);
    if (b.walls > 0) {
      mult *= 1.5;
      label = label ? `BANK ${label}` : "BANK SHOT";
    }
  }
  const pts = Math.round(base * mult);
  g.score += pts;
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
  const special = () => SPECIALS[Math.floor(Math.random() * SPECIALS.length)];
  const power = () => POWER_KINDS[Math.floor(Math.random() * POWER_KINDS.length)];
  if (isBoss(e.type)) {
    g.pickups.push({ x: e.x, y: e.y, kind: "heart", t: 0 });
    g.pickups.push({ x: e.x + 20, y: e.y, kind: special(), t: 0 });
    g.pickups.push({ x: e.x - 20, y: e.y, kind: power(), t: 0 });
  } else if (roll < 0.05) g.pickups.push({ x: e.x, y: e.y, kind: "heart", t: 0 });
  else if (roll < 0.24) g.pickups.push({ x: e.x, y: e.y, kind: special(), t: 0 });
  else if (roll < 0.31) g.pickups.push({ x: e.x, y: e.y, kind: power(), t: 0 });
}

/** A blast hurts every enemy in range (shields don't help) and you too, if you're standing in it. */
function explode(g: Game, x: number, y: number, radius: number, b: Bullet | null, by: string) {
  g.blasts.push({ x, y, r: radius, t: 0 });
  burst(g, x, y, "#ff8a3d", 26, 200);
  burst(g, x, y, "#ffe14d", 14, 120);
  g.shake = Math.max(g.shake, 8);
  g.sounds.push("boom");
  for (const e of [...g.enemies]) {
    if (!e.dead && Math.hypot(e.x - x, e.y - y) < radius + e.r) damageEnemy(g, e, 2, b);
  }
  const p = g.player;
  if (Math.hypot(p.x - x, p.y - y) < radius + p.r - 4) hurtPlayer(g, by);
}

function split(g: Game, b: Bullet) {
  const sp = Math.hypot(b.vx, b.vy);
  const a = Math.atan2(b.vy, b.vx);
  for (const da of [-0.45, 0, 0.45]) {
    const s = makeBullet(g, "bouncer", "player", b.x, b.y, Math.cos(a + da) * sp, Math.sin(a + da) * sp, true);
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
  g.score += 10;
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
  const ricochet = () => {
    const dx = b.x - e.x, dy = b.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    reflect(b, dx / d, dy / d);
    b.x = e.x + (dx / d) * (e.r + b.r + 1);
    b.y = e.y + (dy / d) * (e.r + b.r + 1);
    bounced(g, b, false);
  };
  switch (b.kind) {
    case "bouncer":
      damageEnemy(g, e, 1, b);
      if (b.mini) b.dead = true;
      else ricochet();
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
      ricochet();
      break;
    case "bomb":
      b.dead = true;
      explode(g, b.x, b.y, BLAST_R, b, "KABOOM!");
      break;
  }
  // Brutes are so rubbery everything bounces off them.
  if (e.type === "brute" && !b.dead && b.kind !== "boomerang" && b.kind !== "piercer" && b.kind !== "seeker") ricochet();
  // big ones get knocked back along the shot
  if (e.type === "brute" || isBoss(e.type)) {
    e.x += kx * 4;
    e.y += ky * 4;
  }
}

// ---------- step ----------

export function step(g: Game, input: Input, dt: number) {
  g.sounds.length = 0;
  dt = Math.min(dt, 1 / 30);
  g.time += dt;
  const p = g.player;

  // effects keep animating after game over
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
  if (g.over) return;

  // player
  const ml = Math.hypot(input.moveX, input.moveY);
  if (ml > 0.05) {
    const s = Math.min(1, ml) / ml;
    p.x += input.moveX * s * PLAYER_SPEED * dt;
    p.y += input.moveY * s * PLAYER_SPEED * dt;
    p.walk += dt * 10;
  }
  collideWorld(g, p);
  if (Math.hypot(input.aimX, input.aimY) > 0.01) (p.aimX = input.aimX), (p.aimY = input.aimY);
  p.cooldown -= dt;
  p.invuln -= dt;
  g.power.rapid = Math.max(0, g.power.rapid - dt);
  g.power.triple = Math.max(0, g.power.triple - dt);
  if (input.fire) shoot(g);

  // waves
  if (g.interT > 0) {
    g.interT -= dt;
    if (g.interT <= 0) startWave(g);
  } else if (g.queue.length) {
    g.spawnT -= dt;
    if (g.spawnT <= 0) {
      const type = g.queue.shift()!;
      const at = spawnPoint(g, ENEMY[type].r);
      g.warnings.push({ ...at, type, t: 0.9 });
      g.spawnT = Math.max(0.35, 1.1 - g.wave * 0.05);
    }
  }
  for (const w of g.warnings) {
    w.t -= dt;
    if (w.t <= 0) g.enemies.push(makeEnemy(g, w.type, w.x, w.y));
  }
  g.warnings = g.warnings.filter((w) => w.t > 0);

  updateEnemies(g, dt);
  updateBullets(g, dt);

  // pickups
  for (const pk of g.pickups) {
    pk.t += dt;
    if (Math.hypot(pk.x - p.x, pk.y - p.y) < p.r + 12) {
      pk.t = 99;
      g.sounds.push("pickup");
      if (pk.kind === "heart") {
        if (g.hearts < MAX_HEARTS) g.hearts++;
        else g.score += 250;
        pop(g, pk.x, pk.y - 12, g.hearts < MAX_HEARTS ? "+1 HEART" : "+250", "#ff4d6d");
      } else if (pk.kind === "shield" || pk.kind === "rapid" || pk.kind === "triple") {
        if (pk.kind === "shield") g.power.shield = true;
        else g.power[pk.kind] = POWER_TIME;
        g.sounds.push("power");
        pop(g, pk.x, pk.y - 12, POWERS[pk.kind].name.toUpperCase() + "!", POWERS[pk.kind].color);
      } else {
        const n = pk.kind === "glue" || pk.kind === "boomerang" || pk.kind === "bomb" ? 2 : 3;
        g.ammo[pk.kind] += n;
        pop(g, pk.x, pk.y - 12, `+${n} ${BULLETS[pk.kind].name.toUpperCase()}`, BULLETS[pk.kind].color);
      }
    }
  }
  g.pickups = g.pickups.filter((pk) => pk.t < 9);

  // wave cleared
  if (g.interT <= 0 && !g.queue.length && !g.warnings.length && !g.enemies.length) {
    if (g.wave > 0) {
      const bonus = 100 * g.wave;
      g.score += bonus;
      g.banner = { text: "CLEAR!", sub: `+${bonus}`, t: 1.4 };
      if (g.wave % 5 === 0 && g.hearts < MAX_HEARTS) g.hearts++;
    }
    g.interT = g.wave === 0 ? 0.6 : 2;
    // enemy pellets fizzle between waves
    g.bullets = g.bullets.filter((b) => b.owner === "player");
  }
}

function updateEnemies(g: Game, dt: number) {
  const p = g.player;
  for (const e of g.enemies) {
    e.flash -= dt;
    if (e.frozen > 0) {
      e.frozen -= dt;
      continue;
    }
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const sp = ENEMY[e.type].speed;
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
          if (d < 60) (e.state = 1), (e.t = 0.8);
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
          if (e.t > 0.45) (e.fire = Math.atan2(dy, dx)); // aim, then lock for the last moment
          if (e.t <= 0) {
            e.state = 1;
            e.t = 0.6;
            e.vx = Math.cos(e.fire) * sp;
            e.vy = Math.sin(e.fire) * sp;
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
        if (e.fire <= 0) {
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
    if (!e.dead && e.frozen <= 0 && Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.r - 2) hurtPlayer(g, "OUCH!");
  }
  g.enemies = es.filter((e) => !e.dead);
}

function updateBullets(g: Game, dt: number) {
  const p = g.player;
  const SUB = 3;
  const h = dt / SUB;
  for (const b of g.bullets) {
    b.age += dt;
    if (b.age > b.life) {
      b.dead = true;
      if (b.kind === "bomb" && b.owner === "player") explode(g, b.x, b.y, BLAST_R, b, "KABOOM!");
      continue;
    }
    if (b.kind === "seeker" && b.owner === "player" && b.age > 0.12) {
      let target: Enemy | null = null;
      let bestD = 260;
      for (const e of g.enemies) {
        if (e.dead || b.ignore.includes(e.id)) continue;
        const d = Math.hypot(e.x - b.x, e.y - b.y);
        if (d < bestD) (bestD = d), (target = e);
      }
      if (target) {
        const sp = Math.hypot(b.vx, b.vy);
        const cur = Math.atan2(b.vy, b.vx);
        const want = Math.atan2(target.y - b.y, target.x - b.x);
        const diff = ((want - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        // turn harder up close so it can't end up orbiting its target
        const rate = Math.max(4, (2.2 * sp) / bestD);
        const a = cur + clamp(diff, -rate * dt, rate * dt);
        b.vx = Math.cos(a) * sp;
        b.vy = Math.sin(a) * sp;
      }
    }
    if (b.kind === "boomerang" && b.age > 0.45) {
      const dx = p.x - b.x, dy = p.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      b.vx += (dx / d) * 1100 * dt;
      b.vy += (dy / d) * 1100 * dt;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 380) (b.vx *= 380 / sp), (b.vy *= 380 / sp);
      if (d < p.r + b.r + 6) {
        b.dead = true;
        g.ammo.boomerang++;
        g.sounds.push("catch");
        pop(g, p.x, p.y - 18, "CAUGHT!", BULLETS.boomerang.color);
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
      // Your own rubber comes back for you once it has bounced (or after a moment).
      const armed = b.owner === "enemy" || (b.kind !== "boomerang" && (b.bounces > 0 || b.age > 0.6));
      if (armed && p.invuln <= 0 && Math.hypot(p.x - b.x, p.y - b.y) < p.r + b.r - 1) {
        b.dead = true;
        if (b.kind === "bomb" && b.owner === "player") explode(g, b.x, b.y, BLAST_R, b, "KABOOM!");
        else hurtPlayer(g, b.owner === "enemy" ? "HIT!" : "OWN GOAL!");
      }
    }
  }
  g.bullets = g.bullets.filter((b) => !b.dead);
}
