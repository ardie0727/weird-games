"use client";

import { useMemo, useRef } from "react";
import type { TableData } from "@/lib/dataset";
import { sfx } from "@/lib/client/sound";

const KEYWORDS = ["SELECT", "FROM", "WHERE", "GROUP BY", "HAVING", "ORDER BY", "DESC", "LIMIT", "JOIN", "LEFT JOIN", "ON", "AND", "OR", "IS NULL", "IS NOT NULL", "NOT IN", "DISTINCT", "COUNT(*)", "COUNT(", "SUM(", "AVG(", "MAX(", "MIN(", "ROUND(", "COALESCE(", "BETWEEN", "AS", "=", ">", "<", "<>", "'", "(", ")", ",", "*"];

export function SqlEditor({
  value,
  onChange,
  onRun,
  tables,
  disabled,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  onRun: () => void;
  tables: TableData[];
  disabled?: boolean;
  invalid?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const names = useMemo(() => {
    const s = new Set<string>();
    tables.forEach((t) => {
      s.add(t.name);
      t.columns.forEach((c) => s.add(c.name));
    });
    return [...s];
  }, [tables]);

  const insert = (tok: string) => {
    const el = ref.current;
    if (!el) return;
    sfx("click");
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const insideString = (before.match(/'/g)?.length ?? 0) % 2 === 1;
    const glue = before === "" || /[\s(]$/.test(before) || tok === ")" || tok === "," || (tok === "'" && insideString) ? "" : " ";
    const tail = tok.endsWith("(") || (tok === "'" && !insideString) ? "" : " ";
    const next = before + glue + tok + tail + (tail && after.startsWith(" ") ? after.slice(1) : after);
    onChange(next);
    const pos = (before + glue + tok + tail).length;
    requestAnimationFrame(() => {
      el.focus({ preventScroll: true });
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="space-y-2">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onRun();
          }
        }}
        disabled={disabled}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        rows={5}
        aria-label="SQL editor"
        className={`sql w-full resize-y bg-black/70 border-2 px-3 py-2 font-code text-ink caret-pink outline-none focus:border-cyan ${invalid ? "border-red" : "border-line"}`}
      />
      <div className="scroll-x -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {names.map((n) => (
          <Chip key={"n" + n} label={n} onTap={() => insert(n)} tone="name" />
        ))}
      </div>
      <div className="scroll-x -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {KEYWORDS.map((k) => (
          <Chip key={k} label={k} onTap={() => insert(k)} tone="kw" />
        ))}
      </div>
    </div>
  );
}

function Chip({ label, onTap, tone }: { label: string; onTap: () => void; tone: "kw" | "name" }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => e.preventDefault()} // keep the textarea focused and the keyboard open
      onClick={onTap}
      className={`shrink-0 whitespace-nowrap border px-2 py-1 font-code text-[12px] active:translate-y-px ${tone === "kw" ? "border-pink/60 text-pink" : "border-cyan/50 text-cyan"}`}
    >
      {label}
    </button>
  );
}
