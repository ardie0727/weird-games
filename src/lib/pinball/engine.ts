// Pinball Dungeon: the game engine. You are the pinball.
//
// Each room of the dungeon is a small pinball table with monsters on it. Smash the ball
// into them until they are all dead, then pick an upgrade and drop into the next room.
// Drain your last ball down the middle and the run is over. Skeleton archers and the
// bosses shoot at your flippers and freeze them for a moment.
//
// Pure data and functions with a fixed physics step, deterministic from the seed, so the
// bot script (scripts/pinball-sim.ts) can play whole runs without a browser.

import { Rng } from "../rng.ts";

export const W = 360;
export const H = 600;
export const STEP = 1 / 480; // physics step in seconds
export const ROOMS = 12;
export const BALL_R = 7;
const GRAV = 820;
const MAX_V = 1500;

export interface V {
  x: number;
  y: number;
}
export interface Seg {
  a: V;
  b: V;
}

// ---------- the table ----------

export const PIVOT_L: V = { x: 110, y: 540 };
export const PIVOT_R: V = { x: 250, y: 540 };
const REST = 0.5;
const UP = -0.45;
export const FLIP_R = 5;

export const WALLS: Seg[] = [
  { a: { x: 8, y: 420 }, b: { x: 8, y: 64 } },
  { a: { x: 8, y: 64 }, b: { x: 56, y: 8 } },
  { a: { x: 56, y: 8 }, b: { x: 304, y: 8 } },
  { a: { x: 304, y: 8 }, b: { x: 352, y: 64 } },
  { a: { x: 352, y: 64 }, b: { x: 352, y: 420 } },
  { a: { x: 8, y: 420 }, b: { x: 104, y: 535 } },
  { a: { x: 352, y: 420 }, b: { x: 256, y: 535 } },
];

export interface Flipper {
  pivot: V;
  side: 1 | -1; // +1: tip points right (left flipper)
  len: number;
  ang: number;
  omega: number;
  pressed: boolean;
  frozen: number; // seconds left frozen by an arrow or fireball
}

export function flipperTip(f: Flipper, a = f.ang): V {
  return { x: f.pivot.x + f.side * Math.cos(a) * f.len, y: f.pivot.y + Math.sin(a) * f.len };
}

// ---------- monsters ----------

export type MonsterKind = "slime" | "mini" | "skeleton" | "bat" | "knight" | "ghost" | "mimic" | "kingslime" | "dragon" | "lich" | "skull";
export const MONSTERS: Record<MonsterKind, { name: string; r: number; hp: number; pts: number; boss?: boolean; note: string }> = {
  slime: { name: "Slime", r: 13, hp: 2, pts: 50, note: "Splits in two." },
  mini: { name: "Slimelet", r: 9, hp: 1, pts: 25, note: "" },
  skeleton: { name: "Skeleton Archer", r: 13, hp: 3, pts: 100, note: "Shoots your flippers. Hit an arrow with the ball to break it." },
  bat: { name: "Bat", r: 11, hp: 1, pts: 75, note: "Flaps about." },
  knight: { name: "Knight", r: 14, hp: 4, pts: 150, note: "Armoured. Only a hard, fast hit hurts." },
  ghost: { name: "Ghost", r: 12, hp: 2, pts: 120, note: "Fades out now and then. The ball goes right through." },
  mimic: { name: "Mimic", r: 13, hp: 3, pts: 400, note: "A treasure chest with teeth. Big points." },
  kingslime: { name: "KING SLIME", r: 40, hp: 40, pts: 3000, boss: true, note: "" },
  dragon: { name: "BONE DRAGON", r: 34, hp: 70, pts: 5000, boss: true, note: "" },
  lich: { name: "THE LICH", r: 30, hp: 90, pts: 9000, boss: true, note: "" },
  skull: { name: "Skull", r: 9, hp: 999, pts: 0, note: "" },
};
export const BOSS_ROOM: Record<number, MonsterKind> = { 4: "kingslime", 8: "dragon", 12: "lich" };

export interface Monster {
  id: number;
  kind: MonsterKind;
  x: number;
  y: number;
  r: number;
  hp: number;
  max: number;
  hitCd: number;
  hurt: number;
  burn: number;
  cd: number;
  t: number; // own clock, drives movement
  ax: number; // anchor
  ay: number;
  phase: number; // ghosts: >0 means faded out
  owner: number; // skulls orbit this boss id
}

export interface Bumper {
  x: number;
  y: number;
  r: number;
  lit: number;
}

export interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: "arrow" | "fire";
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  trail: V[];
  still: number;
}

// ---------- upgrades ----------

export type UpgradeId = "heavy" | "fire" | "split" | "long" | "saver" | "extra" | "spark" | "shield" | "homing" | "snap" | "crit" | "post";
export const UPGRADES: Record<UpgradeId, { name: string; desc: string; max: number }> = {
  heavy: { name: "Lead Core", desc: "+1 damage on every hit.", max: 3 },
  fire: { name: "Fireball", desc: "Hits set monsters on fire for a few seconds.", max: 2 },
  split: { name: "Split Ball", desc: "Start every room with one more ball (multiball!).", max: 2 },
  long: { name: "Long Flippers", desc: "Flippers grow longer. Harder to drain.", max: 2 },
  saver: { name: "Ball Saver", desc: "Drains in the first seconds of a room are free. Lasts longer.", max: 2 },
  extra: { name: "Extra Ball", desc: "+1 ball in reserve.", max: 9 },
  spark: { name: "Live Wire", desc: "Mushroom bumpers zap the nearest monster.", max: 2 },
  shield: { name: "Flipper Guards", desc: "Arrows and fire can't freeze your flippers.", max: 1 },
  homing: { name: "Lodestone", desc: "The ball curves gently toward monsters.", max: 2 },
  snap: { name: "Snappy Flips", desc: "Flippers swing faster and hit harder.", max: 2 },
  crit: { name: "Lucky Dent", desc: "Hits sometimes do triple damage.", max: 2 },
  post: { name: "Centre Post", desc: "A post guards the drain for the first 12s of each room.", max: 1 },
};
export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];

// ---------- the run ----------

export type Phase = "ready" | "play" | "pick" | "dead" | "won";

export type Fx =
  | { k: "hit"; x: number; y: number; big: boolean }
  | { k: "kill"; x: number; y: number; boss: boolean }
  | { k: "pop"; x: number; y: number; text: string; tone: "good" | "bad" | "gold" }
  | { k: "freeze"; x: number; y: number }
  | { k: "zap"; x: number; y: number; x2: number; y2: number }
  | { k: "snd"; name: SoundName };

export type SoundName = "flip" | "hit" | "bump" | "kill" | "boss" | "drain" | "saved" | "clear" | "dead" | "won" | "arrow" | "freeze" | "clink" | "launch" | "split";

export interface Run {
  rng: Rng;
  seed: number;
  room: number;
  phase: Phase;
  time: number;
  roomTime: number;
  score: number;
  lives: number;
  balls: Ball[];
  flippers: [Flipper, Flipper];
  monsters: Monster[];
  bumpers: Bumper[];
  pegs: V[];
  shots: Shot[];
  ups: Partial<Record<UpgradeId, number>>;
  offer: UpgradeId[];
  combo: number;
  bestCombo: number;
  kills: number;
  nextId: number;
  fx: Fx[];
  shake: number;
  bossName: string;
}

export const lv = (r: Run, u: UpgradeId) => r.ups[u] ?? 0;

export function newRun(seed: number): Run {
  const mk = (pivot: V, side: 1 | -1): Flipper => ({ pivot, side, len: 60, ang: REST, omega: 0, pressed: false, frozen: 0 });
  const r: Run = {
    rng: new Rng(seed),
    seed,
    room: 1,
    phase: "ready",
    time: 0,
    roomTime: 0,
    score: 0,
    lives: 3,
    balls: [],
    flippers: [mk(PIVOT_L, 1), mk(PIVOT_R, -1)],
    monsters: [],
    bumpers: [],
    pegs: [],
    shots: [],
    ups: {},
    offer: [],
    combo: 0,
    bestCombo: 0,
    kills: 0,
    nextId: 1,
    fx: [],
    shake: 0,
    bossName: "",
  };
  buildRoom(r);
  return r;
}

function addMonster(r: Run, kind: MonsterKind, x: number, y: number, owner = 0): Monster {
  const d = MONSTERS[kind];
  const bonus = d.boss || kind === "skull" ? 0 : Math.floor((r.room - 1) / 3);
  const m: Monster = { id: r.nextId++, kind, x, y, r: d.r, hp: d.hp + bonus, max: d.hp + bonus, hitCd: 0, hurt: 0, burn: 0, cd: 2 + r.rng.next() * 3, t: r.rng.next() * 10, ax: x, ay: y, phase: 0, owner };
  r.monsters.push(m);
  return m;
}

function fits(r: Run, x: number, y: number, rad: number) {
  for (const m of r.monsters) if (Math.hypot(m.x - x, m.y - y) < m.r + rad + 22) return false;
  for (const b of r.bumpers) if (Math.hypot(b.x - x, b.y - y) < b.r + rad + 22) return false;
  for (const p of r.pegs) if (Math.hypot(p.x - x, p.y - y) < rad + 26) return false;
  return true;
}

function place(r: Run, rad: number, y0 = 70, y1 = 380): V | null {
  for (let i = 0; i < 80; i++) {
    const x = r.rng.int(40 + rad, W - 40 - rad), y = r.rng.int(y0, y1);
    if (fits(r, x, y, rad)) return { x, y };
  }
  return null;
}

export function buildRoom(r: Run) {
  const rng = r.rng;
  r.monsters = [];
  r.bumpers = [];
  r.pegs = [];
  r.shots = [];
  r.balls = [];
  r.combo = 0;
  r.roomTime = 0;
  r.phase = "ready";
  r.bossName = "";
  for (const f of r.flippers) {
    f.len = 60 + lv(r, "long") * 9;
    f.ang = REST;
    f.omega = 0;
    f.frozen = 0;
    f.pressed = false;
  }
  const boss = BOSS_ROOM[r.room];
  if (boss) {
    const b = addMonster(r, boss, W / 2, 150);
    r.bossName = MONSTERS[boss].name;
    if (boss === "lich") for (let i = 0; i < 3; i++) addMonster(r, "skull", b.x, b.y, b.id).t = (i / 3) * Math.PI * 2;
    if (boss === "kingslime") {
      addMonster(r, "slime", 80, 300);
      addMonster(r, "slime", 280, 300);
    }
    if (boss === "dragon") addMonster(r, "skeleton", 70, 330);
    r.bumpers.push({ x: 90, y: 400, r: 14, lit: 0 }, { x: 270, y: 400, r: 14, lit: 0 });
  } else {
    // mushroom bumpers and stone pegs first, then the monsters around them
    const nb = rng.int(1, 3);
    for (let i = 0; i < nb; i++) {
      const p = place(r, 14, 120, 400);
      if (p) r.bumpers.push({ ...p, r: 14, lit: 0 });
    }
    const np = rng.int(0, 4);
    for (let i = 0; i < np; i++) {
      const p = place(r, 6, 100, 420);
      if (p) r.pegs.push(p);
    }
    const n = Math.min(9, 3 + Math.floor(r.room * 0.6));
    const pool: MonsterKind[] = ["slime", "slime", "bat"];
    if (r.room >= 2) pool.push("skeleton", "bat");
    if (r.room >= 3) pool.push("knight", "mimic");
    if (r.room >= 5) pool.push("ghost", "skeleton", "knight");
    if (r.room >= 9) pool.push("ghost", "skeleton");
    let archers = 0;
    for (let i = 0; i < n; i++) {
      let kind = rng.pick(pool);
      if (kind === "skeleton" && archers >= 1 + Math.floor(r.room / 4)) kind = "slime";
      if (kind === "mimic" && r.monsters.some((m) => m.kind === "mimic")) kind = "bat";
      if (kind === "skeleton") archers++;
      const p = place(r, MONSTERS[kind].r, 60, kind === "skeleton" ? 220 : 370);
      if (p) addMonster(r, kind, p.x, p.y);
    }
  }
  if (boss) r.fx.push({ k: "snd", name: "boss" });
}

function newBall(x: number, y: number, vx = 0, vy = 0): Ball {
  return { x, y, vx, vy, trail: [], still: 0 };
}

/** Drop the ball(s) in from the top and start the room. */
export function launch(r: Run) {
  if (r.phase !== "ready") return;
  r.phase = "play";
  const n = 1 + lv(r, "split");
  for (let i = 0; i < n; i++) r.balls.push(newBall(W / 2 + (i - (n - 1) / 2) * 30, 40, (r.rng.next() - 0.5) * 160, 60));
  r.fx.push({ k: "snd", name: "launch" });
}

export function press(r: Run, side: 0 | 1, down: boolean) {
  const f = r.flippers[side];
  if (down && !f.pressed && f.frozen <= 0) r.fx.push({ k: "snd", name: "flip" });
  f.pressed = down;
  if (down && r.phase === "ready") launch(r);
}

// ---------- physics ----------

function closestOnSeg(p: V, a: V, b: V): { c: V; t: number } {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return { c: { x: a.x + dx * t, y: a.y + dy * t }, t };
}

/** Push the ball out of a circle or capsule edge and bounce it off a surface moving at (sx, sy). */
function bounce(ball: Ball, cx: number, cy: number, minD: number, e: number, sx = 0, sy = 0): number {
  let nx = ball.x - cx, ny = ball.y - cy;
  const d = Math.hypot(nx, ny);
  if (d >= minD) return 0;
  if (d < 1e-6) {
    nx = 0;
    ny = -1;
  } else {
    nx /= d;
    ny /= d;
  }
  ball.x = cx + nx * minD;
  ball.y = cy + ny * minD;
  const rvx = ball.vx - sx, rvy = ball.vy - sy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0.0001;
  ball.vx -= (1 + e) * vn * nx;
  ball.vy -= (1 + e) * vn * ny;
  return -vn;
}

function flipperStep(r: Run, f: Flipper, dt: number) {
  if (f.frozen > 0) f.frozen -= dt;
  const want = f.pressed && f.frozen <= 0 ? UP : REST;
  const speed = (want === UP ? 22 : 15) * (1 + lv(r, "snap") * 0.15);
  const prev = f.ang;
  if (f.ang > want) f.ang = Math.max(want, f.ang - speed * dt);
  else f.ang = Math.min(want, f.ang + speed * dt);
  f.omega = (f.ang - prev) / dt;
}

function hitMonster(r: Run, m: Monster, ball: Ball, impact: number) {
  if (m.kind === "skull") {
    r.fx.push({ k: "snd", name: "clink" });
    return;
  }
  if (m.hitCd > 0) return;
  m.hitCd = 0.12;
  if (m.kind === "knight" && impact < 430) {
    r.fx.push({ k: "pop", x: m.x, y: m.y - m.r, text: "CLANG", tone: "bad" });
    r.fx.push({ k: "snd", name: "clink" });
    return;
  }
  let dmg = 1 + lv(r, "heavy");
  const crit = lv(r, "crit") && r.rng.chance(0.12 * lv(r, "crit"));
  if (crit) dmg *= 3;
  if (lv(r, "fire")) m.burn = 1.5 + lv(r, "fire") * 1.5;
  r.combo++;
  r.bestCombo = Math.max(r.bestCombo, r.combo);
  const mult = Math.min(5, 1 + Math.floor(r.combo / 3));
  r.score += 10 * mult;
  r.fx.push({ k: "hit", x: ball.x, y: ball.y, big: crit || impact > 600 });
  if (crit) r.fx.push({ k: "pop", x: m.x, y: m.y - m.r, text: "CRIT!", tone: "gold" });
  r.fx.push({ k: "snd", name: "hit" });
  damage(r, m, dmg);
}

export function damage(r: Run, m: Monster, n: number) {
  if (m.hp <= 0 || m.kind === "skull") return;
  m.hp -= n;
  m.hurt = 0.12;
  if (m.hp > 0) return;
  const d = MONSTERS[m.kind];
  const mult = Math.min(5, 1 + Math.floor(r.combo / 3));
  const pts = d.pts * mult;
  r.score += pts;
  r.kills++;
  r.fx.push({ k: "kill", x: m.x, y: m.y, boss: !!d.boss });
  r.fx.push({ k: "pop", x: m.x, y: m.y - 6, text: mult > 1 ? `+${pts} x${mult}` : `+${pts}`, tone: d.boss || m.kind === "mimic" ? "gold" : "good" });
  r.fx.push({ k: "snd", name: d.boss ? "won" : "kill" });
  r.monsters = r.monsters.filter((o) => o !== m);
  if (m.kind === "slime") {
    for (const dx of [-12, 12]) addMonster(r, "mini", Math.max(30, Math.min(W - 30, m.x + dx)), m.y);
  }
  if (d.boss) {
    r.monsters = [];
    r.shots = [];
    r.shake = 0.6;
  }
}

function ballStep(r: Run, ball: Ball, dt: number) {
  ball.vy += GRAV * dt;
  // lodestone: a gentle pull toward the nearest monster while the ball is up in the room
  if (lv(r, "homing") && ball.y < 440 && r.monsters.length) {
    let best: Monster | null = null, bd = 1e9;
    for (const m of r.monsters) {
      if (m.kind === "skull") continue;
      const d = Math.hypot(m.x - ball.x, m.y - ball.y);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    if (best && bd < 200) {
      const k = 260 * lv(r, "homing") * dt;
      ball.vx += ((best.x - ball.x) / bd) * k;
      ball.vy += ((best.y - ball.y) / bd) * k;
    }
  }
  const sp = Math.hypot(ball.vx, ball.vy);
  if (sp > MAX_V) {
    ball.vx *= MAX_V / sp;
    ball.vy *= MAX_V / sp;
  }
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  for (const s of WALLS) {
    const { c } = closestOnSeg(ball, s.a, s.b);
    bounce(ball, c.x, c.y, BALL_R, 0.45);
  }
  for (const p of r.pegs) if (bounce(ball, p.x, p.y, BALL_R + 6, 0.6) > 40) r.fx.push({ k: "snd", name: "clink" });
  for (const b of r.bumpers) {
    const imp = bounce(ball, b.x, b.y, BALL_R + b.r, 0.9);
    if (imp > 0) {
      // pop bumpers kick the ball away hard
      const nx = (ball.x - b.x) / (BALL_R + b.r), ny = (ball.y - b.y) / (BALL_R + b.r);
      ball.vx += nx * 260;
      ball.vy += ny * 260;
      if (b.lit <= 0) {
        b.lit = 0.15;
        r.score += 25;
        r.fx.push({ k: "snd", name: "bump" });
        if (lv(r, "spark")) {
          const t = r.monsters.filter((m) => m.kind !== "skull").sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y))[0];
          if (t) {
            r.fx.push({ k: "zap", x: b.x, y: b.y, x2: t.x, y2: t.y });
            damage(r, t, lv(r, "spark"));
          }
        }
      }
    }
  }
  for (const m of [...r.monsters]) {
    if (m.kind === "ghost" && m.phase > 0) continue;
    const imp = bounce(ball, m.x, m.y, BALL_R + m.r, MONSTERS[m.kind].boss ? 0.7 : 0.75);
    if (imp > 0) hitMonster(r, m, ball, imp);
  }
  for (const f of r.flippers) {
    const tip = flipperTip(f);
    const { c, t } = closestOnSeg(ball, f.pivot, tip);
    const dist = t * f.len;
    // velocity of the flipper surface at the contact point
    const sx = -f.side * Math.sin(f.ang) * dist * f.omega, sy = Math.cos(f.ang) * dist * f.omega;
    const imp = bounce(ball, c.x, c.y, BALL_R + FLIP_R, 0.3, sx, sy);
    if (imp > 0) r.combo = 0;
  }
  if (lv(r, "post") && r.roomTime < 12) bounce(ball, W / 2, 556, BALL_R + 6, 0.5);
  // arrows and fireballs break on the ball
  for (const s of r.shots) if (Math.hypot(s.x - ball.x, s.y - ball.y) < BALL_R + 6) s.y = 9999;
}

function monsterStep(r: Run, m: Monster, dt: number) {
  m.t += dt;
  if (m.hitCd > 0) m.hitCd -= dt;
  if (m.hurt > 0) m.hurt -= dt;
  if (m.burn > 0) {
    m.burn -= dt;
    if (Math.floor((m.burn + dt) * 2) !== Math.floor(m.burn * 2)) damage(r, m, 1);
    if (m.hp <= 0) return;
  }
  const flipTarget = () => {
    const f = r.rng.pick(r.flippers);
    const tip = flipperTip(f);
    return { x: (f.pivot.x + tip.x) / 2, y: (f.pivot.y + tip.y) / 2 };
  };
  const shoot = (kind: Shot["kind"], speed: number, spread = 0) => {
    const t = flipTarget();
    const a = Math.atan2(t.y - m.y, t.x - m.x) + spread;
    r.shots.push({ x: m.x, y: m.y + m.r, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, kind });
    r.fx.push({ k: "snd", name: "arrow" });
  };
  switch (m.kind) {
    case "bat":
      m.x = m.ax + Math.sin(m.t * 1.3) * 50;
      m.y = m.ay + Math.sin(m.t * 2.6) * 18;
      break;
    case "ghost":
      m.x = m.ax + Math.sin(m.t * 0.7) * 30;
      m.phase = Math.sin(m.t * 1.1) > 0.45 ? 1 : 0;
      break;
    case "mini":
      m.x = m.ax + Math.sin(m.t * 3) * 6;
      break;
    case "skeleton":
      m.cd -= dt;
      if (m.cd <= 0) {
        m.cd = 4.2 - Math.min(2.2, r.room * 0.2) + r.rng.next() * 1.5;
        shoot("arrow", 170);
      }
      break;
    case "kingslime":
      m.x = W / 2 + Math.sin(m.t * 0.6) * 100;
      m.y = 150 + Math.abs(Math.sin(m.t * 1.8)) * -30;
      m.cd -= dt;
      if (m.cd <= 0) {
        m.cd = m.hp < m.max / 2 ? 5 : 7;
        if (r.monsters.length < 5) {
          addMonster(r, "mini", m.x - 30, m.y + 40);
          addMonster(r, "mini", m.x + 30, m.y + 40);
        }
      }
      break;
    case "dragon":
      m.x = W / 2 + Math.sin(m.t * 0.7) * 110;
      m.y = 160 + Math.sin(m.t * 1.4) * 50;
      m.cd -= dt;
      if (m.cd <= 0) {
        m.cd = m.hp < m.max / 2 ? 1.8 : 2.8;
        shoot("fire", 190, -0.15);
        shoot("fire", 190, 0.15);
      }
      break;
    case "lich":
      m.cd -= dt;
      if (m.cd <= 0) {
        // blink somewhere else, leave a ghost behind, throw a fireball
        m.cd = m.hp < m.max / 2 ? 3.5 : 5;
        const old = { x: m.x, y: m.y };
        m.x = r.rng.int(90, W - 90);
        m.y = r.rng.int(110, 230);
        if (r.monsters.filter((o) => o.kind === "ghost").length < 3) addMonster(r, "ghost", old.x, old.y + 40);
        shoot("fire", 200);
        r.fx.push({ k: "pop", x: m.x, y: m.y - 40, text: "BLINK", tone: "bad" });
      }
      break;
    case "skull": {
      const o = r.monsters.find((b) => b.id === m.owner);
      if (!o) return;
      m.x = o.x + Math.cos(m.t * 1.6) * 52;
      m.y = o.y + Math.sin(m.t * 1.6) * 52;
      break;
    }
  }
}

function shotStep(r: Run, dt: number) {
  for (const s of r.shots) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    for (const f of r.flippers) {
      const { c } = closestOnSeg(s, f.pivot, flipperTip(f));
      if (Math.hypot(c.x - s.x, c.y - s.y) < FLIP_R + 4) {
        s.y = 9999;
        if (lv(r, "shield")) {
          r.fx.push({ k: "pop", x: c.x, y: c.y - 16, text: "BLOCKED", tone: "gold" });
          r.fx.push({ k: "snd", name: "clink" });
        } else {
          f.frozen = s.kind === "fire" ? 1.6 : 1.2;
          r.fx.push({ k: "freeze", x: c.x, y: c.y });
          r.fx.push({ k: "snd", name: "freeze" });
        }
      }
    }
  }
  r.shots = r.shots.filter((s) => s.y < H + 20 && s.x > -20 && s.x < W + 20);
}

/** Advance one physics step. */
export function step(r: Run) {
  if (r.phase !== "play") return;
  const dt = STEP;
  r.time += dt;
  r.roomTime += dt;
  if (r.shake > 0) r.shake -= dt;
  for (const f of r.flippers) flipperStep(r, f, dt);
  for (const m of [...r.monsters]) if (r.monsters.includes(m)) monsterStep(r, m, dt);
  for (const b of r.bumpers) if (b.lit > 0) b.lit -= dt;
  for (const ball of r.balls) ballStep(r, ball, dt);
  shotStep(r, dt);

  // drains
  const saver = 3 + lv(r, "saver") * 4;
  for (const ball of r.balls) {
    if (ball.y < H + 20) continue;
    if (r.roomTime < saver) {
      Object.assign(ball, newBall(W / 2, 40, (r.rng.next() - 0.5) * 120, 60));
      r.fx.push({ k: "pop", x: W / 2, y: 520, text: "BALL SAVED", tone: "gold" });
      r.fx.push({ k: "snd", name: "saved" });
    } else ball.y = Infinity;
  }
  if (r.balls.some((b) => b.y === Infinity)) {
    r.balls = r.balls.filter((b) => b.y !== Infinity);
    r.combo = 0;
    if (r.balls.length === 0) {
      r.lives--;
      r.fx.push({ k: "snd", name: "drain" });
      r.fx.push({ k: "pop", x: W / 2, y: 500, text: "DRAINED", tone: "bad" });
      if (r.lives <= 0) {
        r.phase = "dead";
        r.fx.push({ k: "snd", name: "dead" });
        return;
      }
      // next ball waits at the top
      r.phase = "ready";
      r.shots = [];
      for (const f of r.flippers) {
        f.frozen = 0;
        f.pressed = false;
      }
      return;
    }
  }

  // a ball that stops moving somewhere odd gets shaken loose
  for (const ball of r.balls) {
    const sp = Math.hypot(ball.vx, ball.vy);
    // holding a ball on a raised flipper is fine; anywhere else it should keep rolling
    const cradled = ball.y > 470 && r.flippers.some((f) => f.pressed);
    ball.still = sp < 25 && !cradled ? ball.still + dt : 0;
    if (ball.still > (ball.y > 470 ? 0.6 : 1.5)) {
      if (ball.y > 470) ball.vx += Math.sign(W / 2 - ball.x) * 90;
      else {
        ball.vx += (r.rng.next() - 0.5) * 300;
        ball.vy -= 200;
        r.shake = 0.25;
      }
      ball.still = 0;
    }
  }

  // room cleared
  if (!r.monsters.some((m) => m.kind !== "skull")) {
    r.score += 250 * r.room + r.balls.length * 100;
    r.fx.push({ k: "snd", name: "clear" });
    if (r.room >= ROOMS) {
      r.score += r.lives * 2000;
      r.phase = "won";
      return;
    }
    r.offer = rollUpgrades(r);
    r.phase = "pick";
  }
}

/** Advance real time in fixed physics steps. Returns the leftover seconds. */
export function advance(r: Run, seconds: number): number {
  let t = Math.min(seconds, 0.05);
  while (t >= STEP) {
    step(r);
    t -= STEP;
    if (r.phase !== "play") return 0;
  }
  // trail for drawing, once per frame
  for (const b of r.balls) {
    b.trail.unshift({ x: b.x, y: b.y });
    if (b.trail.length > 6) b.trail.pop();
  }
  return t;
}

function rollUpgrades(r: Run): UpgradeId[] {
  const pool = UPGRADE_IDS.filter((u) => lv(r, u) < UPGRADES[u].max);
  return r.rng.shuffle(pool).slice(0, 3);
}

export function chooseUpgrade(r: Run, u: UpgradeId) {
  if (r.phase !== "pick" || !r.offer.includes(u)) return;
  r.ups[u] = lv(r, u) + 1;
  if (u === "extra") r.lives++;
  r.offer = [];
  r.room++;
  buildRoom(r);
}

export function takeFx(r: Run): Fx[] {
  const f = r.fx;
  r.fx = [];
  return f;
}

// ---------- progress between runs ----------

export interface Meta {
  best: number;
  bestRoom: number;
  runs: number;
  wins: number;
}
export const newMeta = (): Meta => ({ best: 0, bestRoom: 0, runs: 0, wins: 0 });

export function recordRun(m: Meta, r: Run) {
  m.runs++;
  m.best = Math.max(m.best, r.score);
  m.bestRoom = Math.max(m.bestRoom, r.phase === "won" ? ROOMS : r.room);
  if (r.phase === "won") m.wins++;
}
