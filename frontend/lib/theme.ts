// Lightweight theme management for light/dark/system modes.
//
// Why hand-roll this instead of pulling in next-themes? Two reasons:
// 1. The footprint is tiny — a few dozen lines beat another dependency.
// 2. We can ship the pre-paint bootstrap as a literal inline <script>
//    so there's no flash of wrong theme on first paint.
//
// Storage: `caselogic-theme` localStorage key. Values are limited to
// "light" | "dark" | "system". Anything else is treated as "system".
//
// The class flipped is `.dark` on <html>, matching tailwind.config.ts's
// `darkMode: "class"` setting.

export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "caselogic-theme";

/**
 * Inline script source that runs *before* React hydrates. Reads the user's
 * stored choice (or falls back to OS preference) and applies the `.dark`
 * class to <html> synchronously. This avoids a "flash of light theme" on
 * first paint when the user has chosen dark mode.
 *
 * Returned as a plain string so it can be injected via
 * `dangerouslySetInnerHTML` from a server component.
 */
export function getInitialThemeScript(): string {
  return `
(function() {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored === 'dark' || (stored !== 'light' && prefersDark);
    if (dark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  } catch (e) {}
})();
`.trim();
}

/**
 * Apply a theme at runtime: write the user's preference to storage and
 * flip the `.dark` class on <html> to match. Safe to call on the client
 * only; no-ops if `window` is undefined.
 */
export function applyTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  try {
    if (theme === "system") {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  } catch {
    /* storage might be disabled — fall through and still flip the class */
  }

  const prefersDark = window.matchMedia(
    "(prefers-color-scheme: dark)",
  ).matches;
  const wantDark = theme === "dark" || (theme === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", wantDark);
}

/**
 * Read the user's stored preference. Returns "system" if no explicit
 * choice has been recorded. Safe on the server (returns "system").
 */
export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* storage disabled — fall through */
  }
  return "system";
}
