// Plays many Pinball Dungeon runs with a simple flipping bot to catch crashes, stuck
// rooms and wildly unbalanced numbers. Run: npm run test:pinball -- <runs> <skill 0..1>
import { advance, chooseUpgrade, flipperTip, launch, newRun, press, ROOMS, takeFx, type Run } from "../src/lib/pinball/engine.ts";

const N = Number(process.argv[2] ?? 60);
const SKILL = Number(process.argv[3] ?? 0.8); // chance the bot reacts to a ball in time

const held = [0, 0];
function bot(r: Run, rand: () => number) {
  for (const side of [0, 1] as const) {
    const f = r.flippers[side];
    held[side] = f.pressed ? held[side] + 1 : 0;
    if (held[side] > 12) {
      press(r, side, false);
      continue;
    }
    if (f.pressed) continue;
    // flip when a ball is close to the outer half of this flipper
    const tip = flipperTip(f, 0.5);
    const near = r.balls.some((b) => {
      const dx = tip.x - f.pivot.x, dy = tip.y - f.pivot.y;
      const t = ((b.x - f.pivot.x) * dx + (b.y - f.pivot.y) * dy) / (dx * dx + dy * dy);
      const cx = f.pivot.x + dx * t, cy = f.pivot.y + dy * t;
      return t > 0.3 && t < 1.15 && Math.hypot(b.x - cx, b.y - cy) < 30 && b.vy > -100;
    });
    if (near && rand() < SKILL) press(r, side, true);
  }
}

const reached: number[] = [];
let wins = 0, stuck = 0;
const roomSecs: number[] = [];
for (let i = 0; i < N; i++) {
  const r = newRun(5000 + i * 104729);
  let seed = i * 7 + 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let t = 0, roomT = 0, room = 1;
  while (r.phase !== "dead" && r.phase !== "won") {
    if (r.phase === "ready") launch(r);
    if (r.phase === "pick") chooseUpgrade(r, r.offer[0]);
    bot(r, rand);
    advance(r, 1 / 60);
    takeFx(r);
    t += 1 / 60;
    roomT += 1 / 60;
    if (r.room !== room) {
      roomSecs.push(roomT);
      roomT = 0;
      room = r.room;
    }
    if (roomT > 600) {
      stuck++;
      console.log(`run ${i}: room ${r.room} took 10 minutes (${r.monsters.map((m) => `${m.kind}@${m.x.toFixed(0)},${m.y.toFixed(0)}`).join(" ")}) balls ${r.balls.map((b) => `${b.x.toFixed(0)},${b.y.toFixed(0)} v${b.vx.toFixed(0)},${b.vy.toFixed(0)}`).join(" ")} pegs ${JSON.stringify(r.pegs)} bumpers ${JSON.stringify(r.bumpers.map((b) => [b.x, b.y]))}`);
      break;
    }
  }
  if (r.phase === "won") wins++;
  reached.push(r.phase === "won" ? ROOMS + 1 : r.room);
}
const hist: Record<number, number> = {};
for (const x of reached) hist[x] = (hist[x] ?? 0) + 1;
roomSecs.sort((a, b) => a - b);
console.log(`runs ${N}, wins ${wins}, stuck ${stuck}, median room ${roomSecs[roomSecs.length >> 1]?.toFixed(0)}s, slowest ${roomSecs[roomSecs.length - 1]?.toFixed(0)}s`);
console.log("room reached:", hist);
if (stuck) process.exit(1);
