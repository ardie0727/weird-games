"use client";

import { useEffect, useState } from "react";
import { fetchBoard, type BoardRow, type Period } from "@/lib/client/api";
import { sfx } from "@/lib/client/sound";
import { MODE_ORDER, MODES, isModeId } from "@/lib/game/modes";
import type { ModeId } from "@/lib/game/types";
import { RANK_COLORS } from "./ArcadeHome";
import { cx, NeonButton, Panel } from "./ui";

const PERIODS: { id: Period; label: string }[] = [
  { id: "daily", label: "TODAY" },
  { id: "weekly", label: "WEEK" },
  { id: "all", label: "ALL TIME" },
];
const ord = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "ST" : n % 10 === 2 && n % 100 !== 12 ? "ND" : n % 10 === 3 && n % 100 !== 13 ? "RD" : "TH"}`;

export function Scores() {
  const [mode, setMode] = useState<ModeId>("blitz");
  const [period, setPeriod] = useState<Period>("daily");
  const [data, setData] = useState<{ online: boolean; rows: BoardRow[] } | null>(null);

  useEffect(() => {
    const m = new URLSearchParams(location.search).get("mode");
    if (m && isModeId(m)) setMode(m);
  }, []);
  useEffect(() => {
    setData(null);
    let live = true;
    fetchBoard(mode, period).then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [mode, period]);

  const cfg = MODES[mode];
  return (
    <div className="space-y-4">
      <h1 className="text-center font-pixel text-[18px] text-yellow neon">HIGH SCORES</h1>
      <div className="scroll-x -mx-4 flex gap-2 overflow-x-auto px-4">
        {MODE_ORDER.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              sfx("click");
              setMode(m);
            }}
            className={cx("shrink-0 border-2 px-2.5 py-2 font-pixel text-[8px] whitespace-nowrap", m === mode ? "text-bg" : "text-dim")}
            style={{ borderColor: MODES[m].color, background: m === mode ? MODES[m].color : "transparent" }}
          >
            {MODES[m].name.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              sfx("click");
              setPeriod(p.id);
            }}
            className={cx("border px-2 py-2 font-pixel text-[9px]", p.id === period ? "border-cyan text-cyan neon-soft" : "border-line text-dim")}
          >
            {p.label}
          </button>
        ))}
      </div>
      <Panel color={cfg.color} className="px-3 py-4">
        <div className="mb-3 grid grid-cols-[3.2rem_1fr_5.5rem] gap-2 font-pixel text-[8px] text-dim">
          <span>RANK</span>
          <span>NAME</span>
          <span className="text-right">SCORE</span>
        </div>
        {data === null ? (
          <div className="py-6 text-center font-pixel text-[9px] text-dim blink">LOADING…</div>
        ) : data.rows.length === 0 ? (
          <div className="py-6 text-center text-[19px] text-dim">No scores yet. Be the first!</div>
        ) : (
          <ol className="space-y-2.5">
            {data.rows.map((r, i) => (
              <li key={i} className="grid grid-cols-[3.2rem_1fr_5.5rem] items-baseline gap-2 font-pixel text-[10px]" style={{ color: RANK_COLORS[i % RANK_COLORS.length] }}>
                <span>{ord(i + 1)}</span>
                <span className="truncate">
                  {r.name}
                  {r.streak > 1 && <span className="ml-1 text-[8px] text-orange">🔥{r.streak}</span>}
                </span>
                <span className="text-right tabular-nums">{String(r.score).padStart(6, "0")}</span>
              </li>
            ))}
          </ol>
        )}
      </Panel>
      <p className="text-center text-[16px] text-dim">
        {data?.online === false
          ? "Showing scores saved on this device. The global board appears once the database is connected."
          : "Best score per player. Every score is re-checked by the server. Days roll over at midnight IST."}
      </p>
      <div className="flex justify-center gap-3">
        <NeonButton href={`/query-arcade/play/${mode}`} color={cfg.color} solid>
          ▶ Play {cfg.name}
        </NeonButton>
        <NeonButton href="/query-arcade" color="#8f89b8">
          Menu
        </NeonButton>
      </div>
    </div>
  );
}
