// Recorder driver — single continuous capture.
//
// Pipeline:
//   1. Spawn `next dev` (devServer.ts).
//   2. Launch a Playwright Chromium browser.
//   3. Open ONE BrowserContext with `recordVideo` -> a single WebM
//      that covers the whole tour. We also instantiate a `Markers`
//      object whose start time matches the WebM start, and pass it
//      through to the tour so every meaningful beat is timestamped.
//   4. Persist markers.json next to the raw WebM.
//   5. Tear everything down even if the tour throws.
//
// Output:
//   demo/clips/raw.webm
//   demo/clips/markers.json
//
// edit.ts then consumes both to produce the final mp4.

import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { CLIP_DIR, FPS, VIEWPORT } from "./config.js";
import { startDevServer, type DevServer } from "./devServer.js";
import { Markers } from "./markers.js";
import { runTour } from "./scenes/tour.js";

const RAW_FILENAME = "raw.webm";
const MARKERS_FILENAME = "markers.json";

async function ensureCleanDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  for (const name of await fs.readdir(dir)) {
    if (name === ".gitkeep") continue;
    await fs.rm(path.join(dir, name), { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[record] viewport=${VIEWPORT.width}x${VIEWPORT.height} fps=${FPS}`);
  await ensureCleanDir(CLIP_DIR);

  // Playwright auto-names the WebM under this dir; we move it to a
  // deterministic path after closing the context.
  const stagingDir = path.join(CLIP_DIR, "_staging");
  await fs.mkdir(stagingDir, { recursive: true });

  let dev: DevServer | null = null;
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  try {
    dev = await startDevServer();

    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled"],
    });

    context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      recordVideo: {
        dir: stagingDir,
        size: VIEWPORT,
      },
    });
    const page = await context.newPage();
    page.on("pageerror", (err) => {
      // eslint-disable-next-line no-console
      console.warn(`[tour] page error:`, err.message);
    });

    // Anchor markers at "now" — the BrowserContext open above is the
    // earliest moment Playwright considers part of the recording.
    // A tiny drift (tens of ms) between this Date.now() and the
    // first WebM frame is unavoidable but harmless for the cuts we
    // make (which have multi-second tolerances).
    const markers = new Markers(Date.now());

    let tourError: unknown = null;
    try {
      // eslint-disable-next-line no-console
      console.log(`[tour] start`);
      await runTour(page, markers);
      // eslint-disable-next-line no-console
      console.log(`[tour] done`);
    } catch (err) {
      tourError = err;
      // eslint-disable-next-line no-console
      console.warn(
        `[tour] error (raw clip will still be saved):`,
        err instanceof Error ? err.message : String(err),
      );
    }

    const video = page.video();
    await context.close();
    context = null;

    if (!video) {
      throw new Error(`[record] no video recorded`);
    }
    const rawPath = path.join(CLIP_DIR, RAW_FILENAME);
    await video.saveAs(rawPath);

    const markersPath = path.join(CLIP_DIR, MARKERS_FILENAME);
    await markers.writeJson(markersPath);

    await fs.rm(stagingDir, { recursive: true, force: true });

    // eslint-disable-next-line no-console
    console.log(`[record] wrote:`);
    // eslint-disable-next-line no-console
    console.log(`  - ${rawPath}`);
    // eslint-disable-next-line no-console
    console.log(`  - ${markersPath}`);

    if (tourError) {
      // Don't crash the recorder — the editor will run with whatever
      // markers were captured. But surface the failure clearly.
      // eslint-disable-next-line no-console
      console.warn(`[record] tour reported an error; partial clip saved.`);
    }
  } finally {
    if (context) {
      await context.close().catch(() => undefined);
    }
    if (browser) {
      await browser.close().catch(() => undefined);
    }
    if (dev) {
      await dev.stop().catch(() => undefined);
    }
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[record] failed:", err);
  process.exit(1);
});
