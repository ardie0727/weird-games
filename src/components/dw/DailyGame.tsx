"use client";

import { useCallback, useEffect, useState } from "react";
import { NeonButton, Panel, cx } from "@/components/qa/ui";
import { type Board, type GuessResult, type PublicFact, type Stats, fetchBoard, fetchToday, history, localStats, msToNext, remember, sendGuess, sendName } from "@/lib/client/daily";
import { sfx, unlockAudio } from "@/lib/client/sound";
import { cleanName, getPlayer, setPlayerName } from "@/lib/client/storage";

const OPT_COLORS = ["#22f3ff", "#ff2bd6"] as const;

function Countdown() {
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setMs(msToNext());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  if (ms === null) return null;
  const s = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="font-pixel text-yellow neon-soft">
      {pad(Math.floor(s / 3600))}:{pad(Math.floor((s % 3600) / 60))}:{pad(s % 60)}
    </span>
  );
}

function StatBox({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-1 border border-line bg-black/40 px-2 py-2">
      <div className="font-pixel text-[16px] neon-soft" style={{ color }}>
        {value}
      </div>
      <div className="font-pixel text-[7px] text-dim">{label}</div>
    </div>
  );
}

function shareText(fact: PublicFact, r: GuessResult, streak: number) {
  const url = typeof window !== "undefined" ? `${window.location.origin}/daily-weird` : "/daily-weird";
  return [`Daily Weird Guess #${fact.number} ${fact.emoji}`, r.correct ? "✅ Got it right" : "❌ Fooled me", streak > 0 ? `🔥 ${streak} day streak` : "🧊 Streak reset", url].join("\n");
}

export function DailyGame() {
  const [playerId, setPlayerId] = useState("");
  const [name, setName] = useState("");
  const [fact, setFact] = useState<PublicFact | null>(null);
  const [result, setResult] = useState<GuessResult | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [justPicked, setJustPicked] = useState(false);
  const [shared, setShared] = useState("");

  const load = useCallback(async () => {
    setError("");
    const p = getPlayer();
    setPlayerId(p.id);
    setName(p.name);
    try {
      const t = await fetchToday(p.id);
      setFact(t.fact);
      setOnline(t.online);
      const local = history()[t.fact.day];
      const r = t.result ?? (local ? { pick: local.pick, correct: local.correct, answer: local.answer, reveal: local.reveal } : null);
      setResult(r);
      if (t.result) remember(t.fact, t.result);
      setStats(t.online && t.stats ? t.stats : t.online ? { streak: 0, best: 0, played: 0, wins: 0 } : localStats(t.fact.day));
    } catch {
      setError("Couldn't reach the fact machine. Check your connection and try again.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function guess(pick: number) {
    if (!fact || busy || result) return;
    unlockAudio();
    setBusy(true);
    try {
      const g = await sendGuess({ day: fact.day, pick, playerId, name });
      remember(fact, g.result);
      setResult(g.result);
      setJustPicked(true);
      setStats(g.online && g.stats ? g.stats : localStats(fact.day));
      sfx(g.result.correct ? "win" : "over");
    } catch (e) {
      if ((e as { stale?: boolean }).stale) void load();
      else setError("That guess didn't go through. Try again.");
      sfx("bad");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!fact || !result) return;
    const text = shareText(fact, result, stats?.streak ?? 0);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setShared("Copied! Paste it anywhere.");
    } catch {
      /* cancelled */
    }
  }

  if (error && !fact)
    return (
      <Panel className="p-6 text-center" color="#ff4d6d">
        <div className="text-4xl">📡</div>
        <p className="mt-3 text-[20px]">{error}</p>
        <div className="mt-4">
          <NeonButton onClick={() => void load()} color="#ffe14d">
            Retry
          </NeonButton>
        </div>
      </Panel>
    );

  if (!fact)
    return (
      <div className="py-20 text-center font-pixel text-[10px] text-cyan">
        <span className="blink">LOADING TODAY&apos;S WEIRDNESS…</span>
      </div>
    );

  const split = result?.split;
  const total = split ? split[0] + split[1] : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <div className="font-pixel text-[8px] tracking-[0.3em] text-dim">FACT #{fact.number}</div>
        <h1 className="mt-2 font-pixel text-[18px] leading-snug sm:text-[22px]">
          <span className="text-cyan neon">DAILY</span> <span className="text-yellow neon">WEIRD</span> <span className="text-pink neon">GUESS</span>
        </h1>
      </div>

      <Panel className={cx("p-5", justPicked && (result?.correct ? "flash-ok" : "shake"))} color={result ? (result.correct ? "#39ff88" : "#ff4d6d") : "#22f3ff"}>
        <div className="text-center text-6xl" aria-hidden>
          {fact.emoji}
        </div>
        <p className="mt-4 text-center text-[26px] leading-tight">{fact.prompt}</p>

        <div className="mt-5 flex flex-col gap-3">
          {fact.options.map((opt, i) => {
            const isAnswer = result?.answer === i;
            const isPick = result?.pick === i;
            const color = result ? (isAnswer ? "#39ff88" : isPick ? "#ff4d6d" : "#2a2350") : OPT_COLORS[i];
            const pct = total ? Math.round(((split?.[i] ?? 0) / total) * 100) : null;
            return (
              <button
                key={i}
                type="button"
                disabled={!!result || busy}
                onClick={() => void guess(i)}
                className={cx(
                  "neon-box pixel-corners relative min-h-[64px] w-full overflow-hidden px-4 py-3 text-left transition-transform",
                  !result && "active:translate-y-[2px] active:scale-[0.98]",
                  result && !isAnswer && !isPick && "opacity-50",
                )}
                style={{ ["--glow" as string]: color, background: "rgba(5,4,11,0.7)" }}
              >
                {pct !== null && <span className="absolute inset-y-0 left-0 opacity-20" style={{ width: `${pct}%`, background: color }} aria-hidden />}
                <span className="relative flex items-center gap-3">
                  <span className="font-pixel text-[12px]" style={{ color }}>
                    {result ? (isAnswer ? "✓" : isPick ? "✗" : "·") : i === 0 ? "A" : "B"}
                  </span>
                  <span className="flex-1 text-[23px] leading-tight">{opt}</span>
                  {pct !== null && <span className="font-pixel text-[9px] text-dim">{pct}%</span>}
                </span>
              </button>
            );
          })}
        </div>

        {!result && <p className="mt-4 text-center font-pixel text-[8px] text-dim">{busy ? "CHECKING…" : "ONE GUESS. NO TAKE-BACKS."}</p>}
        {error && fact && <p className="mt-3 text-center text-[18px] text-red">{error}</p>}

        {result && (
          <div className="mt-5 border-t border-line pt-4">
            <div className={cx("font-pixel text-[13px] neon-soft", result.correct ? "text-green" : "text-red")}>{result.correct ? "CORRECT! 🎉" : "FOOLED YOU! 🙃"}</div>
            <p className="mt-2 text-[20px] text-ink/90">{result.reveal}</p>
            {total > 0 && <p className="mt-2 text-[16px] text-dim">{total === 1 ? "You're the first to guess today." : `${total} players guessed today.`}</p>}
          </div>
        )}
      </Panel>

      {stats && (
        <div className="grid grid-cols-4 gap-2">
          <StatBox label="STREAK" value={`🔥${stats.streak}`} color="#ff8a3d" />
          <StatBox label="BEST" value={stats.best} color="#ffe14d" />
          <StatBox label="PLAYED" value={stats.played} color="#22f3ff" />
          <StatBox label="WIN %" value={stats.played ? Math.round((stats.wins / stats.played) * 100) : 0} color="#39ff88" />
        </div>
      )}

      {result && (
        <Panel className="flex flex-col items-center gap-3 p-4 text-center">
          <div className="font-pixel text-[8px] text-dim">NEXT WEIRD FACT IN</div>
          <div className="text-[20px]">
            <Countdown />
          </div>
          <NeonButton onClick={() => void share()} color="#ffe14d" solid>
            📣 Share result
          </NeonButton>
          {shared && <div className="text-[16px] text-green">{shared}</div>}
        </Panel>
      )}

      {online && result && <NameForm playerId={playerId} name={name} onSaved={setName} />}
      {online ? <Leaderboard refreshKey={result ? 1 : 0} /> : <p className="text-center text-[16px] text-dim">Offline mode: your streak is saved on this device only.</p>}
    </div>
  );
}

function NameForm({ playerId, name, onSaved }: { playerId: string; name: string; onSaved: (n: string) => void }) {
  const [value, setValue] = useState(name);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(!name);
  if (!editing)
    return (
      <div className="text-center text-[17px] text-dim">
        On the board as <span className="font-pixel text-[10px] text-cyan">{name}</span>{" "}
        <button type="button" className="underline" onClick={() => setEditing(true)}>
          change
        </button>
      </div>
    );
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const n = cleanName(value);
        try {
          await sendName(playerId, n);
          setPlayerName(n);
          onSaved(n);
          setEditing(false);
          setMsg("");
        } catch (err) {
          setMsg((err as Error).message);
        }
      }}
    >
      <label className="font-pixel text-[8px] text-dim" htmlFor="dw-name">
        PUT YOUR STREAK ON THE BOARD
      </label>
      <div className="flex gap-2">
        <input
          id="dw-name"
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          maxLength={12}
          placeholder="YOUR NAME"
          autoComplete="nickname"
          className="min-w-0 flex-1 border-2 border-line bg-black/50 px-3 py-2 font-pixel text-[12px] text-ink outline-none focus:border-cyan"
          style={{ fontSize: 16 }}
        />
        <NeonButton type="submit" color="#39ff88" size="sm">
          Save
        </NeonButton>
      </div>
      {msg && <div className="text-[16px] text-red">{msg}</div>}
    </form>
  );
}

function Leaderboard({ refreshKey }: { refreshKey: number }) {
  const [tab, setTab] = useState<"live" | "best">("live");
  const [board, setBoard] = useState<Board | null>(null);
  useEffect(() => {
    fetchBoard()
      .then(setBoard)
      .catch(() => setBoard(null));
  }, [refreshKey]);
  const rows = board ? board[tab] : [];
  return (
    <Panel className="p-4" color="#b26bff">
      <div className="flex items-center justify-between gap-2">
        <div className="font-pixel text-[10px] text-purple neon-soft">STREAK BOARD</div>
        <div className="flex gap-1">
          {(["live", "best"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                sfx("click");
                setTab(t);
              }}
              className={cx("font-pixel text-[8px] px-2 py-1.5 border", tab === t ? "border-purple text-purple" : "border-line text-dim")}
            >
              {t === "live" ? "LIVE" : "ALL-TIME"}
            </button>
          ))}
        </div>
      </div>
      <ol className="mt-3 flex flex-col gap-1">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center gap-3 border-b border-line/60 py-1 text-[19px]">
            <span className={cx("w-7 font-pixel text-[9px]", i === 0 ? "text-yellow" : i === 1 ? "text-ink" : i === 2 ? "text-orange" : "text-dim")}>{i + 1}</span>
            <span className="flex-1 truncate font-pixel text-[10px]">{r.name}</span>
            <span className="font-pixel text-[11px] text-orange">🔥{tab === "live" ? r.streak : r.best}</span>
          </li>
        ))}
        {board && rows.length === 0 && <li className="py-2 text-[18px] text-dim">No streaks yet. Yours could be first.</li>}
        {!board && <li className="py-2 text-[18px] text-dim">Loading…</li>}
      </ol>
      <p className="mt-3 text-[15px] text-dim">Guess right on consecutive days to grow your streak. One wrong guess or a missed day resets it.</p>
    </Panel>
  );
}
