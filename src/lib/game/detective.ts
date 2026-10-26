import type { Cell, Dataset, TableData } from "../dataset.ts";
import { Rng } from "../rng.ts";
import { type GenCtx, makeSqlRound, q } from "./ctx.ts";
import type { SqlRound } from "./types.ts";

export interface DetectiveCase {
  id: "spree" | "vanish" | "double";
  title: string;
  intro: string;
  outro: string;
  facts: Record<string, string | number>;
}

const clone = (t: TableData): TableData => ({ ...t, rows: t.rows.map((r) => r.slice()) });

function plant(ds: Dataset, rng: Rng): { tables: TableData[]; story: { title: string; intro: string; outro: string }; kase: DetectiveCase } {
  const { fact: f, label: L, gen } = ds.theme;
  const fact = clone(ds.tables[0]);
  const dim = clone(ds.tables[1]);
  const kind = rng.pick(["spree", "vanish", "double"] as const);
  const nextId = () => fact.rows.reduce((mx, r) => Math.max(mx, r[0] as number), 0) + 1;
  const countBy = (rows: Cell[][], idx: number) => {
    const m = new Map<Cell, number>();
    rows.forEach((r) => m.set(r[idx], (m.get(r[idx]) ?? 0) + 1));
    return m;
  };

  if (kind === "spree") {
    const suspect = dim.rows[rng.int(0, 4)];
    const day = rng.pick(ds.dates);
    const [, hi, step] = gen.m;
    for (let j = 0; j < 4; j++) {
      fact.rows.push([nextId(), suspect[0], rng.pick(ds.aValues), rng.pick(ds.bValues), hi - step * j * 2, rng.int(gen.m2[0], gen.m2[1]), day, gen.nul[0]]);
    }
    return {
      tables: [fact, dim],
      kase: { id: kind, title: "The Midnight Spree", intro: "", outro: "", facts: { day, name: suspect[1] as string, key: suspect[0] as number } },
      story: {
        title: "The Midnight Spree",
        intro: `Head office spotted a strange spike in ${L.m}. Someone went on a spree in a single day. Find out who, and how much.`,
        outro: `Case closed. ${suspect[1]} was behind the spike on ${day}. The ${L.rows} have been flagged for review.`,
      },
    };
  }

  if (kind === "vanish") {
    const backup: TableData = { ...clone(ds.tables[0]), name: `${f.table}_backup` };
    const freq = [...countBy(fact.rows, 2).entries()].sort((a, b) => b[1] - a[1]);
    const lost = freq[0][0] as string;
    const victims = fact.rows.filter((r) => r[2] === lost).slice(0, 3).map((r) => r[0]);
    fact.rows = fact.rows.filter((r) => !victims.includes(r[0]));
    return {
      tables: [fact, dim, backup],
      kase: { id: kind, title: "The Vanishing Records", intro: "", outro: "", facts: { lost, n: victims.length } },
      story: {
        title: "The Vanishing Records",
        intro: `Last night's load ran, but the totals look low. A backup copy, ${backup.name}, was taken before the load. Compare them and track down what vanished.`,
        outro: `Case closed. Every missing ${L.row} came from ${lost}. A bad filter in the load job dropped them, and they've been restored from the backup.`,
      },
    };
  }

  // double
  const freq = [...countBy(fact.rows, 1).entries()].sort((a, b) => b[1] - a[1]);
  const key = freq[0][0] as number;
  const name = dim.rows.find((r) => r[0] === key)![1] as string;
  const victims = fact.rows.filter((r) => r[1] === key).slice(0, 3);
  for (const v of victims) fact.rows.push([nextId(), ...v.slice(1)]);
  return {
    tables: [fact, dim],
    kase: { id: kind, title: "The Double Charge", intro: "", outro: "", facts: { name, key } },
    story: {
      title: "The Double Charge",
      intro: `A ${L.dimRow} complained they were counted twice. Some ${L.rows} were copied with a fresh ${f.id}, but the same ${f.key}, ${f.date} and ${f.m}. Find the duplicates.`,
      outro: `Case closed. ${name}'s ${L.rows} were double-loaded. A retry without deduplication caused it. The pipeline now dedupes on (${f.key}, ${f.date}, ${f.m}).`,
    },
  };
}

function rounds(c: GenCtx, kase: DetectiveCase): SqlRound[] {
  const { fact: f, dim: d, label: L } = c.ds.theme;
  const T = f.table;
  const D = d.table;
  const scale = 1.5;
  const mk = (spec: Parameters<typeof makeSqlRound>[1], clue: string, reveal: string) => {
    const r = makeSqlRound(c, spec, scale);
    if (!r) throw new Error("detective round failed: " + spec.title);
    r.clue = clue;
    r.reveal = reveal;
    return r;
  };

  if (kase.id === "spree") {
    const day = String(kase.facts.day);
    const name = String(kase.facts.name);
    return [
      mk(
        { title: "Clue 1: The spike", prompt: `Which ${f.date} had the highest total ${L.m}? Return just the date.`, solution: `SELECT ${f.date} FROM ${T} GROUP BY ${f.date} ORDER BY SUM(${f.m}) DESC LIMIT 1`, starter: `SELECT ${f.date}\nFROM ${T}\n`, line: `ORDER BY SUM(${f.m}) DESC LIMIT 1`, ordered: true, tag: "GROUP BY" },
        "Start with the money. One day stands out.",
        "The spike happened on {answer}.",
      ),
      mk(
        { title: "Clue 2: The regular", prompt: `On ${day}, which ${L.dimRow} appears in the most ${L.rows}? Return their ${d.name}.`, solution: `SELECT d.${d.name} FROM ${T} f JOIN ${D} d ON f.${f.key} = d.${d.key} WHERE f.${f.date} = ${q(day)} GROUP BY d.${d.name} ORDER BY COUNT(*) DESC LIMIT 1`, starter: `SELECT d.${d.name}\nFROM ${T} f\nJOIN ${D} d ON f.${f.key} = d.${d.key}\nWHERE `, line: `WHERE f.${f.date} = '${day}' GROUP BY d.${d.name} ORDER BY COUNT(*) DESC LIMIT 1`, ordered: true, tag: "JOIN" },
        `The spike was on ${day}. Who keeps showing up that day?`,
        "Suspect identified: {answer}.",
      ),
      mk(
        { title: "Clue 3: The damage", prompt: `What is ${name}'s total ${L.m} on ${day}?`, solution: `SELECT SUM(f.${f.m}) FROM ${T} f JOIN ${D} d ON f.${f.key} = d.${d.key} WHERE d.${d.name} = ${q(name)} AND f.${f.date} = ${q(day)}`, starter: `SELECT \nFROM ${T} f\nJOIN ${D} d ON f.${f.key} = d.${d.key}\nWHERE `, line: `WHERE d.${d.name} = '${name}' AND f.${f.date} = '${day}'`, tag: "JOIN" },
        `${name} is our suspect. How big was the spree?`,
        "Total damage: {answer}.",
      ),
    ];
  }

  if (kase.id === "vanish") {
    const B = `${T}_backup`;
    const lost = String(kase.facts.lost);
    return [
      mk(
        { title: "Clue 1: The gap", prompt: `How many ${L.rows} are in ${B} but missing from ${T}?`, solution: `SELECT COUNT(*) FROM ${B} WHERE ${f.id} NOT IN (SELECT ${f.id} FROM ${T})`, starter: `SELECT COUNT(*)\nFROM ${B}\nWHERE `, line: `WHERE ${f.id} NOT IN (SELECT ${f.id} FROM ${T})`, tag: "ANTI-JOIN" },
        `Compare ${B} with ${T}, matching on ${f.id}.`,
        "{answer} records vanished.",
      ),
      mk(
        { title: "Clue 2: The pattern", prompt: `Which ${L.a} did the missing ${L.rows} come from?`, solution: `SELECT DISTINCT ${f.a} FROM ${B} WHERE ${f.id} NOT IN (SELECT ${f.id} FROM ${T})`, starter: `SELECT \nFROM ${B}\nWHERE `, line: `SELECT DISTINCT ${f.a}`, tag: "DISTINCT" },
        "Records don't vanish at random. Do the missing ones have something in common?",
        "Every missing record is from {answer}.",
      ),
      mk(
        { title: "Clue 3: The cost", prompt: `How much ${L.m} went missing in total?`, solution: `SELECT SUM(${f.m}) FROM ${B} WHERE ${f.id} NOT IN (SELECT ${f.id} FROM ${T})`, starter: `SELECT \nFROM ${B}\nWHERE `, line: `SELECT SUM(${f.m})`, tag: "SUM" },
        `It's all ${lost}. How much did the business lose from the report?`,
        "{answer} recovered from the backup.",
      ),
    ];
  }

  const name = String(kase.facts.name);
  const grp = `${f.key}, ${f.date}, ${f.m}`;
  return [
    mk(
      { title: "Clue 1: Count the copies", prompt: `How many (${grp}) combinations appear more than once?`, solution: `SELECT COUNT(*) FROM (SELECT ${grp} FROM ${T} GROUP BY ${grp} HAVING COUNT(*) > 1)`, starter: `SELECT ${grp}, COUNT(*)\nFROM ${T}\nGROUP BY ${grp}\n`, line: `HAVING COUNT(*) > 1  (then count those groups)`, tag: "HAVING" },
      `Group by the columns that should be unique together, and look for groups bigger than 1.`,
      "{answer} rows were loaded twice.",
    ),
    mk(
      { title: "Clue 2: The victim", prompt: `Which ${L.dimRow} owns the duplicated ${L.rows}? Return their ${d.name}.`, solution: `SELECT DISTINCT d.${d.name} FROM ${D} d WHERE d.${d.key} IN (SELECT ${f.key} FROM ${T} GROUP BY ${grp} HAVING COUNT(*) > 1)`, starter: `SELECT \nFROM ${D} d\nWHERE `, line: `WHERE d.${d.key} IN (SELECT ${f.key} FROM ${T} GROUP BY ... HAVING COUNT(*) > 1)`, tag: "SUBQUERY" },
      "Now find out whose records they are.",
      "It was {answer}.",
    ),
    mk(
      { title: "Clue 3: The overcount", prompt: `How much extra ${L.m} did the duplicates add?`, solution: `SELECT SUM(${f.m}) FROM (SELECT ${f.m} FROM ${T} GROUP BY ${grp} HAVING COUNT(*) > 1)`, starter: `SELECT SUM(${f.m})\nFROM (\n  SELECT \n  FROM ${T}\n)`, line: `FROM (SELECT ${f.m} FROM ${T} GROUP BY ${grp} HAVING COUNT(*) > 1)`, tag: "SUBQUERY" },
      `${name} was counted twice. By how much?`,
      "{answer} was overcounted.",
    ),
  ];
}

export const generateDetective = { plant, rounds };
