import type { ProgressPoint, SyncMarker } from '../types';
import { progressAtTime, timeAtProgress } from './progressCurve';

// ─── Seek helper ─────────────────────────────────────────────────────────────

const SEEK_THRESHOLD_MS = 33; // ~1 frame at 30fps

type VideoWithFastSeek = HTMLVideoElement & { fastSeek(t: number): void };

export function seekVideo(video: HTMLVideoElement, targetSeconds: number): void {
  const diffMs = Math.abs(video.currentTime - targetSeconds) * 1000;
  if (diffMs < SEEK_THRESHOLD_MS) return; // already close enough
  if ('fastSeek' in (video as object)) {
    (video as VideoWithFastSeek).fastSeek(targetSeconds);
  } else {
    video.currentTime = targetSeconds;
  }
}

// ─── Blended time lookup ─────────────────────────────────────────────────────

/**
 * Given a target progress (0–1) and optional sync markers, returns the time (ms)
 * in the follower video. When inside a marker span, uses piecewise-linear mapping
 * of the manual annotation; outside falls back to the auto progress curve.
 */
export function blendedTimeAtProgress(
  followerCurve: ProgressPoint[],
  targetProgress: number,
  syncMarkers: SyncMarker[],
  searchFromMs: number
): number {
  if (syncMarkers.length >= 2) {
    // Build sorted marker list by progress of videoA (leader assumed A here;
    // caller resolves which is leader before passing followerCurve).
    // Markers are stored as {videoATime, videoBTime} — caller maps to
    // {leaderProgress, followerMs} before invoking this function.
    // This function receives pre-sorted markers as {leaderProgress, followerMs}.
    // (See SyncController.update for the mapping.)
  }
  return timeAtProgress(followerCurve, targetProgress, searchFromMs);
}

/** Called by SyncController with already-resolved marker pairs. */
export function blendedTimeFromMarkers(
  followerCurve: ProgressPoint[],
  targetProgress: number,
  sortedMarkers: Array<{ leaderProgress: number; followerMs: number }>,
  searchFromMs: number
): number {
  if (sortedMarkers.length >= 2) {
    const first = sortedMarkers[0];
    const last = sortedMarkers[sortedMarkers.length - 1];

    if (
      targetProgress >= first.leaderProgress &&
      targetProgress <= last.leaderProgress
    ) {
      // Find bounding markers
      let lo = 0, hi = sortedMarkers.length - 1;
      for (let i = 0; i < sortedMarkers.length - 1; i++) {
        if (
          sortedMarkers[i].leaderProgress <= targetProgress &&
          sortedMarkers[i + 1].leaderProgress >= targetProgress
        ) {
          lo = i; hi = i + 1; break;
        }
      }
      const a = sortedMarkers[lo], b = sortedMarkers[hi];
      const span = b.leaderProgress - a.leaderProgress;
      if (span < 1e-6) return a.followerMs;
      const t = (targetProgress - a.leaderProgress) / span;
      return a.followerMs + t * (b.followerMs - a.followerMs);
    }
  }
  return timeAtProgress(followerCurve, targetProgress, searchFromMs);
}

// ─── SyncController ──────────────────────────────────────────────────────────

export class SyncController {
  private rafId: number | null = null;
  private leader: HTMLVideoElement | null = null;
  private follower: HTMLVideoElement | null = null;
  private leaderCurve: ProgressPoint[] = [];
  private followerCurve: ProgressPoint[] = [];
  private syncMarkers: SyncMarker[] = [];
  private leaderRole: 'A' | 'B' = 'A';
  private lastFollowerSearchMs = 0;
  private onProgressUpdate: ((progress: number) => void) | null = null;

  configure(params: {
    leader: HTMLVideoElement;
    follower: HTMLVideoElement;
    leaderCurve: ProgressPoint[];
    followerCurve: ProgressPoint[];
    syncMarkers: SyncMarker[];
    leaderRole: 'A' | 'B';
    onProgressUpdate?: (progress: number) => void;
  }): void {
    this.leader = params.leader;
    this.follower = params.follower;
    this.leaderCurve = params.leaderCurve;
    this.followerCurve = params.followerCurve;
    this.syncMarkers = params.syncMarkers;
    this.leaderRole = params.leaderRole;
    this.onProgressUpdate = params.onProgressUpdate ?? null;
    this.lastFollowerSearchMs = 0;
  }

  start(): void {
    if (this.rafId !== null) return;
    this.scheduleUpdate();
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private scheduleUpdate(): void {
    this.rafId = requestAnimationFrame(() => {
      this.update();
      if (this.rafId !== null) this.scheduleUpdate();
    });
  }

  private update(): void {
    if (!this.leader || !this.follower) return;

    const leaderMs = this.leader.currentTime * 1000;
    const progress = progressAtTime(this.leaderCurve, leaderMs);

    this.onProgressUpdate?.(progress);

    // Build marker pairs with roles resolved
    const sortedMarkers = this.resolveSortedMarkers(progress);

    const followerMs = blendedTimeFromMarkers(
      this.followerCurve,
      progress,
      sortedMarkers,
      this.lastFollowerSearchMs
    );

    // Update search hint for next frame
    this.lastFollowerSearchMs = Math.max(0, followerMs - 200);

    seekVideo(this.follower, followerMs / 1000);
  }

  private resolveSortedMarkers(
    _currentProgress: number
  ): Array<{ leaderProgress: number; followerMs: number }> {
    if (this.syncMarkers.length < 2) return [];

    return this.syncMarkers
      .map(m => {
        const leaderTimeS = this.leaderRole === 'A' ? m.videoATime : m.videoBTime;
        const followerTimeS = this.leaderRole === 'A' ? m.videoBTime : m.videoATime;
        const leaderMs = leaderTimeS * 1000;
        const followerMs = followerTimeS * 1000;
        return {
          leaderProgress: progressAtTime(this.leaderCurve, leaderMs),
          followerMs
        };
      })
      .sort((a, b) => a.leaderProgress - b.leaderProgress);
  }

  /** Force a single sync tick (used when scrubber moves while paused). */
  syncOnce(): void {
    this.lastFollowerSearchMs = 0; // reset hint so backward scrub finds the right segment
    this.update();
  }
}
