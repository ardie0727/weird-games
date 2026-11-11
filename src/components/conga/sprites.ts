// Conga Crawl pixel art: 8x8 sprites as text, drawn into small cached canvases with an
// automatic 1-pixel outline whose colour says whose side the sprite is on.

export type Theme = "dark" | "light";

const COLORS: Record<string, string> = {
  s: "#e3a877", // skin
  t: "#a8693f", // darker skin
  h: "#3a2418", // hair
  w: "#f4f0ff", // white
  k: "#1b1426", // near black
  y: "#ffcf3d", // gold
  c: "#22c8e0", // cyan
  m: "#ff2bd6", // magenta
  p: "#ff7ab8", // pink
  r: "#e8344e", // red
  g: "#4fbf6a", // green
  b: "#3d6ee0", // blue
  v: "#8e5bd6", // purple
  o: "#e88a2a", // orange
  n: "#7a4a24", // brown
  e: "#8f8fa8", // grey
};

export const SPRITES: Record<string, string[]> = {
  dada: [".wwwwww.", "wwwwwwww", "wssssssw", "wkkskksw", ".sskkss.", "syyyyyys", ".yyyyyy.", ".kk..kk."],
  bride: [".wrrrrw.", "whhhhhhw", "whsssshw", "wskssksw", "w.srrs.w", "rryyyyrr", ".rrrrrr.", "rrrrrrrr"],
  horse: ["..k..k..", ".wwwwww.", "wwkwwkww", "wwwwwwww", ".wwppww.", "..wkkw..", ".ywwwwy.", ".kk..kk."],
  aunty: ["...hh...", "..hhhh..", ".hssssh.", ".skssks.", "..srrs..", ".ppppyy.", "pppyyppp", ".pppppp."],
  uncle: ["..ssss..", ".hssssh.", ".skssks.", ".skkkks.", "..ssss..", "swwwwwws", ".wwwwww.", ".kk..kk."],
  dj: [".cccccc.", "kcccccck", "kssssssk", "kskssksk", "..ssss..", "smmmmmms", ".mmmmmm.", ".kk..kk."],
  photo: ["..hhhh..", ".hhhhhh.", ".ssssss.", "kkkkkkkk", "kkwwkyyk", "kkwwkkkk", ".bbbbbb.", ".kk..kk."],
  baby: ["........", "...hh...", "..ssss..", ".skssks.", ".ssppss.", "..wwww..", ".swwwws.", "..s..s.."],
  chef: [".wwwwww.", ".wwwwww.", "..wwww..", ".ssssss.", ".skssks.", ".wwwwww.", "swwrwwws", ".kk..kk."],
  mozzie: ["........", ".ww..ww.", "wwwkkwww", ".w.kk.w.", "...rr...", "..krrk..", ".k.kk.k.", "...k...."],
  neighbour: [".p.pp.p.", ".hhhhhh.", ".ssssss.", ".skssks.", ".sskkss.", "gggggggg", ".gggggg.", ".kk..kk."],
  caterer: ["..kkkk..", ".kssssk.", ".skssks.", "..ssss..", ".kkrrkk.", "wwkkkkk.", "wwkkkkk.", ".kk..kk."],
  rival: ["..hhhh..", ".hhhhhh.", ".ssssss.", ".kkskks.", "..ssss..", "seeeeees", ".eeeeee.", ".kk..kk."],
  mami: ["..hhhh..", ".hhhhhh.", "hssssssh", "swwswwss", ".ssrrss.", "vvvvyyvv", "vvyyvvvv", ".vvvvvv."],
  chefboss: [".wwwwww.", ".wwwwww.", "..wwww..", ".ssssss.", ".srssrs.", "wwwwwwee", "swwwwwke", ".kk..kk."],
  djboss: [".mmmmmm.", "kmmmmmmk", "kssssssk", "kkkskkkk", "..ssss..", "kkyyyykk", "kkkyykkk", ".kk..kk."],
  samosa: ["........", "...oo...", "..oooo..", "..oyoo..", ".oooooo.", ".ooyooo.", "oooooooo", "........"],
  disco: ["...k....", "...k....", "..wcww..", ".wcwcww.", ".cwcwcw.", ".wcwcww.", "..wwcw..", "........"],
  heart: ["........", ".rr.rr..", "rrrrrrr.", "rrrrrrr.", ".rrrrr..", "..rrr...", "...r....", "........"],
  cake: ["...y....", "..wpw...", ".wwwww..", ".ppppp..", "wwwwwww.", "ppppppp.", ".eeeee..", "........"],
  pot: [".w..w...", "..w..w..", "kkkkkkkk", ".oyoyoo.", ".nnnnnn.", ".nnnnnn.", "..nnnn..", "........"],
};

export type Team = "leader" | "line" | "guest" | "enemy" | "boss" | "item" | "none";

function outline(team: Team, theme: Theme): string | null {
  if (team === "none") return null;
  if (theme === "light") return team === "enemy" || team === "boss" ? "#8a1027" : "#141210";
  switch (team) {
    case "leader":
      return "#ffe14d";
    case "line":
      return "#22f3ff";
    case "guest":
      return "#39ff88";
    case "enemy":
      return "#ff4d6d";
    case "boss":
      return "#ff2bd6";
    case "item":
      return "#ffe14d";
  }
}

const cache = new Map<string, HTMLCanvasElement>();

/** A 10x10 canvas: the 8x8 sprite with a 1px outline round it. `white` makes a hit-flash silhouette. */
export function sprite(name: string, team: Team, theme: Theme, white = false): HTMLCanvasElement {
  const key = `${name}|${team}|${theme}|${white}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rows = SPRITES[name] ?? SPRITES.samosa;
  const c = document.createElement("canvas");
  c.width = 10;
  c.height = 10;
  const cx = c.getContext("2d")!;
  const filled = (x: number, y: number) => y >= 0 && y < 8 && x >= 0 && x < 8 && rows[y][x] !== ".";
  const ol = outline(team, theme);
  if (ol) {
    cx.fillStyle = ol;
    for (let y = -1; y <= 8; y++)
      for (let x = -1; x <= 8; x++) {
        if (filled(x, y)) continue;
        if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) cx.fillRect(x + 1, y + 1, 1, 1);
      }
  }
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const ch = rows[y][x];
      if (ch === ".") continue;
      cx.fillStyle = white ? "#ffffff" : COLORS[ch] ?? "#ff00ff";
      cx.fillRect(x + 1, y + 1, 1, 1);
    }
  cache.set(key, c);
  return c;
}
