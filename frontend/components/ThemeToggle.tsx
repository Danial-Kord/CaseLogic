"use client";

import { useEffect, useState } from "react";
import {
  THEME_STORAGE_KEY,
  applyTheme,
  getStoredTheme,
  type Theme,
} from "@/lib/theme";
import { strings } from "@/lib/i18n/en";

const OPTIONS: ReadonlyArray<{ value: Theme; label: string }> = [
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
];

export default function ThemeToggle() {
  // We start as "system" on the server — even when the user has chosen
  // light or dark, the inline bootstrap script in layout.tsx already
  // applied the right `.dark` class before paint. We just sync this
  // component's local state on mount.
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(getStoredTheme());
    setMounted(true);
  }, []);

  // When the user is in "system" mode, reflect OS preference changes live.
  useEffect(() => {
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme]);

  // Cross-tab sync: if another tab changes the stored preference, mirror
  // the change here. Browsers fire `storage` events on other tabs only.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== THEME_STORAGE_KEY) return;
      const next = getStoredTheme();
      setTheme(next);
      applyTheme(next);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function handleSelect(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label={strings.themeToggle.ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-full border border-brand-border bg-brand-surface p-0.5"
    >
      {OPTIONS.map((opt) => {
        const active = mounted && theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={
              strings.themeToggle.optionLabel?.[opt.value] ?? opt.label
            }
            onClick={() => handleSelect(opt.value)}
            className={[
              "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
              active
                ? "bg-brand-accent text-white shadow-sm"
                : "text-brand-muted hover:text-brand-primary",
            ].join(" ")}
          >
            <ThemeIcon kind={opt.value} />
          </button>
        );
      })}
    </div>
  );
}

function ThemeIcon({ kind }: { kind: Theme }) {
  // Inline SVGs sized to ~14px to match the 28px button size. currentColor
  // means they pick up the active/inactive text color from the parent.
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (kind) {
    case "light":
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="3.2" />
          <path d="M10 2.5v1.5M10 16v1.5M2.5 10h1.5M16 10h1.5M4.5 4.5l1 1M14.5 14.5l1 1M4.5 15.5l1-1M14.5 5.5l1-1" />
        </svg>
      );
    case "dark":
      return (
        <svg {...common}>
          <path d="M16.5 11.5A6.5 6.5 0 0 1 8.5 3.5a6.5 6.5 0 1 0 8 8z" />
        </svg>
      );
    case "system":
    default:
      return (
        <svg {...common}>
          <rect x="2.5" y="3.5" width="15" height="10" rx="1.5" />
          <path d="M7 17h6M10 13.5V17" />
        </svg>
      );
  }
}
