// Element-targeted zoom helper. We apply a CSS transform to the page's
// root scroll container so the zoom is recorded natively in the WebM —
// no ffmpeg zoompan needed (which is fiddly to compose with xfade).
//
// Mechanism:
//   1. Compute the target's bounding rect.
//   2. Set transform-origin to the target's center so it stays centered
//      under the zoom.
//   3. Transition to scale(N) with a smooth easing.
//   4. Hold.
//   5. Reset to scale(1) with the same easing.
//
// We transform <html> rather than <body> because Tailwind sets
// `dark` mode on <html> via class, and transforming <body> can
// produce subtle layout glitches with the fixed-position overlays
// in overlay.ts. Both are valid; <html> is the safer pick here.

import type { Page } from "playwright";

const TRANSITION_MS = 600;

export interface ZoomOptions {
  scale?: number;
  holdMs?: number;
  /**
   * Optional: shift the focal point off-center so the target sits in
   * the upper third (helpful for elements near the bottom of the
   * viewport that would otherwise scroll off-screen when zoomed).
   */
  yOffset?: number;
}

/**
 * Zoom into the first matching element, hold, then reset. If the
 * selector doesn't match anything, the helper logs a warning and
 * returns without animating — recording continues uninterrupted.
 */
export async function zoomTo(
  page: Page,
  selector: string,
  opts: ZoomOptions = {},
): Promise<void> {
  const scale = opts.scale ?? 1.6;
  const holdMs = opts.holdMs ?? 1800;
  const yOffset = opts.yOffset ?? 0;

  const ok = await page.evaluate(
    ({ selector, scale, transitionMs, yOffset }) => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2 + yOffset;
      const html = document.documentElement;
      html.style.transition = `transform ${transitionMs}ms cubic-bezier(.2,.8,.2,1)`;
      html.style.transformOrigin = `${cx}px ${cy}px`;
      html.style.transform = `scale(${scale})`;
      return true;
    },
    { selector, scale, transitionMs: TRANSITION_MS, yOffset },
  );

  if (!ok) {
    // eslint-disable-next-line no-console
    console.warn(`[zoom] selector not found, skipping: ${selector}`);
    return;
  }

  await page.waitForTimeout(TRANSITION_MS + holdMs);

  await page.evaluate(
    ({ transitionMs }) => {
      const html = document.documentElement;
      html.style.transition = `transform ${transitionMs}ms cubic-bezier(.2,.8,.2,1)`;
      html.style.transform = "scale(1)";
    },
    { transitionMs: TRANSITION_MS },
  );

  await page.waitForTimeout(TRANSITION_MS + 50);

  // Clear inline styles so subsequent layout reads aren't biased by a
  // stale transform-origin from the previous call.
  await page.evaluate(() => {
    const html = document.documentElement;
    html.style.transition = "";
    html.style.transformOrigin = "";
    html.style.transform = "";
  });
}
