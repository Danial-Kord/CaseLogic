# CaseLogic demo recorder

Automated demo video pipeline for the CaseLogic frontend. Boots the
Next.js app against the live backend, scripts a tour with Playwright,
and stitches the clips into a single mp4 with `ffmpeg-static`.

Output: `demo/output/caselogic-demo.mp4` (~60–90 s, 1280×800 @ 30 fps).

## Quick start

```powershell
# 1. Make sure the backend API is running on http://localhost:8000
#    (set NEXT_PUBLIC_API_URL in your env to point elsewhere).
#    See backend/README.md for how to start it.

# 2. Run the demo:
cd demo
npm install
# First run only: download the bundled Chromium build.
npm run browsers
npm run demo
```

The `demo` script runs `record` (boots the dev server, captures one
continuous raw clip + a markers JSON into `demo/clips/`) and then
`edit` (trims long LLM waits per `src/timeline.ts` and renders the
final mp4 in `demo/output/`).

You can re-edit at any time without re-recording — `npm run edit`
reuses `demo/clips/raw.webm` + `markers.json`.

```powershell
npm run record   # produces demo/clips/raw.webm + markers.json
npm run edit     # reads clips/, writes demo/output/caselogic-demo.mp4
```

## How it works

```
demo/
  src/
    record.ts        # spawns dev server, runs the tour, writes raw.webm + markers.json
    edit.ts          # ffmpeg-static select+setpts cuts using markers and timeline
    devServer.ts     # spawn `next dev`, readiness probe, Windows kill
    overlay.ts       # injects animated text overlays into the page
    zoom.ts          # CSS-transform-based zoom helper
    markers.ts       # named-timestamp tracker (recorder writes JSON, editor reads)
    timeline.ts      # declarative gap caps used by edit.ts
    config.ts        # viewport, fps, port, paths
    scenes/
      tour.ts        # single continuous tour: landing → research → plans
  clips/             # raw.webm + markers.json (gitignored)
  output/            # final mp4 (gitignored)
```

Overlays are baked into the recording by appending styled `<div>`s into
the page. Zooms apply a CSS transform to `<html>`. Both render natively
in the captured WebM, so `ffmpeg`'s only job is to skip past the dead
air between marker pairs — no `drawtext` or `zoompan` filters needed.

The dev server is launched on port **3100** (set in `config.ts`) so the
recorder doesn't collide with a dev server you might already have
running on the default port 3000.

### Tuning pacing

Open `src/timeline.ts`. Each `GAP_CAP` says "between marker A and
marker B, allow at most `maxSec` of recording — drop the middle".
Lower `maxSec` for a snappier video, higher for more breathing room.
Marker names available are listed in `src/scenes/tour.ts` (every
`markers.add(...)` call).

## Live backend

The recorder spawns the frontend with `NEXT_PUBLIC_MOCK_MODE=false`,
so it talks to the real backend at `NEXT_PUBLIC_API_URL` (default
`http://localhost:8000`). Start the backend before running the demo
— if the API is offline, retrieval and chat will surface errors in
the recording.

To switch back to the canned mock data (no backend needed), set
`NEXT_PUBLIC_MOCK_MODE: "true"` in `src/devServer.ts`.

## Troubleshooting

- **First run is slow.** `next dev` cold start can take 60+ s on
  Windows. The recorder polls for up to 90 s before giving up.
- **Selectors didn't match.** Check that the i18n strings in
  `frontend/lib/i18n/en.ts` haven't drifted. Most scene clicks use
  `getByRole({ name })` against accessible labels.
- **Dev server didn't shut down.** On Windows, the recorder uses
  `taskkill /T /F` to kill the spawned tree. If a stray Node process
  stays alive, kill it manually with `taskkill /F /IM node.exe` (or
  by PID via Task Manager).
- **Output mp4 is too dark / wrong colors.** The page transform we
  apply during zoom uses `<html>` as the host. If a custom theme
  applies its own transform there it would collide; check the
  `ThemeToggle` and bookmark UI changes.

## Out of scope

- Voiceover / TTS.
- Audio bed (silent video; trivial to add later via `-i music.mp3
  ...amix`).
- macOS / Linux polish — the `taskkill` shutdown path is Windows-only.
- CI integration. Run manually before each demo.
