// Plays many full Down the Couch runs with a simple bot to catch crashes, stuck states
// and wildly unbalanced numbers. Run: npm run test:dtc
import { CARD, ENEMY, HERO_ORDER, SNACK, viewCard, type HeroId } from "../src/lib/dtc/data.ts";
import {
  alive,
  buy,
  campRest,
  campUpgrade,
  canPlay,
  chooseEvent,
  chooseNode,
  choosePerk,
  enemyStep,
  endTurn,
  eventChoiceOk,
  finishReward,
  leaveCamp,
  leaveEvent,
  leaveShop,
  leaveTreasure,
  moveDamage,
  moveOf,
  newMeta,
  newRun,
  pickCard,
  pickableCards,
  playCard,
  reachable,
  shopRemove,
  takeCard,
  takeRewardSnack,
  takeTreasure,
  totalFloor,
  useSnack,
  type Run,
} from "../src/lib/dtc/engine.ts";
import { EVENT } from "../src/lib/dtc/data.ts";

function botCombat(run: Run, rnd: () => number) {
  const c = run.combat!;
  let guard = 0;
  while (c.phase === "player" && guard++ < 60) {
    const incoming = alive(c).reduce((s, e) => {
      const m = moveOf(e);
      const d = m ? moveDamage(run, e, m) : null;
      return s + (d ? d.dmg * d.hits : 0);
    }, 0);
    // snacks when low
    if (run.hp < run.maxHp * 0.4) {
      const slot = run.snacks.findIndex((s) => s);
      if (slot >= 0) {
        const s = SNACK[run.snacks[slot]!];
        useSnack(run, slot, alive(c)[0]?.uid);
        if (s) continue;
      }
    }
    const playable = c.hand.filter((h) => canPlay(run, h));
    if (!playable.length) break;
    const needBlock = incoming > c.block;
    const score = (uid: number) => {
      const h = c.hand.find((x) => x.uid === uid)!;
      const v = viewCard(h);
      if (v.def.type === "power") return 100;
      const blk = v.fx.some((f) => f.k === "block");
      if (needBlock && blk) return 80;
      if (v.def.type === "attack") return 60 + rnd() * 5;
      return 40 + rnd() * 5;
    };
    playable.sort((a, b) => score(b.uid) - score(a.uid));
    const pick = playable[0];
    const target = alive(c).sort((a, b) => a.hp - b.hp)[0];
    if (!playCard(run, pick.uid, target?.uid)) break;
  }
  if (c.phase !== "player") return;
  endTurn(run);
  let g = 0;
  while ((c.phase as string) === "enemy" && g++ < 50) enemyStep(run);
  if (g >= 50) throw new Error("enemy phase stuck");
}

function playRun(hero: HeroId, seed: number, asc = 0) {
  const meta = newMeta();
  const run = newRun(hero, asc, meta, seed);
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  let steps = 0;
  while (run.screen !== "over" && run.screen !== "victory") {
    if (steps++ > 20000) throw new Error(`run stuck on ${run.screen}`);
    switch (run.screen) {
      case "map": {
        const opts = reachable(run);
        if (!opts.length) throw new Error("no reachable nodes");
        const n = opts[Math.floor(rnd() * opts.length)];
        chooseNode(run, n.row, n.col);
        break;
      }
      case "combat":
        botCombat(run, rnd);
        break;
      case "reward": {
        const r = run.reward!;
        if (r.cards) takeCard(run, run.deck.length < 22 ? r.cards[0].uid : null);
        if (r.snack) takeRewardSnack(run);
        if (r.boss) {
          const id = r.boss[0] ?? null;
          r.boss = null;
          if (id) run.trinkets.push(id);
        }
        finishReward(run);
        break;
      }
      case "levelup":
        choosePerk(run, run.levelChoices![0]);
        break;
      case "shop": {
        const sh = run.shop!;
        sh.trinkets.forEach((_, i) => buy(run, "trinket", i));
        if (!sh.removed && shopRemove(run)) break;
        leaveShop(run);
        break;
      }
      case "pick": {
        const list = pickableCards(run);
        const curse = list.find((c) => CARD[c.id].type === "curse");
        const ci = curse ?? list[0];
        if (!ci) throw new Error("pick with nothing to pick");
        pickCard(run, ci.uid);
        break;
      }
      case "camp":
        if (!run.campDone) {
          if (run.hp < run.maxHp * 0.65) campRest(run);
          else campUpgrade(run);
          if ((run.screen as string) === "pick") break;
        }
        leaveCamp(run);
        break;
      case "event": {
        const ev = run.event!;
        if (ev.result === null) {
          const def = EVENT[ev.id];
          const ch = def.choices.find((c) => eventChoiceOk(run, c.id))!;
          chooseEvent(run, ch.id);
        } else leaveEvent(run);
        break;
      }
      case "treasure":
        takeTreasure(run, run.treasure!.options[0] ?? null);
        leaveTreasure(run);
        break;
    }
    if (run.hp > run.maxHp) throw new Error("hp above max");
    if (Number.isNaN(run.hp)) throw new Error("hp NaN");
  }
  return run;
}

let fails = 0;
const N = Number(process.env.N ?? 150);
for (const hero of HERO_ORDER) {
  let wins = 0;
  let floors = 0;
  const killers: Record<string, number> = {};
  for (let i = 0; i < N; i++) {
    try {
      const run = playRun(hero, 1000 + i * 7919);
      if (run.screen === "victory") wins++;
      floors += totalFloor(run);
      if (run.killer) killers[run.killer] = (killers[run.killer] ?? 0) + 1;
      JSON.parse(JSON.stringify(run));
    } catch (e) {
      fails++;
      console.error(`${hero} seed ${i}:`, e);
    }
  }
  const top = Object.entries(killers)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, n]) => `${k} ${n}`)
    .join(", ");
  console.log(`${hero.padEnd(7)} win ${((wins / N) * 100).toFixed(0)}%  avg floor ${(floors / N).toFixed(1)}  killers: ${top}`);
}
// sanity: every enemy referenced by an area exists
for (const id of Object.keys(ENEMY)) if (!ENEMY[id].moves.length) (fails++, console.error("enemy without moves", id));
if (fails) {
  console.error(`${fails} failures`);
  process.exit(1);
}
console.log("ok");
