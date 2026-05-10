// Single source of truth for recording knobs. Tweak here rather than
// chasing magic numbers across the scene scripts.

import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolve paths relative to demo/ regardless of where the script is invoked.
const __filename = fileURLToPath(import.meta.url);
const DEMO_ROOT = path.resolve(path.dirname(__filename), "..");

// Full HD @ 60 fps. The browser viewport == recorded video resolution,
// so the page renders at exactly the size we capture (no scaling,
// no letterboxing). 1080p@60 is a sweet spot — crisp on any modern
// display, smooth motion for the zooms/scrolls, and Chromium's
// software encoder keeps up without burning a lot of wall-clock.
export const VIEWPORT = { width: 1920, height: 1080 } as const;
export const FPS = 60;

export const DEV_PORT = 3100; // off-default so we don't fight a dev server you may already have running
export const DEV_URL = `http://localhost:${DEV_PORT}`;

// Folders are gitignored; we mkdir -p them in record.ts/edit.ts on startup.
export const CLIP_DIR = path.join(DEMO_ROOT, "clips");
export const OUTPUT_DIR = path.join(DEMO_ROOT, "output");
export const OUTPUT_FILE = path.join(OUTPUT_DIR, "caselogic-demo.mp4");

// Frontend root, used by devServer.ts to spawn `next dev` with the right cwd.
export const FRONTEND_DIR = path.resolve(DEMO_ROOT, "..", "frontend");
