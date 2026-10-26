"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { Cell } from "@/lib/dataset";
import { sfx } from "@/lib/client/sound";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type BtnProps = {
  children: ReactNode;
  color?: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  solid?: boolean;
  title?: string;
  type?: "button" | "submit";
};

export function NeonButton({ children, color = "#22f3ff", onClick, href, disabled, size = "md", className, solid, title, type = "button" }: BtnProps) {
  const pad = size === "lg" ? "px-6 py-4 text-sm" : size === "sm" ? "px-3 py-2 text-[9px]" : "px-4 py-3 text-[11px]";
  const style = { "--glow": color, color: solid ? "#05040b" : color, background: solid ? color : "rgba(5,4,11,0.6)" } as CSSProperties;
  const cls = cx(
    "neon-box pixel-corners font-pixel uppercase tracking-wider whitespace-nowrap select-none transition-transform active:translate-y-[2px] active:scale-[0.98] inline-flex items-center justify-center gap-2",
    pad,
    disabled && "opacity-40 pointer-events-none",
    className,
  );
  if (href)
    return (
      <Link href={href} className={cls} style={style} onClick={() => sfx("click")} title={title}>
        {children}
      </Link>
    );
  return (
    <button
      type={type}
      className={cls}
      style={style}
      disabled={disabled}
      title={title}
      onClick={() => {
        sfx("click");
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}

export function Panel({ children, color = "#2a2350", className, style }: { children: ReactNode; color?: string; className?: string; style?: CSSProperties }) {
  return (
    <div className={cx("pixel-corners bg-panel/90 border-2", className)} style={{ borderColor: color, ...style }}>
      {children}
    </div>
  );
}

export function Tag({ children, color = "#22f3ff" }: { children: ReactNode; color?: string }) {
  return (
    <span className="font-pixel text-[8px] uppercase px-1.5 py-1 border" style={{ color, borderColor: color }}>
      {children}
    </span>
  );
}

export function fmtCell(c: Cell): string {
  if (c === null) return "NULL";
  if (typeof c === "number") return Number.isInteger(c) ? String(c) : String(Math.round(c * 100) / 100);
  return c;
}

export function DataTable({ columns, rows, title, max = 50, compact, highlight }: { columns: string[]; rows: Cell[][]; title?: string; max?: number; compact?: boolean; highlight?: string }) {
  return (
    <div className="min-w-0">
      {title && <div className="font-pixel text-[9px] text-cyan mb-1 neon-soft">{title}</div>}
      <div className="overflow-x-auto scroll-x border border-line bg-black/40" style={highlight ? { borderColor: highlight } : undefined}>
        <table className={cx("w-full border-collapse font-code", compact ? "text-[11px]" : "text-[12px]")}>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={i} className="text-left px-2 py-1 text-yellow font-normal border-b border-line whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, max).map((r, i) => (
              <tr key={i} className="odd:bg-white/[0.03]">
                {r.map((c, j) => (
                  <td key={j} className={cx("px-2 py-[3px] whitespace-nowrap", c === null ? "text-dim italic" : typeof c === "number" ? "text-green" : "text-ink")}>
                    {fmtCell(c)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length || 1} className="px-2 py-1 text-dim italic">
                  (no rows)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > max && <div className="text-dim text-sm">+{rows.length - max} more rows</div>}
    </div>
  );
}

const SQL_KW =
  /\b(SELECT|FROM|WHERE|GROUP|BY|ORDER|HAVING|LIMIT|JOIN|LEFT|INNER|ON|AS|AND|OR|NOT|IN|IS|NULL|DISTINCT|COUNT|SUM|AVG|MIN|MAX|ROUND|DESC|ASC|BETWEEN|CASE|WHEN|THEN|ELSE|END|COALESCE|WITH|USING)\b/g;
const PY_KW = /(\.\w+(?=\()|\bF\.\w+|\bresult\b)/g;

export function CodeBlock({ text, lang, className }: { text: string; lang: "sql" | "python"; className?: string }) {
  // Light syntax colouring: keywords, strings, numbers.
  const parts = text.split(/('[^']*'|"[^"]*")/g);
  return (
    <pre className={cx("font-code text-[12.5px] leading-snug whitespace-pre-wrap break-words bg-black/50 border border-line px-3 py-2 text-ink", className)}>
      {parts.map((p, i) =>
        /^['"]/.test(p) ? (
          <span key={i} className="text-orange">
            {p}
          </span>
        ) : (
          <span
            key={i}
            dangerouslySetInnerHTML={{
              __html: p
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(lang === "sql" ? SQL_KW : PY_KW, (m) => `<span class="${lang === "sql" ? "text-pink" : "text-cyan"}">${m}</span>`)
                .replace(/\b(\d+(\.\d+)?)\b/g, '<span class="text-green">$1</span>'),
            }}
          />
        ),
      )}
    </pre>
  );
}

export function Hearts({ n, max }: { n: number; max: number }) {
  return (
    <span className="text-[16px] tracking-tight" aria-label={`${n} lives`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < n ? "text-red neon-soft" : "text-line"}>
          ♥
        </span>
      ))}
    </span>
  );
}

export function PixelTitle({ children, color = "#ff2bd6", className }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <h1 className={cx("font-pixel neon leading-tight", className)} style={{ color }}>
      {children}
    </h1>
  );
}
