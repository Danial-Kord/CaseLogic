// Continuous tour — captured as a single WebM by the recorder.
//
// Replaces the old per-scene split (landing.ts, research.ts,
// plans.ts) so the editor can work from one raw video. Overlays and
// zooms are still rendered into the page, so the final video keeps
// the brand styling. The new piece is the `Markers` instance: every
// meaningful beat is timestamped, and the edit pass uses those
// timestamps to cut long LLM-induced waits down to size.

import type { Page } from "playwright";
import { DEV_URL } from "../config.js";
import { ensureOverlayStyles, showOverlay } from "../overlay.js";
import { zoomTo } from "../zoom.js";
import type { Markers } from "../markers.js";

export async function runTour(page: Page, markers: Markers): Promise<void> {
  await landingBlock(page, markers);
  await researchBlock(page, markers);
  await plansBlock(page, markers);
}

// ----------------------------------------------------------------- landing
async function landingBlock(page: Page, markers: Markers): Promise<void> {
  await page.goto(`${DEV_URL}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=CaseLogic", { timeout: 30_000 });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await ensureOverlayStyles(page);
  markers.add("landing:start");

  // Hero hold + title overlay.
  await showOverlay(
    page,
    "CaseLogic — source-grounded legal research",
    { holdMs: 6000, position: "bottom" },
  );
  markers.add("landing:hero_overlay_done");

  // Quick dark/light flash. No narration overlay.
  const darkBtn = page.getByRole("radio", { name: "Dark theme" });
  await darkBtn.waitFor({ state: "visible", timeout: 10_000 });
  await darkBtn.click();
  markers.add("landing:dark_clicked");
  await page.waitForTimeout(1000);
  await page.getByRole("radio", { name: "Light theme" }).click();
  markers.add("landing:light_clicked");
  await page.waitForTimeout(500);
  markers.add("landing:end");
}

// ---------------------------------------------------------------- research
async function researchBlock(page: Page, markers: Markers): Promise<void> {
  await page.goto(`${DEV_URL}/research`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await ensureOverlayStyles(page);
  markers.add("research:start");

  await page.getByRole("button", { name: "+ New chat" }).click();
  markers.add("research:new_chat_clicked");

  await showOverlay(page, "Hybrid retrieval", { holdMs: 2000 });

  await page
    .getByRole("button", {
      name: "What are the laws about reckless driving?",
      exact: true,
    })
    .click();
  markers.add("research:sample_clicked");
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Send" }).click();
  markers.add("research:send_clicked");

  // Trace overlays narrate the streaming agent loop.
  await showOverlay(page, "Every claim cites a source", { holdMs: 2200 });
  await showOverlay(page, "Verifier audits citations", { holdMs: 2200 });

  // Wait for the assistant to finish — table mounts when hits arrive.
  await page
    .locator("table")
    .first()
    .waitFor({ state: "visible", timeout: 90_000 });
  markers.add("research:table_visible");

  await page
    .locator("table")
    .first()
    .scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  await showOverlay(page, "Sort by score, citation, or section", {
    holdMs: 1800,
  });

  // Sort interactions.
  const sortClickByLabel = async (label: string) => {
    const header = page
      .locator("table")
      .first()
      .getByRole("button", { name: new RegExp(`^${label}\\b`, "i") });
    if ((await header.count()) > 0) {
      await header.first().click();
      await page.waitForTimeout(700);
    }
  };
  await sortClickByLabel("Score");
  await sortClickByLabel("Citation");
  await sortClickByLabel("Section");
  markers.add("research:sort_done");
  await page.waitForTimeout(300);

  // Open the modal by clicking the first row.
  const firstRow = page
    .locator("table")
    .first()
    .locator("tbody tr")
    .first();
  await firstRow.scrollIntoViewIfNeeded();
  await firstRow.click();

  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 8_000 });
  markers.add("research:modal_visible");
  await page.waitForTimeout(1000);

  // Zoom on the first <mark> highlight inside the dialog.
  await zoomTo(page, '[role="dialog"] mark', { scale: 1.7, holdMs: 1400 });
  // Then zoom on a citation chip (no click — just attention).
  const citeSelector =
    '[role="dialog"] button[aria-label^="Open "], [role="dialog"] span[title="Cross-reference to another statute"]';
  if ((await page.locator(citeSelector).count()) > 0) {
    await zoomTo(page, citeSelector, { scale: 1.8, holdMs: 1600 });
  }
  markers.add("research:zoom_done");

  await dialog.getByRole("button", { name: "Close" }).click();
  await page.waitForTimeout(400);
  markers.add("research:end");
}

// ------------------------------------------------------------------- plans
async function plansBlock(page: Page, markers: Markers): Promise<void> {
  await page.goto(`${DEV_URL}/plans`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await ensureOverlayStyles(page);
  markers.add("plans:start");

  await page.getByRole("button", { name: "+ New plan" }).click();
  await page.waitForTimeout(200);
  markers.add("plans:new_plan_clicked");

  await showOverlay(page, "Planning agent — three sub-agents", { holdMs: 2000 });

  const SAMPLE_PROMPT_FIRST =
    "Hit-and-run at intersection: opposing driver ran red light at high speed, my client (pedestrian) suffered a fractured tibia.";
  await page
    .getByRole("button", { name: SAMPLE_PROMPT_FIRST, exact: true })
    .click();
  markers.add("plans:sample_clicked");
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Generate plan" }).click();
  markers.add("plans:generate_clicked");

  // For each step: drop the intro overlay, scroll the matching
  // section into view. Wait long enough for the section to actually
  // render — the editor will trim any over-runs to keep the final
  // video punchy.
  await showOverlay(page, "Step 1 — Related cases", { holdMs: 1800 });
  await focusSection(page, "Related cases & statutes", 60_000);
  markers.add("plans:related_done");
  await page.waitForTimeout(400);

  await showOverlay(page, "Step 2 — People to reach out (roles only)", {
    holdMs: 1800,
  });
  await focusSection(page, "People to reach out to", 60_000);
  markers.add("plans:contacts_done");
  await page.waitForTimeout(400);

  await showOverlay(page, "Step 3 — Recommended brief", { holdMs: 1800 });
  await focusSection(page, "Recommended brief outline", 60_000);
  markers.add("plans:brief_done");
  await page.waitForTimeout(600);

  // Cited-chip detour. Skip silently if no chip is rendered.
  const chip = page
    .locator("article button")
    .filter({ hasText: /^ca-veh-/ })
    .first();
  try {
    await chip.waitFor({ state: "visible", timeout: 4_000 });
    await chip.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await chip.click();

    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible", timeout: 6_000 });
    markers.add("plans:chip_modal_visible");
    await page.waitForTimeout(1000);

    await showOverlay(page, "Every output cites a statute", { holdMs: 1500 });

    await dialog.getByRole("button", { name: "Close" }).click();
    await page.waitForTimeout(300);
  } catch {
    // No chip — keep moving.
  }

  await showOverlay(page, "Try it yourself", {
    holdMs: 2200,
    position: "center",
    size: "lg",
  });
  await page.waitForTimeout(500);
  markers.add("plans:end");
}

// Scroll a section's <article> card into view, wait for its "Done"
// pill (capped). If the cap is hit, we keep recording — the edit pass
// will trim the dead air later.
async function focusSection(
  page: Page,
  sectionHeading: string,
  maxWaitMs: number,
): Promise<void> {
  const card = page.locator("article").filter({
    has: page.getByRole("heading", { name: sectionHeading }),
  });
  if ((await card.count()) === 0) return;
  await card.first().scrollIntoViewIfNeeded().catch(() => undefined);
  try {
    await card
      .locator("span", { hasText: /^Done$/ })
      .first()
      .waitFor({ state: "visible", timeout: maxWaitMs });
  } catch {
    /* fall through */
  }
}
