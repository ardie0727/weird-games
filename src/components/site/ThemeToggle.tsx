"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { currentTheme, flipTheme, onThemeChange, type Theme } from "@/lib/client/theme";

/** The site-wide paper/neon switch. Rubber Bullet Man draws its own in its header. */
export function ThemeToggle() {
  const path = usePathname() ?? "/";
  const btn = useRef<HTMLButtonElement>(null);
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    setTheme(currentTheme());
    return onThemeChange(setTheme);
  }, []);
  if (path.startsWith("/rubber-bullet-man")) return null;
  const hub = path === "/" || path.startsWith("/lab");
  return (
    <button
      ref={btn}
      type="button"
      onClick={() => flipTheme(btn.current)}
      aria-label={theme === "dark" ? "Switch to paper (light) mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Paper mode" : "Dark mode"}
      className={`fixed z-[60] grid place-items-center rounded-full border-2 border-ink bg-panel shadow-[3px_3px_0_0_var(--color-pink)] transition-transform active:scale-90 ${
        hub ? "right-4 top-4 h-10 w-10" : "bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 h-8 w-8 opacity-80 hover:opacity-100"
      }`}
    >
      <span className="relative block h-4 w-4 overflow-hidden rounded-full border-2 border-ink">
        <span className="absolute inset-y-0 right-0 w-1/2 bg-ink" />
      </span>
    </button>
  );
}
