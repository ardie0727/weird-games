// Drawing for Rubber Bullet Man: one frame of a Game on the canvas.

import { BLAST_R, BULLETS, H, MAX_HEARTS, MIRROR_ARC, POWERS, POWER_KINDS, W, enemyColor, isBoss, nearestPlayer, predictPath, type BulletKind, type Game, type Player } from "@/lib/rbm/engine";

export interface Stick {
  id: number | null;
  ox: number;
  oy: number;
  x: number;
  y: number;
  t0: number;
}

export const STICK = 46; // css px for a full push
export const DEAD = 12;

export interface DrawOpts {
  font: (px: number) => string;
  /** The player this screen belongs to (their HUD, aim line and name tag). */
  me: Player | null;
  hud: boolean;
  playing: boolean;
  aim: { aiming: boolean; mouse: boolean } | null;
  sticks: { move: Stick; aim: Stick };
  /** CSS px per world unit. */
  scale: number;
}

export function drawGame(cx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, g: Game, o: DrawOpts) {
  const { font, me } = o;
  const s = canvas.width / W;
  const multi = g.players.length > 1 || g.mode !== "classic";
  cx.setTransform(1, 0, 0, 1, 0, 0);
  cx.fillStyle = "#07051a";
  cx.fillRect(0, 0, canvas.width, canvas.height);
  const sh = g.shake;
  cx.setTransform(s, 0, 0, s, sh ? (Math.random() - 0.5) * sh * s : 0, sh ? (Math.random() - 0.5) * sh * s : 0);
  const t = g.time;

  // floor grid
  cx.strokeStyle = "rgba(42,35,80,0.55)";
  cx.lineWidth = 1;
  cx.beginPath();
  for (let x = 30; x < W; x += 30) cx.moveTo(x, 0), cx.lineTo(x, H);
  for (let y = 30; y < H; y += 30) cx.moveTo(0, y), cx.lineTo(W, y);
  cx.stroke();
  cx.strokeStyle = g.mode === "brawl" ? "#ff2bd6" : "#22f3ff";
  cx.lineWidth = 3;
  cx.strokeRect(1.5, 1.5, W - 3, H - 3);

  for (const ob of g.obstacles) {
    cx.fillStyle = "#1b1440";
    cx.fillRect(ob.x, ob.y, ob.w, ob.h);
    cx.strokeStyle = "#22f3ff";
    cx.lineWidth = 2;
    cx.strokeRect(ob.x + 1, ob.y + 1, ob.w - 2, ob.h - 2);
  }

  // pinball bumpers
  for (const bp of g.bumpers) {
    const lit = bp.flash > 0;
    cx.fillStyle = lit ? "#ff2bd6" : "#2a0f3a";
    cx.beginPath();
    cx.arc(bp.x, bp.y, lit ? bp.r + 2 : bp.r, 0, Math.PI * 2);
    cx.fill();
    cx.strokeStyle = "#ff2bd6";
    cx.lineWidth = 3;
    cx.stroke();
    cx.fillStyle = lit ? "#fff" : "#ff2bd6";
    cx.beginPath();
    cx.arc(bp.x, bp.y, bp.r * 0.35, 0, Math.PI * 2);
    cx.fill();
  }

  // spawn warnings
  for (const w of g.warnings) {
    if (Math.floor(w.t * 10) % 2) continue;
    cx.strokeStyle = enemyColor(w.type);
    cx.lineWidth = 2;
    const r = isBoss(w.type) ? 30 : 12;
    cx.beginPath();
    cx.arc(w.x, w.y, r, 0, Math.PI * 2);
    cx.stroke();
    cx.font = font(10);
    cx.fillStyle = enemyColor(w.type);
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    cx.fillText("!", w.x, w.y + 1);
  }

  // pickups
  for (const pk of g.pickups) {
    if (pk.t > (g.mode === "brawl" ? 9 : 6) && Math.floor(pk.t * 8) % 2) continue;
    const y = pk.y + Math.sin(pk.t * 5) * 2;
    if (pk.kind === "heart") drawHeart(cx, pk.x, y, 7, "#ff4d6d");
    else if (pk.kind === "shield" || pk.kind === "rapid" || pk.kind === "triple") {
      const pw = POWERS[pk.kind];
      cx.fillStyle = pw.color;
      cx.globalAlpha = 0.25 + Math.sin(pk.t * 8) * 0.1;
      cx.beginPath();
      cx.arc(pk.x, y, 12, 0, Math.PI * 2);
      cx.fill();
      cx.globalAlpha = 1;
      cx.strokeStyle = pw.color;
      cx.lineWidth = 2;
      cx.beginPath();
      cx.arc(pk.x, y, 8, 0, Math.PI * 2);
      cx.stroke();
      cx.fillStyle = pw.color;
      cx.font = font(8);
      cx.textAlign = "center";
      cx.textBaseline = "middle";
      cx.fillText(pw.letter, pk.x + 0.5, y + 1);
    } else {
      cx.fillStyle = BULLETS[pk.kind].color;
      cx.globalAlpha = 0.25;
      cx.beginPath();
      cx.arc(pk.x, y, 11, 0, Math.PI * 2);
      cx.fill();
      cx.globalAlpha = 1;
      cx.strokeStyle = BULLETS[pk.kind].color;
      cx.lineWidth = 2;
      cx.strokeRect(pk.x - 7, y - 7, 14, 14);
      cx.font = font(8);
      cx.textAlign = "center";
      cx.textBaseline = "middle";
      cx.fillText(BULLETS[pk.kind].name[0], pk.x + 0.5, y + 1);
    }
  }

  // enemies
  for (const e of g.enemies) {
    const col = enemyColor(e.type);
    const look = nearestPlayer(g, e.x, e.y) ?? me ?? { x: W / 2, y: H };
    if (e.type === "dasher" && e.state === 0 && e.t < 0.6) {
      cx.strokeStyle = "rgba(255,138,61,0.5)";
      cx.setLineDash([4, 4]);
      cx.lineWidth = 2;
      cx.beginPath();
      cx.moveTo(e.x, e.y);
      cx.lineTo(e.x + Math.cos(e.fire) * 160, e.y + Math.sin(e.fire) * 160);
      cx.stroke();
      cx.setLineDash([]);
    }
    const squish = 1 + Math.sin(t * 9 + e.id) * 0.06;
    cx.fillStyle = e.flash > 0 ? "#ffffff" : e.frozen > 0 ? "#6c4aa8" : col;
    cx.beginPath();
    cx.ellipse(e.x, e.y, e.r * squish, e.r / squish, 0, 0, Math.PI * 2);
    cx.fill();
    if (e.type === "brute") {
      cx.strokeStyle = "#ffd0da";
      cx.lineWidth = 2;
      cx.stroke();
    }
    if (e.type === "shooter") {
      const a = Math.atan2(look.y - e.y, look.x - e.x);
      cx.strokeStyle = col;
      cx.lineWidth = 4;
      cx.beginPath();
      cx.moveTo(e.x, e.y);
      cx.lineTo(e.x + Math.cos(a) * (e.r + 6), e.y + Math.sin(a) * (e.r + 6));
      cx.stroke();
    }
    if (e.type === "boss") {
      cx.fillStyle = "#ff2bd6";
      cx.beginPath();
      cx.moveTo(e.x - 16, e.y - 24);
      cx.lineTo(e.x - 16, e.y - 38);
      cx.lineTo(e.x - 8, e.y - 30);
      cx.lineTo(e.x, e.y - 40);
      cx.lineTo(e.x + 8, e.y - 30);
      cx.lineTo(e.x + 16, e.y - 38);
      cx.lineTo(e.x + 16, e.y - 24);
      cx.fill();
    }
    if (e.type === "queen") {
      cx.fillStyle = "#ffe14d";
      for (let i = -2; i <= 2; i++) {
        cx.beginPath();
        cx.arc(e.x + i * 7, e.y - 27 - (2 - Math.abs(i)) * 3, 3, 0, Math.PI * 2);
        cx.fill();
      }
      // a bubble wand
      cx.strokeStyle = "#ece9ff";
      cx.lineWidth = 2;
      cx.beginPath();
      cx.moveTo(e.x + 24, e.y + 6);
      cx.lineTo(e.x + 34, e.y - 10);
      cx.stroke();
      cx.beginPath();
      cx.arc(e.x + 37, e.y - 15, 5, 0, Math.PI * 2);
      cx.stroke();
    }
    if (e.type === "fuse") {
      const lit = e.state === 1;
      const tipX = e.x + 4, tipY = e.y - e.r - 6;
      cx.strokeStyle = "#c9b38a";
      cx.lineWidth = 2;
      cx.beginPath();
      cx.moveTo(e.x + 1, e.y - e.r + 1);
      cx.quadraticCurveTo(e.x + 6, e.y - e.r - 2, tipX, tipY);
      cx.stroke();
      cx.fillStyle = Math.floor(t * 20) % 2 ? "#ffe14d" : "#ff8a3d";
      cx.beginPath();
      cx.arc(tipX, tipY, lit ? 3.5 : 2, 0, Math.PI * 2);
      cx.fill();
      if (lit) {
        cx.strokeStyle = "rgba(255,77,109,0.7)";
        cx.setLineDash([4, 4]);
        cx.lineWidth = 1.5;
        cx.beginPath();
        cx.arc(e.x, e.y, BLAST_R, 0, Math.PI * 2);
        cx.stroke();
        cx.setLineDash([]);
        if (Math.floor(e.t * 12) % 2) {
          cx.fillStyle = "#ff4d6d";
          cx.beginPath();
          cx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
          cx.fill();
        }
      }
    }
    if (e.type === "mirror") {
      cx.strokeStyle = e.frozen > 0 ? "#5a5480" : "#ffffff";
      cx.lineWidth = 4;
      cx.lineCap = "round";
      cx.beginPath();
      cx.arc(e.x, e.y, e.r + 5, e.face - MIRROR_ARC, e.face + MIRROR_ARC);
      cx.stroke();
      cx.lineCap = "butt";
    }
    // eyes follow the nearest player
    const a = Math.atan2(look.y - e.y, look.x - e.x);
    const er = Math.max(2, e.r * 0.28);
    for (const side of [-1, 1]) {
      const ex = e.x + Math.cos(a + side * 0.6) * e.r * 0.45;
      const ey = e.y + Math.sin(a + side * 0.6) * e.r * 0.45;
      cx.fillStyle = "#05040b";
      cx.beginPath();
      cx.arc(ex, ey, er, 0, Math.PI * 2);
      cx.fill();
      cx.fillStyle = "#fff";
      cx.fillRect(ex + Math.cos(a) * er * 0.4 - 1, ey + Math.sin(a) * er * 0.4 - 1, 2, 2);
    }
    if (e.frozen > 0) {
      cx.strokeStyle = "#b26bff";
      cx.lineWidth = 2;
      cx.strokeRect(e.x - e.r - 3, e.y - e.r - 3, (e.r + 3) * 2, (e.r + 3) * 2);
    }
    if (e.maxHp > 1) {
      const wv = e.r * 2;
      cx.fillStyle = "#2a2350";
      cx.fillRect(e.x - wv / 2, e.y + e.r + 4, wv, 3);
      cx.fillStyle = col;
      cx.fillRect(e.x - wv / 2, e.y + e.r + 4, (wv * Math.max(0, e.hp)) / e.maxHp, 3);
    }
  }

  // aim preview (touch aim stick or mouse)
  if (o.aim && me && !me.down && o.playing && !g.over && (o.aim.aiming || o.aim.mouse)) {
    const kind = me.ammo[me.selected] > 0 ? me.selected : "bouncer";
    const pts = predictPath(g, me.x, me.y, me.aimX, me.aimY, BULLETS[kind].r, o.aim.aiming ? 360 : 140, o.aim.aiming ? 2 : 1);
    cx.strokeStyle = BULLETS[kind].color;
    cx.globalAlpha = o.aim.aiming ? 0.8 : 0.35;
    cx.lineWidth = 1.5;
    cx.setLineDash([5, 5]);
    cx.lineDashOffset = -t * 30;
    cx.beginPath();
    pts.forEach((q, i) => (i ? cx.lineTo(q.x, q.y) : cx.moveTo(q.x, q.y)));
    cx.stroke();
    cx.setLineDash([]);
    cx.globalAlpha = 1;
  }

  // bullets: in a brawl, a player's shots wear a ring of their colour
  const colorOf = new Map(g.players.map((p) => [p.id, p.color]));
  for (const b of g.bullets) {
    const col = b.owner === "enemy" ? "#ff8a3d" : BULLETS[b.kind].color;
    cx.strokeStyle = col;
    cx.globalAlpha = 0.35;
    cx.lineWidth = b.r * 1.4;
    cx.beginPath();
    cx.moveTo(b.x - b.vx * 0.04, b.y - b.vy * 0.04);
    cx.lineTo(b.x, b.y);
    cx.stroke();
    cx.globalAlpha = 0.25;
    cx.fillStyle = col;
    cx.beginPath();
    cx.arc(b.x, b.y, b.r * 2, 0, Math.PI * 2);
    cx.fill();
    cx.globalAlpha = 1;
    if (b.kind === "bomb" && b.owner === "player") {
      cx.fillStyle = "#1b1440";
      cx.beginPath();
      cx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      cx.fill();
      cx.strokeStyle = col;
      cx.lineWidth = 2;
      cx.stroke();
      cx.fillStyle = Math.floor(b.age * 16) % 2 ? "#ffe14d" : "#ff4d6d";
      cx.beginPath();
      cx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
      cx.fill();
    } else if (b.kind === "boomerang") {
      cx.save();
      cx.translate(b.x, b.y);
      cx.rotate(b.age * 18);
      cx.fillRect(-b.r, -2, b.r * 2, 4);
      cx.fillRect(-2, -b.r, 4, b.r * 2);
      cx.restore();
    } else {
      cx.beginPath();
      cx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      cx.fill();
      cx.fillStyle = "#fff";
      cx.beginPath();
      cx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.35, 0, Math.PI * 2);
      cx.fill();
    }
    if (b.kind === "piercer" && b.phased) {
      cx.strokeStyle = "#fff";
      cx.lineWidth = 1;
      cx.beginPath();
      cx.arc(b.x, b.y, b.r + 3, 0, Math.PI * 2);
      cx.stroke();
    }
    if (g.mode === "brawl" && b.owner === "player" && !b.mini) {
      cx.strokeStyle = colorOf.get(b.pid) ?? "#fff";
      cx.lineWidth = 1.5;
      cx.beginPath();
      cx.arc(b.x, b.y, b.r + 2.5, 0, Math.PI * 2);
      cx.stroke();
    }
  }

  // the men
  for (const p of g.players) drawMan(cx, g, p, p === me, multi, font, t);

  for (const bl of g.blasts) {
    const k = bl.t / 0.4;
    cx.globalAlpha = 0.5 * (1 - k);
    cx.fillStyle = "#ff8a3d";
    cx.beginPath();
    cx.arc(bl.x, bl.y, bl.r * (0.4 + k * 0.6), 0, Math.PI * 2);
    cx.fill();
    cx.globalAlpha = 1 - k;
    cx.strokeStyle = "#ffe14d";
    cx.lineWidth = 3;
    cx.stroke();
    cx.globalAlpha = 1;
  }

  for (const pt of g.particles) {
    cx.globalAlpha = 1 - pt.t / pt.life;
    cx.fillStyle = pt.color;
    cx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  cx.globalAlpha = 1;
  cx.textAlign = "center";
  cx.textBaseline = "middle";
  for (const pp of g.pops) {
    cx.globalAlpha = Math.min(1, 2 - pp.t * 2);
    cx.font = font(7);
    cx.fillStyle = "#05040b";
    cx.fillText(pp.text, pp.x + 1, pp.y + 1);
    cx.fillStyle = pp.color;
    cx.fillText(pp.text, pp.x, pp.y);
  }
  cx.globalAlpha = 1;

  // HUD
  cx.setTransform(s, 0, 0, s, 0, 0);
  if (o.hud) drawHud(cx, g, me, font);
  if (g.banner && o.playing) {
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    cx.font = font(22);
    cx.fillStyle = "#05040b";
    cx.fillText(g.banner.text, W / 2 + 2, H * 0.38 + 2);
    cx.fillStyle = g.banner.text === "BOSS WAVE" || g.banner.text === "BRAWL!" ? "#ff2bd6" : "#ffe14d";
    cx.fillText(g.banner.text, W / 2, H * 0.38);
    if (g.banner.sub) {
      cx.font = font(10);
      cx.fillStyle = "#ece9ff";
      cx.fillText(g.banner.sub, W / 2, H * 0.38 + 28);
    }
  }
  if (me?.down && o.playing && !g.over) {
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    cx.font = font(9);
    cx.fillStyle = "#ece9ff";
    cx.fillText(g.mode === "brawl" ? "KO! RESPAWNING..." : "YOU'RE DOWN. BACK NEXT WAVE", W / 2, H * 0.55);
  }

  // thumb sticks, in screen pixels
  const dpr = canvas.width / (W * o.scale);
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const selColor = me ? BULLETS[me.selected].color : BULLETS.bouncer.color;
  for (const [st, col] of [
    [o.sticks.move, "#ece9ff"],
    [o.sticks.aim, selColor],
  ] as const) {
    if (st.id === null) continue;
    let dx = st.x - st.ox, dy = st.y - st.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK) (dx *= STICK / d), (dy *= STICK / d);
    cx.globalAlpha = 0.18;
    cx.fillStyle = col;
    cx.beginPath();
    cx.arc(st.ox, st.oy, STICK, 0, Math.PI * 2);
    cx.fill();
    cx.globalAlpha = 0.6;
    cx.beginPath();
    cx.arc(st.ox + dx, st.oy + dy, 20, 0, Math.PI * 2);
    cx.fill();
    cx.globalAlpha = 1;
  }
}

function drawMan(cx: CanvasRenderingContext2D, g: Game, p: Player, mine: boolean, multi: boolean, font: (px: number) => string, t: number) {
  if (p.down) {
    if (g.over || g.mode === "brawl") return;
    // a downed co-op teammate: a faint ghost where they fell
    cx.globalAlpha = 0.25 + Math.sin(t * 4) * 0.08;
    cx.strokeStyle = p.color;
    cx.lineWidth = 2;
    cx.setLineDash([3, 3]);
    cx.beginPath();
    cx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    cx.stroke();
    cx.setLineDash([]);
    cx.globalAlpha = 1;
    return;
  }
  if (g.over && g.mode !== "brawl") return;
  const blink = p.invuln > 0 && Math.floor(p.invuln * 12) % 2;
  if (!blink) {
    const len = Math.hypot(p.aimX, p.aimY) || 1;
    const ax = p.aimX / len, ay = p.aimY / len;
    const bob = Math.sin(p.walk) * 1.5;
    cx.fillStyle = "#3a2a00";
    cx.beginPath();
    cx.ellipse(p.x, p.y + p.r + 2, p.r, 3, 0, 0, Math.PI * 2);
    cx.fill();
    const kind: BulletKind = p.ammo[p.selected] > 0 ? p.selected : "bouncer";
    cx.strokeStyle = BULLETS[kind].color;
    cx.lineWidth = 5;
    cx.lineCap = "round";
    cx.beginPath();
    cx.moveTo(p.x + ax * 4, p.y + ay * 4 + bob);
    cx.lineTo(p.x + ax * (p.r + 8), p.y + ay * (p.r + 8) + bob);
    cx.stroke();
    cx.lineCap = "butt";
    cx.fillStyle = p.frozen > 0 ? "#6c4aa8" : p.color;
    cx.beginPath();
    cx.arc(p.x, p.y + bob, p.r, 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = p.color === "#ff2bd6" ? "#ffe14d" : "#ff2bd6";
    cx.fillRect(p.x - p.r, p.y - 3 + bob, p.r * 2, 3); // headband
    cx.fillStyle = "#05040b";
    for (const side of [-1, 1]) cx.fillRect(p.x + ax * 3 + side * -ay * 3.5 - 1.5, p.y + ay * 3 + side * ax * 3.5 + bob, 3, 3);
    if (p.frozen > 0) {
      cx.strokeStyle = "#b26bff";
      cx.lineWidth = 2;
      cx.strokeRect(p.x - p.r - 3, p.y - p.r - 3, (p.r + 3) * 2, (p.r + 3) * 2);
    }
  }
  if (p.power.shield) {
    cx.strokeStyle = POWERS.shield.color;
    cx.globalAlpha = 0.55 + Math.sin(t * 6) * 0.2;
    cx.lineWidth = 2;
    cx.beginPath();
    cx.arc(p.x, p.y, p.r + 7, 0, Math.PI * 2);
    cx.stroke();
    cx.globalAlpha = 0.12;
    cx.fillStyle = POWERS.shield.color;
    cx.fill();
    cx.globalAlpha = 1;
  }
  if (multi) {
    // name tag, with little hearts for everyone else
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    cx.font = font(6);
    const label = mine ? "YOU" : p.name;
    cx.fillStyle = "#05040b";
    cx.fillText(label, p.x + 1, p.y - p.r - 9);
    cx.fillStyle = p.color;
    cx.fillText(label, p.x, p.y - p.r - 10);
    if (!mine) for (let i = 0; i < p.hearts; i++) drawHeart(cx, p.x - (p.hearts - 1) * 4 + i * 8, p.y + p.r + 9, 2.6, "#ff4d6d");
  }
}

function drawHud(cx: CanvasRenderingContext2D, g: Game, me: Player | null, font: (px: number) => string) {
  cx.textBaseline = "top";
  if (g.mode === "brawl" && g.brawl) {
    // everyone's points, in seat order
    cx.font = font(8);
    cx.textAlign = "left";
    let x = 10;
    for (const p of g.players) {
      cx.fillStyle = p.color;
      cx.fillRect(x, 11, 7, 7);
      const label = `${p.points}`;
      cx.fillStyle = p === me ? "#ffffff" : p.color;
      cx.fillText(label, x + 10, 11);
      x += 22 + cx.measureText(label).width;
    }
    const tl = Math.ceil(g.brawl.timeLeft);
    cx.textAlign = "center";
    cx.fillStyle = tl <= 15 && Math.floor(g.time * 4) % 2 ? "#ff4d6d" : "#22f3ff";
    cx.fillText(`${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, "0")}`, W / 2 + 30, 12);
  } else {
    cx.font = font(10);
    cx.textAlign = "left";
    cx.fillStyle = "#ffe14d";
    cx.fillText(String(g.score).padStart(6, "0"), 10, 10);
    cx.textAlign = "center";
    cx.fillStyle = "#22f3ff";
    cx.font = font(8);
    cx.fillText(`WAVE ${Math.max(1, g.wave)}`, W / 2, 12);
  }
  if (!me) return;
  for (let i = 0; i < MAX_HEARTS; i++) drawHeart(cx, W - 16 - i * 18, 16, 6, i < me.hearts ? "#ff4d6d" : "#2a2350");
  // active power-ups, under the score
  cx.font = font(7);
  cx.textAlign = "left";
  let px = 10;
  for (const k of POWER_KINDS) {
    const on = k === "shield" ? me.power.shield : me.power[k] > 0;
    if (!on) continue;
    const left = k === "shield" ? 0 : me.power[k];
    if (left > 0 && left < 2 && Math.floor(left * 8) % 2) continue;
    const label = k === "shield" ? POWERS[k].name.toUpperCase() : `${POWERS[k].name.toUpperCase()} ${Math.ceil(left)}`;
    cx.fillStyle = POWERS[k].color;
    cx.fillText(label, px, 26);
    px += cx.measureText(label).width + 8;
  }
}

export function drawHeart(cx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  cx.fillStyle = color;
  cx.beginPath();
  cx.moveTo(x, y + s);
  cx.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.6, y - s * 1.4, x, y - s * 0.4);
  cx.bezierCurveTo(x + s * 0.6, y - s * 1.4, x + s * 1.6, y - s * 0.2, x, y + s);
  cx.fill();
}
