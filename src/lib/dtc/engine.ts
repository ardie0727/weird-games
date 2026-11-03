// Down the Couch: the game engine. Plain functions that mutate a serializable Run object.
// The UI clones the run after each call to re-render, and saves it to localStorage.

import {
  AREAS,
  CARD,
  CARDS,
  ENEMY,
  EVENT,
  EVENTS,
  HEROES,
  LEVEL_PERKS,
  META_UPGRADES,
  SNACK,
  SNACKS,
  STATUS,
  TRINKET,
  TRINKETS,
  XP_LEVELS,
  viewCard,
  type CardInst,
  type EnemyDef,
  type Fx,
  type HeroId,
  type MoveDef,
  type StatusId,
  type Tier,
  type TrinketRarity,
} from "./data.ts";

export const ROWS = 8; // regular rows per area; the boss sits on row ROWS
export const COLS = 5;
export const HAND_MAX = 10;
export const START_CRUMBS = 60;

export type NodeType = "fight" | "elite" | "event" | "shop" | "camp" | "treasure" | "boss";

export interface MapNode {
  row: number;
  col: number;
  type: NodeType;
  real: NodeType; // what a "?" turns out to be
  next: number[]; // cols in the next row
}

export type Statuses = Partial<Record<StatusId, number>>;

export interface Enemy {
  uid: number;
  id: string;
  hp: number;
  maxHp: number;
  block: number;
  st: Statuses;
  pi: number;
  move: string | null;
  extra: number;
  sinceRewind: number;
  dead: boolean;
  fresh: boolean;
  phase2: boolean;
}

export type FxKind = "dmg" | "block" | "heal" | "status" | "die" | "text" | "summon" | "atk" | "crit" | "card";

export interface FxEvent {
  seq: number;
  kind: FxKind;
  who: "hero" | number;
  n?: number;
  text?: string;
}

export interface Combat {
  kind: Tier;
  bonusTrinket: boolean;
  enemies: Enemy[];
  block: number;
  st: Statuses;
  draw: CardInst[];
  hand: CardInst[];
  discard: CardInst[];
  exhaust: CardInst[];
  energy: number;
  maxEnergy: number;
  turn: number;
  phase: "player" | "enemy" | "won" | "lost";
  attacksThisTurn: number;
  attacksTotal: number;
  lostHpThisTurn: boolean;
  zeroCost: number[];
  staticUids: number[];
  enemyIdx: number;
  freshHero: StatusId[];
  fx: FxEvent[];
  seq: number;
}

export interface Reward {
  crumbs: number;
  crumbsTaken: boolean;
  cards: CardInst[] | null;
  trinket: string | null;
  snack: string | null;
  boss: string[] | null;
  xp: number;
}

export interface ShopItem<T> {
  item: T;
  price: number;
  sold: boolean;
}

export interface Shop {
  cards: ShopItem<CardInst>[];
  trinkets: ShopItem<string>[];
  snacks: ShopItem<string>[];
  removePrice: number;
  removed: boolean;
}

export interface EventState {
  id: string;
  result: string | null;
}

export type PickMode = "upgrade" | "remove" | "transform" | "view";

export interface Pick {
  mode: PickMode;
  back: Screen;
  count: number;
  title: string;
  cancel: boolean;
}

export type Screen = "map" | "combat" | "reward" | "shop" | "camp" | "event" | "treasure" | "levelup" | "pick" | "over" | "victory";

export interface RunStats {
  kills: number;
  elites: number;
  bosses: number;
  cardsPlayed: number;
  dmgDealt: number;
  biggestHit: number;
  turns: number;
}

export interface Run {
  v: 1;
  rs: number;
  hero: HeroId;
  asc: number;
  hp: number;
  maxHp: number;
  crumbs: number;
  xp: number;
  level: number;
  pendingLevels: number;
  levelChoices: string[] | null;
  deck: CardInst[];
  trinkets: string[];
  snacks: (string | null)[];
  area: number;
  map: MapNode[][];
  pos: { row: number; col: number } | null;
  floor: number;
  fightsInArea: number;
  seenEvents: string[];
  screen: Screen;
  combat: Combat | null;
  reward: Reward | null;
  shop: Shop | null;
  event: EventState | null;
  treasure: { options: string[]; crumbs: number; taken: boolean } | null;
  pick: Pick | null;
  campDone: boolean;
  perks: { crit: number; draw1: number; block: number; str: number };
  flags: { pinUsed: boolean; eye: boolean; cozy: boolean; removals: number; afterBoss: boolean };
  stats: RunStats;
  uid: number;
  lint: number | null; // lint earned, set when the run ends
  killer: string | null;
  startedAt: number;
}

export interface Meta {
  v: 1;
  lint: number;
  totalLint: number;
  unlocked: HeroId[];
  up: Record<string, number>;
  asc: number;
  runs: number;
  wins: number;
  bestFloor: number;
  winsByHero: Partial<Record<HeroId, number>>;
}

export function newMeta(): Meta {
  return { v: 1, lint: 0, totalLint: 0, unlocked: ["penny"], up: {}, asc: 0, runs: 0, wins: 0, bestFloor: 0, winsByHero: {} };
}

// ---------------- rng ----------------

export function rand(run: { rs: number }): number {
  run.rs = (run.rs + 0x6d2b79f5) | 0;
  let t = Math.imul(run.rs ^ (run.rs >>> 15), 1 | run.rs);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rint = (run: Run, a: number, b: number) => a + Math.floor(rand(run) * (b - a + 1));
const rpick = <T>(run: Run, arr: readonly T[]): T => arr[Math.floor(rand(run) * arr.length)];
function shuffle<T>(run: Run, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(run) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function weighted<T extends string>(run: Run, w: [T, number][]): T {
  const total = w.reduce((s, [, n]) => s + n, 0);
  let r = rand(run) * total;
  for (const [k, n] of w) {
    if ((r -= n) < 0) return k;
  }
  return w[w.length - 1][0];
}

export const has = (run: Run, t: string) => run.trinkets.includes(t);

// ---------------- run setup ----------------

export function newRun(hero: HeroId, asc: number, meta: Meta, seed = Date.now()): Run {
  const h = HEROES[hero];
  const lvl = (id: string) => meta.up[id] ?? 0;
  const maxHp = h.maxHp + 5 * lvl("stuffing");
  const run: Run = {
    v: 1,
    rs: seed | 0,
    hero,
    asc,
    hp: maxHp,
    maxHp,
    crumbs: START_CRUMBS + 20 * lvl("pocket"),
    xp: 0,
    level: 1,
    pendingLevels: 0,
    levelChoices: null,
    deck: [],
    trinkets: [],
    snacks: [null, null, null],
    area: 0,
    map: [],
    pos: null,
    floor: 0,
    fightsInArea: 0,
    seenEvents: [],
    screen: "map",
    combat: null,
    reward: null,
    shop: null,
    event: null,
    treasure: null,
    pick: null,
    campDone: false,
    perks: { crit: 0, draw1: 0, block: 0, str: 0 },
    flags: { pinUsed: false, eye: lvl("eye") > 0, cozy: lvl("cozy") > 0, removals: 0, afterBoss: false },
    stats: { kills: 0, elites: 0, bosses: 0, cardsPlayed: 0, dmgDealt: 0, biggestHit: 0, turns: 0 },
    uid: 1,
    lint: null,
    killer: null,
    startedAt: Date.now(),
  };
  for (const id of h.starter) run.deck.push(card(run, id));
  if (asc >= 4) run.deck.push(card(run, "sticky"));
  if (asc >= 5) run.hp = Math.round(maxHp * 0.9);
  if (lvl("stash")) addSnack(run, rpick(run, SNACKS).id);
  if (lvl("headstart")) {
    const t = randomTrinket(run, "common");
    if (t) gainTrinket(run, t);
  }
  if (lvl("practice")) {
    const starters = run.deck.filter((c) => !c.up && CARD[c.id].rarity === "starter");
    if (starters.length) rpick(run, starters).up = true;
  }
  run.map = genMap(run);
  return run;
}

export function card(run: Run, id: string, up = false): CardInst {
  return { uid: run.uid++, id, up };
}

// ---------------- map ----------------

export function genMap(run: Run): MapNode[][] {
  const rows: (MapNode | undefined)[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(undefined));
  const edges = new Set<string>();
  const starts = shuffle(run, [0, 1, 2, 3, 4]).slice(0, 2);
  const paths = 5;
  for (let p = 0; p < paths; p++) {
    let c = p < 2 ? starts[p] : rint(run, 0, COLS - 1);
    for (let r = 0; r < ROWS; r++) {
      if (!rows[r][c]) rows[r][c] = { row: r, col: c, type: "fight", real: "fight", next: [] };
      if (r === ROWS - 1) break;
      let opts = [c - 1, c, c + 1].filter((x) => x >= 0 && x < COLS);
      // no crossing edges
      opts = opts.filter((n) => !(n !== c && edges.has(`${r}:${n}>${c}`)));
      const n = rpick(run, opts);
      edges.add(`${r}:${c}>${n}`);
      const node = rows[r][c]!;
      if (!node.next.includes(n)) node.next.push(n);
      c = n;
    }
  }
  const out: MapNode[][] = rows.map((row) => row.filter((n): n is MapNode => !!n));
  for (const row of out) for (const n of row) n.next.sort((a, b) => a - b);
  // assign types
  for (let r = 0; r < ROWS; r++) {
    for (const n of out[r]) {
      let t: NodeType;
      if (r === 0) t = "fight";
      else if (r === ROWS - 1) t = "camp";
      else if (r === 4) t = "treasure";
      else {
        const w: [NodeType, number][] = [["fight", 46], ["event", 24]];
        if (r >= 2) w.push(["elite", run.area === 0 && r < 3 ? 0 : 12], ["shop", 9]);
        if (r >= 3 && r !== ROWS - 2) w.push(["camp", 9]);
        t = weighted(run, w);
      }
      n.type = t;
      n.real = t === "event" ? weighted<NodeType>(run, [["event", 70], ["fight", 15], ["treasure", 8], ["shop", 7]]) : t;
    }
  }
  // avoid two shops/camps/elites in a row on any edge
  for (let r = 1; r < ROWS - 1; r++) {
    for (const n of out[r]) {
      for (const nc of n.next) {
        const m = out[r + 1].find((x) => x.col === nc);
        if (m && r + 1 < ROWS - 1 && m.type === n.type && (n.type === "shop" || n.type === "camp" || n.type === "elite")) {
          m.type = "fight";
          m.real = "fight";
        }
      }
    }
  }
  out.push([{ row: ROWS, col: 2, type: "boss", real: "boss", next: [] }]);
  for (const n of out[ROWS - 1]) n.next = [2];
  return out;
}

export function nodeAt(run: Run, row: number, col: number): MapNode | undefined {
  return run.map[row]?.find((n) => n.col === col);
}

export function reachable(run: Run): MapNode[] {
  if (!run.pos) return run.map[0];
  const cur = nodeAt(run, run.pos.row, run.pos.col);
  if (!cur) return [];
  return cur.next.map((c) => nodeAt(run, run.pos!.row + 1, c)).filter((n): n is MapNode => !!n);
}

export function chooseNode(run: Run, row: number, col: number): boolean {
  if (run.screen !== "map") return false;
  const target = reachable(run).find((n) => n.row === row && n.col === col);
  if (!target) return false;
  run.pos = { row, col };
  run.floor++;
  run.campDone = false;
  enterNode(run, target.real, target.type === "event");
  return true;
}

function enterNode(run: Run, t: NodeType, mystery: boolean) {
  const area = AREAS[run.area];
  switch (t) {
    case "fight": {
      const pool = run.fightsInArea < 2 ? area.easy : area.normal;
      run.fightsInArea++;
      startCombat(run, rpick(run, pool), "normal");
      break;
    }
    case "elite":
      startCombat(run, rpick(run, area.elites), "elite");
      break;
    case "boss":
      startCombat(run, [area.boss], "boss");
      break;
    case "event": {
      let pool = EVENTS.filter((e) => e.areas.includes(run.area) && !run.seenEvents.includes(e.id));
      if (!pool.length) pool = EVENTS.filter((e) => e.areas.includes(run.area));
      const ev = rpick(run, pool);
      run.seenEvents.push(ev.id);
      run.event = { id: ev.id, result: null };
      run.screen = "event";
      break;
    }
    case "shop":
      run.shop = genShop(run);
      run.screen = "shop";
      break;
    case "camp":
      run.screen = "camp";
      break;
    case "treasure": {
      const n = run.hero === "key" ? 2 : 1;
      const options: string[] = [];
      for (let i = 0; i < n; i++) {
        const t2 = randomTrinket(run, undefined, options);
        if (t2) options.push(t2);
      }
      run.treasure = { options, crumbs: rint(run, 20, 40) + (mystery ? 0 : 10), taken: false };
      run.screen = "treasure";
      break;
    }
  }
}

// ---------------- trinkets, snacks, cards ----------------

export function randomTrinket(run: Run, rarity?: TrinketRarity, exclude: string[] = []): string | null {
  const r = rarity ?? weighted<TrinketRarity>(run, [["common", 55], ["uncommon", 33], ["rare", 12]]);
  const ok = (t: (typeof TRINKETS)[number]) => !run.trinkets.includes(t.id) && !exclude.includes(t.id);
  let pool = TRINKETS.filter((t) => t.rarity === r && ok(t));
  if (!pool.length) pool = TRINKETS.filter((t) => t.rarity !== "boss" && t.rarity !== "shop" && ok(t));
  if (!pool.length) return null;
  return rpick(run, pool).id;
}

export function gainTrinket(run: Run, id: string) {
  if (run.trinkets.includes(id)) return;
  run.trinkets.push(id);
  if (id === "sugar-packet") {
    run.maxHp += 10;
    run.hp += 10;
  }
  if (id === "snow-globe") {
    run.snacks.push(null);
  }
}

export function addSnack(run: Run, id: string): boolean {
  const i = run.snacks.indexOf(null);
  if (i < 0) return false;
  run.snacks[i] = id;
  return true;
}

export function cardPool(hero: HeroId, rarity?: string) {
  return CARDS.filter((c) => (c.hero === hero || c.hero === "any") && c.rarity !== "starter" && c.rarity !== "curse" && (!rarity || c.rarity === rarity));
}

function rollCard(run: Run, kind: Tier | "shop", exclude: string[]): CardInst {
  const w: [string, number][] =
    kind === "boss" ? [["rare", 100]] : kind === "elite" ? [["common", 45], ["uncommon", 40], ["rare", 15]] : [["common", 60], ["uncommon", 32], ["rare", 8]];
  const r = weighted(run, w);
  let pool = cardPool(run.hero, r).filter((c) => !exclude.includes(c.id));
  // lean toward the hero's own cards
  const own = pool.filter((c) => c.hero === run.hero);
  if (own.length && rand(run) < 0.7) pool = own;
  if (!pool.length) pool = cardPool(run.hero).filter((c) => !exclude.includes(c.id));
  const def = rpick(run, pool);
  const up = has(run, "loaded-die") && rand(run) < 0.4;
  return card(run, def.id, up);
}

export function healHero(run: Run, n: number) {
  run.hp = Math.min(run.maxHp, run.hp + Math.max(0, Math.round(n)));
}

export function heroCrit(run: Run, extra = 0): number {
  const c = run.combat;
  let p = run.hero === "penny" ? 0.1 : 0;
  p += (c?.st.luck ?? 0) * 0.05;
  if (has(run, "clover-sticker")) p += 0.1;
  p += run.perks.crit * 0.05;
  return Math.min(0.95, p + extra);
}

export function energyPerTurn(run: Run): number {
  let e = 3;
  for (const t of ["nine-volt", "royal-lint", "velvet-throne", "spring-coil"]) if (has(run, t)) e++;
  return e;
}

// ---------------- combat ----------------

function ascHp(run: Run) {
  return run.asc >= 1 ? 1.1 : 1;
}

function makeEnemy(run: Run, id: string): Enemy {
  const d = ENEMY[id];
  const hp = Math.round(rint(run, d.hp[0], d.hp[1]) * ascHp(run));
  const e: Enemy = { uid: run.uid++, id, hp, maxHp: hp, block: 0, st: {}, pi: 0, move: null, extra: 0, sinceRewind: 0, dead: false, fresh: false, phase2: false };
  if (d.randomStart && d.pattern) e.pi = rint(run, 0, d.pattern.length - 1);
  for (const [s, n] of d.start ?? []) e.st[s] = n;
  return e;
}

function push(c: Combat, kind: FxKind, who: "hero" | number, n?: number, text?: string) {
  c.fx.push({ seq: ++c.seq, kind, who, n, text });
  if (c.fx.length > 60) c.fx.splice(0, c.fx.length - 60);
}

export function startCombat(run: Run, ids: string[], kind: Tier, bonusTrinket = false) {
  const c: Combat = {
    kind,
    bonusTrinket,
    enemies: ids.map((id) => makeEnemy(run, id)),
    block: 0,
    st: {},
    draw: shuffle(run, run.deck.map((x) => ({ ...x }))),
    hand: [],
    discard: [],
    exhaust: [],
    energy: 0,
    maxEnergy: energyPerTurn(run),
    turn: 0,
    phase: "player",
    attacksThisTurn: 0,
    attacksTotal: 0,
    lostHpThisTurn: false,
    zeroCost: [],
    staticUids: [],
    enemyIdx: 0,
    freshHero: [],
    fx: [],
    seq: 0,
  };
  run.combat = c;
  run.screen = "combat";
  // hero setup
  const str = (has(run, "rubber-band") ? 1 : 0) + run.perks.str;
  if (str) c.st.str = str;
  if (has(run, "toy-soldier")) c.st.thorns = 3;
  if (has(run, "big-keychain")) c.st.static = 1;
  c.block += (has(run, "bottle-cap") ? 10 : 0) + run.perks.block;
  if (has(run, "spring-coil")) run.hp = Math.max(1, run.hp - 3);
  // enemy setup
  for (const e of c.enemies) {
    if (run.hero === "key") addStatus(c, e, "vuln", 1);
    if (has(run, "lost-earring")) addStatus(c, e, "vuln", 2);
    if (has(run, "googly-eye")) addStatus(c, e, "weak", 1);
    if (has(run, "velvet-throne")) e.block += 5;
  }
  if (has(run, "birthday-candle")) for (const e of alive(c)) hitEnemy(run, e, 5, false);
  if (c.phase === "won") return;
  for (const e of c.enemies) chooseMove(run, e);
  startPlayerTurn(run);
}

export const alive = (c: Combat) => c.enemies.filter((e) => !e.dead);

function addStatus(c: Combat, who: Enemy | "hero", s: StatusId, n: number) {
  const st = who === "hero" ? c.st : who.st;
  st[s] = (st[s] ?? 0) + n;
  if ((st[s] ?? 0) <= 0) delete st[s];
  push(c, "status", who === "hero" ? "hero" : who.uid, n, STATUS[s].name);
}

function heroAddStatus(run: Run, s: StatusId, n: number) {
  if (has(run, "sunglasses") && (s === "weak" || s === "frail")) return;
  const c = run.combat!;
  if (c.phase === "enemy" && !c.freshHero.includes(s)) c.freshHero.push(s);
  addStatus(c, "hero", s, n);
}

function drawCards(run: Run, n: number) {
  const c = run.combat!;
  for (let i = 0; i < n; i++) {
    if (c.hand.length >= HAND_MAX) return;
    if (!c.draw.length) {
      if (!c.discard.length) return;
      c.draw = shuffle(run, c.discard);
      c.discard = [];
    }
    c.hand.push(c.draw.pop()!);
  }
}

function startPlayerTurn(run: Run) {
  const c = run.combat!;
  if (c.phase === "won" || c.phase === "lost") return;
  c.turn++;
  run.stats.turns++;
  c.phase = "player";
  c.attacksThisTurn = 0;
  c.lostHpThisTurn = false;
  c.zeroCost = [];
  c.staticUids = [];
  // block decay
  if (c.turn > 1) {
    if (c.st.keepall) {
      /* keep */
    } else {
      let keep = run.hero === "button" ? Math.floor(c.block / 2) : 0;
      if (has(run, "cork")) keep = Math.max(keep, Math.min(10, c.block));
      c.block = keep;
    }
  }
  // grime
  if (c.st.grime) {
    loseHp(run, c.st.grime, "Grime");
    c.st.grime--;
    if (!c.st.grime) delete c.st.grime;
    if (run.hp <= 0) return;
  }
  c.energy = c.maxEnergy + (c.st.energy ?? 0);
  if (c.turn === 1 && has(run, "aa-battery")) c.energy++;
  if (has(run, "tape-measure") && c.turn % 3 === 0) c.energy += 2;
  if (c.st.fort) gainBlock(run, c.st.fort, false);
  if (has(run, "thread-spool")) gainBlock(run, 3, false);
  if (c.st.grow) addStatus(c, "hero", "str", c.st.grow);
  if (c.st.rust) for (const e of alive(c)) addStatus(c, e, "grime", c.st.rust);
  if (has(run, "rusty-nail") && alive(c).length) addStatus(c, rpick(run, alive(c)), "grime", 2);
  let n = 5;
  if (has(run, "big-keychain")) n++;
  if (c.turn === 1) n += (has(run, "marble") ? 2 : 0) + run.perks.draw1;
  drawCards(run, n);
  if (c.st.static) {
    const pool = shuffle(run, c.hand.filter((h) => CARD[h.id].cost >= 0).map((h) => h.uid));
    c.staticUids = pool.slice(0, c.st.static);
    delete c.st.static;
  }
}

export function cardCost(run: Run, ci: CardInst): number {
  const c = run.combat;
  const v = viewCard(ci);
  if (v.cost < 0) return -1;
  if (c?.zeroCost.includes(ci.uid)) return 0;
  return v.cost + (c?.staticUids.includes(ci.uid) ? 1 : 0);
}

export function canPlay(run: Run, ci: CardInst): boolean {
  const c = run.combat;
  if (!c || c.phase !== "player") return false;
  const cost = cardCost(run, ci);
  return cost >= 0 && cost <= c.energy;
}

export function needsTarget(ci: CardInst): boolean {
  return CARD[ci.id].target === "enemy";
}

function gainBlock(run: Run, n: number, fromCard: boolean) {
  const c = run.combat!;
  let b = n;
  if (fromCard && has(run, "thimble")) b += 2;
  if (c.st.frail) b = Math.floor(b * 0.75);
  if (b <= 0) return;
  c.block += b;
  push(c, "block", "hero", b);
}

function loseHp(run: Run, n: number, source: string) {
  const c = run.combat!;
  if (n <= 0) return;
  run.hp -= n;
  push(c, "dmg", "hero", n);
  if (!c.lostHpThisTurn) {
    c.lostHpThisTurn = true;
    if (has(run, "sock-puppet") && c.phase === "enemy") addStatus(c, "hero", "str", 1);
  }
  if (run.hp <= 0) {
    if (has(run, "safety-pin") && !run.flags.pinUsed) {
      run.flags.pinUsed = true;
      run.hp = 1;
      push(c, "text", "hero", undefined, "Safety Pin!");
      return;
    }
    run.hp = 0;
    run.killer = source;
    c.phase = "lost";
    endRun(run, false);
  }
}

// damage a hero attack deals to one enemy (before block)
export function heroHitDamage(run: Run, base: number, e: Enemy | null, mult = 1): number {
  const c = run.combat!;
  let d = base + (c.st.str ?? 0);
  if (c.st.weak) d *= 0.75;
  if (e?.st.vuln) d *= has(run, "red-crayon") ? 1.75 : 1.5;
  d *= mult;
  return Math.max(0, Math.floor(d));
}

function hitEnemy(run: Run, e: Enemy, amount: number, attack: boolean, crit = false) {
  const c = run.combat!;
  if (e.dead) return;
  let a = amount;
  if (e.block) {
    const b = Math.min(e.block, a);
    e.block -= b;
    a -= b;
  }
  e.hp -= a;
  e.sinceRewind += a;
  run.stats.dmgDealt += a;
  run.stats.biggestHit = Math.max(run.stats.biggestHit, amount);
  push(c, crit ? "crit" : "dmg", e.uid, amount);
  if (attack && e.st.thorns) {
    damageHero(run, e.st.thorns, ENEMY[e.id].name, false);
  }
  if (e.hp <= 0) killEnemy(run, e);
  else checkPhase(run, e);
}

function checkPhase(run: Run, e: Enemy) {
  if (e.id === "vacuum" && !e.phase2 && e.hp <= e.maxHp / 2) {
    e.phase2 = true;
    e.st.str = (e.st.str ?? 0) + 3;
    e.pi = 0;
    push(run.combat!, "text", e.uid, undefined, "Bag full!");
  }
}

function killEnemy(run: Run, e: Enemy) {
  const c = run.combat!;
  e.hp = 0;
  e.dead = true;
  push(c, "die", e.uid);
  run.stats.kills++;
  const d = ENEMY[e.id];
  if (has(run, "popcorn-kernel")) healHero(run, 3);
  for (const o of alive(c)) {
    if (o.st.swarm) addStatus(c, o, "str", o.st.swarm);
  }
  if (e.st.split) {
    const room = 5 - alive(c).length;
    for (let i = 0; i < Math.min(2, room); i++) {
      const m = makeEnemy(run, "mini-slime");
      m.fresh = c.phase === "enemy";
      chooseMove(run, m);
      c.enemies.push(m);
      push(c, "summon", m.uid);
    }
  }
  if (d.tier === "boss") {
    for (const o of alive(c)) {
      o.dead = true;
      o.hp = 0;
      push(c, "die", o.uid);
    }
  }
  if (!alive(c).length && c.phase !== "lost") winCombat(run);
}

function damageHero(run: Run, amount: number, source: string, _attack: boolean) {
  const c = run.combat!;
  if (c.phase === "lost" || c.phase === "won") return;
  let a = Math.max(0, Math.floor(amount));
  if (c.block) {
    const b = Math.min(c.block, a);
    c.block -= b;
    a -= b;
    if (b) push(c, "text", "hero", b, "blocked");
  }
  if (a > 0) loseHp(run, a, source);
}

type CardFx = Fx;

export function playCard(run: Run, uid: number, targetUid?: number): boolean {
  const c = run.combat;
  if (!c || c.phase !== "player") return false;
  const idx = c.hand.findIndex((h) => h.uid === uid);
  if (idx < 0) return false;
  const ci = c.hand[idx];
  const v = viewCard(ci);
  const def = v.def;
  if (!canPlay(run, ci)) return false;
  let target: Enemy | undefined;
  if (def.target === "enemy") {
    target = alive(c).find((e) => e.uid === targetUid) ?? (alive(c).length === 1 ? alive(c)[0] : undefined);
    if (!target) return false;
  }
  const cost = cardCost(run, ci);
  c.energy -= cost;
  c.hand.splice(idx, 1);
  run.stats.cardsPlayed++;
  push(c, "card", "hero", undefined, v.name);

  const isAttack = def.type === "attack";
  let aoe = def.target === "all";
  let reps = 1;
  let mult = 1;
  if (isAttack) {
    c.attacksThisTurn++;
    c.attacksTotal++;
    if (has(run, "bent-paperclip") && c.attacksTotal % 3 === 0 && def.target !== "self") aoe = true;
    if (c.st.echo) {
      reps = 2;
      c.st.echo--;
      if (!c.st.echo) delete c.st.echo;
    }
    if (c.st.double) {
      mult = 2;
      delete c.st.double;
    }
  }
  const firstAttack = isAttack && c.attacksThisTurn === 1;

  for (let r = 0; r < reps; r++) {
    if (c.phase !== "player") break;
    resolve(run, v.fx, def.target, aoe, target, mult, v.crit, false);
  }
  if (run.hero === "pick" && firstAttack && c.phase === "player") {
    push(c, "text", "hero", undefined, "Encore!");
    resolve(run, v.fx.filter((f) => f.k === "dmg" || (f.k === "special" && ["rolldmg", "dmgvuln", "solo", "corrode", "dmgblock"].includes(f.id))), def.target, aoe, target, mult * 0.5, v.crit, true);
  }
  if (c.phase !== "player") {
    // fight ended mid-card
    return true;
  }
  if (isAttack && has(run, "lucky-coin")) addStatus(c, "hero", "luck", 1);
  if (cost === 0 && has(run, "hair-clip") && alive(c).length) hitEnemy(run, rpick(run, alive(c)), 3, false);
  if (def.type === "skill" && has(run, "lint-ball")) gainBlock(run, 3, false);

  if (c.phase === "player") {
    if (v.exhaust) c.exhaust.push(ci);
    else if (def.type !== "power") c.discard.push(ci);
  }
  return true;
}

function targetsFor(run: Run, tgt: string, aoe: boolean, target?: Enemy): Enemy[] {
  const c = run.combat!;
  if (aoe) return alive(c);
  if (tgt === "random") return alive(c).length ? [rpick(run, alive(c))] : [];
  if (target && !target.dead) return [target];
  return [];
}

function resolve(run: Run, fx: CardFx[], tgt: string, aoe: boolean, target: Enemy | undefined, mult: number, critExtra: number, echoOnly: boolean) {
  const c = run.combat!;
  // one crit roll per card resolution
  const crit = rand(run) < heroCrit(run, critExtra);
  let critted = false;
  const attackHit = (e: Enemy, base: number) => {
    let d = heroHitDamage(run, base, e, mult);
    if (crit) {
      d *= 2;
      critted = true;
    }
    hitEnemy(run, e, d, true, crit);
    if (crit && has(run, "glitter") && !e.dead) addStatus(c, e, "vuln", 1);
  };
  for (const f of fx) {
    if (c.phase !== "player") return;
    switch (f.k) {
      case "dmg": {
        const hits = f.hits ?? 1;
        for (let h = 0; h < hits; h++) {
          const ts = targetsFor(run, tgt, aoe, target);
          for (const e of ts) attackHit(e, f.n);
          if (c.phase !== "player") return;
        }
        break;
      }
      case "block":
        if (!echoOnly) gainBlock(run, f.n, true);
        break;
      case "draw":
        drawCards(run, f.n);
        break;
      case "energy":
        c.energy += f.n;
        break;
      case "heal":
        healHero(run, f.n);
        push(c, "heal", "hero", f.n);
        break;
      case "crumbs":
        run.crumbs += f.n;
        push(c, "text", "hero", f.n, "crumbs");
        break;
      case "st": {
        if (f.to === "self") {
          if (f.s === "weak" || f.s === "frail") heroAddStatus(run, f.s, f.n);
          else addStatus(c, "hero", f.s, f.n);
        } else if (f.to === "all") {
          for (const e of alive(c)) addStatus(c, e, f.s, f.n);
        } else {
          const ts = targetsFor(run, tgt, aoe, target);
          for (const e of ts) addStatus(c, e, f.s, f.n);
        }
        break;
      }
      case "special":
        special(run, f, tgt, aoe, target, attackHit);
        break;
    }
  }
  if (critted) {
    push(c, "text", "hero", undefined, "CRIT!");
    if (c.st.streak) drawCards(run, c.st.streak);
    if (c.st.critblock) gainBlock(run, c.st.critblock, false);
  }
}

function special(run: Run, f: Extract<Fx, { k: "special" }>, tgt: string, aoe: boolean, target: Enemy | undefined, attackHit: (e: Enemy, base: number) => void) {
  const c = run.combat!;
  const ts = () => targetsFor(run, tgt, aoe, target);
  switch (f.id) {
    case "rolldmg": {
      const n = rint(run, f.n ?? 1, f.m ?? 6);
      push(c, "text", "hero", n, "rolled");
      for (const e of ts()) attackHit(e, n);
      break;
    }
    case "dmgblock":
      for (const e of ts()) attackHit(e, c.block);
      break;
    case "hemslam": {
      const b = c.block * 2;
      for (const e of ts()) attackHit(e, b);
      c.block = 0;
      break;
    }
    case "doubleblock":
      if (c.block) gainBlock(run, c.block, false);
      break;
    case "drawifvuln":
      if (target?.st.vuln) drawCards(run, f.n ?? 1);
      break;
    case "dmgvuln":
      for (const e of ts()) attackHit(e, (f.n ?? 0) + (e.st.vuln ? f.m ?? 0 : 0));
      break;
    case "corrode":
      for (const e of ts()) attackHit(e, (f.n ?? 0) + 2 * (e.st.grime ?? 0));
      break;
    case "solo":
      for (const e of ts()) attackHit(e, (f.n ?? 0) + (f.m ?? 0) * Math.max(0, c.attacksThisTurn - 1));
      break;
    case "copycard": {
      const others = c.hand.filter((h) => CARD[h.id].cost >= 0);
      if (others.length && c.hand.length < HAND_MAX) {
        const src = rpick(run, others);
        const cp = { uid: run.uid++, id: src.id, up: src.up };
        c.hand.push(cp);
        c.zeroCost.push(cp.uid);
      }
      break;
    }
    case "snack": {
      const s = rpick(run, SNACKS).id;
      if (addSnack(run, s)) push(c, "text", "hero", undefined, SNACK[s].name);
      break;
    }
  }
}

export function useSnack(run: Run, slot: number, targetUid?: number): boolean {
  const id = run.snacks[slot];
  if (!id) return false;
  const c = run.combat;
  const s = SNACK[id];
  const boost = has(run, "snow-globe") ? 1.5 : 1;
  if (!c || c.phase !== "player") {
    // outside combat only healing works
    if (id !== "gummy") return false;
    healHero(run, 12 * boost);
    run.snacks[slot] = null;
    return true;
  }
  let target: Enemy | undefined;
  if (s.target === "enemy") {
    target = alive(c).find((e) => e.uid === targetUid) ?? (alive(c).length === 1 ? alive(c)[0] : undefined);
    if (!target) return false;
  }
  run.snacks[slot] = null;
  switch (id) {
    case "gummy":
      healHero(run, 12 * boost);
      push(c, "heal", "hero", Math.round(12 * boost));
      break;
    case "hot-sauce":
      addStatus(c, "hero", "str", 2);
      break;
    case "popcorn":
      for (const e of alive(c)) hitEnemy(run, e, Math.round(10 * boost), false);
      break;
    case "espresso":
      c.energy += 2;
      break;
    case "mint":
      gainBlock(run, Math.round(12 * boost), false);
      break;
    case "cracker":
      drawCards(run, 3);
      break;
    case "jelly-bean":
      for (const e of alive(c)) {
        addStatus(c, e, "vuln", 2);
        addStatus(c, e, "weak", 2);
      }
      break;
    case "cheese-puff":
      if (target) addStatus(c, target, "grime", Math.round(8 * boost));
      break;
  }
  return true;
}

export function discardSnack(run: Run, slot: number) {
  run.snacks[slot] = null;
}

// ---- enemy side ----

function chooseMove(run: Run, e: Enemy) {
  const d = ENEMY[e.id];
  let pattern = d.pattern ?? d.moves.map((m) => m.id);
  if (e.id === "vacuum" && e.phase2) pattern = ["debris", "slam", "charge", "hoover", "suck"];
  let id = pattern[e.pi % pattern.length];
  e.pi++;
  if (e.id === "queen-bunny" && id === "summon") {
    const bunnies = alive(run.combat!).filter((x) => x.id === "dust-bunny").length;
    if (bunnies >= 2) id = "swipe";
  }
  e.move = id;
}

export function moveOf(e: Enemy): MoveDef | undefined {
  return ENEMY[e.id].moves.find((m) => m.id === e.move);
}

function enemyMult(run: Run, e: Enemy): number {
  const tier = ENEMY[e.id].tier;
  let m = 1;
  if (run.asc >= 2 && (tier === "elite" || tier === "boss")) m *= 1.15;
  if (run.asc >= 5) m *= 1.1;
  return m;
}

export function moveDamage(run: Run, e: Enemy, m: MoveDef): { dmg: number; hits: number } | null {
  if (m.dmg === undefined) return null;
  const c = run.combat!;
  let base = m.dmg;
  let hits = m.hits ?? 1;
  if (m.special === "morehits") hits = 2 + e.extra;
  if (m.special === "rollup") base = m.dmg + 3 * e.extra;
  let d = (base + (e.st.str ?? 0)) * enemyMult(run, e);
  if (e.st.weak) d *= 0.75;
  if (c.st.vuln) d *= 1.5;
  return { dmg: Math.max(0, Math.floor(d)), hits };
}

export function endTurn(run: Run): boolean {
  const c = run.combat;
  if (!c || c.phase !== "player") return false;
  // end-of-turn effects
  for (const h of c.hand) if (h.id === "crumb-mess") loseHp(run, 2, "Crumb Mess");
  if (c.phase !== "player") return true;
  if (has(run, "fridge-magnet") && c.energy > 0) gainBlock(run, 3 * c.energy, false);
  if (c.st.regen) {
    healHero(run, c.st.regen);
    push(c, "heal", "hero", c.st.regen);
    c.st.regen--;
    if (!c.st.regen) delete c.st.regen;
  }
  delete c.st.double;
  c.discard.push(...c.hand);
  c.hand = [];
  c.phase = "enemy";
  c.enemyIdx = 0;
  return true;
}

// runs one enemy's action; returns true when the enemy phase is finished
export function enemyStep(run: Run): boolean {
  const c = run.combat;
  if (!c || c.phase !== "enemy") return true;
  while (c.enemyIdx < c.enemies.length) {
    const e = c.enemies[c.enemyIdx++];
    if (e.dead || e.fresh) continue;
    e.block = 0;
    if (e.st.grime) {
      hitEnemyRaw(run, e, e.st.grime);
      if (!e.dead) {
        e.st.grime!--;
        if (!e.st.grime) delete e.st.grime;
      }
      if (e.dead) {
        if (c.phase !== "enemy") return true;
        continue;
      }
    }
    doMove(run, e);
    return c.phase !== "enemy" ? true : false;
  }
  finishEnemyPhase(run);
  return true;
}

function hitEnemyRaw(run: Run, e: Enemy, n: number) {
  const c = run.combat!;
  e.hp -= n;
  e.sinceRewind += n;
  run.stats.dmgDealt += n;
  push(c, "dmg", e.uid, n);
  if (e.hp <= 0) killEnemy(run, e);
  else checkPhase(run, e);
}

function doMove(run: Run, e: Enemy) {
  const c = run.combat!;
  const m = moveOf(e);
  if (!m) return;
  const name = ENEMY[e.id].name;
  push(c, "atk", e.uid, undefined, m.name);
  const md = moveDamage(run, e, m);
  if (md) {
    for (let h = 0; h < md.hits; h++) {
      damageHero(run, md.dmg, name, true);
      if (c.st.thorns && !e.dead) hitEnemyRaw(run, e, c.st.thorns);
      if (c.phase !== "enemy" || e.dead) break;
    }
    if (m.special === "morehits" || m.special === "rollup") e.extra++;
  }
  if (c.phase !== "enemy") return;
  if (e.dead) return;
  if (m.block) {
    e.block += m.block;
    push(c, "block", e.uid, m.block);
  }
  for (const [s, n] of m.self ?? []) addStatus(c, e, s, n);
  for (const [s, n] of m.allies ?? []) for (const o of alive(c)) addStatus(c, o, s, n);
  for (const [s, n] of m.hero ?? []) heroAddStatus(run, s, n);
  if (m.special === "rewind") {
    const h = Math.min(30, e.sinceRewind, e.maxHp - e.hp);
    e.hp += h;
    e.sinceRewind = 0;
    for (const s of ["weak", "vuln", "grime"] as StatusId[]) delete e.st[s];
    push(c, "heal", e.uid, h);
  }
  if (m.special === "steal") {
    const n = Math.min(run.crumbs, 10);
    run.crumbs -= n;
    if (n) push(c, "text", "hero", n, "crumbs stolen");
  }
  if (m.summon) {
    for (const id of m.summon) {
      if (alive(c).length >= 5) break;
      const s = makeEnemy(run, id);
      s.fresh = true;
      chooseMove(run, s);
      c.enemies.push(s);
      push(c, "summon", s.uid);
    }
  }
  if (m.addCard) {
    c.discard.push({ uid: run.uid++, id: m.addCard, up: false });
    push(c, "text", "hero", undefined, `+${CARD[m.addCard].name}`);
  }
  if (m.special === "explode") {
    e.dead = true;
    e.hp = 0;
    push(c, "die", e.uid);
    if (!alive(c).length) winCombat(run);
  }
}

function finishEnemyPhase(run: Run) {
  const c = run.combat!;
  for (const e of alive(c)) {
    for (const s of ["weak", "vuln", "frail"] as StatusId[]) {
      if (e.st[s] && !e.fresh) {
        e.st[s]!--;
        if (!e.st[s]) delete e.st[s];
      }
    }
    if (e.st.regen) {
      e.hp = Math.min(e.maxHp, e.hp + e.st.regen);
      e.st.regen--;
    }
    if (e.fresh) e.fresh = false;
    else chooseMove(run, e);
  }
  for (const s of ["weak", "vuln", "frail"] as StatusId[]) {
    if (c.st[s] && !c.freshHero.includes(s)) {
      c.st[s]!--;
      if (!c.st[s]) delete c.st[s];
    }
  }
  c.freshHero = [];
  startPlayerTurn(run);
}

function winCombat(run: Run) {
  const c = run.combat!;
  if (c.phase === "won") return;
  c.phase = "won";
  if (has(run, "gum-wrapper")) healHero(run, 4);
  if (has(run, "band-aid") && run.hp < run.maxHp / 2) healHero(run, 10);
  const kind = c.kind;
  if (kind === "elite") run.stats.elites++;
  if (kind === "boss") run.stats.bosses++;
  const crumbs = (kind === "boss" ? rint(run, 90, 110) : kind === "elite" ? rint(run, 30, 42) : rint(run, 14, 24)) + (has(run, "piggy-bank") ? 10 : 0);
  let n = 3 + (has(run, "old-receipt") ? 1 : 0) + (run.flags.eye ? 1 : 0) - (has(run, "royal-lint") ? 1 : 0);
  n = Math.max(1, n);
  const cards: CardInst[] = [];
  for (let i = 0; i < n; i++) cards.push(rollCard(run, kind, cards.map((x) => x.id)));
  let trinket: string | null = null;
  if (kind === "elite" || c.bonusTrinket) trinket = randomTrinket(run);
  if (kind === "elite" && has(run, "fortune-slip")) {
    const extra = randomTrinket(run, undefined, trinket ? [trinket] : []);
    if (extra) gainTrinket(run, extra);
  }
  const snack = rand(run) < (kind === "normal" ? 0.35 : 0.6) ? rpick(run, SNACKS).id : null;
  let boss: string[] | null = null;
  if (kind === "boss" && run.area < AREAS.length - 1) {
    boss = shuffle(run, TRINKETS.filter((t) => t.rarity === "boss" && !run.trinkets.includes(t.id)).map((t) => t.id)).slice(0, 3);
  }
  const xp = kind === "boss" ? 50 : kind === "elite" ? 25 : 10;
  run.reward = { crumbs, crumbsTaken: false, cards, trinket, snack, boss, xp };
  gainXp(run, xp);
  run.flags.afterBoss = kind === "boss";
  if (kind === "boss" && run.area === AREAS.length - 1) {
    endRun(run, true);
    return;
  }
  run.screen = "reward";
}

export function gainXp(run: Run, n: number) {
  run.xp += n;
  while (run.level < XP_LEVELS.length && run.xp >= XP_LEVELS[run.level]) {
    run.level++;
    run.pendingLevels++;
  }
}

export function xpProgress(run: Run): { into: number; need: number } {
  const lo = XP_LEVELS[run.level - 1] ?? 0;
  const hi = XP_LEVELS[run.level] ?? lo + 100;
  return { into: run.xp - lo, need: hi - lo };
}

// ---------------- rewards ----------------

export function takeCrumbs(run: Run) {
  if (!run.reward || run.reward.crumbsTaken) return;
  run.crumbs += run.reward.crumbs;
  run.reward.crumbsTaken = true;
}

export function takeCard(run: Run, uid: number | null) {
  if (!run.reward?.cards) return;
  const ci = run.reward.cards.find((x) => x.uid === uid);
  if (ci) run.deck.push(ci);
  run.reward.cards = null;
}

export function takeRewardTrinket(run: Run) {
  if (!run.reward?.trinket) return;
  gainTrinket(run, run.reward.trinket);
  run.reward.trinket = null;
}

export function takeRewardSnack(run: Run): boolean {
  if (!run.reward?.snack) return false;
  if (!addSnack(run, run.reward.snack)) return false;
  run.reward.snack = null;
  return true;
}

export function takeBossTrinket(run: Run, id: string | null) {
  if (!run.reward?.boss) return;
  if (id && run.reward.boss.includes(id)) gainTrinket(run, id);
  run.reward.boss = null;
}

// leave the reward screen
export function finishReward(run: Run) {
  if (!run.reward) return;
  takeCrumbs(run);
  takeRewardTrinket(run);
  run.reward = null;
  run.combat = null;
  afterNode(run);
}

function afterNode(run: Run) {
  if (run.pendingLevels > 0) {
    openLevelUp(run);
    return;
  }
  if (run.flags.afterBoss) {
    run.flags.afterBoss = false;
    nextArea(run);
    return;
  }
  run.screen = "map";
}

function nextArea(run: Run) {
  run.area++;
  run.pos = null;
  run.fightsInArea = 0;
  // the trip down heals part of the missing HP
  healHero(run, (run.maxHp - run.hp) * 0.6);
  run.map = genMap(run);
  run.screen = "map";
}

function openLevelUp(run: Run) {
  const pool = LEVEL_PERKS.filter((p) => !(p.id === "snack" && run.snacks.length >= 5));
  run.levelChoices = shuffle(run, pool.map((p) => p.id)).slice(0, 3);
  run.screen = "levelup";
}

export function choosePerk(run: Run, id: string) {
  if (!run.levelChoices?.includes(id)) return;
  switch (id) {
    case "hp":
      run.maxHp += 8;
      healHero(run, 8);
      break;
    case "crit":
      run.perks.crit++;
      break;
    case "draw1":
      run.perks.draw1++;
      break;
    case "block":
      run.perks.block += 5;
      break;
    case "snack":
      run.snacks.push(null);
      addSnack(run, rpick(run, SNACKS).id);
      break;
    case "heal":
      healHero(run, run.maxHp * 0.3);
      break;
    case "upgrade":
      upgradeRandom(run, 2);
      break;
    case "str":
      run.perks.str++;
      break;
    case "crumbs":
      run.crumbs += 60;
      break;
  }
  run.pendingLevels--;
  run.levelChoices = null;
  afterNode(run);
}

function upgradeRandom(run: Run, n: number): string[] {
  const pool = shuffle(run, run.deck.filter((c) => !c.up && CARD[c.id].type !== "curse"));
  const names: string[] = [];
  for (const c of pool.slice(0, n)) {
    c.up = true;
    names.push(CARD[c.id].name);
  }
  return names;
}

// ---------------- treasure ----------------

export function takeTreasure(run: Run, id: string | null) {
  const t = run.treasure;
  if (!t || t.taken) return;
  if (id && t.options.includes(id)) gainTrinket(run, id);
  run.crumbs += t.crumbs;
  t.taken = true;
}

export function leaveTreasure(run: Run) {
  if (run.treasure && !run.treasure.taken) takeTreasure(run, run.treasure.options[0] ?? null);
  run.treasure = null;
  afterNode(run);
}

// ---------------- camp ----------------

export function restHeal(run: Run): number {
  if (has(run, "nine-volt")) return 0;
  let p = run.asc >= 3 ? 0.2 : 0.3;
  if (run.flags.cozy) p += 0.1;
  return Math.round(run.maxHp * p + (has(run, "rubber-duck") ? 12 : 0));
}

export function campRest(run: Run) {
  if (run.screen !== "camp" || run.campDone) return;
  healHero(run, restHeal(run));
  run.campDone = true;
}

export function campUpgrade(run: Run) {
  if (run.screen !== "camp" || run.campDone) return;
  run.pick = { mode: "upgrade", back: "camp", count: 1, title: "Stitch a card (upgrade it)", cancel: true };
  run.screen = "pick";
}

export function leaveCamp(run: Run) {
  run.campDone = false;
  afterNode(run);
}

// ---------------- card picking (upgrade / remove / transform) ----------------

export function pickableCards(run: Run): CardInst[] {
  const p = run.pick;
  if (!p) return [];
  if (p.mode === "upgrade") return run.deck.filter((c) => !c.up && CARD[c.id].type !== "curse");
  return run.deck;
}

export function pickCard(run: Run, uid: number): string | null {
  const p = run.pick;
  if (!p) return null;
  const ci = pickableCards(run).find((c) => c.uid === uid);
  if (!ci) return null;
  let msg = "";
  if (p.mode === "upgrade") {
    ci.up = true;
    msg = `${CARD[ci.id].name} upgraded.`;
    if (p.back === "camp") run.campDone = true;
  } else if (p.mode === "remove") {
    run.deck = run.deck.filter((c) => c.uid !== uid);
    msg = `${CARD[ci.id].name} removed.`;
    if (p.back === "shop" && run.shop) {
      run.crumbs -= run.shop.removePrice;
      run.shop.removed = true;
      run.flags.removals++;
    }
  } else if (p.mode === "transform") {
    run.deck = run.deck.filter((c) => c.uid !== uid);
    const pool = cardPool(run.hero).filter((c) => c.id !== ci.id);
    const n = card(run, rpick(run, pool).id);
    run.deck.push(n);
    msg = `${CARD[ci.id].name} became ${CARD[n.id].name}.`;
  }
  p.count--;
  if (p.count <= 0) {
    run.screen = p.back;
    run.pick = null;
    if (run.event && run.screen === "event") run.event.result = (run.event.result ? run.event.result + " " : "") + msg;
  }
  return msg;
}

export function cancelPick(run: Run) {
  const p = run.pick;
  if (!p || !p.cancel) return;
  run.screen = p.back;
  run.pick = null;
}

// ---------------- shop ----------------

const CARD_PRICE: Record<string, [number, number]> = { common: [45, 60], uncommon: [70, 90], rare: [140, 170] };
const TRINKET_PRICE: Record<string, [number, number]> = { common: [120, 150], uncommon: [170, 210], rare: [230, 270], shop: [140, 170] };

export function discount(run: Run, p: number): number {
  return has(run, "coupon") ? Math.round(p * 0.75) : p;
}

export function genShop(run: Run): Shop {
  const cards: ShopItem<CardInst>[] = [];
  const ids: string[] = [];
  for (let i = 0; i < 5; i++) {
    const ci = rollCard(run, "shop", ids);
    ids.push(ci.id);
    const [a, b] = CARD_PRICE[CARD[ci.id].rarity] ?? [50, 60];
    cards.push({ item: ci, price: rint(run, a, b), sold: false });
  }
  const trinkets: ShopItem<string>[] = [];
  const tids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const t = i === 2 ? randomTrinket(run, "shop", tids) ?? randomTrinket(run, undefined, tids) : randomTrinket(run, undefined, tids);
    if (!t) continue;
    tids.push(t);
    const [a, b] = TRINKET_PRICE[TRINKET[t].rarity] ?? [150, 180];
    trinkets.push({ item: t, price: rint(run, a, b), sold: false });
  }
  const snacks: ShopItem<string>[] = shuffle(run, SNACKS.map((s) => s.id))
    .slice(0, 3)
    .map((s) => ({ item: s, price: rint(run, 35, 55), sold: false }));
  return { cards, trinkets, snacks, removePrice: 70 + 25 * run.flags.removals, removed: false };
}

export function buy(run: Run, kind: "card" | "trinket" | "snack", i: number): boolean {
  const s = run.shop;
  if (!s) return false;
  const list = kind === "card" ? s.cards : kind === "trinket" ? s.trinkets : s.snacks;
  const it = list[i];
  if (!it || it.sold) return false;
  const price = discount(run, it.price);
  if (run.crumbs < price) return false;
  if (kind === "snack" && !run.snacks.includes(null)) return false;
  run.crumbs -= price;
  it.sold = true;
  if (kind === "card") run.deck.push(it.item as CardInst);
  if (kind === "trinket") gainTrinket(run, it.item as string);
  if (kind === "snack") addSnack(run, it.item as string);
  return true;
}

export function shopRemove(run: Run): boolean {
  const s = run.shop;
  if (!s || s.removed) return false;
  if (run.crumbs < discount(run, s.removePrice)) return false;
  s.removePrice = discount(run, s.removePrice);
  run.pick = { mode: "remove", back: "shop", count: 1, title: "Remove a card from your deck", cancel: true };
  run.screen = "pick";
  return true;
}

export function leaveShop(run: Run) {
  run.shop = null;
  afterNode(run);
}

// ---------------- events ----------------

export function eventChoiceOk(run: Run, choiceId: string): boolean {
  const ev = run.event && EVENT[run.event.id];
  const ch = ev?.choices.find((c) => c.id === choiceId);
  if (!ch) return false;
  if (ch.cost && run.crumbs < ch.cost) return false;
  return true;
}

export function chooseEvent(run: Run, choiceId: string) {
  const st = run.event;
  if (!st || st.result !== null || !eventChoiceOk(run, choiceId)) return;
  const say = (s: string) => (st.result = s);
  const hurt = (n: number) => {
    run.hp = Math.max(1, run.hp - n);
  };
  switch (`${st.id}:${choiceId}`) {
    case "coin-jar:reach":
      if (rand(run) < 0.6) {
        run.crumbs += 60;
        say("Your hand closes around a fistful of coins. +60 crumbs.");
      } else {
        hurt(8);
        say("Something in the jar bites you! You lose 8 HP.");
      }
      break;
    case "fortune-cookie:crack": {
      const r = rint(run, 0, 3);
      if (r === 0) {
        const n = upgradeRandom(run, 1);
        say(`"Practice makes perfect." ${n[0] ? `${n[0]} is upgraded.` : "Nothing to upgrade."}`);
      } else if (r === 1) {
        const t = randomTrinket(run, "common");
        if (t) gainTrinket(run, t);
        say(`"A lost thing will find you." You found a ${t ? TRINKET[t].name : "nothing"}.`);
      } else if (r === 2) {
        run.crumbs += 40;
        say(`"Fortune favors the small." +40 crumbs.`);
      } else {
        run.deck.push(card(run, "crumb-mess"));
        say(`"You will make a mess." A Crumb Mess curse joins your deck.`);
      }
      break;
    }
    case "fortune-cookie:eat":
      healHero(run, 12);
      say("Crunchy and slightly sweet. You heal 12 HP.");
      break;
    case "lint-shrine:pray":
      hurt(6);
      say("The shrine accepts your offering.");
      run.pick = { mode: "remove", back: "event", count: 1, title: "Offer a card to the shrine (remove it)", cancel: false };
      run.screen = "pick";
      break;
    case "lint-shrine:nap": {
      const h = Math.round(run.maxHp * 0.15);
      healHero(run, h);
      say(`Softest nap ever. You heal ${h} HP.`);
      break;
    }
    case "toy-soldier:pay": {
      run.crumbs -= 40;
      const t = randomTrinket(run);
      if (t) gainTrinket(run, t);
      say(`"Pleasure doing business." You got a ${t ? TRINKET[t].name : "handshake"}.`);
      break;
    }
    case "toy-soldier:fight": {
      run.event = null;
      const area = AREAS[run.area];
      startCombat(run, rpick(run, area.normal), "normal", true);
      return;
    }
    case "sticky-candy:eat":
      run.hp = run.maxHp;
      run.deck.push(card(run, "sticky"));
      say("Delicious. You're fully healed, but now you're Sticky.");
      break;
    case "sticky-candy:lick":
      healHero(run, 8);
      say("Just a lick. You heal 8 HP.");
      break;
    case "sleeping-cat:sneak":
      if (rand(run) < 0.65) {
        const pool = cardPool(run.hero, "rare");
        const ci = card(run, rpick(run, pool).id);
        run.deck.push(ci);
        say(`You slip it out from under the paw: ${CARD[ci.id].name} joins your deck.`);
      } else {
        hurt(14);
        say("An eye opens. A paw swats. You lose 14 HP and flee empty-handed.");
      }
      break;
    case "battery-lick:lick": {
      hurt(5);
      const n = upgradeRandom(run, 2);
      say(`Zzzap! You lose 5 HP. Upgraded: ${n.join(", ") || "nothing"}.`);
      break;
    }
    case "crumb-feast:eat":
      healHero(run, 20);
      say("A pretzel feast. You heal 20 HP.");
      break;
    case "crumb-feast:pocket":
      run.crumbs += 45;
      say("You stuff your pockets. +45 crumbs.");
      break;
    case "mirror-shard:train": {
      hurt(7);
      const n = upgradeRandom(run, 1);
      say(`You train hard and lose 7 HP. ${n[0] ? `${n[0]} is upgraded.` : ""}`);
      run.pick = { mode: "upgrade", back: "event", count: 1, title: "Upgrade a card", cancel: false };
      if (pickableCards(run).length) run.screen = "pick";
      else run.pick = null;
      break;
    }
    case "mirror-shard:leave":
      run.maxHp += 1;
      run.hp += 1;
      say("Looking good. +1 max HP.");
      break;
    case "trading-stamp:swap":
      say("The stamp licks its lips.");
      run.pick = { mode: "transform", back: "event", count: 1, title: "Swap a card for a random one", cancel: false };
      run.screen = "pick";
      break;
    case "lost-snacks:take": {
      const got: string[] = [];
      for (let i = 0; i < 2; i++) {
        const s = rpick(run, SNACKS).id;
        if (addSnack(run, s)) got.push(SNACK[s].name);
      }
      say(got.length ? `You found: ${got.join(" and ")}.` : "Your pockets are full. You leave the snacks.");
      break;
    }
    case "lost-snacks:crumbs":
      run.crumbs += 25;
      say("You shake out 25 crumbs.");
      break;
    default:
      say("You move on.");
  }
}

export function leaveEvent(run: Run) {
  run.event = null;
  afterNode(run);
}

// ---------------- run end ----------------

export function lintFor(run: Run, won: boolean): number {
  const base = run.floor * 2 + run.stats.elites * 6 + run.stats.bosses * 20 + (won ? 40 : 0);
  return Math.round(base * (1 + run.asc * 0.1));
}

function endRun(run: Run, won: boolean) {
  run.lint = lintFor(run, won);
  run.screen = won ? "victory" : "over";
}

export function applyRunToMeta(run: Run, meta: Meta): Meta {
  const m: Meta = JSON.parse(JSON.stringify(meta));
  const won = run.screen === "victory";
  m.lint += run.lint ?? 0;
  m.totalLint += run.lint ?? 0;
  m.runs++;
  m.bestFloor = Math.max(m.bestFloor, totalFloor(run));
  if (won) {
    m.wins++;
    m.winsByHero[run.hero] = (m.winsByHero[run.hero] ?? 0) + 1;
    if (run.asc >= m.asc && m.asc < 5) m.asc = run.asc + 1;
  }
  return m;
}

export function totalFloor(run: Run): number {
  return run.area * (ROWS + 1) + (run.pos ? run.pos.row + 1 : 0);
}

export function abandonRun(run: Run) {
  run.lint = lintFor(run, false);
  run.killer = "Gave up";
  run.screen = "over";
}

// ---------------- meta ----------------

export function metaCost(meta: Meta, id: string): number | null {
  const u = META_UPGRADES.find((x) => x.id === id);
  if (!u) return null;
  const lvl = meta.up[id] ?? 0;
  return lvl < u.costs.length ? u.costs[lvl] : null;
}

export function buyMeta(meta: Meta, id: string): Meta | null {
  const cost = metaCost(meta, id);
  if (cost === null || meta.lint < cost) return null;
  const m: Meta = JSON.parse(JSON.stringify(meta));
  m.lint -= cost;
  m.up[id] = (m.up[id] ?? 0) + 1;
  return m;
}

export function unlockHero(meta: Meta, hero: HeroId): Meta | null {
  const cost = HEROES[hero].unlockCost;
  if (meta.unlocked.includes(hero) || meta.lint < cost) return null;
  const m: Meta = JSON.parse(JSON.stringify(meta));
  m.lint -= cost;
  m.unlocked.push(hero);
  return m;
}

export type { EnemyDef };
