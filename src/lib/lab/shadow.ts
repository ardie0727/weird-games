// Shadow Match: pure puzzle logic. A polycube floats in the corner of a room and
// one to three lights throw its shadow onto the back wall, floor and side wall.
// The player turns it in 90° steps until every lit shadow fills its outline.

export type V3 = [number, number, number];
/** 3x3 matrix, row-major. Orientations are integer rotation matrices. */
export type M3 = number[];
export type Wall = "back" | "floor" | "side";
export type Move = "left" | "right" | "up" | "down" | "rollL" | "rollR";

export const WALLS: Wall[] = ["back", "floor", "side"];
export const MOVES: Move[] = ["left", "up", "down", "right", "rollL", "rollR"];
export const IDENT: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

const RX: M3 = [1, 0, 0, 0, 0, -1, 0, 1, 0];
const RY: M3 = [0, 0, 1, 0, 1, 0, -1, 0, 0];
const RZ: M3 = [0, -1, 0, 1, 0, 0, 0, 0, 1];
const T = (m: M3): M3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

/** World-space rotation for each control, plus the axis/sign used to animate it. */
export const MOVE_ROT: Record<Move, { m: M3; axis: V3; sign: number }> = {
  right: { m: RY, axis: [0, 1, 0], sign: 1 },
  left: { m: T(RY), axis: [0, 1, 0], sign: -1 },
  down: { m: RX, axis: [1, 0, 0], sign: 1 },
  up: { m: T(RX), axis: [1, 0, 0], sign: -1 },
  rollL: { m: RZ, axis: [0, 0, 1], sign: 1 },
  rollR: { m: T(RZ), axis: [0, 0, 1], sign: -1 },
};

export function mul(a: M3, b: M3): M3 {
  const r = new Array<number>(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}

export function apply(m: M3, v: V3): V3 {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
}

/** Rotation by angle (radians) about a unit axis, as a float matrix. */
export function axisAngle([x, y, z]: V3, a: number): M3 {
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}

const mkey = (m: M3) => m.map((n) => Math.round(n)).join(",");

/** Drops the axis the light shines along. Cells are centred, so coordinates may be halves. */
export function project(v: V3, wall: Wall): [number, number] {
  if (wall === "back") return [v[0], v[1]];
  if (wall === "floor") return [v[0], v[2]];
  return [v[2], v[1]];
}

export function shadowKey(cells: V3[], m: M3, wall: Wall): string {
  const s = new Set<string>();
  for (const c of cells) {
    const [a, b] = project(apply(m, c), wall);
    s.add(`${Math.round(a * 2)},${Math.round(b * 2)}`);
  }
  return [...s].sort().join(" ");
}

export function matches(cells: V3[], m: M3, target: M3, walls: Wall[]): boolean[] {
  return walls.map((w) => shadowKey(cells, m, w) === shadowKey(cells, target, w));
}

/** A random connected polycube, centred on the origin. */
export function makeObject(n: number, rnd = Math.random): V3[] {
  const dirs: V3[] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  for (;;) {
    const cells: V3[] = [[0, 0, 0]];
    const has = new Set(["0,0,0"]);
    while (cells.length < n) {
      const base = cells[Math.floor(rnd() * cells.length)];
      const d = dirs[Math.floor(rnd() * 6)];
      const c: V3 = [base[0] + d[0], base[1] + d[1], base[2] + d[2]];
      const k = c.join(",");
      if (has.has(k)) continue;
      // keep it inside a 3x3x3 box so it fits the room
      const next = [...cells, c];
      if ([0, 1, 2].some((i) => Math.max(...next.map((p) => p[i])) - Math.min(...next.map((p) => p[i])) > 2)) continue;
      has.add(k);
      cells.push(c);
    }
    const ctr = [0, 1, 2].map((i) => (Math.max(...cells.map((p) => p[i])) + Math.min(...cells.map((p) => p[i]))) / 2);
    const out = cells.map((c) => [c[0] - ctr[0], c[1] - ctr[1], c[2] - ctr[2]] as V3);
    // reject shapes that look the same from every side (boring)
    const looks = new Set(allOrientations().map((m) => WALLS.map((w) => shadowKey(out, m, w)).join("|")));
    if (looks.size >= 6) return out;
  }
}

let ORIENTS: M3[] | null = null;
export function allOrientations(): M3[] {
  if (ORIENTS) return ORIENTS;
  const seen = new Map<string, M3>([[mkey(IDENT), IDENT]]);
  const q = [IDENT];
  while (q.length) {
    const m = q.shift()!;
    for (const mv of MOVES) {
      const n = mul(MOVE_ROT[mv].m, m);
      const k = mkey(n);
      if (!seen.has(k)) seen.set(k, n), q.push(n);
    }
  }
  return (ORIENTS = [...seen.values()]);
}

/** Fewest moves from `from` to any orientation whose lit shadows all match. */
export function par(cells: V3[], from: M3, target: M3, walls: Wall[]): number {
  const want = walls.map((w) => shadowKey(cells, target, w)).join("|");
  const dist = new Map<string, number>([[mkey(from), 0]]);
  const q = [from];
  while (q.length) {
    const m = q.shift()!;
    const d = dist.get(mkey(m))!;
    if (walls.map((w) => shadowKey(cells, m, w)).join("|") === want) return d;
    for (const mv of MOVES) {
      const n = mul(MOVE_ROT[mv].m, m);
      const k = mkey(n);
      if (!dist.has(k)) dist.set(k, d + 1), q.push(n);
    }
  }
  return 0;
}

export interface Level {
  n: number;
  cells: V3[];
  walls: Wall[];
  start: M3;
  target: M3;
  par: number;
  time: number;
}

export function lightsFor(level: number): number {
  return level < 4 ? 1 : level < 9 ? 2 : 3;
}

export function makeLevel(level: number, rnd = Math.random): Level {
  const size = level < 3 ? 4 : level < 6 ? 5 : level < 10 ? 6 : 7;
  const lights = lightsFor(level);
  // the light wanders: each level starts it on a different wall
  const first = (level - 1) % 3;
  const walls = [0, 1, 2].slice(0, lights).map((i) => WALLS[(first + i) % 3]);
  const os = allOrientations();
  for (;;) {
    const cells = makeObject(size, rnd);
    const start = os[Math.floor(rnd() * os.length)];
    const target = os[Math.floor(rnd() * os.length)];
    if (matches(cells, start, target, walls).every(Boolean)) continue;
    const p = par(cells, start, target, walls);
    if (p < (level < 3 ? 1 : 2)) continue;
    const time = Math.max(15, 30 - (level - 1)) + (lights - 1) * 8;
    return { n: level, cells, walls, start, target, par: p, time };
  }
}
