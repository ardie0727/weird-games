// Pinball Dungeon monster art: 8x8 sprites as text, cached as small canvases with a
// 1-pixel outline (neon in dark mode, ink in paper mode).

export type Theme = "dark" | "light";

const COLORS: Record<string, string> = {
  g: "#55d66b",
  w: "#f1ecff",
  k: "#1b1426",
  r: "#ff3d5a",
  y: "#ffd23d",
  v: "#8e5bd6",
  e: "#9aa0b8",
  b: "#3d6ee0",
  n: "#8a5426",
  o: "#ff8a2a",
};

export const SPRITES: Record<string, string[]> = {
  slime: ["........", "...gg...", "..gggg..", ".gwkgwk.", "gggggggg", "gggggggg", ".gggggg.", "........"],
  mini: ["........", "........", "...gg...", "..gggg..", ".gwkgwk.", "gggggggg", ".gggggg.", "........"],
  skeleton: ["..wwww..", ".wkwwkw.", ".wwwwww.", "..wkkw..", "...ww..n", "wwwwww.n", "...ww..n", ".w...w.."],
  bat: ["........", "v......v", "vv.vv.vv", "vvvvvvvv", ".vvrrvv.", "..vvvv..", "...vv...", "........"],
  knight: ["..eeee..", ".eeeeee.", ".ekkkke.", ".eeeeee.", "beeeeeeb", "beeyyeeb", "beeeeee.", ".ee..ee."],
  ghost: ["..wwww..", ".wwwwww.", "wwkwwkww", "wwwwwwww", "wwwkkwww", "wwwwwwww", "wwwwwwww", "w.ww.ww."],
  mimic: ["........", ".nnnnnn.", "nyyyyyyn", "wnwnwnwn", "nkkkkkkn", "nnnyynnn", "nnnnnnnn", "........"],
  kingslime: ["..y.y.y.", "..yyyyy.", ".gggggg.", "gwkggwkg", "gggggggg", "ggrrrrgg", "gggggggg", ".gggggg."],
  dragon: ["w......w", "ww....ww", ".wwwwww.", "wkrwwrkw", "wwwwwwww", ".wkwkwk.", "..wwww..", "...ww..."],
  lich: ["..vvvv..", ".vvvvvv.", "vvwwwwvv", "vwrwwrwv", "vvwwwwvv", "vvvwwvvv", "vvvvvvvv", "vv.vv.vv"],
  skull: ["........", "..wwww..", ".wwwwww.", ".wkwwkw.", ".wwwwww.", "..wkwk..", "........", "........"],
};

const cache = new Map<string, HTMLCanvasElement>();

export function sprite(name: string, theme: Theme, boss: boolean, white = false): HTMLCanvasElement {
  const key = `${name}|${theme}|${boss}|${white}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rows = SPRITES[name] ?? SPRITES.slime;
  const c = document.createElement("canvas");
  c.width = 10;
  c.height = 10;
  const cx = c.getContext("2d")!;
  const filled = (x: number, y: number) => y >= 0 && y < 8 && x >= 0 && x < 8 && rows[y][x] !== ".";
  cx.fillStyle = theme === "light" ? "#141210" : boss ? "#ff2bd6" : "#ff4d6d";
  for (let y = -1; y <= 8; y++)
    for (let x = -1; x <= 8; x++) {
      if (filled(x, y)) continue;
      if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) cx.fillRect(x + 1, y + 1, 1, 1);
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
