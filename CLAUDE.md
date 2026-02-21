# Beta Compare — Claude Context

Side-by-side bouldering video comparison PWA. Videos are synced by **route progress** (hip-Y curve from MediaPipe pose) not wall-clock time. Fully client-side, no backend.

## Stack
- React 18 + TypeScript, Vite 5, Tailwind CSS
- `@mediapipe/tasks-vision@0.10.14` (Tasks API)
- `idb@8` IndexedDB persistence
- `zustand@4.5.4` + immer middleware
- `vite-plugin-pwa@0.20.1`

## File Map
```
src/
  App.tsx                  — screen router (import / processing / player)
  types/index.ts           — all shared types + worker message protocol
  store/appStore.ts        — Zustand store; addAttempt is an UPSERT
  lib/
    db.ts                  — IDB: attempts store + blobs store (ArrayBuffer)
    progressCurve.ts       — extract → interpolate → smooth → normalize → query
    syncLogic.ts           — SyncController rAF loop + blendedTimeFromMarkers
  components/
    ImportScreen.tsx       — library, file picker (<label> wrapping <input>), pair selector
    ProcessingScreen.tsx   — frame extraction + pose detection on main thread
    PlayerScreen.tsx       — orchestrates videos, SyncController, controls
    VideoPanel.tsx         — single <video> + sparkline strip
    SparklineChart.tsx     — SVG progress curve with low-confidence shading
    SyncMarkers.tsx        — marker list + "Mark Here" button (max 8)
    Controls.tsx           — play/pause, speed, scrubber, swap
  workers/
    poseWorker.ts          — KEPT BUT UNUSED (see gotcha #3 below)
public/
  pose_landmarker_lite.task — 5.5 MB model, served statically
  wasm/                    — 4 MediaPipe WASM files copied from node_modules
  _headers                 — Netlify COOP/COEP headers
```

## Architecture Decisions

### MediaPipe runs on the main thread
The worker (`poseWorker.ts`) exists but is unused. MediaPipe's Emscripten WASM loader calls `importScripts()` internally, which is blocked in module workers. In Vite dev mode there is no workaround — Vite only bundles workers as IIFE in production. Main-thread processing is the reliable cross-env solution.

### Module-level landmarker singleton
`ProcessingScreen.tsx` uses a module-level `_landmarkerPromise` (not a component ref) because MediaPipe's WASM runtime is itself a singleton — re-initialising it on component remount causes silent failures on the second video.

### COEP: credentialless (not require-corp)
`require-corp` blocks jsDelivr and other CDNs that don't set `CORP: cross-origin`. `credentialless` still enables cross-origin isolation (required for SharedArrayBuffer) while allowing third-party resources. Set in `vite.config.ts` for dev/preview and `public/_headers` for Netlify production.

### WASM served locally
Files in `public/wasm/` are copied from `node_modules/@mediapipe/tasks-vision/wasm/`. This avoids any CDN CORS/COEP issues. `FilesetResolver.forVisionTasks()` is pointed at `${window.location.origin}/wasm`.

### addAttempt is an upsert
`ImportScreen` adds a stub record before processing; `ProcessingScreen` calls `addAttempt` again with the completed curve. If it were a push instead of upsert it would duplicate.

### Player layout is always flex-row
Side-by-side always, no portrait stacking. `h-dvh` (not `h-screen`) for iOS Safari toolbar.

### Scrubber fallback
If `progressCurve` is empty, scrubber falls back to `progress × duration` (wall-clock seek).

## Key Gotchas
1. **IMAGE mode, not VIDEO** — VIDEO mode requires monotonic timestamps; seek-based extraction breaks it.
2. **Transfer ImageBitmap** — if you re-enable the worker, always pass transfer list: `postMessage(msg, [msg.bitmap])`.
3. **`seeked` event, not setTimeout** — never issue next seek until `seeked` fires; queued seeks lose frames.
4. **`fastSeek()` feature detect** — use `(video as object)` for the `in` check to avoid TypeScript narrowing `video` to `never`.
5. **iOS autoplay** — `play()` must be called in a direct user-event handler, not a Promise chain.
6. **Blob URL cleanup** — always `URL.revokeObjectURL()` in cleanup to avoid memory leaks.
7. **immer sub-path** — `import { immer } from 'zustand/middleware/immer'` not `'zustand/middleware'`.
8. **React StrictMode** — double-invocation can cause two concurrent processing runs; `abortRef` guards against this.

## Processing Pipeline (ProcessingScreen.tsx)
```
loadedmetadata → totalFrames = ceil(duration × FPS/FRAME_STEP)   [FPS=10, FRAME_STEP=3]
for each frame:
  video.currentTime = t → await seeked
  ctx.drawImage(video, canvas)
  landmarker.detect(canvas)          ← synchronous, blocks ~50-200ms
  pickClimber(landmarks)             ← pick highest pose, filter belayer (avgY > 0.75)
  results.push(...)
  incrementProcessed()
  await setTimeout(0)                ← yield to browser for repaint
buildProgressCurve(results) → updateAttemptRecord → goToImport
```

## Progress Curve Pipeline (lib/progressCurve.ts)
1. `extractHipProgress` — hip midpoint Y, inverted (`1 - y`)
2. `interpolateGaps` — linear interp through zero-confidence frames
3. `applyMovingAverage` — centred window=15, smooths progress only
4. `normalizeProgressCurve` — rescale to [0,1] using detected frames only
5. `buildProgressCurve` — convenience wrapper for steps 1–4

Query: `progressAtTime` (binary search + lerp), `timeAtProgress` (forward search from hint)

## Sync Logic (lib/syncLogic.ts)
- `SyncController` rAF loop: reads leader.currentTime → `progressAtTime` → `blendedTimeFromMarkers` → `seekVideo(follower)`
- Follower is always paused, only seeked. Only leader plays/pauses.
- `blendedTimeFromMarkers`: piecewise-linear within marker range, auto-curve outside.
- `seekVideo`: `fastSeek()` if available, skip if within 33ms threshold.

## Deploy
- **Netlify** — `netlify deploy --prod --dir dist` (CLI) or connect GitHub repo in Netlify UI
- `public/_headers` sets COOP/COEP for production automatically
- Large files (model + WASM, ~24 MB) are not precached by service worker but are served and browser-cached

## Current Known Issues / Next Work
- [ ] Processing blocks main thread — consider OffscreenCanvas + worker for production builds only
- [ ] No rename UI for attempts
- [ ] Sparkline cursor not implemented
- [ ] No scrubber thumb sync during playback (DOM update via ref needed)
