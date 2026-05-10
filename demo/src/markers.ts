// Timestamp tracker. The tour scripts call `markers.add("name")` at
// each beat (button click, modal open, section done, …). The recorder
// then writes `markers.json` next to the raw WebM so the edit pass
// knows where to cut.
//
// Times are in seconds, relative to the moment recording started
// (i.e. the BrowserContext was opened). We assume the recorder calls
// `new Markers()` at the same instant the WebM begins.
//
// File format (markers.json):
//   {
//     "startedAt": "2026-05-10T05:30:00.000Z",
//     "items": [
//       { "t": 0.12, "name": "landing:start" },
//       { "t": 9.83, "name": "landing:dark_clicked" },
//       ...
//     ]
//   }

import fs from "node:fs/promises";

export interface Marker {
  t: number;
  name: string;
}

export class Markers {
  private startedAtMs: number;
  private items: Marker[] = [];

  constructor(startedAtMs: number = Date.now()) {
    this.startedAtMs = startedAtMs;
  }

  /** Record a named beat. `t` is computed against the instance's start. */
  add(name: string): void {
    const t = (Date.now() - this.startedAtMs) / 1000;
    this.items.push({ t, name });
    // eslint-disable-next-line no-console
    console.log(`  [marker] +${t.toFixed(2)}s ${name}`);
  }

  list(): readonly Marker[] {
    return this.items;
  }

  /** Persist to disk as JSON. */
  async writeJson(filePath: string): Promise<void> {
    const payload = {
      startedAt: new Date(this.startedAtMs).toISOString(),
      items: this.items,
    };
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  }

  /** Load a marker file written by `writeJson`. */
  static async readJson(
    filePath: string,
  ): Promise<{ startedAt: string; items: Marker[] }> {
    const buf = await fs.readFile(filePath, "utf8");
    return JSON.parse(buf) as { startedAt: string; items: Marker[] };
  }
}
