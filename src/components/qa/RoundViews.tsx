"use client";

import { useEffect, useState } from "react";
import type { TableData } from "@/lib/dataset";
import type { QueryResult } from "@/lib/engine";
import type { Feedback } from "@/lib/game/reducer";
import type { AnswerValue, ChoiceRound, Hint, ModeConfig, OrderRound, PyFillRound, PyOrderRound, Round, SqlRound } from "@/lib/game/types";
import { OrderList } from "./OrderList";
import { SqlEditor } from "./SqlEditor";
import { CodeBlock, cx, DataTable, NeonButton, Tag } from "./ui";

export interface RoundProps<R extends Round> {
  round: R;
  index: number;
  cfg: ModeConfig;
  tables: TableData[];
  usedHints: number[];
  feedback: Feedback | null;
  lastResult: QueryResult | null;
  disabled: boolean;
  onAnswer: (v: AnswerValue) => void;
  onSkip: () => void;
  onHint: (i: number) => void;
  onShowTables: () => void;
}

function HintMenu({ hints, used, onHint, disabled }: { hints: Hint[]; used: number[]; onHint: (i: number) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  if (!hints.length) return null;
  return (
    <div className="relative">
      <NeonButton color="#ffe14d" size="sm" onClick={() => setOpen((o) => !o)} disabled={disabled}>
        💡 Hint
      </NeonButton>
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-60 border-2 border-yellow bg-bg p-2 shadow-[0_0_20px_rgba(255,225,77,0.3)]">
          <div className="mb-1 font-pixel text-[8px] text-dim">HINTS COST POINTS AND RESET YOUR COMBO</div>
          {hints.map((h, i) => (
            <button
              key={i}
              type="button"
              disabled={used.includes(i)}
              onClick={() => {
                onHint(i);
                setOpen(false);
              }}
              className="flex w-full justify-between gap-2 border-b border-line px-1 py-2 text-left text-[18px] last:border-0 disabled:opacity-40"
            >
              <span>{h.label}</span>
              <span className="text-red">-{h.cost}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UsedHints({ hints, used }: { hints: Hint[]; used: number[] }) {
  if (!used.length) return null;
  return (
    <div className="border border-yellow/60 bg-yellow/5 px-3 py-2 text-[18px] text-yellow">
      {used.map((i) => (
        <div key={i}>
          💡 <span className="font-code text-[13px]">{hints[i].text}</span>
        </div>
      ))}
    </div>
  );
}

function VerdictLine({ fb, index }: { fb: Feedback | null; index: number }) {
  if (!fb || fb.round !== index || fb.ok) return null;
  return (
    <div className={cx("border px-3 py-2 text-[18px]", fb.error ? "border-yellow/70 text-yellow" : "border-red/70 text-red")} role="status">
      {fb.error ? "⚠ " : "✗ "}
      {fb.reason}
    </div>
  );
}

function Actions({ p, children }: { p: RoundProps<Round>; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <HintMenu hints={p.round.hints} used={p.usedHints} onHint={p.onHint} disabled={p.disabled} />
      <NeonButton color="#8f89b8" size="sm" onClick={p.onSkip} disabled={p.disabled}>
        {p.cfg.skipLabel}
      </NeonButton>
      <div className="flex-1" />
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- SQL

export function SqlView(p: RoundProps<SqlRound>) {
  const [sql, setSql] = useState(p.round.starter);
  useEffect(() => setSql(p.round.starter), [p.round]);
  const wrong = !!p.feedback && p.feedback.round === p.index && !p.feedback.ok && !p.feedback.error;
  return (
    <div className="space-y-3">
      {p.round.code && (
        <div>
          <div className="mb-1 font-pixel text-[8px] text-purple">PYSPARK</div>
          <CodeBlock text={p.round.code.text} lang={p.round.code.lang} />
        </div>
      )}
      <UsedHints hints={p.round.hints} used={p.usedHints} />
      <SqlEditor value={sql} onChange={setSql} onRun={() => p.onAnswer(sql)} tables={p.tables} disabled={p.disabled} invalid={wrong} />
      <VerdictLine fb={p.feedback} index={p.index} />
      {p.lastResult && p.feedback?.round === p.index && !p.feedback.ok && !p.feedback.error && <DataTable title="YOUR RESULT" columns={p.lastResult.columns} rows={p.lastResult.rows} compact max={8} highlight="#ff4d6d" />}
      <Actions p={p as RoundProps<Round>}>
        <NeonButton color="#22f3ff" size="sm" onClick={p.onShowTables}>
          📋<span className="hidden sm:inline"> Tables</span>
        </NeonButton>
        <NeonButton color="#39ff88" solid onClick={() => p.onAnswer(sql)} disabled={p.disabled}>
          Run ▶
        </NeonButton>
      </Actions>
    </div>
  );
}

// ---------------------------------------------------------------- Choice

export function ChoiceView(p: RoundProps<ChoiceRound> & { reveal: number | null }) {
  const elim = p.usedHints.map((i) => p.round.hints[i]?.elim).filter((x): x is number => typeof x === "number");
  const letters = "ABCD";
  return (
    <div className="space-y-3">
      {p.round.code && <CodeBlock text={p.round.code.text} lang={p.round.code.lang} />}
      {p.round.mini && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {p.round.mini.map((t) => (
            <DataTable key={t.name} title={t.name} columns={t.columns.map((c) => c.name)} rows={t.rows} compact />
          ))}
        </div>
      )}
      <div className="font-pixel text-[9px] text-dim">PICK THE RESULT:</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {p.round.options.map((o, i) => {
          const isElim = elim.includes(i);
          const revealed = p.reveal !== null;
          const right = p.round.correct.includes(i);
          const color = revealed ? (right ? "#39ff88" : i === p.reveal ? "#ff4d6d" : "#2a2350") : "#22f3ff";
          return (
            <button
              key={i}
              type="button"
              disabled={p.disabled || isElim || revealed}
              onClick={() => p.onAnswer(i)}
              data-opt={i}
              className={cx("relative border-2 bg-black/40 p-2 text-left transition-transform active:scale-[0.99]", isElim && "opacity-25")}
              style={{ borderColor: color, boxShadow: revealed && right ? "0 0 16px rgba(57,255,136,.45)" : undefined }}
            >
              <span className="absolute -left-0.5 -top-0.5 bg-bg px-1.5 font-pixel text-[9px]" style={{ color }}>
                {letters[i]}
              </span>
              <div className="pt-3">
                {o.result && <DataTable columns={o.result.columns} rows={o.result.rows} compact />}
                {o.code && <CodeBlock text={o.code.text} lang={o.code.lang} className="text-[11px]" />}
              </div>
            </button>
          );
        })}
      </div>
      <Actions p={p as unknown as RoundProps<Round>}>
        <span />
      </Actions>
    </div>
  );
}

// ---------------------------------------------------------------- Order (pipeline)

export function OrderView(p: RoundProps<OrderRound>) {
  const [order, setOrder] = useState(p.round.start);
  useEffect(() => setOrder(p.round.start), [p.round]);
  const byId = new Map(p.round.steps.map((s) => [s.id, s]));
  return (
    <div className="space-y-3">
      <UsedHints hints={p.round.hints} used={p.usedHints} />
      <OrderList
        order={order}
        onChange={setOrder}
        disabled={p.disabled}
        render={(id) => {
          const s = byId.get(id)!;
          return (
            <div>
              <div className="text-[19px] leading-tight text-ink">{s.text}</div>
              {s.detail && <div className="font-code text-[11px] text-dim">{s.detail}</div>}
            </div>
          );
        }}
      />
      <VerdictLine fb={p.feedback} index={p.index} />
      <Actions p={p as RoundProps<Round>}>
        <NeonButton color="#39ff88" solid onClick={() => p.onAnswer(order)} disabled={p.disabled}>
          Lock in ▶
        </NeonButton>
      </Actions>
    </div>
  );
}

// ---------------------------------------------------------------- PySpark tiles

function SqlVsPy({ sql }: { sql: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 font-pixel text-[8px]">
        <span className="text-pink">SQL</span>
        <span className="text-dim">VS</span>
        <span className="text-purple">PYSPARK</span>
      </div>
      <CodeBlock text={sql} lang="sql" />
    </div>
  );
}

export function PyOrderView(p: RoundProps<PyOrderRound>) {
  const [order, setOrder] = useState(p.round.start);
  useEffect(() => setOrder(p.round.start), [p.round]);
  const byId = new Map(p.round.tiles.map((t) => [t.id, t.code]));
  return (
    <div className="space-y-3">
      <SqlVsPy sql={p.round.sql} />
      <UsedHints hints={p.round.hints} used={p.usedHints} />
      <div className="font-code text-[13px] text-purple">
        result = ( <span className="text-ink">{p.round.head}</span>
      </div>
      <OrderList order={order} onChange={setOrder} color="#b26bff" disabled={p.disabled} render={(id) => <code className="block break-all font-code text-[12.5px] text-cyan">{byId.get(id)}</code>} />
      <div className="font-code text-[13px] text-purple">)</div>
      <VerdictLine fb={p.feedback} index={p.index} />
      <Actions p={p as RoundProps<Round>}>
        <NeonButton color="#22f3ff" size="sm" onClick={p.onShowTables}>
          📋
        </NeonButton>
        <NeonButton color="#39ff88" solid onClick={() => p.onAnswer(order)} disabled={p.disabled}>
          Run ▶
        </NeonButton>
      </Actions>
    </div>
  );
}

export function PyFillView(p: RoundProps<PyFillRound>) {
  const [pick, setPick] = useState<number | null>(null);
  useEffect(() => setPick(null), [p.round]);
  const [pre, post] = p.round.template.split("___");
  return (
    <div className="space-y-3">
      <SqlVsPy sql={p.round.sql} />
      <UsedHints hints={p.round.hints} used={p.usedHints} />
      <pre className="whitespace-pre-wrap break-words border border-line bg-black/50 px-3 py-2 font-code text-[12.5px] text-cyan">
        {pre}
        <span className={cx("border-b-2 px-1", pick === null ? "border-yellow text-yellow blink" : "border-green text-green")}>{pick === null ? "____" : p.round.options[pick]}</span>
        {post}
      </pre>
      <div className="grid grid-cols-2 gap-2">
        {p.round.options.map((o, i) => (
          <button
            key={i}
            type="button"
            disabled={p.disabled}
            onClick={() => setPick(i)}
            data-fill={i}
            className={cx("border-2 px-2 py-2 font-code text-[13px] active:translate-y-px", pick === i ? "border-green text-green" : "border-purple/60 text-purple")}
          >
            {o.trim()}
          </button>
        ))}
      </div>
      <VerdictLine fb={p.feedback} index={p.index} />
      <Actions p={p as RoundProps<Round>}>
        <NeonButton color="#22f3ff" size="sm" onClick={p.onShowTables}>
          📋
        </NeonButton>
        <NeonButton color="#39ff88" solid onClick={() => pick !== null && p.onAnswer(pick)} disabled={p.disabled || pick === null}>
          Run ▶
        </NeonButton>
      </Actions>
    </div>
  );
}

export function TableSheet({ tables, onClose }: { tables: TableData[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div className="mx-auto max-h-[72dvh] w-full max-w-3xl overflow-y-auto border-t-2 border-cyan bg-bg px-4 pb-8 pt-3" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 mb-2 flex items-center justify-between bg-bg py-1">
          <span className="font-pixel text-[10px] text-cyan">TABLES</span>
          <button type="button" onClick={onClose} className="font-pixel text-[10px] text-dim">
            CLOSE ✕
          </button>
        </div>
        <div className="space-y-4">
          {tables.map((t) => (
            <DataTable key={t.name} title={`${t.name} (${t.rows.length} rows)`} columns={t.columns.map((c) => c.name)} rows={t.rows} compact />
          ))}
        </div>
      </div>
    </div>
  );
}

export function RoundHeader({ round, index, total, color }: { round: Round; index: number; total: number | null; color: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="shrink-0 whitespace-nowrap font-pixel text-[9px]" style={{ color }}>
          {total ? `ROUND ${index + 1}/${total}` : `Q${index + 1}`}
        </span>
        {round.tag && <Tag color="#8f89b8">{round.tag}</Tag>}
        <span className="truncate font-pixel text-[9px] text-ink/70">{round.title}</span>
      </div>
      <p className="text-[22px] leading-tight text-ink">{round.prompt}</p>
    </div>
  );
}
