// Spawn `next dev` on a non-default port so the recorder doesn't
// fight a dev server you may already have running. The frontend talks
// to the live backend (NEXT_PUBLIC_API_URL, default http://localhost:8000)
// — start the backend before running the demo. Readiness is checked
// by polling the root URL until we get any HTTP response (Next
// responds with 200 on /, even before the page hydrates).
//
// Teardown on Windows requires `taskkill /T /F` because `npm` spawns
// `node`, and a plain `child.kill()` only kills the npm wrapper. The
// detached + tree-kill pattern below mirrors what playwright-test uses
// internally for the dev-server fixture.

import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { DEV_PORT, DEV_URL, FRONTEND_DIR } from "./config.js";

export interface DevServer {
  /** Force-kill the spawned process tree. Idempotent. */
  stop: () => Promise<void>;
}

const READY_TIMEOUT_MS = 90_000; // first `next dev` cold start can be slow on Windows

/**
 * Start the Next.js dev server in mock mode and wait until it responds.
 * Resolves to a handle exposing a `stop()` for clean teardown.
 */
export async function startDevServer(): Promise<DevServer> {
  // eslint-disable-next-line no-console
  console.log(`[dev] starting next dev on port ${DEV_PORT}\u2026`);

  // Node >= 20 refuses to spawn .cmd/.bat directly without shell:true
  // (CVE-2024-27980 hardening). On Windows we route through cmd.exe;
  // on POSIX we keep the simple direct spawn.
  const isWin = process.platform === "win32";
  const child: ChildProcess = spawn(
    isWin ? "npm.cmd" : "npm",
    ["run", "dev", "--", "--port", String(DEV_PORT)],
    {
      cwd: FRONTEND_DIR,
      env: {
        ...process.env,
        // Live backend — make sure the API server is running on
        // NEXT_PUBLIC_API_URL (default http://localhost:8000) before
        // kicking off the recorder.
        NEXT_PUBLIC_MOCK_MODE: "false",
        // Some terminals try to open the browser; suppress for headless runs.
        BROWSER: "none",
      },
      // Detached on POSIX puts the spawned tree on its own pgid so we can
      // kill -SIGTERM <-pgid>. On Windows we kill via taskkill /T anyway.
      detached: !isWin,
      stdio: ["ignore", "pipe", "pipe"],
      shell: isWin,
    },
  );

  // Surface dev-server stderr if it dies early; otherwise keep stdout quiet.
  child.stdout?.on("data", (chunk: Buffer) => {
    const line = chunk.toString();
    if (line.includes("ready") || line.includes("Ready")) {
      // eslint-disable-next-line no-console
      console.log(`[dev] ${line.trim().slice(0, 120)}`);
    }
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    if (/error/i.test(text)) {
      // eslint-disable-next-line no-console
      console.error(`[dev] ${text.trim()}`);
    }
  });

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    if (child.pid === undefined || child.exitCode !== null) return;
    if (process.platform === "win32") {
      await new Promise<void>((resolve) => {
        const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
        });
        killer.on("close", () => resolve());
        killer.on("error", () => resolve());
      });
    } else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // process already exited
      }
    }
  };

  // If the dev server dies on its own, the next readiness probe will fail
  // out with a clear error rather than hanging.
  child.on("exit", (code) => {
    if (!stopped) {
      // eslint-disable-next-line no-console
      console.warn(`[dev] dev server exited unexpectedly (code=${code})`);
    }
  });

  try {
    await waitForReady();
  } catch (err) {
    await stop();
    throw err;
  }

  return { stop };
}

async function waitForReady(): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastErr: unknown = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(DEV_URL, { method: "GET" });
      if (res.ok || res.status === 200 || res.status === 304) {
        // eslint-disable-next-line no-console
        console.log(`[dev] ready at ${DEV_URL}`);
        return;
      }
    } catch (err) {
      lastErr = err;
    }
    await sleep(500);
  }
  throw new Error(
    `[dev] timed out waiting for ${DEV_URL}: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  );
}
