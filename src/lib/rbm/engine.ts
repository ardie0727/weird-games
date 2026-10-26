// Rubber Bullet Man: the whole game simulation. No DOM here, so it can run in tests.
// The arena is a fixed 360x600 world; the component scales it to the screen.

export const W = 360;
export const H = 600;

export type BulletKind = "bouncer" | "piercer" | "splitter" | "boomerang" | "glue";
export type EnemyType = "blob" | "baby" | "dasher" | "shooter" | "mama" | "brute" | "boss";

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
};

export const KINDS: BulletKind[] = ["bouncer", "piercer", "splitter", "boomerang", "glue"];

const ENEMY: Record<EnemyType, { r: number; hp: number; pts: number; speed: number; color: string }> = {
  blob: { r: 11, hp: 1, pts: 100, speed: 46, color: "#39ff88" },
  baby: { r: 7, hp: 1, pts: 50, speed: 72, color: "#8dffb9" },
  dasher: { r: 10, hp: 1, pts: 150, speed: 270, color: "#ff8a3d" },
  shooter: { r: 11, hp: 2, pts: 200, speed: 55, color: "#22f3ff" },
  mama: { r: 15, hp: 2, pts: 150, speed: 34, color: "#b26bff" },
  brute: { r: 18, hp: 4, pts: 300, speed: 30, color: "#ff4d6d" },
  boss: { r: 30, hp: 12, pts: 2000, speed: 80, color: "#ffe14d" },
};
export const enemyColor = (t: EnemyType) => ENEMY[t].color;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
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
  state: number; // 0 wait/aim, 1 dash (dasher)
  t: number;
  fire: number;
  frozen: number;
  flash: number;
  dead: boolean;
}

export interface Pickup {
  x: number;
  y: number;
  kind: BulletKind | "heart";
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

export type Sound = "shoot" | "bounce" | "hit" | "kill" | "hurt" | "pickup" | "wave" | "over" | "catch" | "chain" | "freeze";

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

const LAYOUTS: Rect[][] = [
  [],
  [
    { x: 70, y: 200, w: 44, h: 44 },
    { x: 246, y: 200, w: 44, h: 44 },
  ],
  [
    { x: 120, y: 270, w: 120, h: 18 },
    { x: 30, y: 140, w: 18, h: 70 },
    { x: 312, y: 140, w: 18, h: 70 },
  ],
  [
    { x: 60, y: 150, w: 36, h: 36 },
    { x: 264, y: 150, w: 36, h: 36 },
    { x: 60, y: 360, w: 36, h: 36 },
    { x: 264, y: 360, w: 36, h: 36 },
  ],
  [
    { x: 162, y: 120, w: 36, h: 120 },
    { x: 40, y: 330, w: 90, h: 18 },
    { x: 230, y: 330, w: 90, h: 18 },
  ],
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
    ammo: { bouncer: Infinity, piercer: 3, splitter: 2, boomerang: 1, glue: 1 },
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
function collideWorld(g: Game, o: { x: number; y: number; r: number }): { nx: number; ny: number } | null {
  let hit: { nx: number; ny: number } | null = null;
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

const COST: Partial<Record<EnemyType, number>> = { blob: 1, dasher: 2, shooter: 3, mama: 3, brute: 4 };
const UNLOCK: Partial<Record<EnemyType, number>> = { blob: 1, dasher: 2, shooter: 3, mama: 4, brute: 6 };

export function buildWave(n: number, rnd = Math.random): EnemyType[] {
  if (n % 5 === 0) {
    const out: EnemyType[] = ["boss"];
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
    g.obstacles = LAYOUTS[Math.floor(g.wave / 3) % LAYOUTS.length];
    collideWorld(g, g.player);
  }
  g.queue = buildWave(g.wave);
  g.spawnT = 0.4;
  const boss = g.wave % 5 === 0;
  g.banner = { text: boss ? "BOSS WAVE" : `WAVE ${g.wave}`, sub: boss ? "THE RUBBER KING" : "", t: 1.8 };
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
    return { x, y };
  }
  return { x: W / 2, y: 30 };
}

function makeEnemy(g: Game, type: EnemyType, x: number, y: number): Enemy {
  const d = ENEMY[type];
  const hp = type === "boss" ? d.hp + g.wave : d.hp;
  const a = Math.random() * Math.PI * 2;
  return {
    id: g.nextId++,
    type,
    x,
    y,
    vx: type === "boss" ? Math.cos(a) * d.speed : 0,
    vy: type === "boss" ? Math.abs(Math.sin(a)) * d.speed + 20 : 0,
    r: d.r,
    hp,
    maxHp: hp,
    state: 0,
    t: 0.8 + Math.random() * 0.8,
    fire: 1.5 + Math.random() * 1.5,
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
    life: owner === "enemy" ? 5 : kind === "boomerang" ? 4 : 6,
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
  const b = makeBullet(g, kind, "player", p.x + dx * (p.r + 6), p.y + dy * (p.r + 6), dx * info.speed, dy * info.speed);
  // Fired point-blank into a wall: start it at the player so it bounces cleanly.
  if (collideWorld(g, { x: b.x, y: b.y, r: b.r })) (b.x = p.x), (b.y = p.y);
  g.bullets.push(b);
  p.cooldown = info.cooldown;
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
  burst(g, e.x, e.y, ENEMY[e.type].color, e.type === "boss" ? 60 : 14, e.type === "boss" ? 240 : 140);
  g.sounds.push("kill");
  if (e.type === "boss") g.shake = 14;
  if (e.type === "mama") {
    for (const s of [-1, 1]) {
      const kid = makeEnemy(g, "baby", e.x + s * 8, e.y);
      kid.vx = s * 120;
      g.enemies.push(kid);
    }
  }
  // Drops: specials keep the game interesting; hearts are rare.
  const roll = Math.random();
  if (e.type === "boss") {
    g.pickups.push({ x: e.x, y: e.y, kind: "heart", t: 0 });
    g.pickups.push({ x: e.x + 20, y: e.y, kind: KINDS[1 + Math.floor(Math.random() * 4)], t: 0 });
  } else if (roll < 0.05) g.pickups.push({ x: e.x, y: e.y, kind: "heart", t: 0 });
  else if (roll < 0.24) g.pickups.push({ x: e.x, y: e.y, kind: KINDS[1 + Math.floor(Math.random() * 4)], t: 0 });
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

/** A bullet bounced off something solid. */
function bounced(g: Game, b: Bullet, wall: boolean) {
  b.bounces++;
  if (wall) b.walls++;
  if (b.kind === "splitter" && !b.mini) return split(g, b);
  if (b.bounces > b.maxBounces) {
    b.dead = true;
    burst(g, b.x, b.y, b.owner === "enemy" ? "#ff8a3d" : BULLETS[b.kind].color, 4, 60);
  } else g.sounds.push("bounce");
}

function hitEnemy(g: Game, b: Bullet, e: Enemy) {
  b.ignore.push(e.id);
  const sp = Math.hypot(b.vx, b.vy) || 1;
  const kx = b.vx / sp, ky = b.vy / sp;
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
        if (Math.hypot(o.x - e.x, o.y - e.y) < e.r + o.r + 40) o.frozen = o.type === "boss" ? 1.5 : 3.5;
      }
      damageEnemy(g, e, 1, b);
      burst(g, e.x, e.y, BULLETS.glue.color, 16, 100);
      g.sounds.push("freeze");
      b.dead = true;
      break;
  }
  // Brutes are so rubbery everything bounces off them.
  if (e.type === "brute" && !b.dead && b.kind !== "boomerang" && b.kind !== "piercer") ricochet();
  // big ones get knocked back along the shot
  if (e.type === "brute" || e.type === "boss") {
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
      } else {
        const n = pk.kind === "glue" || pk.kind === "boomerang" ? 2 : 3;
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
      case "brute": {
        // ease toward a chase velocity so knockbacks and splits feel springy
        const k = Math.min(1, dt * 4);
        e.vx += ((dx / d) * sp - e.vx) * k;
        e.vy += ((dy / d) * sp - e.vy) * k;
        break;
      }
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
    if (hit && (e.type === "boss" || (e.type === "dasher" && e.state === 1))) reflect(e, hit.nx, hit.ny);
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
        const wa = a.type === "boss" ? 0 : 1, wb = b.type === "boss" ? 0 : 1;
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
    if (b.age > b.life) b.dead = true;
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
      if (hit && reflect(b, hit.nx, hit.ny)) bounced(g, b, true);
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
        hurtPlayer(g, b.owner === "enemy" ? "HIT!" : "OWN GOAL!");
        b.dead = true;
      }
    }
  }
  g.bullets = g.bullets.filter((b) => !b.dead);
}
