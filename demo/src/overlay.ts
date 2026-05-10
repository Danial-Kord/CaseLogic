// On-page text overlay used by every scene to narrate the recording.
//
// The overlay is just a fixed-position <div> we append to <body> and
// remove again. It's recorded as part of the WebM the same way any
// other DOM is, so we don't need an ffmpeg drawtext post-process.
//
// Usage:
//   await ensureOverlayStyles(page);  // once per page
//   await showOverlay(page, "CaseLogic", { holdMs: 4000 });
//
// The helper waits for the full lifecycle (fade-in + hold + fade-out)
// before resolving so callers can sequence text changes naturally.

import type { Page } from "playwright";

const STYLE_ID = "__demo_overlay_styles";

const FADE_IN_MS = 600;
const FADE_OUT_MS = 400;

export interface OverlayOptions {
  holdMs?: number;
  position?: "top" | "bottom" | "center";
  size?: "lg" | "md";
}

/**
 * Inject the keyframe + container CSS once per page. Cheap to call
 * repeatedly — guarded by an id check so duplicates noop.
 */
export async function ensureOverlayStyles(page: Page): Promise<void> {
  await page.evaluate(
    ({ styleId, fadeInMs, fadeOutMs }) => {
      if (document.getElementById(styleId)) return;
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .__demo_overlay {
          position: fixed;
          left: 50%;
          transform: translateX(-50%);
          z-index: 99999;
          padding: 14px 28px;
          border-radius: 16px;
          background: rgba(15, 23, 42, 0.86);
          color: #ffffff;
          font-family: ui-serif, Georgia, "Times New Roman", serif;
          font-weight: 600;
          letter-spacing: 0.01em;
          box-shadow: 0 12px 38px rgba(15, 23, 42, 0.35),
                      0 0 0 1px rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(6px);
          white-space: nowrap;
          opacity: 0;
          animation: __demoFadeUp ${fadeInMs}ms ease-out forwards;
          will-change: transform, opacity;
        }
        .__demo_overlay--bottom { bottom: 64px; }
        .__demo_overlay--top    { top: 56px; }
        .__demo_overlay--center { top: 50%; transform: translate(-50%, -50%); }
        .__demo_overlay--lg     { font-size: 28px; }
        .__demo_overlay--md     { font-size: 20px; }
        .__demo_overlay--leaving {
          animation: __demoFadeOut ${fadeOutMs}ms ease-in forwards;
        }
        @keyframes __demoFadeUp {
          from { opacity: 0; transform: translateX(-50%) translateY(16px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes __demoFadeOut {
          from { opacity: 1; }
          to   { opacity: 0; transform: translateX(-50%) translateY(-8px); }
        }
        /* center variants need a different translate baseline */
        .__demo_overlay--center.__demo_overlay--leaving {
          animation: __demoFadeOutCenter ${fadeOutMs}ms ease-in forwards;
        }
        @keyframes __demoFadeOutCenter {
          from { opacity: 1; }
          to   { opacity: 0; transform: translate(-50%, calc(-50% - 8px)); }
        }
      `;
      document.head.appendChild(style);
    },
    { styleId: STYLE_ID, fadeInMs: FADE_IN_MS, fadeOutMs: FADE_OUT_MS },
  );
}

/**
 * Show an overlay, hold it, then fade out. Awaits the full lifecycle.
 * Default position is bottom; flip to center for a punchier title card.
 */
export async function showOverlay(
  page: Page,
  text: string,
  opts: OverlayOptions = {},
): Promise<void> {
  const holdMs = opts.holdMs ?? 2200;
  const position = opts.position ?? "bottom";
  const size = opts.size ?? "lg";

  await ensureOverlayStyles(page);

  // Append the element and stash an id we'll address from the next step.
  const id = `__demo_overlay_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  await page.evaluate(
    ({ id, text, position, size }) => {
      const el = document.createElement("div");
      el.id = id;
      el.className = `__demo_overlay __demo_overlay--${position} __demo_overlay--${size}`;
      el.textContent = text;
      document.body.appendChild(el);
    },
    { id, text, position, size },
  );

  // Fade in + hold.
  await page.waitForTimeout(FADE_IN_MS + holdMs);

  // Trigger fade-out, wait for it, then remove.
  await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add("__demo_overlay--leaving");
  }, id);

  await page.waitForTimeout(FADE_OUT_MS + 50);

  await page.evaluate((id) => {
    document.getElementById(id)?.remove();
  }, id);
}
