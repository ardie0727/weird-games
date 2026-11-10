// Rubber Bullet Man online: what the host and its guests say to each other.
// The host runs the real game and sends snapshots ~20 times a second; each guest draws
// those (smoothed), moves its own man locally so it feels instant, and sends its sticks back.

import {
  ENEMY_TYPES,
  KINDS,
  LAYOUTS,
  PICKUP_KINDS,
  PLAYER_COLORS,
  PLAYER_R,
  SOUNDS,
  burst,
  enemyRadius,
  newGame,
  pop,
  setLayout,
  type BulletKind,
  type Fx,
  type Game,
  type Mode,
  type Player,
  type Sound,
} from "./engine.ts";

export const PROTOCOL = 2;
export const SNAP_MS = 50;
export const INPUT_MS = 33;
/** How far behind the newest snapshot a guest draws, so it always has two to blend. */
export const RENDER_DELAY = 90;

export interface LobbySeat {
  name: string;
  bot: boolean;
}

/** Messages a guest sends. */
export type GuestMsg =
  | { t: "hi"; v: number; name: string }
  | { t: "i"; mx: number; my: number; ax: number; ay: number; f: 0 | 1; sh: number; sel: number; x: number; y: number; w: number; tp: number }
  | { t: "bye" };

/** Messages the host sends. */
export type HostMsg =
  | { t: "lobby"; seats: LobbySeat[]; mode: Mode; you: number }
  | { t: "go"; mode: Mode; you: number }
  | { t: "s"; s: Snap }
  | { t: "full" }
  | { t: "bye" };

// Compact arrays keep each snapshot to a few KB.
type PRow = [number, number, string, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number[], number, number, number];
type ERow = [number, number, number, number, number, number, number, number, number, number, number, number, number, number];
type BRow = [number, number, number, number, number, number, number, number, number, number, number];

export interface Snap {
  n: number;
  m: Mode;
  tm: number;
  wv: number;
  sc: number;
  kl: number;
  bc: number;
  ov: 0 | 1;
  sh: number;
  ly: number;
  bn: [string, string, number] | 0;
  br: [number, number, number, number | null] | 0;
  bf: number[];
  P: PRow[];
  E: ERow[];
  B: BRow[];
  K: [number, number, number, number][];
  Wn: [number, number, number, number][];
  X: [number, number, number, number][];
  fx: (["b", number, number, string, number, number] | ["p", number, number, string, string])[];
  s: number[];
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const inf = (v: number) => (v === Infinity ? -1 : v);
const uninf = (v: number) => (v === -1 ? Infinity : v);

/** Host side: everything a guest needs to draw this moment, plus effects since the last one. */
export function encodeSnap(g: Game, n: number, fx: Fx[], sounds: Sound[]): Snap {
  return {
    n,
    m: g.mode,
    tm: r2(g.time),
    wv: g.wave,
    sc: g.score,
    kl: g.kills,
    bc: g.bestChain,
    ov: g.over ? 1 : 0,
    sh: r1(g.shake),
    ly: g.layout,
    bn: g.banner ? [g.banner.text, g.banner.sub, r2(g.banner.t)] : 0,
    br: g.brawl ? [g.brawl.target, r1(g.brawl.timeLeft), r2(g.brawl.countdown), g.brawl.winner] : 0,
    bf: g.bumpers.map((b) => (b.flash > 0 ? 1 : 0)),
    P: g.players.map((p) => [
      p.id,
      p.slot,
      p.name,
      r1(p.x),
      r1(p.y),
      r2(p.aimX),
      r2(p.aimY),
      p.hearts,
      r2(p.invuln),
      (p.power.shield ? 1 : 0) | (p.down ? 2 : 0) | (p.bot ? 4 : 0),
      r1(p.power.rapid),
      r1(p.power.triple),
      KINDS.indexOf(p.selected),
      r1(p.walk),
      p.score,
      p.kills,
      p.points,
      p.kos,
      p.falls,
      r2(p.frozen),
      p.tp,
      KINDS.map((k) => inf(p.ammo[k])),
      p.bestChain,
      p.mag,
      r2(p.reload),
    ]),
    E: g.enemies.map((e) => [e.id, ENEMY_TYPES.indexOf(e.type), r1(e.x), r1(e.y), r1(e.vx), r1(e.vy), e.hp, e.maxHp, e.state, r2(e.t), r2(e.fire), r2(e.face), r2(e.frozen), e.flash > 0 ? 1 : 0]),
    B: g.bullets.map((b) => [b.id, KINDS.indexOf(b.kind), b.owner === "enemy" ? -1 : b.pid, r1(b.x), r1(b.y), Math.round(b.vx), Math.round(b.vy), b.r, (b.phased ? 1 : 0) | (b.mini ? 2 : 0), r2(b.age), b.bounces]),
    K: g.pickups.filter((k) => k.t < 99).map((k) => [r1(k.x), r1(k.y), PICKUP_KINDS.indexOf(k.kind), r1(k.t)]),
    Wn: g.warnings.map((w) => [r1(w.x), r1(w.y), ENEMY_TYPES.indexOf(w.type), r2(w.t)]),
    X: g.blasts.map((b) => [r1(b.x), r1(b.y), b.r, r2(b.t)]),
    fx: fx.map((f) => (f.k === "b" ? ["b", r1(f.x), r1(f.y), f.c, f.n, f.s] : ["p", r1(f.x), r1(f.y), f.text, f.c])),
    s: [...new Set(sounds)].map((s) => SOUNDS.indexOf(s)),
  };
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/**
 * Guest side: the game as drawn on a guest's screen. Snapshots are buffered and blended
 * between, and each one's effects and sounds fire once, when the drawing catches up to it.
 */
export class Mirror {
  game: Game;
  me: number;
  private snaps: { at: number; s: Snap; done: boolean }[] = [];
  /** The last forced move (respawn) we have snapped to. */
  seenTp = -1;
  /** This guest's own man, moved locally. */
  self: { x: number; y: number; r: number; walk: number; aimX: number; aimY: number } = { x: 180, y: 500, r: PLAYER_R, walk: 0, aimX: 0, aimY: -1 };
  /** Our clock time for the newest snapshot: arrival times, smoothed against the host's own clock. */
  private lastTm = 0;
  private lastStamp = 0;
  lastAt = 0;

  constructor(mode: Mode, me: number) {
    this.game = newGame(mode, []);
    this.me = me;
  }

  push(s: Snap, now: number) {
    if (this.snaps.length && s.n <= this.snaps[this.snaps.length - 1].s.n) return; // late or repeated
    // Where this snapshot sits on our clock: the host's spacing, nudged toward when it really
    // arrived, so network jitter doesn't make the picture stutter.
    const expected = this.lastStamp ? this.lastStamp + Math.max(0, s.tm - this.lastTm) * 1000 : now;
    const at = Math.min(now, expected + (now - expected) * 0.1);
    const stamp = Math.abs(now - expected) > 500 ? now : at;
    this.lastStamp = stamp;
    this.lastTm = s.tm;
    this.snaps.push({ at: stamp, s, done: false });
    if (this.snaps.length > 30) this.snaps.splice(0, this.snaps.length - 30);
    this.lastAt = now;
  }

  get ready() {
    return this.snaps.length > 0;
  }

  /** Bring the drawn game up to now. Returns the sounds that fall due. */
  update(now: number): Sound[] {
    const sounds: Sound[] = [];
    if (!this.snaps.length) return sounds;
    const t = now - RENDER_DELAY;
    let i = this.snaps.findIndex((x) => x.at > t);
    if (i === -1) i = this.snaps.length; // ran past the newest: hold it
    const a = this.snaps[Math.max(0, i - 1)];
    const b = this.snaps[Math.min(this.snaps.length - 1, i)];
    // fire effects for every snapshot we've now reached
    for (const x of this.snaps) {
      if (x.done || x.at > t) continue;
      x.done = true;
      for (const f of x.s.fx) {
        if (f[0] === "b") burst(this.game, f[1], f[2], f[3], f[4], f[5]);
        else pop(this.game, f[1], f[2], f[3], f[4]);
      }
      for (const si of x.s.s) sounds.push(SOUNDS[si]);
    }
    const k = b.at > a.at ? Math.max(0, Math.min(1, (t - a.at) / (b.at - a.at))) : 1;
    this.apply(a.s, b.s, k);
    // drop snapshots we're done blending from
    while (this.snaps.length > 2 && this.snaps[1].at <= t) this.snaps.shift();
    return sounds;
  }

  private apply(a: Snap, s: Snap, k: number) {
    const g = this.game;
    g.mode = s.m;
    g.time = lerp(a.tm, s.tm, k);
    g.wave = s.wv;
    g.score = s.sc;
    g.kills = s.kl;
    g.bestChain = s.bc;
    g.over = s.ov === 1;
    g.shake = s.sh;
    if (g.layout !== s.ly || (!g.obstacles.length && !g.bumpers.length && (LAYOUTS[s.ly].rects.length || LAYOUTS[s.ly].bumpers?.length))) setLayout(g, s.ly);
    s.bf.forEach((f, i) => g.bumpers[i] && (g.bumpers[i].flash = f ? 0.1 : 0));
    g.banner = s.bn ? { text: s.bn[0], sub: s.bn[1], t: s.bn[2] } : null;
    g.brawl = s.br ? { target: s.br[0], timeLeft: s.br[1], countdown: s.br[2], winner: s.br[3], dropT: 0 } : null;

    const prevP = new Map(a.P.map((r) => [r[0], r]));
    g.players = s.P.map((r) => {
      const o = prevP.get(r[0]);
      const old = g.players.find((p) => p.id === r[0]);
      const ammo = {} as Record<BulletKind, number>;
      KINDS.forEach((kk, i) => (ammo[kk] = uninf(r[21][i])));
      const p: Player = {
        id: r[0],
        slot: r[1],
        name: r[2],
        color: PLAYER_COLORS[r[1] % PLAYER_COLORS.length],
        x: o ? lerp(o[3], r[3], k) : r[3],
        y: o ? lerp(o[4], r[4], k) : r[4],
        r: PLAYER_R,
        aimX: r[5],
        aimY: r[6],
        hearts: r[7],
        invuln: r[8],
        power: { shield: (r[9] & 1) > 0, rapid: r[10], triple: r[11] },
        down: (r[9] & 2) > 0,
        bot: (r[9] & 4) > 0 ? { think: 0, strafe: 0, strafeT: 0, err: 0, lastX: 0, lastY: 0, tvx: 0, tvy: 0, target: -1 } : null,
        selected: KINDS[r[12]] ?? "bouncer",
        walk: r[13],
        score: r[14],
        kills: r[15],
        points: r[16],
        kos: r[17],
        falls: r[18],
        frozen: r[19],
        tp: r[20],
        ammo,
        bestChain: r[22],
        cooldown: old?.cooldown ?? 0,
        respawn: 0,
        fireSeq: 0,
        queued: 0,
        mag: r[23] ?? 0,
        reload: r[24] ?? 0,
        regen: 0,
      };
      if (p.id === this.me) {
        // our own man is where we say he is, unless the host moved him (respawn, revive)
        if (p.tp !== this.seenTp || p.down) {
          this.seenTp = p.tp;
          this.self.x = r[3];
          this.self.y = r[4];
        }
        p.x = this.self.x;
        p.y = this.self.y;
        p.walk = this.self.walk;
        p.aimX = this.self.aimX;
        p.aimY = this.self.aimY;
      }
      return p;
    });

    const prevE = new Map(a.E.map((r) => [r[0], r]));
    g.enemies = s.E.map((r) => {
      const o = prevE.get(r[0]);
      const type = ENEMY_TYPES[r[1]];
      return {
        id: r[0],
        type,
        x: o ? lerp(o[2], r[2], k) : r[2],
        y: o ? lerp(o[3], r[3], k) : r[3],
        vx: r[4],
        vy: r[5],
        r: enemyRadius(type),
        hp: r[6],
        maxHp: r[7],
        state: r[8],
        t: r[9],
        fire: r[10],
        face: o ? lerpAngle(o[11], r[11], k) : r[11],
        frozen: r[12],
        flash: r[13] ? 0.1 : 0,
        dead: false,
      };
    });

    const prevB = new Map(a.B.map((r) => [r[0], r]));
    g.bullets = s.B.map((r) => {
      const o = prevB.get(r[0]);
      // a bullet that bounced between the two snapshots would cut the corner: don't blend it
      const blend = o && o[10] === r[10];
      return {
        id: r[0],
        kind: KINDS[r[1]],
        owner: r[2] === -1 ? "enemy" : "player",
        pid: r[2],
        x: blend ? lerp(o[3], r[3], k) : r[3],
        y: blend ? lerp(o[4], r[4], k) : r[4],
        vx: r[5],
        vy: r[6],
        r: r[7],
        phased: (r[8] & 1) > 0,
        mini: (r[8] & 2) > 0,
        age: r[9],
        bounces: r[10],
        maxBounces: 0,
        walls: 0,
        kills: 0,
        life: 99,
        ignore: [],
        dead: false,
      };
    });

    g.pickups = s.K.map((r) => ({ x: r[0], y: r[1], kind: PICKUP_KINDS[r[2]], t: r[3] }));
    g.warnings = s.Wn.map((r) => ({ x: r[0], y: r[1], type: ENEMY_TYPES[r[2]], t: r[3] }));
    g.blasts = s.X.map((r) => ({ x: r[0], y: r[1], r: r[2], t: r[3] }));
  }

  /** The newest state the host has told us about our own man (for ammo, cooldown, etc.). */
  get mine(): Player | null {
    return this.game.players.find((p) => p.id === this.me) ?? null;
  }
}


function lerpAngle(a: number, b: number, k: number) {
  const d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * k;
}

/** Room codes: four letters, no look-alikes. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const cleanCode = (raw: string) =>
  raw
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .replace(/[IO]/g, "")
    .slice(0, 4);
