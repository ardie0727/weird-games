"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sfx, unlockAudio } from "@/lib/client/sound";
import { loadSql } from "@/lib/client/sql";
import { cleanName, getPlayer, recordRun, setPlayerName } from "@/lib/client/storage";
import { istDay } from "@/lib/dataset";
import { compareResults, SqlError, type QueryResult } from "@/lib/engine";
import { RACE_ROUNDS, type RaceState, type RaceWin } from "@/lib/game/race";
import { prepareRun, type PreparedRun } from "@/lib/game/run";
import type { SqlRound } from "@/lib/game/types";
import { SqlEditor } from "./SqlEditor";
import { TableSheet } from "./RoundViews";
import { cx, DataTable, NeonButton, Panel } from "./ui";

type Mode = "online" | "cpu";

async function api(body: Record<string, unknown>) {
  const res = await fetch("/api/qa/race", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as { online: boolean; state?: RaceState; ok?: boolean; won?: boolean; reason?: string; stale?: boolean };
}

export function Race() {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [room, setRoom] = useState<RaceState | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setName(getPlayer().name);
    const r = new URLSearchParams(location.search).get("room");
    if (r) setCode(r.toUpperCase().slice(0, 5));
  }, []);

  const needName = () => {
    const n = cleanName(name);
    if (n.length < 2) {
      setErr("Enter your name first (2 to 12 letters or digits).");
      return null;
    }
    setPlayerName(n);
    return n;
  };

  const create = async () => {
    const n = needName();
    if (!n) return;
    unlockAudio();
    setBusy(true);
    setErr("");
    try {
      const r = await api({ action: "create", playerId: getPlayer().id, name: n });
      if (!r.online) {
        setOffline(true);
        return;
      }
      setRoom(r.state!);
      setMode("online");
      history.replaceState(null, "", `?room=${r.state!.code}`);
      sfx("coin");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't create a room.");
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    const n = needName();
    if (!n) return;
    unlockAudio();
    setBusy(true);
    setErr("");
    try {
      const r = await api({ action: "join", code: code.trim().toUpperCase(), playerId: getPlayer().id, name: n });
      if (!r.online) {
        setOffline(true);
        return;
      }
      setRoom(r.state!);
      setMode("online");
      sfx("coin");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't join.");
    } finally {
      setBusy(false);
    }
  };

  const cpu = () => {
    const n = needName() ?? "YOU";
    unlockAudio();
    sfx("coin");
    setRoom({ code: "CPU", seed: Math.floor(Math.random() * 2 ** 31), day: istDay(), host: n, guest: "CPU", startedAt: Date.now() + 3500, serverNow: Date.now(), wins: [], you: "host" });
    setMode("cpu");
  };

  if (room && mode) return <RaceGame initial={room} mode={mode} onExit={() => (setRoom(null), setMode(null), history.replaceState(null, "", location.pathname))} />;

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h1 className="font-pixel text-[20px] text-red neon">1V1 RACE</h1>
        <p className="mt-3 text-[20px] text-ink/85">Same question, same data. The first correct answer takes the round. Best of {RACE_ROUNDS}.</p>
      </div>
      <Panel className="space-y-2 px-3 py-3">
        <label htmlFor="race-name" className="font-pixel text-[9px] text-yellow">
          YOUR NAME
        </label>
        <input
          id="race-name"
          value={name}
          onChange={(e) => setName(cleanName(e.target.value))}
          maxLength={12}
          placeholder="AAA"
          className="w-full border-2 border-yellow bg-black/60 px-3 py-2 font-pixel text-[14px] uppercase text-yellow outline-none"
        />
      </Panel>
      <Panel color="#ff4d6d" className="space-y-3 px-3 py-4">
        <div className="font-pixel text-[10px] text-red">CHALLENGE A FRIEND</div>
        <NeonButton color="#ff4d6d" solid onClick={create} disabled={busy} className="w-full">
          Create private room
        </NeonButton>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
            placeholder="CODE"
            aria-label="Room code"
            className="min-w-0 flex-1 border-2 border-cyan bg-black/60 px-3 py-2 text-center font-pixel text-[16px] tracking-[0.3em] text-cyan outline-none"
          />
          <NeonButton color="#22f3ff" onClick={join} disabled={busy || code.length < 5}>
            Join
          </NeonButton>
        </div>
      </Panel>
      {offline && (
        <div className="border border-yellow/60 px-3 py-2 text-[18px] text-yellow">
          Online rooms need the global database, which isn&apos;t connected yet. You can race the CPU meanwhile.
        </div>
      )}
      <Panel className="space-y-2 px-3 py-4">
        <div className="font-pixel text-[10px] text-cyan">NO FRIEND ONLINE?</div>
        <p className="text-[18px] text-dim">Race the arcade CPU. It answers each question in 10 to 25 seconds.</p>
        <NeonButton color="#22f3ff" onClick={cpu} className="w-full">
          Race the CPU
        </NeonButton>
      </Panel>
      {err && <div className="border border-red px-3 py-2 text-red">{err}</div>}
      <div className="flex justify-center">
        <NeonButton href="/query-arcade" color="#8f89b8" size="sm">
          ◀ Menu
        </NeonButton>
      </div>
    </div>
  );
}

function RaceGame({ initial, mode, onExit }: { initial: RaceState; mode: Mode; onExit: () => void }) {
  const [room, setRoom] = useState(initial);
  const [run, setRun] = useState<PreparedRun | null>(null);
  const [now, setNow] = useState(Date.now());
  const [sql, setSql] = useState("");
  const [msg, setMsg] = useState<{ text: string; tone: "ok" | "bad" | "warn" } | null>(null);
  const [mine, setMine] = useState<QueryResult | null>(null);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const offset = useRef(initial.serverNow - Date.now());
  const recorded = useRef(false);
  const prevRound = useRef(0);
  const me = room.you ?? "host";
  const them = me === "host" ? "guest" : "host";

  useEffect(() => {
    loadSql().then((SQL) => setRun(prepareRun(SQL, "blitz", room.day, room.seed)));
  }, [room.day, room.seed]);

  // Poll the room (online) every second.
  const poll = useCallback(async () => {
    if (mode !== "online") return;
    try {
      const res = await fetch(`/api/qa/race?code=${room.code}&playerId=${getPlayer().id}`, { cache: "no-store" });
      const json = await res.json();
      if (json.state) {
        offset.current = json.state.serverNow - Date.now();
        setRoom(json.state);
      }
    } catch {
      /* keep trying */
    }
  }, [mode, room.code]);
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
    }, 200);
    const p = mode === "online" ? setInterval(poll, 1000) : null;
    return () => {
      clearInterval(id);
      if (p) clearInterval(p);
    };
  }, [poll, mode]);

  const serverNow = now + offset.current;
  const started = room.startedAt !== null && serverNow >= room.startedAt;
  const round = room.wins.length;
  const finished = round >= RACE_ROUNDS;
  const q = run && !finished ? (run.rounds[round] as SqlRound) : null;

  // CPU opponent: solves each round after 10 to 25 seconds.
  useEffect(() => {
    if (mode !== "cpu" || !started || finished) return;
    const delay = 10_000 + Math.random() * 15_000;
    const r = round;
    const id = setTimeout(() => {
      setRoom((s) => (s.wins.length === r ? { ...s, wins: [...s.wins, { r, slot: "guest", t: Date.now() - (s.startedAt ?? 0) }] } : s));
    }, delay);
    return () => clearTimeout(id);
  }, [mode, started, finished, round]);

  // New round: reset the editor and announce who took the last one.
  useEffect(() => {
    if (!q) return;
    setSql(q.starter);
    setMine(null);
    if (round > prevRound.current) {
      const last = room.wins[round - 1];
      if (last.slot === me) setMsg({ text: `You took round ${round}!`, tone: "ok" });
      else {
        setMsg({ text: `${them === "host" ? room.host : room.guest ?? "Opponent"} took round ${round}.`, tone: "bad" });
        sfx("bad");
      }
    }
    prevRound.current = round;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, q]);

  const myWins = room.wins.filter((w: RaceWin) => w.slot === me).length;
  const theirWins = round - myWins;

  useEffect(() => {
    if (!finished || recorded.current) return;
    recorded.current = true;
    const won = myWins > theirWins;
    sfx(won ? "win" : "over");
    recordRun({ mode: "race", score: myWins * 500, correct: myWins, rounds: RACE_ROUNDS, hints: 0, maxCombo: 0, firstTries: 0, skipped: 0, won });
  }, [finished, myWins, theirWins]);

  const submit = async () => {
    if (!q || !run || busy) return;
    let result: QueryResult;
    try {
      result = run.engine.run(sql);
    } catch (e) {
      setMsg({ text: e instanceof SqlError ? e.message : "Query failed.", tone: "warn" });
      return;
    }
    const v = compareResults(q.expected, result, q.ordered);
    setMine(v.ok ? null : result);
    if (!v.ok) {
      sfx("bad");
      setMsg({ text: v.reason, tone: "bad" });
      return;
    }
    if (mode === "cpu") {
      sfx("ok");
      setRoom((s) => (s.wins.length === round ? { ...s, wins: [...s.wins, { r: round, slot: "host", t: Date.now() - (s.startedAt ?? 0) }] } : s));
      return;
    }
    setBusy(true);
    try {
      const r = await api({ action: "answer", code: room.code, playerId: getPlayer().id, round, sql });
      if (r.state) setRoom(r.state);
      if (r.won) sfx("ok");
      else if (r.ok) setMsg({ text: "Correct, but your opponent was faster!", tone: "bad" });
      else if (!r.stale) setMsg({ text: r.reason ?? "Not quite.", tone: "bad" });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Network error.", tone: "warn" });
    } finally {
      setBusy(false);
    }
  };

  const shareLink = typeof location !== "undefined" ? `${location.origin}/query-arcade/race?room=${room.code}` : "";
  const oppName = me === "host" ? room.guest : room.host;

  const scoreBar = (
    <div className="flex items-center justify-between gap-2 font-pixel text-[10px]">
      <span className="truncate text-cyan">{(me === "host" ? room.host : room.guest) ?? "YOU"}</span>
      <span className="text-[16px] text-yellow neon-soft tabular-nums">
        {myWins} - {theirWins}
      </span>
      <span className="truncate text-right text-red">{oppName ?? "???"}</span>
    </div>
  );

  if (!room.startedAt) {
    return (
      <div className="space-y-5 text-center">
        <div className="font-pixel text-[10px] text-dim">ROOM CODE</div>
        <div className="font-pixel text-[40px] tracking-[0.2em] text-yellow neon">{room.code}</div>
        <p className="text-[20px]">Send this code or link to a friend. The race starts as soon as they join.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <NeonButton
            color="#22f3ff"
            onClick={() => {
              const nav = navigator as Navigator;
              if (nav.share) void nav.share({ title: "Query Arcade race", text: `Race me at SQL! Room ${room.code}`, url: shareLink }).catch(() => {});
              else void nav.clipboard?.writeText(shareLink);
            }}
          >
            📤 Share link
          </NeonButton>
          <NeonButton color="#8f89b8" onClick={onExit}>
            Cancel
          </NeonButton>
        </div>
        <div className="font-pixel text-[9px] text-dim blink">WAITING FOR PLAYER 2…</div>
      </div>
    );
  }

  if (!started) {
    const s = Math.max(0, Math.ceil((room.startedAt - serverNow) / 1000));
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-6">
        {scoreBar}
        <div className="font-pixel text-[11px] text-dim">GET READY</div>
        <div className="font-pixel text-[72px] text-red neon">{s || "GO!"}</div>
      </div>
    );
  }

  if (finished) {
    const won = myWins > theirWins;
    return (
      <div className="space-y-5 text-center">
        <div className={cx("pt-4 font-pixel text-[28px] neon", won ? "text-green" : "text-red")}>{won ? "YOU WIN!" : "YOU LOSE"}</div>
        <Panel className="px-4 py-4">{scoreBar}</Panel>
        <div className="grid grid-cols-2 gap-3">
          <NeonButton color="#ff4d6d" solid onClick={onExit}>
            ↻ New race
          </NeonButton>
          <NeonButton href="/query-arcade" color="#8f89b8">
            ◀ Menu
          </NeonButton>
        </div>
      </div>
    );
  }

  if (!q || !run) return <div className="py-10 text-center font-pixel text-[10px] text-dim blink">LOADING…</div>;

  return (
    <div className="space-y-3">
      <div className="sticky top-[46px] z-30 -mx-4 border-b border-line bg-bg/90 px-4 py-2 backdrop-blur-sm">
        {scoreBar}
        <div className="mt-1 flex justify-center gap-1">
          {Array.from({ length: RACE_ROUNDS }, (_, i) => {
            const w = room.wins[i];
            return <span key={i} className={cx("h-2 w-8", !w ? (i === round ? "bg-yellow blink" : "bg-line") : w.slot === me ? "bg-cyan" : "bg-red")} />;
          })}
        </div>
      </div>
      <div className="font-pixel text-[9px] text-red">
        ROUND {round + 1}/{RACE_ROUNDS} <span className="text-dim">· {mode === "cpu" ? "VS CPU" : `ROOM ${room.code}`}</span>
      </div>
      <p className="text-[22px] leading-tight">{q.prompt}</p>
      <SqlEditor value={sql} onChange={setSql} onRun={submit} tables={run.engine.tables} />
      {msg && <div className={cx("border px-3 py-2 text-[18px]", msg.tone === "ok" ? "border-green text-green" : msg.tone === "bad" ? "border-red/70 text-red" : "border-yellow/70 text-yellow")}>{msg.text}</div>}
      {mine && <DataTable title="YOUR RESULT" columns={mine.columns} rows={mine.rows} compact max={8} highlight="#ff4d6d" />}
      <div className="flex items-center gap-2">
        <NeonButton color="#22f3ff" size="sm" onClick={() => setSheet(true)}>
          📋 Tables
        </NeonButton>
        <div className="flex-1" />
        <NeonButton color="#39ff88" solid onClick={submit} disabled={busy}>
          Run ▶
        </NeonButton>
      </div>
      {sheet && <TableSheet tables={run.engine.tables} onClose={() => setSheet(false)} />}
    </div>
  );
}
