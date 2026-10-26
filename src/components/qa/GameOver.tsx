"use client";

import { useEffect, useRef, useState } from "react";
import { submitRun, type RunTicket } from "@/lib/client/api";
import { shareCard } from "@/lib/client/shareCard";
import { sfx } from "@/lib/client/sound";
import { addLocalScore, BADGES, cleanName, getPlayer, levelOf, recordRun, setPlayerName } from "@/lib/client/storage";
import { MODES } from "@/lib/game/modes";
import type { GameState } from "@/lib/game/reducer";
import type { PreparedRun } from "@/lib/game/run";
import type { GameEvent, ModeId } from "@/lib/game/types";
import { NeonButton, Panel } from "./ui";

type Rec = ReturnType<typeof recordRun>;

export function GameOver({ mode, run, state, ticket, events, onAgain, log }: { mode: ModeId; run: PreparedRun; state: GameState; ticket: RunTicket; events: GameEvent[]; onAgain: () => void; log: string[] }) {
  const cfg = MODES[mode];
  const [rec, setRec] = useState<Rec | null>(null);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "sending" | "ok" | "local" | "error"; text?: string; rank?: number; streak?: number }>({ kind: "idle" });
  const [shown, setShown] = useState(0);
  const [shareMsg, setShareMsg] = useState("");
  const done = useRef(false);

  const submit = async (n: string) => {
    const clean = cleanName(n);
    if (clean.length < 2) {
      setStatus({ kind: "error", text: "Enter at least 2 letters." });
      return;
    }
    setPlayerName(clean);
    addLocalScore({ name: clean, mode, score: state.score, timeMs: state.lastT, day: run.day, streak: rec?.streak ?? 0 });
    if (!ticket.online || !ticket.token) {
      setStatus({ kind: "local", text: "Saved to this device's high score table. The global board isn't connected." });
      return;
    }
    setStatus({ kind: "sending" });
    const r = await submitRun(ticket.token, events, clean, getPlayer().id);
    if (r.error) setStatus({ kind: "error", text: r.error });
    else {
      setStatus({ kind: "ok", rank: r.rank, streak: r.streak });
      if (r.rank && r.rank <= 3) sfx("win");
    }
  };

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const r = recordRun({ mode, score: state.score, correct: state.correct, rounds: run.rounds.length, hints: state.hintsUsed, maxCombo: state.maxCombo, firstTries: state.firstTries, skipped: state.skipped });
    setRec(r);
    const p = getPlayer();
    setName(p.name);
    if (p.name && state.score > 0) void submit(p.name);
    else if (state.score === 0) setStatus({ kind: "local", text: "No score this time. Have another go!" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // score count-up
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - start) / 900);
      setShown(Math.round(state.score * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [state.score]);

  const title =
    state.overReason === "lives" ? "GAME OVER" : state.overReason === "time" ? "TIME UP" : state.overReason === "quit" ? "RUN ENDED" : mode === "detective" ? (state.correct === run.rounds.length ? "CASE CLOSED" : "CASE COLD") : "STAGE CLEAR";
  const lvl = levelOf(rec?.progress.xp ?? 0);
  const share = async () => {
    setShareMsg("");
    const res = await shareCard({
      mode: cfg.name,
      color: cfg.color,
      score: state.score,
      correct: state.correct,
      rank: status.kind === "ok" ? status.rank : null,
      level: lvl.name,
      levelColor: lvl.color,
      streak: status.streak ?? rec?.streak ?? 1,
      dataset: run.ds.theme.name,
      day: run.day,
      name: getPlayer().name,
      url: `${location.host}/query-arcade`,
    }).catch(() => "cancelled" as const);
    if (res === "downloaded") setShareMsg("Score card saved as an image.");
  };

  return (
    <div className="space-y-4 text-center">
      <div className="pt-2 font-pixel text-[26px] neon" style={{ color: state.overReason === "lives" ? "#ff4d6d" : cfg.color }}>
        {title}
      </div>
      <div className="font-pixel text-[9px] text-dim">{cfg.name.toUpperCase()} · {run.ds.theme.name.toUpperCase()}</div>
      <div className="font-pixel text-[48px] text-yellow neon tabular-nums">{String(shown).padStart(5, "0")}</div>

      <div className="grid grid-cols-4 gap-2">
        {[
          ["CORRECT", state.correct],
          ["BEST COMBO", state.maxCombo],
          ["1ST TRY", state.firstTries],
          ["HINTS", state.hintsUsed],
        ].map(([k, v]) => (
          <Panel key={k} className="px-1 py-2">
            <div className="font-pixel text-[7px] text-dim">{k}</div>
            <div className="mt-1 font-pixel text-[14px] text-ink">{v}</div>
          </Panel>
        ))}
      </div>

      {mode === "detective" && run.story && (
        <Panel color="#ff8a3d" className="px-3 py-2 text-left">
          <div className="font-pixel text-[9px] text-orange">{run.story.title.toUpperCase()}</div>
          <ul className="mt-1 text-[17px] text-green">
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
          {state.correct === run.rounds.length && <p className="mt-2 text-[18px] text-ink/90">{run.story.outro}</p>}
        </Panel>
      )}

      {rec && (
        <Panel color={lvl.color} className="px-3 py-3 text-left">
          <div className="flex items-center justify-between font-pixel text-[9px]">
            <span style={{ color: lvl.color }}>{lvl.name.toUpperCase()}</span>
            <span className="text-green">+{rec.gained} XP</span>
          </div>
          <div className="mt-2 h-2 bg-line">
            <div className="h-2" style={{ width: `${Math.round(lvl.pct * 100)}%`, background: lvl.color }} />
          </div>
          <div className="mt-1 flex justify-between text-[16px] text-dim">
            <span>{rec.progress.xp} XP</span>
            <span>{lvl.next ? `${lvl.next.min - rec.progress.xp} to ${lvl.next.name}` : "Max level"}</span>
          </div>
          {rec.levelUp && <div className="mt-2 font-pixel text-[10px] text-yellow blink">LEVEL UP: {rec.levelUp.toUpperCase()}!</div>}
          {rec.newBest && state.score > 0 && <div className="mt-2 font-pixel text-[9px] text-pink">NEW PERSONAL BEST</div>}
          <div className="mt-2 text-[17px] text-orange">🔥 {status.streak ?? rec.streak} day streak</div>
          {rec.earned.length > 0 && (
            <div className="mt-3 border-t border-line pt-2">
              <div className="font-pixel text-[8px] text-yellow">BADGES UNLOCKED</div>
              <div className="mt-1 flex flex-wrap gap-2">
                {rec.earned.map((id) => {
                  const b = BADGES.find((x) => x.id === id)!;
                  return (
                    <span key={id} className="border border-yellow/60 px-2 py-1 text-[17px]">
                      {b.icon} {b.name}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </Panel>
      )}

      <Panel color="#ffe14d" className="px-3 py-3">
        {status.kind === "ok" ? (
          <div>
            <div className="font-pixel text-[9px] text-dim">TODAY&apos;S GLOBAL RANK</div>
            <div className="mt-1 font-pixel text-[28px] text-yellow neon">#{status.rank}</div>
            <div className="text-[16px] text-dim">Score verified by the server.</div>
          </div>
        ) : status.kind === "sending" ? (
          <div className="font-pixel text-[10px] text-cyan blink">VERIFYING SCORE…</div>
        ) : status.kind === "local" ? (
          <div className="text-[18px] text-ink/85">{status.text}</div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit(name);
            }}
            className="space-y-2"
          >
            <label className="block font-pixel text-[9px] text-yellow" htmlFor="qa-name">
              ENTER YOUR NAME
            </label>
            <input
              id="qa-name"
              value={name}
              onChange={(e) => setName(cleanName(e.target.value))}
              maxLength={12}
              autoComplete="nickname"
              className="w-full border-2 border-yellow bg-black/60 px-3 py-2 text-center font-pixel text-[16px] uppercase tracking-widest text-yellow outline-none"
              placeholder="AAA"
            />
            {status.kind === "error" && <div className="text-[17px] text-red">{status.text}</div>}
            <NeonButton type="submit" color="#ffe14d" solid>
              Save score
            </NeonButton>
          </form>
        )}
      </Panel>

      <div className="grid grid-cols-2 gap-3">
        <NeonButton color={cfg.color} solid onClick={onAgain}>
          ↻ Play again
        </NeonButton>
        <NeonButton color="#22f3ff" onClick={share}>
          📤 Share card
        </NeonButton>
        <NeonButton href={`/query-arcade/scores?mode=${mode}`} color="#ffe14d">
          🏆 Scores
        </NeonButton>
        <NeonButton href="/query-arcade" color="#8f89b8">
          ◀ Menu
        </NeonButton>
      </div>
      {shareMsg && <div className="text-[17px] text-dim">{shareMsg}</div>}
    </div>
  );
}
