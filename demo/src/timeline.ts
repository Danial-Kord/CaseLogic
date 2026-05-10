// Declarative edit timeline.
//
// The recorder writes a single raw.webm + markers.json. The editor
// uses this config to trim the parts of the recording where the page
// just sat there waiting for an LLM. Each entry says: "between marker
// FROM and marker TO, keep at most MAX_SEC of the recording — drop
// everything in the middle".
//
// Everything outside the listed gaps is kept verbatim, so the brand
// overlays/zooms baked into the recording survive untouched.
//
// Tweak the `maxSec` numbers to dial pacing; add new entries to
// trim other slow stretches.

export interface GapCap {
  /** Marker name where the wait begins (must match a name in markers.json). */
  from: string;
  /** Marker name where the wait ends. */
  to: string;
  /** Maximum allowed duration in seconds for the gap, inclusive of head/tail
   *  context kept on each side of the cut. Smaller = punchier video. */
  maxSec: number;
}

export const GAP_CAPS: GapCap[] = [
  // Research: NO cap on the LLM turn — the thinking/verifier trace
  // is part of the demo, so we let the viewer watch it stream in
  // real time. Re-add an entry here if a particular run is too slow.

  // Planning: each sub-agent is 5–25 s. Cap each step's wait so the
  // three "Step N" overlays pace evenly.
  { from: "plans:generate_clicked", to: "plans:related_done", maxSec: 6 },
  { from: "plans:related_done", to: "plans:contacts_done", maxSec: 6 },
  { from: "plans:contacts_done", to: "plans:brief_done", maxSec: 6 },
];

// Optional fixed head/tail trim. Useful if you want to shave a half-
// second of "Chromium painting white" before the first frame, or a
// trailing blip after the last marker. Set to null to disable.
export const HEAD_TRIM_SEC: number | null = null;
export const TAIL_TRIM_SEC: number | null = null;
