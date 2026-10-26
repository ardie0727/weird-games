"use client";

import { useEffect, useState } from "react";
import { BADGES, cleanName, getPlayer, getProgress, LEVELS, levelOf, setPlayerName, streakOf, type Progress } from "@/lib/client/storage";
import { MODE_ORDER, MODES } from "@/lib/game/modes";
import { cx, NeonButton, Panel } from "./ui";

export function Profile() {
  const [p, setP] = useState<Progress | null>(null);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setP(getProgress());
    setName(getPlayer().name);
  }, []);
  if (!p) return null;
  const lvl = levelOf(p.xp);
  const streak = streakOf(p.days);
  return (
    <div className="space-y-4">
      <h1 className="text-center font-pixel text-[18px] text-green neon">PLAYER</h1>
      <Panel className="px-3 py-3">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPlayerName(name);
            setSaved(true);
          }}
        >
          <input
            value={name}
            onChange={(e) => {
              setName(cleanName(e.target.value));
              setSaved(false);
            }}
            maxLength={12}
            placeholder="YOUR NAME"
            aria-label="Player name"
            className="min-w-0 flex-1 border-2 border-green bg-black/60 px-3 py-2 font-pixel text-[13px] uppercase text-green outline-none"
          />
          <NeonButton type="submit" color="#39ff88" size="sm">
            {saved ? "Saved ✓" : "Save"}
          </NeonButton>
        </form>
      </Panel>

      <Panel color={lvl.color} className="px-4 py-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="font-pixel text-[8px] text-dim">LEVEL</div>
            <div className="mt-1 font-pixel text-[20px] neon" style={{ color: lvl.color }}>
              {lvl.name.toUpperCase()}
            </div>
          </div>
          <div className="text-right">
            <div className="font-pixel text-[8px] text-dim">STREAK</div>
            <div className="mt-1 font-pixel text-[16px] text-orange">🔥 {streak}</div>
          </div>
        </div>
        <div className="mt-3 h-3 bg-line">
          <div className="h-3" style={{ width: `${Math.round(lvl.pct * 100)}%`, background: lvl.color }} />
        </div>
        <div className="mt-1 flex justify-between text-[17px] text-dim">
          <span>{p.xp} XP</span>
          <span>{lvl.next ? `${lvl.next.name} at ${lvl.next.min}` : "Top level!"}</span>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1">
          {LEVELS.map((l, i) => (
            <div key={l.name} className={cx("border py-1 text-center font-pixel text-[7px]", i <= lvl.index ? "" : "opacity-30")} style={{ borderColor: l.color, color: l.color }}>
              {l.name.toUpperCase()}
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-3 gap-2">
        {[
          ["RUNS", p.runs],
          ["CORRECT", p.totalCorrect],
          ["RACE WINS", p.raceWins],
        ].map(([k, v]) => (
          <Panel key={k} className="px-1 py-2 text-center">
            <div className="font-pixel text-[7px] text-dim">{k}</div>
            <div className="mt-1 font-pixel text-[14px]">{v}</div>
          </Panel>
        ))}
      </div>

      <Panel className="px-3 py-3">
        <div className="mb-2 font-pixel text-[9px] text-yellow">PERSONAL BESTS</div>
        <ul className="space-y-1 text-[19px]">
          {MODE_ORDER.map((m) => (
            <li key={m} className="flex justify-between">
              <span style={{ color: MODES[m].color }}>{MODES[m].name}</span>
              <span className="font-pixel text-[11px]">{p.bests[m] ?? 0}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel className="px-3 py-3">
        <div className="mb-2 font-pixel text-[9px] text-yellow">
          BADGES {p.badges.length}/{BADGES.length}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {BADGES.map((b) => {
            const has = p.badges.includes(b.id);
            return (
              <div key={b.id} className={cx("border px-2 py-2", has ? "border-yellow/70" : "border-line opacity-45")}>
                <div className="text-2xl">{has ? b.icon : "🔒"}</div>
                <div className={cx("font-pixel text-[8px] mt-1", has ? "text-yellow" : "text-dim")}>{b.name.toUpperCase()}</div>
                <div className="text-[15px] leading-tight text-dim">{b.desc}</div>
              </div>
            );
          })}
        </div>
      </Panel>
      <p className="text-center text-[16px] text-dim">Progress is saved on this device. Streaks count days played in a row (IST).</p>
      <div className="flex justify-center">
        <NeonButton href="/query-arcade" color="#8f89b8">
          ◀ Menu
        </NeonButton>
      </div>
    </div>
  );
}
