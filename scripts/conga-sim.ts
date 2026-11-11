// Plays many full Conga Crawl runs with a simple steering bot to catch crashes, stuck
// floors and wildly unbalanced numbers. Run: npm run test:conga
import { choosePerk, COLS, DX, DY, ENTRY, enemyAt, EXIT, FLOORS, isWall, LEADER_ORDER, newRun, ROWS, steer, step, takeFx, type Dir, type Run } from "../src/lib/conga/engine.ts";

function botDir(r: Run): Dir | null {
  const head = r.body[0];
  const blocked = new Uint8Array(COLS * ROWS);
  const k = (x: number, y: number) => y * COLS + x;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (isWall(r, x, y) || (x === ENTRY.x && y === ENTRY.y)) blocked[k(x, y)] = 1;
  if (r.exitOpen) blocked[k(EXIT.x, EXIT.y)] = 0;
  r.body.slice(1, -1).forEach((p) => (blocked[k(p.x, p.y)] = 1));
  for (const e of r.enemies) for (const p of e.tail) blocked[k(p.x, p.y)] = 1;
  for (const h of r.hazards) if (h.t < 12) blocked[k(h.x, h.y)] = 1;
  const goal = new Uint8Array(COLS * ROWS);
  let any = false;
  const mark = (x: number, y: number) => {
    goal[k(x, y)] = 1;
    any = true;
  };
  if (r.exitOpen) mark(EXIT.x, EXIT.y);
  else {
    for (const g of r.guests) mark(g.x, g.y);
    for (const p of r.pickups) mark(p.x, p.y);
    if (!any) for (const e of r.enemies) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (e.x + dx >= 0 && e.y + dy >= 0 && e.x + dx < COLS && e.y + dy < ROWS) mark(e.x + dx, e.y + dy);
  }
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (enemyAt(r, x, y)) blocked[k(x, y)] = goal[k(x, y)] ? 0 : 1;
  // BFS from the head, remembering the first step
  const first = new Int8Array(COLS * ROWS).fill(-1);
  const q: number[] = [];
  for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
    if (r.members.length && d === (r.dir + 2) % 4) continue;
    const x = head.x + DX[d], y = head.y + DY[d];
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS || blocked[k(x, y)]) continue;
    first[k(x, y)] = d;
    q.push(k(x, y));
  }
  let fallback: Dir | null = q.length ? (first[q[0]] as Dir) : null;
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    if (goal[c]) return first[c] as Dir;
    const x = c % COLS, y = (c / COLS) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const n = k(nx, ny);
      if (blocked[n] || first[n] >= 0) continue;
      first[n] = first[c];
      q.push(n);
    }
  }
  return fallback;
}

const N = Number(process.argv[2] ?? 150);
// how often the bot is late with a turn, like a human thumb (0 = perfect)
const NOISE = Number(process.argv[3] ?? 0.25);
const floors: number[] = [];
let wins = 0, maxTicks = 0, crashes = 0;
const byLeader: Record<string, number[]> = {};
for (let i = 0; i < N; i++) {
  const leader = LEADER_ORDER[i % LEADER_ORDER.length];
  const r = newRun(1000 + i * 7919, leader);
  let ticks = 0;
  let floorTicks = 0;
  let lastFloor = 1;
  try {
    while (r.phase !== "dead" && r.phase !== "won" && ticks < 20 * 60 * 40) {
      if (r.phase === "perk") choosePerk(r, r.offer[0]);
      if (r.phase === "play" && r.clock + 1 >= r.every + (r.perks.slow ?? 0) && Math.random() >= NOISE) {
        const d = botDir(r);
        if (d !== null && d !== r.dir) steer(r, d);
      }
      step(r);
      takeFx(r);
      ticks++;
      if (r.floor !== lastFloor) {
        maxTicks = Math.max(maxTicks, floorTicks);
        floorTicks = 0;
        lastFloor = r.floor;
      }
      floorTicks++;
      if (floorTicks > 20 * 60 * 6) throw new Error(`stuck on floor ${r.floor} (${r.enemies.length} enemies, ${r.toSpawn.length} to spawn, exit ${r.exitOpen})`);
      if (r.body.length !== r.members.length + 1) throw new Error("line out of sync");
    }
  } catch (e) {
    crashes++;
    console.log(`run ${i} (${leader}): ${(e as Error).message}`);
  }
  if (process.env.V) console.log(leader, "floor", r.floor, "dig", r.dignity, "line", r.members.length, "best", r.bestLine, "score", r.score, "hits", (r as any).hits ?? 0, "t", (ticks/20).toFixed(0));
  const reached = r.phase === "won" ? FLOORS + 1 : r.floor;
  if (r.phase === "won") wins++;
  floors.push(reached);
  (byLeader[leader] ??= []).push(reached);
}
const hist: Record<number, number> = {};
for (const f of floors) hist[f] = (hist[f] ?? 0) + 1;
console.log(`runs ${N}, wins ${wins}, crashes/stuck ${crashes}, longest floor ${(maxTicks / 20).toFixed(0)}s`);
console.log("floor reached:", hist);
for (const [l, f] of Object.entries(byLeader)) console.log(`  ${l}: avg floor ${(f.reduce((a, b) => a + b, 0) / f.length).toFixed(2)}`);
if (crashes) process.exit(1);
