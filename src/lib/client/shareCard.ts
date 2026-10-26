"use client";

export interface CardInfo {
  mode: string;
  color: string;
  score: number;
  correct: number;
  rank?: number | null;
  level: string;
  levelColor: string;
  streak: number;
  dataset: string;
  day: string;
  name: string;
  url: string;
}

function fontVar(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

/** Draw a 1080x1080 arcade-style score card. */
export async function makeShareCard(c: CardInfo): Promise<Blob> {
  const W = 1080;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = W;
  const g = cv.getContext("2d")!;
  const pixel = fontVar("--font-press", "monospace");
  const term = fontVar("--font-vt", "monospace");
  try {
    await document.fonts.ready;
  } catch {
    /* ignore */
  }

  const bg = g.createRadialGradient(W / 2, 0, 50, W / 2, 0, W);
  bg.addColorStop(0, "#2a1260");
  bg.addColorStop(1, "#05040b");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, W);

  // perspective grid
  g.strokeStyle = "rgba(255,43,214,0.35)";
  g.lineWidth = 2;
  const horizon = 700;
  for (let i = -12; i <= 12; i++) {
    g.beginPath();
    g.moveTo(W / 2 + i * 30, horizon);
    g.lineTo(W / 2 + i * 180, W);
    g.stroke();
  }
  for (let k = 0; k < 9; k++) {
    const y = horizon + Math.pow(k / 8, 2) * (W - horizon);
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
  }

  const glow = (color: string, blur = 24) => {
    g.shadowColor = color;
    g.shadowBlur = blur;
    g.fillStyle = color;
  };
  g.textAlign = "center";

  glow("#ff2bd6");
  g.font = `64px ${pixel}`;
  g.fillText("QUERY", W / 2, 150);
  glow("#22f3ff");
  g.fillText("ARCADE", W / 2, 235);

  glow(c.color, 18);
  g.font = `34px ${pixel}`;
  g.fillText(c.mode.toUpperCase(), W / 2, 330);

  glow("#ffe14d", 30);
  g.font = `120px ${pixel}`;
  g.fillText(String(c.score).padStart(5, "0"), W / 2, 500);

  g.shadowBlur = 0;
  g.font = `48px ${term}`;
  g.fillStyle = "#ece9ff";
  const line2 = [`${c.correct} correct`, c.rank ? `#${c.rank} today` : null, `🔥 ${c.streak} day streak`].filter(Boolean).join("  ·  ");
  g.fillText(line2, W / 2, 580);

  glow(c.levelColor, 14);
  g.font = `28px ${pixel}`;
  g.fillText(`${c.name || "PLAYER"} · ${c.level.toUpperCase()}`, W / 2, 650);

  g.shadowBlur = 0;
  g.fillStyle = "rgba(5,4,11,0.75)";
  g.fillRect(0, W - 130, W, 130);
  g.fillStyle = "#8f89b8";
  g.font = `40px ${term}`;
  g.fillText(`${c.dataset} · ${c.day}`, W / 2, W - 75);
  g.fillStyle = "#22f3ff";
  g.font = `36px ${term}`;
  g.fillText(c.url, W / 2, W - 30);

  // scanlines
  g.fillStyle = "rgba(0,0,0,0.22)";
  for (let y = 0; y < W; y += 4) g.fillRect(0, y, W, 2);

  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));
}

/** Share via the native sheet when possible, otherwise download the PNG. */
export async function shareCard(c: CardInfo): Promise<"shared" | "downloaded" | "cancelled"> {
  const blob = await makeShareCard(c);
  const file = new File([blob], `query-arcade-${c.score}.png`, { type: "image/png" });
  const text = `I scored ${c.score} in ${c.mode} on Query Arcade. Can you beat me? ${c.url}`;
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text, title: "Query Arcade" });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return "downloaded";
}
