// Headless runs of Rubber Bullet Man: classic with a dumb auto-player, co-op with three,
// and brawls between bots. Checks nothing throws, numbers stay sane and brawls finish.
// Run: npm run test:rbm
import { newGame, step, W, H, type Game, type Input } from "../src/lib/rbm/engine.ts";

let fails = 0;
const fail = (m: string) => (fails++, console.error("FAIL", m));

function auto(g: Game, id: number, t: number): Input {
  const p = g.players.find((q) => q.id === id)!;
  const e = g.enemies[0];
  return {
    moveX: Math.sin(t * 1.3 + id),
    moveY: Math.cos(t * 0.7 + id),
    aimX: e ? e.x - p.x : 0,
    aimY: e ? e.y - p.y : -1,
    fire: true,
    select: (["bouncer", "piercer", "splitter", "boomerang", "glue", "seeker", "bomb"] as const)[Math.floor(t) % 7],
  };
}

function sane(g: Game, label: string) {
  for (const p of g.players) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > W || p.y < 0 || p.y > H) fail(`${label}: player out of bounds ${p.x},${p.y}`);
  }
  for (const b of g.bullets) if (!Number.isFinite(b.x)) fail(`${label}: NaN bullet`);
  for (const e of g.enemies) if (!Number.isFinite(e.x)) fail(`${label}: NaN enemy`);
}

for (let run = 0; run < 20; run++) {
  const g = newGame();
  let t = 0;
  while (!g.over && t < 600) {
    step(g, auto(g, g.players[0].id, t), 1 / 60);
    t += 1 / 60;
    if (Math.floor(t * 60) % 300 === 0) sane(g, "classic");
  }
  if (run < 3) console.log(`classic: wave ${g.wave} score ${g.score} kills ${g.kills} over=${g.over} t=${t.toFixed(0)}s`);
}

for (let run = 0; run < 10; run++) {
  const g = newGame("coop", [{ name: "A" }, { name: "B" }, { name: "C" }]);
  let t = 0;
  while (!g.over && t < 600) {
    const inputs: Record<number, Input> = {};
    for (const p of g.players) inputs[p.id] = auto(g, p.id, t);
    step(g, inputs, 1 / 60);
    t += 1 / 60;
    if (Math.floor(t * 60) % 300 === 0) sane(g, "coop");
  }
  const total = g.players.reduce((s, p) => s + p.score, 0);
  if (total > g.score) fail(`coop: player scores ${total} > team ${g.score}`);
  if (run < 3) console.log(`coop: wave ${g.wave} score ${g.score} per-player ${g.players.map((p) => p.score).join("/")} t=${t.toFixed(0)}s`);
}

let finished = 0;
for (let run = 0; run < 30; run++) {
  const n = 2 + (run % 3);
  const g = newGame("brawl", Array.from({ length: n }, (_, i) => ({ name: `BOT${i}`, bot: true })));
  let t = 0;
  while (!g.over && t < 400) {
    step(g, {}, 1 / 60);
    t += 1 / 60;
    if (Math.floor(t * 60) % 300 === 0) sane(g, "brawl");
  }
  if (!g.over) fail("brawl never ended");
  if (g.brawl!.winner === null) fail("brawl ended with no result");
  if (g.over) finished++;
  if (run < 6)
    console.log(
      `brawl ${n}p: ${t.toFixed(0)}s winner=${g.brawl!.winner} ` + g.players.map((p) => `${p.name}:${p.points}pts ${p.kos}ko ${p.falls}falls`).join(" "),
    );
}
console.log(`brawls finished: ${finished}/30`);
console.log(fails ? `${fails} failures` : "all good");
process.exit(fails ? 1 : 0);
