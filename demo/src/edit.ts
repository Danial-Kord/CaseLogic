// Edit pass — consumes raw.webm + markers.json + timeline.ts.
//
// Pipeline:
//   1. Read markers.json. Look up each GAP_CAP's `from`/`to` markers.
//      For any gap whose duration exceeds `maxSec`, schedule a CUT
//      that elides the middle (keeps `maxSec/2` of head + `maxSec/2`
//      of tail, so overlays on either side of the wait survive).
//   2. Compose keep-ranges by subtracting all CUTs from the full
//      raw video duration. Optionally apply HEAD_TRIM_SEC/TAIL_TRIM_SEC.
//   3. Render with ffmpeg-static using a `select=between(t,A,B)+...`
//      filter plus `setpts=N/FRAME_RATE/TB` to reset timestamps so the
//      keep-ranges concatenate seamlessly without re-encode artefacts.
//
// Output: demo/output/caselogic-demo.mp4

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import ffmpegStaticDefault from "ffmpeg-static";
import { CLIP_DIR, FPS, OUTPUT_DIR, OUTPUT_FILE, VIEWPORT } from "./config.js";
import { Markers, type Marker } from "./markers.js";
import {
  GAP_CAPS,
  HEAD_TRIM_SEC,
  TAIL_TRIM_SEC,
  type GapCap,
} from "./timeline.js";

const FFMPEG: string = (() => {
  const raw = ffmpegStaticDefault as unknown;
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && "default" in raw) {
    const v = (raw as { default: unknown }).default;
    if (typeof v === "string") return v;
  }
  throw new Error("ffmpeg-static did not return a binary path");
})();

const RAW_FILENAME = "raw.webm";
const MARKERS_FILENAME = "markers.json";

interface KeepRange {
  start: number;
  end: number;
}

async function runFfmpeg(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}\n${stderr.slice(-2000)}`));
    });
    child.on("error", reject);
  });
}

async function probeDurationSec(file: string): Promise<number> {
  const stderr = await new Promise<string>((resolve, reject) => {
    const child = spawn(FFMPEG, ["-i", file], { stdio: ["ignore", "ignore", "pipe"] });
    let buf = "";
    child.stderr.on("data", (c: Buffer) => {
      buf += c.toString();
    });
    child.on("close", () => resolve(buf));
    child.on("error", reject);
  });
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) throw new Error(`couldn't parse duration of ${file}`);
  const h = parseInt(m[1] ?? "0", 10);
  const mn = parseInt(m[2] ?? "0", 10);
  const s = parseFloat(m[3] ?? "0");
  return h * 3600 + mn * 60 + s;
}

/** Find the (latest) marker with the given name. Returns null if missing. */
function findMarker(items: Marker[], name: string): Marker | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const m = items[i];
    if (m && m.name === name) return m;
  }
  return null;
}

/**
 * Compute cut ranges (segments to REMOVE) from the gap caps.
 * For a gap from t1 to t2 with maxSec=M:
 *   if (t2 - t1) <= M: no cut.
 *   else: keep first M/2 after t1 and last M/2 before t2; remove the
 *         interior. The CUT range is [t1 + M/2, t2 - M/2].
 */
function computeCuts(items: Marker[], caps: GapCap[]): { start: number; end: number }[] {
  const cuts: { start: number; end: number }[] = [];
  for (const cap of caps) {
    const a = findMarker(items, cap.from);
    const b = findMarker(items, cap.to);
    if (!a || !b) {
      // eslint-disable-next-line no-console
      console.warn(
        `[edit] skipping cap (markers missing): ${cap.from} -> ${cap.to}`,
      );
      continue;
    }
    if (b.t <= a.t) continue;
    const gap = b.t - a.t;
    if (gap <= cap.maxSec) continue;
    const head = cap.maxSec / 2;
    const tail = cap.maxSec / 2;
    cuts.push({ start: a.t + head, end: b.t - tail });
    // eslint-disable-next-line no-console
    console.log(
      `[edit] cut: ${cap.from} -> ${cap.to} | gap=${gap.toFixed(2)}s, max=${cap.maxSec}s, removing ${(gap - cap.maxSec).toFixed(2)}s`,
    );
  }
  return cuts;
}

/** Subtract cuts from [0, totalDuration] to get keep ranges. */
function computeKeepRanges(
  totalDurationSec: number,
  cuts: { start: number; end: number }[],
  headTrim: number | null,
  tailTrim: number | null,
): KeepRange[] {
  let start = headTrim ?? 0;
  const end = totalDurationSec - (tailTrim ?? 0);
  if (start >= end) return [];

  const sorted = [...cuts].sort((x, y) => x.start - y.start);
  const ranges: KeepRange[] = [];
  for (const c of sorted) {
    const cs = Math.max(c.start, start);
    const ce = Math.min(c.end, end);
    if (ce <= cs) continue;
    if (cs > start) ranges.push({ start, end: cs });
    start = ce;
  }
  if (start < end) ranges.push({ start, end });
  // Drop sub-frame slivers.
  return ranges.filter((r) => r.end - r.start > 1 / FPS);
}

/**
 * Build an ffmpeg `select=` expression that picks frames inside any
 * keep range, then resets PTS so segments concatenate seamlessly.
 *
 *   select='between(t,A0,B0)+between(t,A1,B1)+...',setpts=N/FRAME_RATE/TB
 */
function buildSelectFilter(ranges: KeepRange[]): string {
  if (ranges.length === 0) {
    throw new Error("[edit] no keep ranges — refusing to render empty video");
  }
  const expr = ranges
    .map((r) => `between(t,${r.start.toFixed(3)},${r.end.toFixed(3)})`)
    .join("+");
  return `select='${expr}',setpts=N/FRAME_RATE/TB,fps=${FPS},scale=${VIEWPORT.width}:${VIEWPORT.height}:force_original_aspect_ratio=decrease,pad=${VIEWPORT.width}:${VIEWPORT.height}:(ow-iw)/2:(oh-ih)/2`;
}

async function main(): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const rawPath = path.join(CLIP_DIR, RAW_FILENAME);
  const markersPath = path.join(CLIP_DIR, MARKERS_FILENAME);
  for (const p of [rawPath, markersPath]) {
    try {
      await fs.access(p);
    } catch {
      throw new Error(`[edit] missing ${p} — run \`npm run record\` first`);
    }
  }

  const { items } = await Markers.readJson(markersPath);
  const totalDurationSec = await probeDurationSec(rawPath);

  // eslint-disable-next-line no-console
  console.log(
    `[edit] raw=${rawPath} duration=${totalDurationSec.toFixed(2)}s markers=${items.length}`,
  );

  const cuts = computeCuts(items, GAP_CAPS);
  const keep = computeKeepRanges(totalDurationSec, cuts, HEAD_TRIM_SEC, TAIL_TRIM_SEC);
  const keepDuration = keep.reduce((acc, r) => acc + (r.end - r.start), 0);

  // eslint-disable-next-line no-console
  console.log(
    `[edit] keep ranges: ${keep.length}, total kept: ${keepDuration.toFixed(2)}s (saved ${(totalDurationSec - keepDuration).toFixed(2)}s)`,
  );

  const filter = buildSelectFilter(keep);

  await runFfmpeg([
    "-y",
    "-i",
    rawPath,
    "-vf",
    filter,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-an",
    OUTPUT_FILE,
  ]);

  // eslint-disable-next-line no-console
  console.log(`[edit] wrote ${OUTPUT_FILE}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[edit] failed:", err);
  process.exit(1);
});
