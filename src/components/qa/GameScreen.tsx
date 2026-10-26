"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { startRun, type RunTicket } from "@/lib/client/api";
import { sfx, unlockAudio } from "@/lib/client/sound";
import { loadSql } from "@/lib/client/sql";
import { buildDataset, istDay } from "@/lib/dataset";
import type { QueryResult } from "@/lib/engine";
import { gradeAnswer } from "@/lib/game/grade";
import { MODES } from "@/lib/game/modes";
import { applyEvent, comboMult, deadline, initState, type GameState } from "@/lib/game/reducer";
import { prepareRun, type PreparedRun } from "@/lib/game/run";
import type { AnswerValue, GameEvent, ModeId, SqlRound } from "@/lib/game/types";
import { GameOver } from "./GameOver";
import { ChoiceView, OrderView, PyFillView, PyOrderView, RoundHeader, SqlView, TableSheet, type RoundProps } from "./RoundViews";
import { cx, DataTable, Hearts, NeonButton, Panel } from "./ui";

type Phase = "intro" | "loading" | "countdown" | "play" | "over";

interface Pop {
  id: number;
  text: string;
  color: string;
}

export function GameScreen({ mode }: { mode: ModeId }) {
  const cfg = MODES[mode];
  const [phase, setPhase] = useState<Phase>("intro");
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(3);
  const [run, setRun] = useState<PreparedRun | null>(null);
  const [ticket, setTicket] = useState<RunTicket | null>(null);
  const [state, setState] = useState<GameState>(() => initState(cfg));
  const [now, setNow] = useState(0);
  const [lastResult, setLastResult] = useState<QueryResult | null>(null);
  const [pops, setPops] = useState<Pop[]>([]);
  const [shaking, setShaking] = useState(false);
  const [flash, setFlash] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [reveal, setReveal] = useState<{ round: number; chosen: number } | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [lastExplain, setLastExplain] = useState<{ title: string; text: string; ok: boolean } | null>(null);
  const events = useRef<GameEvent[]>([]);
  const t0 = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const today = useMemo(() => buildDataset(istDay()), []);

  const begin = useCallback(async () => {
    unlockAudio();
    sfx("coin");
    setPhase("loading");
    setError(null);
    try {
      const [SQL, tk] = await Promise.all([loadSql(), startRun(mode)]);
      const r = prepareRun(SQL, mode, tk.day, tk.seed);
      events.current = [];
      setTicket(tk);
      setRun(r);
      setState(initState(cfg));
      setLog([]);
      setLastExplain(null);
      setLastResult(null);
      setCount(3);
      setPhase("countdown");
    } catch (e) {
      console.error(e);
      setError("Couldn't load the SQL engine. Check your connection and try again.");
      setPhase("intro");
    }
  }, [mode, cfg]);

  // 3-2-1 countdown
  useEffect(() => {
    if (phase !== "countdown") return;
    sfx("tick");
    if (count === 0) {
      sfx("start");
      t0.current = performance.now();
      setNow(0);
      setPhase("play");
      return;
    }
    const id = setTimeout(() => setCount((c) => c - 1), 650);
    return () => clearTimeout(id);
  }, [phase, count]);

  // game clock
  useEffect(() => {
    if (phase !== "play") return;
    let lastBeep = -1;
    const id = setInterval(() => {
      const t = performance.now() - t0.current;
      setNow(t);
      const s = stateRef.current;
      const left = deadline(cfg, s) - t;
      const sec = Math.ceil(left / 1000);
      if (left <= 10_000 && left > 0 && sec !== lastBeep) {
        lastBeep = sec;
        sfx("tick");
      }
      if (left <= 0 && !s.over) {
        setState({ ...s, over: true, overReason: "time" });
      }
    }, 100);
    return () => clearInterval(id);
  }, [phase, cfg]);

  useEffect(() => {
    if (phase === "play" && state.over) {
      sfx(state.overReason === "done" ? "win" : "over");
      const id = setTimeout(() => setPhase("over"), 900);
      return () => clearTimeout(id);
    }
  }, [phase, state.over, state.overReason]);

  const pop = (text: string, color: string) => {
    const id = Math.random();
    setPops((p) => [...p, { id, text, color }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 950);
  };

  const dispatch = (ev: GameEvent) => {
    if (!run || phase !== "play" || reveal) return;
    const prev = stateRef.current;
    if (prev.over) return;
    let result: QueryResult | null = null;
    const next = applyEvent(cfg, run.rounds, prev, ev, (round, e) => {
      const v = gradeAnswer(run.engine, round, e.v);
      result = v.result ?? null;
      return v;
    });
    events.current.push(ev);
    setState(next);
    setLastResult(result);
    const round = run.rounds[prev.i];
    const fb = next.feedback;
    if (ev.k === "h") {
      sfx("hint");
      return;
    }
    if (ev.k === "s") {
      sfx("bad");
      if (round.kind === "sql" && round.reveal) {
        const ans = round.expected.rows[0]?.[0];
        setLog((l) => [...l, "🔎 " + round.reveal!.replace("{answer}", String(ans)) + " (revealed)"]);
      }
      if (round.explain) setLastExplain({ title: round.title, text: round.explain, ok: false });
      return;
    }
    if (!fb) return;
    if (fb.error) {
      sfx("tick");
      return;
    }
    if (fb.ok) {
      sfx(fb.mult && fb.mult > 1 ? "combo" : "ok");
      setFlash((f) => f + 1);
      pop(`+${fb.points}${fb.mult && fb.mult > 1 ? ` x${fb.mult}` : ""}`, "#39ff88");
      if (fb.bonusMs) setTimeout(() => pop(`+${fb.bonusMs! / 1000}s`, "#22f3ff"), 220);
      if (round.kind === "sql" && round.reveal) {
        const ans = round.expected.rows[0]?.[0];
        setLog((l) => [...l, "✅ " + round.reveal!.replace("{answer}", String(ans))]);
      }
      if (round.explain && mode !== "blitz") setLastExplain({ title: round.title, text: round.explain, ok: true });
    } else {
      sfx("bad");
      setShaking(true);
      setTimeout(() => setShaking(false), 360);
      if (cfg.lives) pop("-1 ♥", "#ff4d6d");
      else if (cfg.wrongPenalty) pop(`-${cfg.wrongPenalty}`, "#ff4d6d");
      if (round.kind === "choice" && round.explain) setLastExplain({ title: round.title, text: round.explain, ok: false });
    }
    if (round.kind === "choice" && typeof ev.v === "number") {
      setReveal({ round: prev.i, chosen: ev.v });
      setTimeout(() => setReveal(null), 1100);
    }
  };

  // Test hook for automated browser tests. Only exists in `next dev`.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !run) return;
    (window as unknown as Record<string, unknown>).__qa = { run, state: stateRef, grade: (i: number, v: AnswerValue) => gradeAnswer(run.engine, run.rounds[i], v) };
  }, [run]);

  const t = () => Math.round(performance.now() - t0.current);
  const answer = (v: AnswerValue) => dispatch({ k: "a", r: stateRef.current.i, v, t: t() });
  const skip = () => dispatch({ k: "s", r: stateRef.current.i, t: t() });
  const hint = (h: number) => dispatch({ k: "h", r: stateRef.current.i, h, t: t() });

  // ---------------------------------------------------------------- screens

  if (phase === "intro" || phase === "loading") {
    return (
      <div className="space-y-5">
        <div className="text-center">
          <div className="font-pixel text-[9px] text-dim">MODE</div>
          <h1 className="mt-2 font-pixel text-[22px] neon" style={{ color: cfg.color }}>
            {cfg.name.toUpperCase()}
          </h1>
          <p className="mt-3 text-[20px] text-ink/85">{cfg.blurb}</p>
        </div>
        <Panel color={cfg.color} className="px-4 py-3">
          <ul className="space-y-1.5 text-[19px]">
            {cfg.rules.map((r) => (
              <li key={r}>
                <span style={{ color: cfg.color }}>▸</span> {r}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel className="px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-2xl">{today.theme.icon}</span>
            <div>
              <div className="font-pixel text-[9px] text-cyan">TODAY&apos;S DATASET</div>
              <div className="text-[19px]">{today.theme.name}</div>
            </div>
          </div>
          <div className="space-y-3">
            {today.tables.map((tb) => (
              <DataTable key={tb.name} title={tb.name} columns={tb.columns.map((c) => c.name)} rows={tb.rows.slice(0, 3)} compact />
            ))}
            <div className="text-[16px] text-dim">Showing 3 rows of each. Tap 📋 during the game to see everything.</div>
          </div>
        </Panel>
        {error && <div className="border border-red px-3 py-2 text-red">{error}</div>}
        <div className="flex flex-col items-center gap-3">
          <NeonButton color={cfg.color} size="lg" solid onClick={begin} disabled={phase === "loading"}>
            {phase === "loading" ? "Loading…" : "Press start"}
          </NeonButton>
          <NeonButton href="/query-arcade" color="#8f89b8" size="sm">
            ◀ Back to menu
          </NeonButton>
        </div>
      </div>
    );
  }

  if (!run) return null;

  if (phase === "countdown") {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-6">
        <div className="font-pixel text-[11px] text-dim">{cfg.name.toUpperCase()}</div>
        <div key={count} className="font-pixel text-[72px] neon" style={{ color: cfg.color }}>
          {count === 0 ? "GO!" : count}
        </div>
        {run.story && <div className="max-w-sm text-center text-[19px] text-ink/80">{run.story.title}</div>}
      </div>
    );
  }

  if (phase === "over") {
    return <GameOver mode={mode} run={run} state={state} ticket={ticket!} events={events.current} onAgain={begin} log={log} />;
  }

  // phase === "play"
  const left = Math.max(0, deadline(cfg, state) - now);
  const pct = Math.min(100, (left / cfg.timeLimitMs) * 100);
  // While a multiple-choice answer is being revealed, keep showing that round.
  const i = reveal ? reveal.round : Math.min(state.i, run.rounds.length - 1);
  const round = run.rounds[i];
  const props: RoundProps<typeof round> = {
    round,
    index: i,
    cfg,
    tables: run.engine.tables,
    usedHints: state.roundHints,
    feedback: state.feedback,
    lastResult,
    disabled: state.over || !!reveal,
    onAnswer: answer,
    onSkip: skip,
    onHint: hint,
    onShowTables: () => setSheet(true),
  };
  const mult = comboMult(state.combo);
  const total = mode === "blitz" ? null : run.rounds.length;

  return (
    <div className="space-y-3">
      {/* HUD */}
      <div className="sticky top-[46px] z-30 -mx-4 border-b border-line bg-bg/90 px-4 pb-2 pt-1 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2 font-pixel text-[10px]">
          <div>
            <span className="text-dim">SCORE </span>
            <span className="text-yellow neon-soft tabular-nums">{String(state.score).padStart(5, "0")}</span>
          </div>
          <div className={cx("tabular-nums", left < 10_000 ? "text-red blink" : "text-cyan")}>{(left / 1000).toFixed(left < 10_000 ? 1 : 0)}s</div>
          <div className="flex items-center gap-2">
            {mult > 1 && <span className="text-pink neon-soft">x{mult}</span>}
            {cfg.lives ? <Hearts n={state.lives} max={cfg.lives} /> : <span className="text-green">✓{state.correct}</span>}
          </div>
        </div>
        <div className="mt-1.5 h-1.5 bg-line">
          <div className="h-1.5 transition-[width] duration-100" style={{ width: `${pct}%`, background: left < 10_000 ? "#ff4d6d" : cfg.color }} />
        </div>
        {state.combo >= 2 && <div className="mt-1 text-center font-pixel text-[8px] text-pink">COMBO {state.combo} 🔥</div>}
      </div>

      {run.story && (
        <Panel color="#ff8a3d" className="px-3 py-2">
          <div className="font-pixel text-[9px] text-orange">CASE FILE: {run.story.title.toUpperCase()}</div>
          <p className="mt-1 text-[18px] text-ink/85">{run.story.intro}</p>
          {log.length > 0 && (
            <ul className="mt-2 space-y-0.5 border-t border-line pt-2 text-[17px] text-green">
              {log.map((l, k) => (
                <li key={k}>{l}</li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      <div className={cx("relative space-y-3", shaking && "shake")}>
        <div key={`f${flash}`} className={cx("space-y-3 p-0.5", flash > 0 && "flash-ok")}>
          {round.clue && <div className="border-l-4 border-orange pl-3 text-[19px] italic text-orange">🔍 {round.clue}</div>}
          <RoundHeader round={round} index={i} total={total} color={cfg.color} />
          {round.kind === "sql" && <SqlView {...(props as RoundProps<SqlRound>)} />}
          {round.kind === "choice" && <ChoiceView {...(props as RoundProps<typeof round>)} reveal={reveal && reveal.round === i ? reveal.chosen : null} />}
          {round.kind === "order" && <OrderView {...(props as RoundProps<typeof round>)} />}
          {round.kind === "pyorder" && <PyOrderView {...(props as RoundProps<typeof round>)} />}
          {round.kind === "pyfill" && <PyFillView {...(props as RoundProps<typeof round>)} />}
        </div>
        {pops.map((p) => (
          <div key={p.id} className="pop pointer-events-none absolute left-1/2 top-8 z-40 font-pixel text-[20px] neon" style={{ color: p.color }}>
            {p.text}
          </div>
        ))}
      </div>

      {lastExplain && (
        <div className={cx("border px-3 py-2 text-[17px]", lastExplain.ok ? "border-green/50" : "border-red/50")}>
          <div className={cx("font-pixel text-[8px]", lastExplain.ok ? "text-green" : "text-red")}>{lastExplain.ok ? "✓ LAST ROUND" : "✗ LAST ROUND"}: {lastExplain.title.toUpperCase()}</div>
          <p className="mt-1 whitespace-pre-wrap text-ink/80">{lastExplain.text}</p>
        </div>
      )}

      <div className="pt-2 text-center">
        <button
          type="button"
          className="font-pixel text-[8px] text-dim underline"
          onClick={() => {
            if (confirm("End this run now? Your score so far will count.")) setState({ ...stateRef.current, over: true, overReason: "quit" });
          }}
        >
          END RUN
        </button>
      </div>

      {sheet && <TableSheet tables={run.engine.tables} onClose={() => setSheet(false)} />}
    </div>
  );
}
