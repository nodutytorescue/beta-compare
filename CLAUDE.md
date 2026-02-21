# Beta Compare — Project Context

## What it is
A mobile-first PWA for side-by-side bouldering video comparison. Two climbing attempts are shown together so a climber can compare moments without holding one in memory while watching the other.

## Live / Dev
- **Repo:** github.com/nodutytorescue/beta-compare
- **Live:** nodutytorescue.github.io/beta-compare (auto-deploys on push to main via GitHub Actions)
- **Dev:** `npm run dev` in `/Users/bwo/beta-compare` → localhost:5173

## Tech Stack
- React 18 + TypeScript, Vite 5, Tailwind CSS
- `idb@8` for IndexedDB (stores video ArrayBuffers + AttemptRecord metadata)
- `zustand@4.5.4` + immer for state
- No backend, no pose detection, no MediaPipe — fully client-side

## Current Flow
1. **Import** — pick a video file from Photos/Files, stored as ArrayBuffer in IndexedDB
2. **Trim** — scrub to mark start/end of climbing portion, saves trimStart/trimEnd/duration
3. **Library** — shows all trimmed attempts, select two to compare
4. **Player** — side-by-side videos, each with independent scrubber, master play/pause button

## File Structure
```
src/
  App.tsx                  — screen router (import | trim | player)
  types/index.ts           — AttemptRecord, TrimState, ComparisonState, Screen
  store/appStore.ts        — Zustand store, navigation actions
  lib/db.ts                — IndexedDB: saveAttempt, getBlobUrl, updateAttemptRecord, deleteAttempt
  components/
    ImportScreen.tsx       — library list, file picker, pair selector
    TrimScreen.tsx         — scrubber + Set Start/End + Done, saves to db+store
    PlayerScreen.tsx       — holds videoARef/videoBRef, master play/pause, isPlaying state
    VideoPanel.tsx         — forwardRef, self-contained scrubber, onTrimEnd callback
```

## Key Types
```typescript
interface AttemptRecord {
  id: string;
  name: string;
  blobKey: string;
  mimeType: string;    // preserve original (video/quicktime for iPhone .mov)
  duration: number;
  trimStart: number;
  trimEnd: number;
  createdAt: number;
}
```

## Important iOS Gotchas
1. **MIME type** — iPhone videos are `video/quicktime` (.mov). Always use `file.type` on import, store it, and pass it to `getBlobUrl`. Hardcoding `video/mp4` breaks iOS playback.
2. **Frame rendering unlock** — iOS won't show any video frame without a play gesture. In TrimScreen, the first scrub calls `play()` → `pause()` → `seek()` to unlock frame rendering. Tracked with `unlockedRef`.
3. **VideoPanel** — uses `forwardRef<HTMLVideoElement>` so PlayerScreen can control play/pause directly on the video element.
4. **`playsInline` + `muted`** — both required on every `<video>` element or iOS will go fullscreen / block autoplay.

## What's Next — Sync Markers
The main remaining feature. Goal: make the shared scrubber route-aware instead of time-aware.

**Design:**
- User scrubs each video independently to find an equivalent moment (e.g. both at the crux hold)
- Taps "Sync Here" → captures both current timestamps as a sync point `{ timeA, timeB }`
- Can add multiple sync points across the climb
- Master scrubber then moves both videos by interpolating between sync points
- Between two sync points, progress through A maps linearly to progress through B

**Why not automatic sync:** attempts can differ significantly — holds skipped, rest time varies, moves change. The user is the only reliable source of truth for what "equivalent" means.

## Deployment
Push to `main` → GitHub Actions builds and deploys to GitHub Pages automatically (~30s).
No Netlify, no PWA service worker — just a static Vite build.
`vite.config.ts` sets `base: '/beta-compare/'` when `GITHUB_ACTIONS` env var is present.
