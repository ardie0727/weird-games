// Down the Couch: all game content (heroes, cards, trinkets, snacks, enemies, events).
// Pure data plus tiny helpers, shared by the engine, the UI and the simulation test.

export type HeroId = "penny" | "button" | "key" | "pick";

export type StatusId =
  | "str" // Pumped: +N damage per hit
  | "weak" // Frayed: deal 25% less damage (turns)
  | "vuln" // Exposed: take 50% more damage (turns)
  | "frail" // Soggy: gain 25% less block (turns)
  | "grime" // Grime: lose N HP at start of turn, then N-1
  | "thorns" // Prickly: attackers take N damage per hit
  | "luck" // Lucky: +5% crit chance per stack
  | "fort" // Reinforced: gain N block at start of turn
  | "streak" // Hot Streak: draw N when you crit (once per card)
  | "critblock" // Copper Plating: gain N block when you crit
  | "double" // Double Down: next attack deals double damage
  | "echo" // Encore!: next attack is played twice
  | "rust" // Rust Trail: apply N grime to all enemies at start of turn
  | "grow" // Hype / Growing: gain N Pumped at start of turn
  | "energy" // Metronome: gain N energy at start of turn
  | "static" // Static: N cards in your hand cost 1 more this turn
  | "keepall" // Lined Pockets: block isn't reduced at end of turn
  | "regen" // Cozy: heal N at end of turn, then N-1
  | "swarm" // enemy: gains Pumped when an ally dies
  | "split"; // enemy: splits into two when killed

export interface StatusInfo {
  name: string;
  icon: string;
  good: boolean;
  desc: (n: number) => string;
  decays?: boolean; // loses 1 at end of the owner's turn
}

export const STATUS: Record<StatusId, StatusInfo> = {
  str: { name: "Pumped", icon: "💪", good: true, desc: (n) => `Deals ${n} more damage with each hit.` },
  weak: { name: "Frayed", icon: "🧶", good: false, decays: true, desc: (n) => `Deals 25% less damage for ${n} turn${n === 1 ? "" : "s"}.` },
  vuln: { name: "Exposed", icon: "🎯", good: false, decays: true, desc: (n) => `Takes 50% more damage for ${n} turn${n === 1 ? "" : "s"}.` },
  frail: { name: "Soggy", icon: "💧", good: false, decays: true, desc: (n) => `Gains 25% less block for ${n} turn${n === 1 ? "" : "s"}.` },
  grime: { name: "Grime", icon: "🦠", good: false, desc: (n) => `Loses ${n} HP at the start of its turn, then Grime goes down by 1.` },
  thorns: { name: "Prickly", icon: "📌", good: true, desc: (n) => `Attackers take ${n} damage for each hit.` },
  luck: { name: "Lucky", icon: "🍀", good: true, desc: (n) => `+${n * 5}% chance to crit (double damage).` },
  fort: { name: "Reinforced", icon: "🧵", good: true, desc: (n) => `Gains ${n} block at the start of each turn.` },
  streak: { name: "Hot Streak", icon: "🔥", good: true, desc: (n) => `Draw ${n} card${n === 1 ? "" : "s"} whenever you crit.` },
  critblock: { name: "Copper Plating", icon: "🪙", good: true, desc: (n) => `Gain ${n} block whenever you crit.` },
  double: { name: "Double Down", icon: "✖️", good: true, desc: () => `The next attack deals double damage.` },
  echo: { name: "Encore", icon: "🔁", good: true, desc: (n) => `The next ${n === 1 ? "attack is" : `${n} attacks are`} played twice.` },
  rust: { name: "Rust Trail", icon: "🟤", good: true, desc: (n) => `At the start of your turn, apply ${n} Grime to all enemies.` },
  grow: { name: "Growing", icon: "📈", good: true, desc: (n) => `Gains ${n} Pumped at the start of each turn.` },
  energy: { name: "Metronome", icon: "🎵", good: true, desc: (n) => `Gain ${n} extra energy at the start of each turn.` },
  static: { name: "Static", icon: "📻", good: false, desc: (n) => `${n} card${n === 1 ? "" : "s"} in hand cost 1 more next turn.` },
  keepall: { name: "Lined Pockets", icon: "👖", good: true, desc: () => `Block is kept between turns.` },
  regen: { name: "Cozy", icon: "☕", good: true, desc: (n) => `Heals ${n} at the end of its turn, then Cozy goes down by 1.` },
  swarm: { name: "Swarm", icon: "🐇", good: true, desc: (n) => `Gains ${n} Pumped when another bunny falls.` },
  split: { name: "Splits", icon: "🫧", good: true, desc: () => `Splits into two small slimes when defeated.` },
};

// ---------------- cards ----------------

export type Target = "enemy" | "all" | "self" | "random";
export type CardType = "attack" | "skill" | "power" | "curse";
export type Rarity = "starter" | "common" | "uncommon" | "rare" | "curse";

export type Fx =
  | { k: "dmg"; n: number; hits?: number }
  | { k: "block"; n: number }
  | { k: "draw"; n: number }
  | { k: "energy"; n: number }
  | { k: "st"; s: StatusId; n: number; to: "target" | "self" | "all" }
  | { k: "heal"; n: number }
  | { k: "crumbs"; n: number }
  | { k: "special"; id: string; n?: number; m?: number };

export interface CardDef {
  id: string;
  name: string;
  hero: HeroId | "any" | "none";
  rarity: Rarity;
  type: CardType;
  cost: number; // -1 = unplayable
  target: Target;
  fx: Fx[];
  exhaust?: boolean;
  crit?: number; // extra crit chance for this card (0..1)
  text?: string; // custom description (use {n} {m} from first special)
  up: { cost?: number; fx?: Fx[]; exhaust?: boolean; crit?: number; text?: string };
}

const C = (d: CardDef) => d;
const dmg = (n: number, hits?: number): Fx => (hits ? { k: "dmg", n, hits } : { k: "dmg", n });
const block = (n: number): Fx => ({ k: "block", n });
const draw = (n: number): Fx => ({ k: "draw", n });
const energy = (n: number): Fx => ({ k: "energy", n });
const st = (s: StatusId, n: number, to: "target" | "self" | "all" = "target"): Fx => ({ k: "st", s, n, to });
const heal = (n: number): Fx => ({ k: "heal", n });
const sp = (id: string, n?: number, m?: number): Fx => ({ k: "special", id, n, m });

export const CARDS: CardDef[] = [
  // ---- shared ----
  C({ id: "flick", name: "Flick", hero: "any", rarity: "common", type: "attack", cost: 1, target: "enemy", fx: [dmg(8)], up: { fx: [dmg(11)] } }),
  C({ id: "brush-off", name: "Brush Off", hero: "any", rarity: "common", type: "skill", cost: 0, target: "self", fx: [block(4)], up: { fx: [block(7)] } }),
  C({ id: "pocket-lint", name: "Pocket Lint", hero: "any", rarity: "common", type: "skill", cost: 0, target: "self", fx: [heal(4)], exhaust: true, up: { fx: [heal(7)] } }),
  C({ id: "ricochet", name: "Ricochet", hero: "any", rarity: "common", type: "attack", cost: 1, target: "random", fx: [dmg(3, 3)], up: { fx: [dmg(4, 3)] } }),
  C({ id: "static-shock", name: "Static Shock", hero: "any", rarity: "common", type: "attack", cost: 1, target: "all", fx: [dmg(5)], up: { fx: [dmg(8)] } }),
  C({ id: "second-wind", name: "Second Wind", hero: "any", rarity: "common", type: "skill", cost: 1, target: "self", fx: [draw(2)], up: { cost: 0 } }),
  C({ id: "sugar-rush", name: "Sugar Rush", hero: "any", rarity: "uncommon", type: "skill", cost: 0, target: "self", fx: [energy(1)], exhaust: true, up: { fx: [energy(2)] } }),
  C({ id: "scavenge", name: "Scavenge", hero: "any", rarity: "common", type: "skill", cost: 1, target: "self", fx: [{ k: "crumbs", n: 15 }, block(3)], exhaust: true, up: { fx: [{ k: "crumbs", n: 25 }, block(5)] } }),
  C({ id: "brace", name: "Brace", hero: "any", rarity: "uncommon", type: "power", cost: 1, target: "self", fx: [st("fort", 3, "self")], up: { fx: [st("fort", 5, "self")] } }),
  C({ id: "pump-up", name: "Pump Up", hero: "any", rarity: "uncommon", type: "power", cost: 1, target: "self", fx: [st("str", 2, "self")], up: { fx: [st("str", 3, "self")] } }),
  C({ id: "dust-cloud", name: "Dust Cloud", hero: "any", rarity: "common", type: "skill", cost: 1, target: "all", fx: [st("weak", 2, "all"), block(3)], up: { fx: [st("weak", 3, "all"), block(5)] } }),
  C({ id: "big-swing", name: "Big Swing", hero: "any", rarity: "common", type: "attack", cost: 2, target: "enemy", fx: [dmg(17)], up: { fx: [dmg(23)] } }),
  C({ id: "desperate-roll", name: "Desperate Roll", hero: "any", rarity: "common", type: "attack", cost: 0, target: "enemy", fx: [dmg(4), draw(1)], up: { fx: [dmg(7), draw(1)] } }),
  C({ id: "hunker", name: "Hunker Down", hero: "any", rarity: "common", type: "skill", cost: 1, target: "self", fx: [block(8)], up: { fx: [block(11)] } }),
  C({ id: "snack-break", name: "Snack Break", hero: "any", rarity: "rare", type: "skill", cost: 1, target: "self", fx: [sp("snack")], exhaust: true, text: "Get a random snack.", up: { cost: 0 } }),
  C({ id: "second-helping", name: "Second Helping", hero: "any", rarity: "rare", type: "power", cost: 2, target: "self", fx: [st("regen", 3, "self"), st("fort", 2, "self")], up: { cost: 1 } }),

  // ---- curses ----
  C({ id: "sticky", name: "Sticky", hero: "none", rarity: "curse", type: "curse", cost: -1, target: "self", fx: [], text: "Can't be played. Just sits in your hand, being sticky.", up: {} }),
  C({ id: "crumb-mess", name: "Crumb Mess", hero: "none", rarity: "curse", type: "curse", cost: -1, target: "self", fx: [], text: "Can't be played. If it's in your hand at the end of your turn, lose 2 HP.", up: {} }),

  // ---- Penny ----
  C({ id: "flip", name: "Flip", hero: "penny", rarity: "starter", type: "attack", cost: 1, target: "enemy", fx: [dmg(6)], up: { fx: [dmg(9)] } }),
  C({ id: "duck", name: "Duck", hero: "penny", rarity: "starter", type: "skill", cost: 1, target: "self", fx: [block(5)], up: { fx: [block(8)] } }),
  C({ id: "lucky-toss", name: "Lucky Toss", hero: "penny", rarity: "starter", type: "attack", cost: 1, target: "enemy", fx: [dmg(4), st("luck", 2, "self")], up: { fx: [dmg(6), st("luck", 3, "self")] } }),
  C({ id: "coin-toss", name: "Coin Toss", hero: "penny", rarity: "common", type: "attack", cost: 1, target: "enemy", fx: [dmg(7)], crit: 0.4, text: "Deal {d} damage. +40% crit chance.", up: { fx: [dmg(10)] } }),
  C({ id: "jackpot", name: "Jackpot", hero: "penny", rarity: "uncommon", type: "attack", cost: 2, target: "enemy", fx: [dmg(3, 4)], up: { fx: [dmg(3, 5)] } }),
  C({ id: "hot-streak", name: "Hot Streak", hero: "penny", rarity: "uncommon", type: "power", cost: 1, target: "self", fx: [st("streak", 1, "self")], up: { cost: 0 } }),
  C({ id: "four-leaf", name: "Four-Leaf", hero: "penny", rarity: "uncommon", type: "power", cost: 2, target: "self", fx: [st("luck", 6, "self")], up: { cost: 1 } }),
  C({ id: "spare-change", name: "Spare Change", hero: "penny", rarity: "common", type: "skill", cost: 0, target: "self", fx: [block(3), st("luck", 1, "self")], up: { fx: [block(5), st("luck", 1, "self")] } }),
  C({ id: "double-down", name: "Double Down", hero: "penny", rarity: "uncommon", type: "skill", cost: 1, target: "self", fx: [st("double", 1, "self")], up: { cost: 0 } }),
  C({ id: "shiny", name: "Shiny Distraction", hero: "penny", rarity: "common", type: "skill", cost: 1, target: "enemy", fx: [st("weak", 2), st("luck", 1, "self"), block(4)], up: { fx: [st("weak", 3), st("luck", 1, "self"), block(6)] } }),
  C({ id: "penny-thoughts", name: "Penny for Your Thoughts", hero: "penny", rarity: "common", type: "skill", cost: 1, target: "self", fx: [draw(3)], up: { fx: [draw(4)] } }),
  C({ id: "roll-dice", name: "Roll the Dice", hero: "penny", rarity: "common", type: "attack", cost: 1, target: "enemy", fx: [sp("rolldmg", 2, 14)], text: "Deal {n} to {m} damage at random.", up: { fx: [sp("rolldmg", 5, 18)] } }),
  C({ id: "mint-condition", name: "Mint Condition", hero: "penny", rarity: "uncommon", type: "skill", cost: 2, target: "self", fx: [block(13), st("luck", 2, "self")], up: { fx: [block(17), st("luck", 3, "self")] } }),
  C({ id: "all-in", name: "All In", hero: "penny", rarity: "rare", type: "attack", cost: 3, target: "enemy", fx: [dmg(28)], crit: 0.25, text: "Deal {d} damage. +25% crit chance.", up: { fx: [dmg(38)] } }),
  C({ id: "copper-plating", name: "Copper Plating", hero: "penny", rarity: "rare", type: "power", cost: 1, target: "self", fx: [st("critblock", 4, "self")], up: { fx: [st("critblock", 6, "self")] } }),
  C({ id: "heads-i-win", name: "Heads I Win", hero: "penny", rarity: "rare", type: "attack", cost: 1, target: "all", fx: [dmg(6), st("luck", 2, "self")], up: { fx: [dmg(9), st("luck", 3, "self")] } }),

  // ---- Button ----
  C({ id: "needle-jab", name: "Needle Jab", hero: "button", rarity: "starter", type: "attack", cost: 1, target: "enemy", fx: [dmg(6)], up: { fx: [dmg(9)] } }),
  C({ id: "stitch-up", name: "Stitch Up", hero: "button", rarity: "starter", type: "skill", cost: 1, target: "self", fx: [block(5)], up: { fx: [block(8)] } }),
  C({ id: "thread-lash", name: "Thread Lash", hero: "button", rarity: "starter", type: "attack", cost: 1, target: "enemy", fx: [dmg(5), block(4)], up: { fx: [dmg(7), block(6)] } }),
  C({ id: "shield-bash", name: "Shield Bash", hero: "button", rarity: "common", type: "attack", cost: 1, target: "enemy", fx: [sp("dmgblock")], text: "Deal damage equal to your block.", up: { cost: 0 } }),
  C({ id: "double-stitch", name: "Double Stitch", hero: "button", rarity: "uncommon", type: "skill", cost: 2, target: "self", fx: [sp("doubleblock")], text: "Double your block.", up: { cost: 1 } }),
  C({ id: "iron-thread", name: "Iron Thread", hero: "button", rarity: "uncommon", type: "power", cost: 1, target: "self", fx: [st("fort", 3, "self")], up: { fx: [st("fort", 5, "self")] } }),
  C({ id: "quilted-wall", name: "Quilted Wall", hero: "button", rarity: "common", type: "skill", cost: 2, target: "self", fx: [block(15)], up: { fx: [block(20)] } }),
  C({ id: "prickly-pins", name: "Prickly Pins", hero: "button", rarity: "uncommon", type: "power", cost: 1, target: "self", fx: [st("thorns", 3, "self")], up: { fx: [st("thorns", 5, "self")] } }),
  C({ id: "patch-job", name: "Patch Job", hero: "button", rarity: "common", type: "skill", cost: 1, target: "self", fx: [block(7), heal(2)], up: { fx: [block(10), heal(3)] } }),
  C({ id: "unravel", name: "Unravel", hero: "button", rarity: "common", type: "attack", cost: 1, target: "enemy", fx: [dmg(8), st("weak", 1)], up: { fx: [dmg(10), st("weak", 2)] } }),
  C({ id: "buttonhole", name: "Buttonhole", hero: "button", rarity: "common", type: "skill", cost: 1, target: "self", fx: [block(6), draw(1)], up: { fx: [block(9), draw(1)] } }),
  C({ id: "taut-string", name: "Taut String", hero: "button", rarity: "uncommon", type: "attack", cost: 2, target: "all", fx: [dmg(11)], up: { fx: [dmg(15)] } }),
  C({ id: "sewn-on", name: "Sewn On", hero: "button", rarity: "uncommon", type: "skill", cost: 1, target: "self", fx: [st("str", 1, "self"), block(6)], up: { fx: [st("str", 2, "self"), block(7)] } }),
  C({ id: "hem-slam", name: "Hem Slam", hero: "button", rarity: "rare", type: "attack", cost: 3, target: "enemy", fx: [sp("hemslam")], text: "Deal damage equal to twice your block, then lose all block.", up: { cost: 2 } }),
  C({ id: "lined-pockets", name: "Lined Pockets", hero: "button", rarity: "rare", type: "power", cost: 2, target: "self", fx: [st("keepall", 1, "self")], up: { cost: 1 } }),
  C({ id: "tough-love", name: "Tough Love", hero: "button", rarity: "rare", type: "skill", cost: 1, target: "self", fx: [block(10), st("thorns", 2, "self")], exhaust: true, up: { fx: [block(14), st("thorns", 3, "self")] } }),

  // ---- Key ----
  C({ id: "jab", name: "Jab", hero: "key", rarity: "starter", type: "attack", cost: 1, target: "enemy", fx: [dmg(6)], up: { fx: [dmg(9)] } }),
  C({ id: "hide", name: "Hide", hero: "key", rarity: "starter", type: "skill", cost: 1, target: "self", fx: [block(5)], up: { fx: [block(8)] } }),
  C({ id: "unlock", name: "Unlock", hero: "key", rarity: "starter", type: "skill", cost: 0, target: "enemy", fx: [st("vuln", 2)], up: { fx: [st("vuln", 3), draw(1)] } }),
  C({ id: "skeleton-key", name: "Skeleton Key", hero: "key", rarity: "common", type: "attack", cost: 1, target: "enemy", fx: [dmg(8), sp("drawifvuln", 1)], text: "Deal {d} damage. If the target is Exposed, draw 1.", up: { fx: [dmg(11), sp("drawifvuln", 1)] } }),
  C({ id: "master-key", name: "Master Key", hero: "key", rarity: "common", type: "skill", cost: 1, target: "all", fx: [st("vuln", 2, "all")], up: { fx: [st("vuln", 3, "all"), block(4)] } }),
  C({ id: "turn-lock", name: "Turn the Lock", hero: "key", rarity: "uncommon", type: "attack", cost: 2, target: "enemy", fx: [sp("dmgvuln", 13, 8)], text: "Deal {n} damage, or {n}+{m} if the target is Exposed.", up: { fx: [sp("dmgvuln", 17, 10)] } }),
  C({ id: "jingle", name: "Jingle", hero: "key", rarity: "common", type: "attack", cost: 1, target: "all", fx: [dmg(3, 2)], up: { fx: [dmg(4, 2)] } }),
  C({ id: "rust-away", name: "Rust Away", hero: "key", rarity: "common", type: "skill", cost: 1, target: "enemy", fx: [st("grime", 5)], up: { fx: [st("grime", 8)] } }),
  C({ id: "secret-stash", name: "Secret Stash", hero: "key", rarity: "uncommon", type: "skill", cost: 0, target: "self", fx: [energy(1), draw(1)], exhaust: true, up: { fx: [energy(1), draw(2)] } }),
  C({ id: "deadbolt", name: "Deadbolt", hero: "key", rarity: "common", type: "skill", cost: 1, target: "enemy", fx: [block(8), st("vuln", 1)], up: { fx: [block(11), st("vuln", 2)] } }),
  C({ id: "copy-key", name: "Copy Key", hero: "key", rarity: "uncommon", type: "skill", cost: 1, target: "self", fx: [sp("copycard")], text: "Copy a random other card in your hand. The copy costs 0 this turn.", exhaust: true, up: { cost: 0 } }),
  C({ id: "rust-trail", name: "Rust Trail", hero: "key", rarity: "uncommon", type: "power", cost: 1, target: "self", fx: [st("rust", 1, "self")], up: { fx: [st("rust", 2, "self")] } }),
  C({ id: "open-sesame", name: "Open Sesame", hero: "key", rarity: "rare", type: "skill", cost: 2, target: "self", fx: [draw(4), energy(2)], exhaust: true, up: { cost: 1 } }),
  C({ id: "lockout", name: "Lockout", hero: "key", rarity: "uncommon", type: "skill", cost: 2, target: "all", fx: [st("weak", 2, "all"), st("vuln", 2, "all")], up: { fx: [st("weak", 3, "all"), st("vuln", 3, "all")] } }),
  C({ id: "corrode", name: "Corrode", hero: "key", rarity: "rare", type: "attack", cost: 1, target: "enemy", fx: [sp("corrode", 3)], text: "Deal 3 damage plus twice the target's Grime.", up: { fx: [sp("corrode", 3)], cost: 0 } }),

  // ---- Guitar Pick ----
  C({ id: "strum", name: "Strum", hero: "pick", rarity: "starter", type: "attack", cost: 1, target: "enemy", fx: [dmg(3, 2)], up: { fx: [dmg(5, 2)] } }),
  C({ id: "dodge", name: "Dodge", hero: "pick", rarity: "starter", type: "skill", cost: 1, target: "self", fx: [block(5)], up: { fx: [block(8)] } }),
  C({ id: "riff", name: "Riff", hero: "pick", rarity: "starter", type: "attack", cost: 0, target: "enemy", fx: [dmg(3), draw(1)], up: { fx: [dmg(5), draw(1)] } }),
  C({ id: "power-chord", name: "Power Chord", hero: "pick", rarity: "uncommon", type: "attack", cost: 2, target: "enemy", fx: [dmg(6, 3)], up: { fx: [dmg(8, 3)] } }),
  C({ id: "shred", name: "Shred", hero: "pick", rarity: "common", type: "attack", cost: 1, target: "enemy", fx: [dmg(2, 4)], up: { fx: [dmg(2, 6)] } }),
  C({ id: "stage-dive", name: "Stage Dive", hero: "pick", rarity: "common", type: "attack", cost: 1, target: "all", fx: [dmg(7)], up: { fx: [dmg(10)] } }),
  C({ id: "metronome", name: "Metronome", hero: "pick", rarity: "rare", type: "power", cost: 3, target: "self", fx: [st("energy", 1, "self")], up: { cost: 2 } }),
  C({ id: "feedback", name: "Feedback", hero: "pick", rarity: "common", type: "skill", cost: 1, target: "enemy", fx: [st("vuln", 2), draw(1)], up: { fx: [st("vuln", 3), draw(2)] } }),
  C({ id: "solo", name: "Guitar Solo", hero: "pick", rarity: "uncommon", type: "attack", cost: 1, target: "enemy", fx: [sp("solo", 3, 3)], text: "Deal {n} damage, plus {m} for each other attack played this turn.", up: { fx: [sp("solo", 4, 4)] } }),
  C({ id: "quick-tune", name: "Quick Tune", hero: "pick", rarity: "common", type: "skill", cost: 0, target: "self", fx: [draw(2)], exhaust: true, up: { exhaust: false } }),
  C({ id: "mosh-pit", name: "Mosh Pit", hero: "pick", rarity: "uncommon", type: "attack", cost: 2, target: "all", fx: [dmg(4, 3)], up: { fx: [dmg(5, 3)] } }),
  C({ id: "encore", name: "Encore!", hero: "pick", rarity: "uncommon", type: "skill", cost: 1, target: "self", fx: [st("echo", 1, "self")], up: { cost: 0 } }),
  C({ id: "hype", name: "Hype", hero: "pick", rarity: "rare", type: "power", cost: 2, target: "self", fx: [st("grow", 1, "self")], up: { cost: 1 } }),
  C({ id: "slide", name: "Slide", hero: "pick", rarity: "common", type: "skill", cost: 1, target: "self", fx: [block(7), draw(1)], up: { fx: [block(10), draw(1)] } }),
  C({ id: "sound-check", name: "Sound Check", hero: "pick", rarity: "common", type: "attack", cost: 1, target: "enemy", fx: [dmg(5), st("weak", 1), st("vuln", 1)], up: { fx: [dmg(7), st("weak", 2), st("vuln", 2)] } }),
];

export const CARD: Record<string, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c]));

export interface CardInst {
  uid: number;
  id: string;
  up: boolean;
}

export interface CardView {
  def: CardDef;
  name: string;
  cost: number;
  fx: Fx[];
  exhaust: boolean;
  crit: number;
  text: string;
}

export function viewCard(c: { id: string; up: boolean }): CardView {
  const def = CARD[c.id];
  const fx = (c.up && def.up.fx) || def.fx;
  const cost = c.up && def.up.cost !== undefined ? def.up.cost : def.cost;
  const exhaust = c.up && def.up.exhaust !== undefined ? def.up.exhaust : !!def.exhaust;
  const crit = (c.up && def.up.crit) || def.crit || 0;
  const text = describe(def, fx, exhaust, c.up);
  return { def, name: def.name + (c.up ? "+" : ""), cost, fx, exhaust, crit, text };
}

function describe(def: CardDef, fx: Fx[], exhaust: boolean, up: boolean): string {
  const tpl = (up && def.up.text) || def.text;
  let s: string;
  if (tpl) {
    const special = fx.find((f) => f.k === "special") as Extract<Fx, { k: "special" }> | undefined;
    const d = fx.find((f) => f.k === "dmg") as Extract<Fx, { k: "dmg" }> | undefined;
    s = tpl
      .replace("{n}+{m}", String((special?.n ?? 0) + (special?.m ?? 0)))
      .replace(/\{n\}/g, String(special?.n ?? ""))
      .replace(/\{m\}/g, String(special?.m ?? ""))
      .replace("{d}", String(d?.n ?? ""));
  } else {
    const parts: string[] = [];
    for (const f of fx) {
      switch (f.k) {
        case "dmg": {
          const who = def.target === "all" ? " to ALL enemies" : def.target === "random" ? " to random enemies" : "";
          parts.push(`Deal ${f.n} damage${f.hits ? ` ${f.hits} times` : ""}${who}.`);
          break;
        }
        case "block":
          parts.push(`Gain ${f.n} block.`);
          break;
        case "draw":
          parts.push(`Draw ${f.n} card${f.n === 1 ? "" : "s"}.`);
          break;
        case "energy":
          parts.push(`Gain ${f.n} energy.`);
          break;
        case "heal":
          parts.push(`Heal ${f.n} HP.`);
          break;
        case "crumbs":
          parts.push(`Gain ${f.n} crumbs.`);
          break;
        case "st": {
          const info = STATUS[f.s];
          if (f.to === "self") {
            parts.push(def.type === "power" || f.s === "double" || f.s === "echo" || f.s === "luck" || f.s === "str" ? powerText(f.s, f.n) : `Gain ${f.n} ${info.name}.`);
          } else parts.push(`Apply ${f.n} ${info.name}${f.to === "all" ? " to ALL enemies" : ""}.`);
          break;
        }
        case "special":
          break;
      }
    }
    s = parts.join(" ");
  }
  if (exhaust) s += " Used up.";
  return s;
}

function powerText(s: StatusId, n: number): string {
  switch (s) {
    case "fort":
      return `At the start of each turn, gain ${n} block.`;
    case "str":
      return `Gain ${n} Pumped (+${n} damage per hit).`;
    case "thorns":
      return `Gain ${n} Prickly (attackers take ${n} damage).`;
    case "luck":
      return `Gain ${n} Lucky (+${n * 5}% crit).`;
    case "streak":
      return `Whenever you crit, draw 1 card.`;
    case "critblock":
      return `Whenever you crit, gain ${n} block.`;
    case "rust":
      return `At the start of each turn, apply ${n} Grime to ALL enemies.`;
    case "grow":
      return `At the start of each turn, gain ${n} Pumped.`;
    case "energy":
      return `Gain ${n} extra energy every turn.`;
    case "keepall":
      return `Your block is kept between turns.`;
    case "regen":
      return `Gain ${n} Cozy (heal at end of turn).`;
    case "double":
      return `Your next attack deals double damage.`;
    case "echo":
      return `Your next attack is played twice.`;
    default:
      return `Gain ${n} ${STATUS[s].name}.`;
  }
}

// ---------------- heroes ----------------

export interface HeroDef {
  id: HeroId;
  name: string;
  role: string;
  maxHp: number;
  passive: string;
  passiveName: string;
  blurb: string;
  starter: string[];
  color: string;
  unlockCost: number;
}

export const HEROES: Record<HeroId, HeroDef> = {
  penny: {
    id: "penny",
    name: "Penny",
    role: "Luck · crits",
    maxHp: 70,
    passiveName: "Lucky Shine",
    passive: "10% base crit chance. Crits deal double damage.",
    blurb: "A scuffed copper coin who has been lost in 14 different sofas.",
    starter: ["flip", "flip", "flip", "flip", "duck", "duck", "duck", "duck", "lucky-toss"],
    color: "#e08a4c",
    unlockCost: 0,
  },
  button: {
    id: "button",
    name: "Button",
    role: "Tank · shields",
    maxHp: 80,
    passiveName: "Thick Thread",
    passive: "Keeps half his block between turns.",
    blurb: "A four-hole coat button with a thread scarf and a needle for every problem.",
    starter: ["needle-jab", "needle-jab", "needle-jab", "needle-jab", "stitch-up", "stitch-up", "stitch-up", "stitch-up", "thread-lash"],
    color: "#3f9c9a",
    unlockCost: 40,
  },
  key: {
    id: "key",
    name: "Key",
    role: "Explorer · secrets",
    maxHp: 72,
    passiveName: "Skeleton Sense",
    passive: "Enemies start each fight Exposed for 1 turn. Sees what's behind ? rooms and finds extra treasure.",
    blurb: "An old brass key that opens nothing anymore, except secrets.",
    starter: ["jab", "jab", "jab", "jab", "hide", "hide", "hide", "hide", "unlock"],
    color: "#d9a93a",
    unlockCost: 80,
  },
  pick: {
    id: "pick",
    name: "Guitar Pick",
    role: "Speed · double hits",
    maxHp: 62,
    passiveName: "Encore",
    passive: "The first attack each turn hits again for half damage.",
    blurb: "Fell out of a back pocket at a gig and never stopped performing.",
    starter: ["strum", "strum", "strum", "strum", "dodge", "dodge", "dodge", "dodge", "riff"],
    color: "#ff3d9a",
    unlockCost: 120,
  },
};

export const HERO_ORDER: HeroId[] = ["penny", "button", "key", "pick"];

// ---------------- trinkets ----------------

export type TrinketRarity = "common" | "uncommon" | "rare" | "boss" | "shop";

export interface TrinketDef {
  id: string;
  name: string;
  icon: string;
  rarity: TrinketRarity;
  desc: string;
}

export const TRINKETS: TrinketDef[] = [
  { id: "bent-paperclip", name: "Bent Paperclip", icon: "📎", rarity: "uncommon", desc: "Every third attack you play hits ALL enemies." },
  { id: "rubber-band", name: "Rubber Band", icon: "➰", rarity: "common", desc: "Start each fight with 1 Pumped." },
  { id: "bottle-cap", name: "Bottle Cap", icon: "🔘", rarity: "common", desc: "Start each fight with 10 block." },
  { id: "clover-sticker", name: "Clover Sticker", icon: "🍀", rarity: "common", desc: "+10% crit chance." },
  { id: "gum-wrapper", name: "Gum Wrapper", icon: "🍬", rarity: "common", desc: "Heal 4 HP after each fight." },
  { id: "safety-pin", name: "Safety Pin", icon: "🧷", rarity: "rare", desc: "Once per run, survive a killing blow with 1 HP." },
  { id: "marble", name: "Cat's Eye Marble", icon: "🔮", rarity: "common", desc: "Draw 2 more cards on the first turn of each fight." },
  { id: "thimble", name: "Thimble", icon: "🥄", rarity: "uncommon", desc: "Cards that give block give 2 more." },
  { id: "red-crayon", name: "Red Crayon", icon: "🖍️", rarity: "uncommon", desc: "Exposed enemies take 75% more damage instead of 50%." },
  { id: "rusty-nail", name: "Rusty Nail", icon: "🔩", rarity: "common", desc: "At the start of each turn, apply 2 Grime to a random enemy." },
  { id: "aa-battery", name: "AA Battery", icon: "🔋", rarity: "common", desc: "Gain 1 extra energy on the first turn of each fight." },
  { id: "coupon", name: "Coupon", icon: "🎟️", rarity: "shop", desc: "Everything in shops costs 25% less." },
  { id: "piggy-bank", name: "Piggy Bank", icon: "🐷", rarity: "common", desc: "Gain 10 extra crumbs after each fight." },
  { id: "hair-clip", name: "Hair Clip", icon: "🎀", rarity: "uncommon", desc: "Whenever you play a 0-cost card, deal 3 damage to a random enemy." },
  { id: "lost-earring", name: "Lost Earring", icon: "💎", rarity: "uncommon", desc: "Enemies start each fight with 2 Exposed." },
  { id: "birthday-candle", name: "Birthday Candle", icon: "🕯️", rarity: "uncommon", desc: "Deal 5 damage to ALL enemies at the start of each fight." },
  { id: "fridge-magnet", name: "Fridge Magnet", icon: "🧲", rarity: "uncommon", desc: "At the end of your turn, gain 3 block for each unused energy." },
  { id: "popcorn-kernel", name: "Popcorn Kernel", icon: "🍿", rarity: "common", desc: "Heal 3 HP whenever you defeat an enemy." },
  { id: "sugar-packet", name: "Sugar Packet", icon: "🧂", rarity: "common", desc: "+10 max HP." },
  { id: "old-receipt", name: "Old Receipt", icon: "🧾", rarity: "uncommon", desc: "Card rewards offer 1 more card." },
  { id: "snow-globe", name: "Snow Globe", icon: "🌨️", rarity: "uncommon", desc: "+1 snack slot. Snacks heal, block and hit 50% harder." },
  { id: "sock-puppet", name: "Sock Puppet", icon: "🧦", rarity: "uncommon", desc: "The first time you lose HP each turn, gain 1 Pumped." },
  { id: "rubber-duck", name: "Rubber Duck", icon: "🦆", rarity: "common", desc: "Resting at a campfire heals 12 more HP." },
  { id: "toy-soldier", name: "Toy Soldier", icon: "💂", rarity: "common", desc: "Start each fight with 3 Prickly." },
  { id: "sunglasses", name: "Tiny Sunglasses", icon: "🕶️", rarity: "uncommon", desc: "You can't become Frayed or Soggy." },
  { id: "cork", name: "Wine Cork", icon: "🍾", rarity: "rare", desc: "Keep up to 10 block between turns." },
  { id: "glitter", name: "Glitter", icon: "✨", rarity: "uncommon", desc: "Crits apply 1 Exposed." },
  { id: "loaded-die", name: "Loaded Die", icon: "🎲", rarity: "rare", desc: "Cards offered as rewards are often already upgraded." },
  { id: "tape-measure", name: "Tape Measure", icon: "📏", rarity: "rare", desc: "Every 3rd turn, gain 2 energy." },
  { id: "band-aid", name: "Band-Aid", icon: "🩹", rarity: "common", desc: "After a fight, if you're below half HP, heal 10." },
  { id: "googly-eye", name: "Googly Eye", icon: "👁️", rarity: "common", desc: "Enemies start each fight with 1 Frayed." },
  { id: "thread-spool", name: "Thread Spool", icon: "🪡", rarity: "uncommon", desc: "Gain 3 block at the start of each turn." },
  { id: "lucky-coin", name: "Foreign Coin", icon: "🪙", rarity: "shop", desc: "Gain 1 Lucky whenever you play an attack. Resets each fight." },
  { id: "lint-ball", name: "Lint Ball", icon: "☁️", rarity: "shop", desc: "Gain 3 block whenever you play a skill." },
  { id: "fortune-slip", name: "Fortune Slip", icon: "🥠", rarity: "rare", desc: "Whenever you defeat an elite, gain an extra trinket." },
  // boss trinkets
  { id: "nine-volt", name: "9-Volt Battery", icon: "⚡", rarity: "boss", desc: "+1 energy every turn. Campfires can't heal you." },
  { id: "big-keychain", name: "Big Keychain", icon: "🗝️", rarity: "boss", desc: "Draw 1 more card every turn. Start each fight with 1 Static." },
  { id: "royal-lint", name: "Royal Lint", icon: "👑", rarity: "boss", desc: "+1 energy every turn. Card rewards show 1 fewer card." },
  { id: "velvet-throne", name: "Velvet Throne", icon: "🛋️", rarity: "boss", desc: "+1 energy every turn. Enemies start each fight with 5 block." },
  { id: "spring-coil", name: "Spring Coil", icon: "🌀", rarity: "boss", desc: "+1 energy every turn. Lose 3 HP at the start of each fight." },
];

export const TRINKET: Record<string, TrinketDef> = Object.fromEntries(TRINKETS.map((t) => [t.id, t]));

// ---------------- snacks ----------------

export interface SnackDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  target: "self" | "enemy" | "all";
}

export const SNACKS: SnackDef[] = [
  { id: "gummy", name: "Gummy Bear", icon: "🧸", desc: "Heal 12 HP.", target: "self" },
  { id: "hot-sauce", name: "Hot Sauce Packet", icon: "🌶️", desc: "Gain 2 Pumped.", target: "self" },
  { id: "popcorn", name: "Popcorn", icon: "🍿", desc: "Deal 10 damage to ALL enemies.", target: "all" },
  { id: "espresso", name: "Espresso Bean", icon: "☕", desc: "Gain 2 energy.", target: "self" },
  { id: "mint", name: "Breath Mint", icon: "🍃", desc: "Gain 12 block.", target: "self" },
  { id: "cracker", name: "Cracker", icon: "🍘", desc: "Draw 3 cards.", target: "self" },
  { id: "jelly-bean", name: "Jelly Bean", icon: "🫘", desc: "Apply 2 Exposed and 2 Frayed to ALL enemies.", target: "all" },
  { id: "cheese-puff", name: "Cheese Puff", icon: "🧀", desc: "Apply 8 Grime to an enemy.", target: "enemy" },
];

export const SNACK: Record<string, SnackDef> = Object.fromEntries(SNACKS.map((s) => [s.id, s]));

// ---------------- enemies ----------------

export type Intent = "atk" | "def" | "buff" | "debuff" | "atkdef" | "atkdebuff" | "summon" | "charge" | "heal" | "unknown";

export interface MoveDef {
  id: string;
  name: string;
  intent: Intent;
  dmg?: number;
  hits?: number;
  block?: number;
  self?: [StatusId, number][];
  hero?: [StatusId, number][];
  allies?: [StatusId, number][];
  heal?: number;
  summon?: string[];
  addCard?: string; // curse added to discard pile
  special?: string;
}

export type Tier = "normal" | "elite" | "boss" | "minion";

export interface EnemyDef {
  id: string;
  name: string;
  area: number;
  tier: Tier;
  hp: [number, number];
  moves: MoveDef[];
  pattern?: string[]; // cycled; default is weighted random with no triple repeats
  randomStart?: boolean;
  start?: [StatusId, number][];
  desc: string;
  size?: number; // sprite scale
}

const M = (m: MoveDef) => m;

export const ENEMIES: EnemyDef[] = [
  // ---- Area 1: The Cushions ----
  {
    id: "dust-bunny", name: "Dust Bunny", area: 0, tier: "normal", hp: [11, 14], randomStart: true,
    start: [["swarm", 1]],
    moves: [M({ id: "nibble", name: "Nibble", intent: "atk", dmg: 4 }), M({ id: "scratch", name: "Scratch", intent: "atkdebuff", dmg: 3, hero: [["weak", 1]] })],
    pattern: ["nibble", "scratch", "nibble"],
    desc: "Shows up in groups. Each bunny that falls makes the rest angrier.",
  },
  {
    id: "crumb-golem", name: "Crumb Golem", area: 0, tier: "normal", hp: [32, 36],
    moves: [M({ id: "harden", name: "Harden", intent: "def", block: 9, self: [["str", 1]] }), M({ id: "smash", name: "Smash", intent: "atk", dmg: 12 })],
    pattern: ["harden", "smash"],
    desc: "Cookie crumbs held together with jam. Hits hard every other turn.",
  },
  {
    id: "earbud", name: "Lost Earbud", area: 0, tier: "normal", hp: [19, 23], randomStart: true,
    moves: [M({ id: "shriek", name: "Shriek", intent: "atkdebuff", dmg: 4, hero: [["static", 1]] }), M({ id: "whip", name: "Cord Whip", intent: "atk", dmg: 8 })],
    pattern: ["shriek", "whip"],
    desc: "Shrieks feedback that makes your cards cost more.",
  },
  {
    id: "hair-tie", name: "Hair Tie", area: 0, tier: "normal", hp: [15, 18], randomStart: true,
    moves: [M({ id: "snap", name: "Snap", intent: "atk", dmg: 7 }), M({ id: "twist", name: "Twist", intent: "def", block: 6, hero: [["weak", 1]] })],
    pattern: ["snap", "twist"],
    desc: "Stretchy and spiteful. Snaps back when you least expect it.",
  },
  {
    id: "sock-gremlin", name: "Sock Gremlin", area: 0, tier: "elite", hp: [62, 66],
    moves: [
      M({ id: "whip", name: "Toe Whip", intent: "atk", dmg: 7, hits: 2 }),
      M({ id: "stink", name: "Stink Cloud", intent: "debuff", hero: [["weak", 2], ["vuln", 2]] }),
      M({ id: "gulp", name: "Gulp", intent: "atk", dmg: 17 }),
      M({ id: "lurk", name: "Lurk", intent: "buff", block: 10, self: [["str", 2]] }),
    ],
    pattern: ["stink", "whip", "gulp", "lurk"],
    desc: "The other sock from every pair you've ever lost. Smells like revenge.",
    size: 1.15,
  },
  {
    id: "queen-bunny", name: "Queen Dust Bunny", area: 0, tier: "boss", hp: [105, 105],
    moves: [
      M({ id: "summon", name: "Call the Court", intent: "summon", summon: ["dust-bunny", "dust-bunny"] }),
      M({ id: "swipe", name: "Royal Swipe", intent: "atk", dmg: 5, hits: 2 }),
      M({ id: "crown", name: "Crown of Lint", intent: "def", block: 12, self: [["str", 2]] }),
      M({ id: "stomp", name: "Fluffy Stomp", intent: "atk", dmg: 15 }),
    ],
    pattern: ["summon", "swipe", "crown", "stomp"],
    desc: "Rules the cushions from a nest of hair ties. Summons bunnies and grows stronger.",
    size: 1.45,
  },

  // ---- Area 2: The Springs ----
  {
    id: "rust-mite", name: "Rust Mite", area: 1, tier: "normal", hp: [18, 22], randomStart: true,
    moves: [M({ id: "bite", name: "Rusty Bite", intent: "atkdebuff", dmg: 5, hero: [["grime", 3]] }), M({ id: "gnaw", name: "Gnaw", intent: "atk", dmg: 9 })],
    pattern: ["bite", "gnaw"],
    desc: "Tiny, orange and covered in rust. Its bite leaves Grime.",
  },
  {
    id: "coil-snake", name: "Coil Snake", area: 1, tier: "normal", hp: [30, 34],
    moves: [M({ id: "boing", name: "Boing Boing", intent: "atk", dmg: 4, hits: 2, special: "morehits" }), M({ id: "coil", name: "Coil Up", intent: "def", block: 8, self: [["str", 1]] })],
    pattern: ["boing", "coil", "boing"],
    desc: "A loose spring that bounces more each time it attacks.",
  },
  {
    id: "bottlecap-crab", name: "Bottlecap Crab", area: 1, tier: "normal", hp: [34, 38],
    moves: [M({ id: "shell", name: "Shell Up", intent: "def", block: 14 }), M({ id: "pinch", name: "Pinch", intent: "atk", dmg: 10 }), M({ id: "clack", name: "Clack", intent: "atkdef", dmg: 6, block: 6 })],
    pattern: ["shell", "pinch", "clack"],
    desc: "Wears a soda bottle cap as armor. Very hard to crack.",
  },
  {
    id: "paperclip", name: "Paperclip Chain", area: 1, tier: "normal", hp: [24, 28], randomStart: true,
    moves: [M({ id: "link", name: "Link Lash", intent: "atk", dmg: 3, hits: 3 }), M({ id: "bend", name: "Bend", intent: "buff", self: [["str", 2]], block: 4 })],
    pattern: ["link", "bend", "link"],
    desc: "Three paperclips that linked up and decided to fight as one.",
  },
  {
    id: "rusty-spring", name: "Rusty Spring", area: 1, tier: "elite", hp: [80, 86],
    moves: [
      M({ id: "compress", name: "Compress", intent: "charge", block: 14, self: [["str", 2]] }),
      M({ id: "release", name: "Release!", intent: "atk", dmg: 24 }),
      M({ id: "rattle", name: "Rattle", intent: "atkdebuff", dmg: 6, hits: 2, hero: [["frail", 2]] }),
    ],
    pattern: ["rattle", "compress", "release"],
    desc: "A big old couch spring, wound tight. When it lets go, duck.",
    size: 1.15,
  },
  {
    id: "remote", name: "The Remote", area: 1, tier: "boss", hp: [160, 160],
    moves: [
      M({ id: "action", name: "Action Channel", intent: "atk", dmg: 15 }),
      M({ id: "static", name: "Static Channel", intent: "atkdebuff", dmg: 6, hero: [["static", 2], ["vuln", 1]] }),
      M({ id: "mute", name: "Mute", intent: "def", block: 20, self: [["str", 2]] }),
      M({ id: "rewind", name: "Rewind", intent: "heal", special: "rewind" }),
      M({ id: "ff", name: "Fast Forward", intent: "atk", dmg: 5, hits: 4 }),
    ],
    pattern: ["action", "static", "mute", "ff", "rewind"],
    desc: "Lost for years and furious about it. Rewind heals back what you dealt since its last rewind (up to 30).",
    size: 1.45,
  },

  // ---- Area 3: The Underfloor ----
  {
    id: "glow-moth", name: "Glow Moth", area: 2, tier: "normal", hp: [24, 28], randomStart: true,
    moves: [M({ id: "dust", name: "Wing Dust", intent: "debuff", hero: [["weak", 2], ["vuln", 1]] }), M({ id: "flutter", name: "Flutter", intent: "atk", dmg: 8 })],
    pattern: ["dust", "flutter", "flutter"],
    desc: "Drawn to the glow-in-the-dark stars. Its dust makes you clumsy.",
  },
  {
    id: "lego-knight", name: "Brick Knight", area: 2, tier: "normal", hp: [42, 46],
    moves: [M({ id: "shield", name: "Brick Shield", intent: "def", block: 13 }), M({ id: "lance", name: "Lance", intent: "atk", dmg: 14 })],
    pattern: ["shield", "lance", "lance"],
    desc: "Guardian of the ruined brick castle. Still loyal to a king nobody remembers.",
  },
  {
    id: "marble", name: "Rolling Marble", area: 2, tier: "normal", hp: [28, 32],
    moves: [M({ id: "roll", name: "Roll", intent: "atk", dmg: 6, special: "rollup" })],
    pattern: ["roll"],
    desc: "Picks up speed. Hits 3 harder every turn.",
  },
  {
    id: "battery", name: "Leaky Battery", area: 2, tier: "normal", hp: [30, 34],
    moves: [
      M({ id: "fizz", name: "Fizz", intent: "atkdebuff", dmg: 4, hero: [["grime", 2]] }),
      M({ id: "charge", name: "Overcharge", intent: "charge", block: 6 }),
      M({ id: "boom", name: "BOOM", intent: "atk", dmg: 26, special: "explode" }),
    ],
    pattern: ["fizz", "charge", "boom"],
    desc: "Corroded and fizzing. Explodes on its third turn. Kill it first!",
  },
  {
    id: "plastic-dino", name: "Plastic Dino", area: 2, tier: "elite", hp: [108, 114],
    moves: [
      M({ id: "roar", name: "Roar", intent: "buff", self: [["str", 3]], hero: [["weak", 1]] }),
      M({ id: "chomp", name: "Chomp", intent: "atk", dmg: 20 }),
      M({ id: "tail", name: "Tail Sweep", intent: "atk", dmg: 8, hits: 2 }),
    ],
    pattern: ["roar", "chomp", "tail"],
    desc: "A toy dinosaur from a kid's birthday party. It remembers being thrown.",
    size: 1.2,
  },
  {
    id: "cats-paw", name: "The Cat's Paw", area: 2, tier: "boss", hp: [210, 210],
    moves: [
      M({ id: "swat", name: "Swat", intent: "atk", dmg: 22 }),
      M({ id: "bat", name: "Bat Around", intent: "atkdebuff", dmg: 6, hits: 3, hero: [["static", 1]] }),
      M({ id: "knead", name: "Knead", intent: "def", block: 22, self: [["str", 2]] }),
      M({ id: "watch", name: "Watching...", intent: "charge", self: [["str", 1]], hero: [["vuln", 2]] }),
      M({ id: "pounce", name: "POUNCE", intent: "atk", dmg: 32 }),
    ],
    pattern: ["swat", "bat", "knead", "watch", "pounce"],
    desc: "Reaches in from outside the couch. Watch out when it starts watching.",
    size: 1.5,
  },

  // ---- Area 4: The Drain ----
  {
    id: "hair-clog", name: "Hair Clog", area: 3, tier: "normal", hp: [44, 48],
    moves: [M({ id: "tangle", name: "Tangle", intent: "debuff", hero: [["weak", 2], ["grime", 4]] }), M({ id: "squeeze", name: "Squeeze", intent: "atk", dmg: 13 }), M({ id: "squelch", name: "Squelch", intent: "atkdef", dmg: 8, block: 8 })],
    pattern: ["tangle", "squeeze", "squelch"],
    desc: "Years of hair, soap and regret.",
  },
  {
    id: "soap-slime", name: "Soap Slime", area: 3, tier: "normal", hp: [36, 40],
    start: [["split", 1]],
    moves: [M({ id: "slip", name: "Slip", intent: "atkdebuff", dmg: 10, hero: [["vuln", 1]] }), M({ id: "foam", name: "Foam Up", intent: "def", block: 11 })],
    pattern: ["slip", "foam"],
    desc: "Bubbly and slippery. Splits into two small slimes when defeated.",
  },
  {
    id: "mini-slime", name: "Soap Bubble", area: 3, tier: "minion", hp: [14, 14],
    moves: [M({ id: "pop", name: "Pop", intent: "atk", dmg: 7 })],
    pattern: ["pop"],
    desc: "A small piece of a soap slime.",
    size: 0.75,
  },
  {
    id: "drip", name: "Drip", area: 3, tier: "normal", hp: [20, 24], randomStart: true,
    moves: [M({ id: "plip", name: "Plip", intent: "atk", dmg: 4 }), M({ id: "plop", name: "Plop", intent: "atk", dmg: 4 }), M({ id: "drop", name: "DROP", intent: "atk", dmg: 16 })],
    pattern: ["plip", "plop", "drop"],
    desc: "Plip. Plop. DROP. Count the drips.",
  },
  {
    id: "drain-rat", name: "Drain Rat", area: 3, tier: "normal", hp: [32, 36], randomStart: true,
    moves: [M({ id: "gnaw", name: "Gnaw", intent: "atk", dmg: 7, hits: 2 }), M({ id: "steal", name: "Snatch", intent: "atkdebuff", dmg: 6, special: "steal" })],
    pattern: ["gnaw", "steal"],
    desc: "Steals crumbs when it hits you.",
  },
  {
    id: "toothbrush", name: "Old Toothbrush", area: 3, tier: "elite", hp: [135, 140],
    moves: [
      M({ id: "scrub", name: "Scrub", intent: "atk", dmg: 9, hits: 3 }),
      M({ id: "bristle", name: "Bristle Up", intent: "def", block: 16, self: [["thorns", 3]] }),
      M({ id: "polish", name: "Polish", intent: "buff", self: [["str", 3]], hero: [["frail", 2]] }),
    ],
    pattern: ["bristle", "scrub", "polish", "scrub"],
    desc: "Retired from teeth duty. Now scrubs anything that moves.",
    size: 1.2,
  },
  {
    id: "vacuum", name: "The Vacuum", area: 3, tier: "boss", hp: [320, 320],
    moves: [
      M({ id: "suck", name: "Suction", intent: "atkdebuff", dmg: 10, hero: [["static", 2]] }),
      M({ id: "roar", name: "ROAR", intent: "debuff", hero: [["weak", 2], ["vuln", 2], ["frail", 2]] }),
      M({ id: "slam", name: "Nozzle Slam", intent: "atk", dmg: 26 }),
      M({ id: "debris", name: "Spit Debris", intent: "atk", dmg: 6, hits: 4, addCard: "crumb-mess" }),
      M({ id: "charge", name: "Revving Up", intent: "charge", block: 25, self: [["str", 3]] }),
      M({ id: "hoover", name: "HOOVER", intent: "atk", dmg: 42 }),
    ],
    pattern: ["suck", "roar", "slam", "debris", "charge", "hoover"],
    desc: "The end of everything lost. At half HP its bag fills up and it gets angrier.",
    size: 1.6,
  },
];

export const ENEMY: Record<string, EnemyDef> = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));

export interface AreaDef {
  name: string;
  short: string;
  blurb: string;
  easy: string[][];
  normal: string[][];
  elites: string[][];
  boss: string;
}

export const AREAS: AreaDef[] = [
  {
    name: "The Cushions",
    short: "Cushions",
    blurb: "Warm velvet hills and a golden lamp glow. The fluff is getting restless.",
    easy: [["dust-bunny", "dust-bunny"], ["crumb-golem"], ["earbud"], ["hair-tie", "dust-bunny"]],
    normal: [["dust-bunny", "dust-bunny", "dust-bunny"], ["crumb-golem", "dust-bunny"], ["earbud", "hair-tie"], ["hair-tie", "hair-tie"], ["earbud", "dust-bunny", "dust-bunny"], ["crumb-golem", "hair-tie"]],
    elites: [["sock-gremlin"]],
    boss: "queen-bunny",
  },
  {
    name: "The Springs",
    short: "Springs",
    blurb: "A rusty forest of coils. Everything bounces, and everything bites.",
    easy: [["rust-mite", "rust-mite"], ["coil-snake"], ["bottlecap-crab"]],
    normal: [["rust-mite", "paperclip"], ["coil-snake", "rust-mite"], ["bottlecap-crab", "paperclip"], ["paperclip", "paperclip"], ["rust-mite", "rust-mite", "rust-mite"], ["coil-snake", "bottlecap-crab"]],
    elites: [["rusty-spring"]],
    boss: "remote",
  },
  {
    name: "The Underfloor",
    short: "Underfloor",
    blurb: "Dark floorboards lit by lost glow stars. Forgotten toys keep watch.",
    easy: [["glow-moth", "glow-moth"], ["lego-knight"], ["marble", "glow-moth"]],
    normal: [["battery", "glow-moth"], ["lego-knight", "marble"], ["glow-moth", "glow-moth", "marble"], ["battery", "lego-knight"], ["marble", "marble"], ["battery", "battery"]],
    elites: [["plastic-dino"]],
    boss: "cats-paw",
  },
  {
    name: "The Drain",
    short: "Drain",
    blurb: "Cold tiles and dripping pipes. You can hear the Vacuum coming.",
    easy: [["hair-clog"], ["soap-slime"], ["drip", "drip"]],
    normal: [["hair-clog", "drip"], ["soap-slime", "drain-rat"], ["drain-rat", "drain-rat"], ["drip", "drip", "drain-rat"], ["soap-slime", "drip"], ["hair-clog", "drain-rat"]],
    elites: [["toothbrush"]],
    boss: "vacuum",
  },
];

// ---------------- level-up perks ----------------

export interface PerkDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
}

export const LEVEL_PERKS: PerkDef[] = [
  { id: "hp", name: "Extra Stuffing", icon: "❤️", desc: "+8 max HP and heal 8." },
  { id: "crit", name: "Polish", icon: "✨", desc: "+5% crit chance." },
  { id: "draw1", name: "Quick Start", icon: "🃏", desc: "Draw 1 more card on the first turn of each fight." },
  { id: "block", name: "Thick Skin", icon: "🛡️", desc: "Start each fight with 5 block." },
  { id: "snack", name: "Bigger Pockets", icon: "🎒", desc: "+1 snack slot and a random snack." },
  { id: "heal", name: "Nap", icon: "💤", desc: "Heal 30% of your max HP." },
  { id: "upgrade", name: "Practice", icon: "⬆️", desc: "Upgrade 2 random cards." },
  { id: "str", name: "Workout", icon: "💪", desc: "Start each fight with 1 Pumped." },
  { id: "crumbs", name: "Couch Change", icon: "🍪", desc: "Gain 60 crumbs." },
];

export const XP_LEVELS = [0, 20, 50, 90, 140, 200, 270, 350, 440, 540, 650];

// ---------------- meta (Junk Drawer) ----------------

export interface MetaUpgrade {
  id: string;
  name: string;
  icon: string;
  desc: string;
  costs: number[]; // one per level
}

export const META_UPGRADES: MetaUpgrade[] = [
  { id: "stuffing", name: "Extra Stuffing", icon: "🧸", desc: "+5 max HP per level.", costs: [25, 50, 90] },
  { id: "pocket", name: "Pocket Change", icon: "🍪", desc: "+20 starting crumbs per level.", costs: [20, 45, 80] },
  { id: "stash", name: "Snack Stash", icon: "🍬", desc: "Start each run with a random snack.", costs: [40] },
  { id: "headstart", name: "Lucky Find", icon: "🎁", desc: "Start each run with a random common trinket.", costs: [80] },
  { id: "eye", name: "Sharp Eye", icon: "🔍", desc: "Card rewards offer 1 more card.", costs: [100] },
  { id: "cozy", name: "Cozy Lint", icon: "🔥", desc: "Campfire rests heal 10% more.", costs: [60] },
  { id: "practice", name: "Muscle Memory", icon: "⬆️", desc: "Start each run with 1 random starter card upgraded.", costs: [70] },
];

export const SPRING_CLEANING = [
  "Normal",
  "Enemies have 10% more HP.",
  "Elites and bosses hit 15% harder.",
  "Campfires heal less (20% instead of 30%).",
  "Start each run with a Sticky curse.",
  "All enemies hit 10% harder and you start at 90% HP.",
];

// ---------------- events ----------------

export interface EventChoice {
  label: string;
  hint: string;
  id: string;
  cost?: number; // crumbs required
}

export interface EventDef {
  id: string;
  title: string;
  areas: number[];
  text: string;
  choices: EventChoice[];
  art: string; // emoji for the event card
}

export const EVENTS: EventDef[] = [
  {
    id: "coin-jar", title: "The Coin Jar", areas: [0, 1], art: "🫙",
    text: "A tipped-over jar of loose change blocks the path. Something glints deep inside. Something else is breathing in there.",
    choices: [
      { id: "reach", label: "Reach in", hint: "60%: gain 60 crumbs. 40%: lose 8 HP." },
      { id: "leave", label: "Walk past", hint: "Nothing happens." },
    ],
  },
  {
    id: "fortune-cookie", title: "Fortune Cookie", areas: [0, 1, 2, 3], art: "🥠",
    text: "A fortune cookie, slightly stale, still wrapped. It hums faintly.",
    choices: [
      { id: "crack", label: "Crack it open", hint: "Read your fortune. Could be great, could be bad." },
      { id: "eat", label: "Just eat it", hint: "Heal 12 HP." },
    ],
  },
  {
    id: "lint-shrine", title: "Lint Shrine", areas: [0, 1, 2, 3], art: "⛩️",
    text: "Someone built a tiny shrine out of dryer lint. It looks very soft and very holy.",
    choices: [
      { id: "pray", label: "Leave an offering", hint: "Lose 6 HP. Remove a card from your deck." },
      { id: "nap", label: "Nap against it", hint: "Heal 15% of your max HP." },
    ],
  },
  {
    id: "toy-soldier", title: "The Toy Soldier's Toll", areas: [0, 1, 2], art: "💂",
    text: "A plastic soldier guards a bridge made of popsicle sticks. \"Toll is 40 crumbs,\" he says. \"I have a trinket for whoever pays.\"",
    choices: [
      { id: "pay", label: "Pay 40 crumbs", hint: "Get a random trinket.", cost: 40 },
      { id: "fight", label: "Push past", hint: "Fight him and his friends." },
      { id: "leave", label: "Turn back", hint: "Nothing happens." },
    ],
  },
  {
    id: "sticky-candy", title: "Sticky Candy", areas: [0, 1, 2, 3], art: "🍭",
    text: "A half-eaten lollipop stuck to the fabric. It's still sweet, and it's very, very sticky.",
    choices: [
      { id: "eat", label: "Eat the whole thing", hint: "Heal to full. Add a Sticky curse to your deck." },
      { id: "lick", label: "Take a lick", hint: "Heal 8 HP." },
    ],
  },
  {
    id: "sleeping-cat", title: "A Sleeping Cat", areas: [2, 3], art: "🐈",
    text: "Through a gap in the floorboards you see a whisker the size of a tree. Under its paw: something shiny.",
    choices: [
      { id: "sneak", label: "Sneak and grab it", hint: "65%: get a rare card. 35%: it wakes up. Lose 14 HP." },
      { id: "leave", label: "Tiptoe away", hint: "Nothing happens." },
    ],
  },
  {
    id: "battery-lick", title: "The Tingly Battery", areas: [1, 2, 3], art: "🔋",
    text: "A 9-volt battery lies on its side. Everyone knows you're not supposed to lick it.",
    choices: [
      { id: "lick", label: "Lick it anyway", hint: "Lose 5 HP. Upgrade 2 random cards." },
      { id: "leave", label: "Be sensible", hint: "Nothing happens." },
    ],
  },
  {
    id: "crumb-feast", title: "Crumb Feast", areas: [0, 1, 2, 3], art: "🥨",
    text: "A whole pretzel, barely touched. That's a feast down here.",
    choices: [
      { id: "eat", label: "Feast", hint: "Heal 20 HP." },
      { id: "pocket", label: "Pocket the crumbs", hint: "Gain 45 crumbs." },
    ],
  },
  {
    id: "mirror-shard", title: "Mirror Shard", areas: [1, 2, 3], art: "🪞",
    text: "A shard of a compact mirror. Your reflection looks tougher than you feel.",
    choices: [
      { id: "train", label: "Practice in front of it", hint: "Lose 7 HP. Upgrade a card of your choice and a random one." },
      { id: "leave", label: "Admire yourself and go", hint: "Gain 1 max HP." },
    ],
  },
  {
    id: "trading-stamp", title: "The Stamp Collector", areas: [0, 1, 2, 3], art: "📮",
    text: "An old postage stamp with a tiny face offers to swap one of your moves for something new.",
    choices: [
      { id: "swap", label: "Swap a card", hint: "Turn a card from your deck into a random card." },
      { id: "leave", label: "No thanks", hint: "Nothing happens." },
    ],
  },
  {
    id: "lost-snacks", title: "Lost Snack Bag", areas: [0, 1, 2, 3], art: "🛍️",
    text: "A crinkly snack bag with a few treats still inside.",
    choices: [
      { id: "take", label: "Grab what you can", hint: "Get 2 random snacks (if you have room)." },
      { id: "crumbs", label: "Shake out the crumbs", hint: "Gain 25 crumbs." },
    ],
  },
];

export const EVENT: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
