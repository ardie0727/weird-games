"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchBoard, type BoardRow } from "@/lib/client/api";
import { sfx, unlockAudio } from "@/lib/client/sound";
import { getPlayer, getProgress, levelOf, streakOf, type Progress } from "@/lib/client/storage";
import { buildDataset, istDay } from "@/lib/dataset";
import { MODE_ORDER, MODES } from "@/lib/game/modes";
import { cx, NeonButton, Panel } from "./ui";

const GLYPH: Record<string, string> = { blitz: "⚡", bug: "🐞", predict: "🔮", pipeline: "🏗️", detective: "🕵️", duel: "⚔️", race: "🏁" };
export const RANK_COLORS = ["#ffe14d", "#22f3ff", "#ff2bd6", "#39ff88", "#ff8a3d", "#b26bff"];

function useCredit() {
  const [credit, setCredit] = useState<number | null>(null);
  useEffect(() => {
    try {
      setCredit(Number(sessionStorage.getItem("qa.credit") ?? 0));
    } catch {
      setCredit(0);
    }
  }, []);
  const insert = () => {
    unlockAudio();
    sfx("coin");
    setCredit((c) => {
      const n = (c ?? 0) + 1;
      try {
        sessionStorage.setItem("qa.credit", String(n));
      } catch {
        /* ignore */
      }
      return n;
    });
  };
  return { credit, insert };
}

export function ArcadeHome() {
  const { credit, insert } = useCredit();
  if (credit === null) return <div className="min-h-[70dvh]" />;
  return credit > 0 ? <Menu credit={credit} /> : <Attract onCoin={insert} />;
}

function Attract({ onCoin }: { onCoin: () => void }) {
  const [slide, setSlide] = useState(0);
  const [top, setTop] = useState<BoardRow[] | null>(null);
  const ds = buildDataset(istDay());

  useEffect(() => {
    fetchBoard("blitz", "daily").then((b) => setTop(b.rows.slice(0, 5)));
    const t = setInterval(() => setSlide((s) => (s + 1) % 3), 4800);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " " || e.key.toLowerCase() === "c") onCoin();
    };
    window.addEventListener("keydown", key);
    return () => {
      clearInterval(t);
      window.removeEventListener("keydown", key);
    };
  }, [onCoin]);

  return (
    <button type="button" onClick={onCoin} className="relative block w-full min-h-[calc(100dvh-7rem)] overflow-hidden text-center" aria-label="Insert coin to start">
      <div className="stars absolute inset-0" aria-hidden />
      <div className="absolute inset-x-0 bottom-0 h-[38%] overflow-hidden" aria-hidden>
        <div className="grid-floor absolute -inset-x-1/2 top-0 h-[200%]" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6 pt-8">
        <div className="font-pixel text-[9px] tracking-[0.3em] text-dim">WEIRD GAMES PRESENTS</div>
        <div className="font-pixel leading-[1.15]">
          <div className="text-[38px] sm:text-[54px] text-pink neon">QUERY</div>
          <div className="text-[38px] sm:text-[54px] text-cyan neon">ARCADE</div>
        </div>
        <div className="font-pixel text-[9px] text-yellow neon-soft tracking-widest">SQL · PYSPARK · DATA</div>

        <div className="mt-2 w-full max-w-md px-2">
          <Panel color="#ff2bd6" className="min-h-[220px] px-4 py-4 text-left">
            {slide === 0 && (
              <div>
                <div className="font-pixel text-[11px] text-yellow neon-soft text-center mb-3">TODAY&apos;S HIGH SCORES</div>
                {top === null ? (
                  <div className="text-dim text-center">LOADING…</div>
                ) : top.length === 0 ? (
                  <div className="text-center text-dim">
                    No scores yet today.
                    <br />
                    <span className="text-green">Your name could be here.</span>
                  </div>
                ) : (
                  <ol className="font-pixel text-[10px] space-y-2.5">
                    {top.map((r, i) => (
                      <li key={i} className="flex justify-between gap-3" style={{ color: RANK_COLORS[i % RANK_COLORS.length] }}>
                        <span>{["1ST", "2ND", "3RD", "4TH", "5TH"][i]}</span>
                        <span className="tabular-nums">{String(r.score).padStart(6, "0")}</span>
                        <span className="w-24 truncate text-right">{r.name}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
            {slide === 1 && (
              <div>
                <div className="font-pixel text-[11px] text-yellow neon-soft text-center mb-3">TODAY&apos;S DATASET</div>
                <div className="text-center text-4xl mb-1">{ds.theme.icon}</div>
                <div className="text-center font-pixel text-[11px] text-cyan mb-2">{ds.theme.name.toUpperCase()}</div>
                <div className="text-center text-dim mb-3">{ds.theme.tagline}</div>
                {ds.tables.map((t) => (
                  <div key={t.name} className="font-code text-[11px] text-ink/90 truncate">
                    <span className="text-pink">{t.name}</span>({t.columns.map((c) => c.name).join(", ")})
                  </div>
                ))}
              </div>
            )}
            {slide === 2 && (
              <div>
                <div className="font-pixel text-[11px] text-yellow neon-soft text-center mb-3">HOW TO PLAY</div>
                <ul className="space-y-1.5 text-[19px]">
                  <li>
                    <span className="text-green">▸</span> Real SQL runs in your browser.
                  </li>
                  <li>
                    <span className="text-green">▸</span> Answers are checked by <span className="text-cyan">result</span>, so any correct query wins.
                  </li>
                  <li>
                    <span className="text-green">▸</span> Streaks build a combo up to <span className="text-pink">x5</span>.
                  </li>
                  <li>
                    <span className="text-green">▸</span> A new synthetic dataset every day.
                  </li>
                  <li>
                    <span className="text-green">▸</span> 7 modes, including PySpark and 1v1 races.
                  </li>
                </ul>
              </div>
            )}
          </Panel>
          <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className={cx("h-1.5 w-4", i === slide ? "bg-pink" : "bg-line")} />
            ))}
          </div>
        </div>

        <div className="mt-4 font-pixel text-[18px] text-yellow neon blink">INSERT COIN</div>
        <div className="font-pixel text-[8px] text-dim">TAP ANYWHERE · FREE PLAY</div>
      </div>
    </button>
  );
}

function Menu({ credit }: { credit: number }) {
  const [prog, setProg] = useState<Progress | null>(null);
  const [name, setName] = useState("");
  useEffect(() => {
    setProg(getProgress());
    setName(getPlayer().name);
    sfx("start");
  }, []);
  const lvl = levelOf(prog?.xp ?? 0);
  const streak = prog ? streakOf(prog.days) : 0;
  const ds = buildDataset(istDay());

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="font-pixel text-[12px] text-yellow neon-soft">SELECT GAME</div>
        <div className="font-pixel text-[9px] text-green">CREDIT {String(credit).padStart(2, "0")}</div>
      </div>

      <Link href="/query-arcade/profile" className="block">
        <Panel color={lvl.color} className="flex items-center gap-3 px-3 py-2.5">
          <div className="font-pixel text-[10px]" style={{ color: lvl.color }}>
            {lvl.name.toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="h-2 bg-line">
              <div className="h-2" style={{ width: `${Math.round(lvl.pct * 100)}%`, background: lvl.color }} />
            </div>
            <div className="mt-0.5 flex justify-between text-[16px] text-dim">
              <span>{name || "NEW PLAYER"}</span>
              <span>{prog?.xp ?? 0} XP</span>
            </div>
          </div>
          <div className="font-pixel text-[10px] text-orange" title="Days in a row">
            🔥{streak}
          </div>
        </Panel>
      </Link>

      <div className="flex items-center gap-2 text-dim text-[18px]">
        <span className="text-2xl">{ds.theme.icon}</span>
        <span>
          Today&apos;s data: <span className="text-cyan">{ds.theme.name}</span>
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {MODE_ORDER.map((id, i) => {
          const m = MODES[id];
          return (
            <Link key={id} href={`/query-arcade/play/${id}`} onClick={() => sfx("click")} className="group block transition-transform active:scale-[0.98]">
              <Panel color={m.color} className="relative flex items-center gap-3 px-3 py-3 neon-box" style={{ ["--glow" as string]: m.color }}>
                <div className="text-3xl w-10 text-center">{GLYPH[id]}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-pixel text-[11px] neon-soft" style={{ color: m.color }}>
                    {i + 1}. {m.name.toUpperCase()}
                  </div>
                  <div className="text-[18px] text-ink/80 leading-tight">{m.short}</div>
                </div>
                <div className="text-right font-pixel text-[8px] text-dim">
                  BEST
                  <div className="text-[10px] text-ink mt-1">{prog?.bests[id] ?? 0}</div>
                </div>
              </Panel>
            </Link>
          );
        })}
        <Link href="/query-arcade/race" onClick={() => sfx("click")} className="block transition-transform active:scale-[0.98]">
          <Panel color="#ff4d6d" className="flex items-center gap-3 px-3 py-3 neon-box" style={{ ["--glow" as string]: "#ff4d6d" }}>
            <div className="text-3xl w-10 text-center">{GLYPH.race}</div>
            <div className="min-w-0 flex-1">
              <div className="font-pixel text-[11px] text-red neon-soft">7. 1V1 RACE</div>
              <div className="text-[18px] text-ink/80 leading-tight">Race a friend with a room code</div>
            </div>
            <div className="text-right font-pixel text-[8px] text-dim">
              WINS
              <div className="text-[10px] text-ink mt-1">{prog?.raceWins ?? 0}</div>
            </div>
          </Panel>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NeonButton href="/query-arcade/scores" color="#ffe14d">
          🏆 Scores
        </NeonButton>
        <NeonButton href="/query-arcade/profile" color="#39ff88">
          👾 Player
        </NeonButton>
      </div>
      <p className="text-center text-[16px] text-dim">All data is synthetic and made up. No real company data, ever.</p>
    </div>
  );
}
