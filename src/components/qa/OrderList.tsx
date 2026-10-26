"use client";

import { useRef, useState, type ReactNode } from "react";
import { sfx } from "@/lib/client/sound";
import { cx } from "./ui";

/** Touch-friendly reorderable list: drag the handle, or tap the arrows. */
export function OrderList({ order, onChange, render, color = "#ffe14d", disabled }: { order: string[]; onChange: (o: string[]) => void; render: (id: string, i: number) => ReactNode; color?: string; disabled?: boolean }) {
  const [drag, setDrag] = useState<number | null>(null);
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = order.slice();
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onChange(next);
    sfx("tick");
  };

  return (
    <ol className="space-y-2 select-none">
      {order.map((id, i) => (
        <li
          key={id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className={cx("flex items-stretch border-2 bg-black/50 transition-colors", drag === i ? "bg-white/10" : "")}
          style={{ borderColor: drag === i ? color : "#2a2350" }}
        >
          <button
            type="button"
            aria-label="Drag to reorder"
            disabled={disabled}
            className="w-10 shrink-0 cursor-grab touch-none border-r border-line text-xl text-dim active:cursor-grabbing"
            onPointerDown={(e) => {
              if (disabled) return;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              setDrag(i);
            }}
            onPointerMove={(e) => {
              if (drag === null) return;
              const y = e.clientY;
              for (let j = 0; j < order.length; j++) {
                const r = refs.current[j]?.getBoundingClientRect();
                if (!r) continue;
                if (y >= r.top && y <= r.bottom && j !== drag) {
                  move(drag, j);
                  setDrag(j);
                  break;
                }
              }
            }}
            onPointerUp={() => setDrag(null)}
            onPointerCancel={() => setDrag(null)}
          >
            ⠿
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2">
            <span className="font-pixel text-[9px] w-5 shrink-0" style={{ color }}>
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">{render(id, i)}</div>
          </div>
          <div className="flex shrink-0 flex-col border-l border-line">
            <button type="button" aria-label="Move up" disabled={disabled || i === 0} onClick={() => move(i, i - 1)} className="h-1/2 px-3 text-cyan disabled:text-line">
              ▲
            </button>
            <button type="button" aria-label="Move down" disabled={disabled || i === order.length - 1} onClick={() => move(i, i + 1)} className="h-1/2 px-3 text-cyan disabled:text-line">
              ▼
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}
