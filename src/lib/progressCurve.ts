import type { ProgressPoint } from '../types';

// ─── Step 1: Extract hip progress from raw frame results ────────────────────

interface RawFrameResult {
  timestampMs: number;
  progress: number | null;   // null = no climber detected
  confidence: number;
}

export function extractHipProgress(frames: RawFrameResult[]): ProgressPoint[] {
  return frames.map(f => ({
    timestamp: f.timestampMs,
    // Invert: high Y on screen = low on route; null → 0 placeholder
    progress: f.progress !== null ? f.progress : 0,
    confidence: f.progress !== null ? f.confidence : 0
  }));
}

// ─── Step 2: Linear interpolation through zero-confidence gaps ──────────────

export function interpolateGaps(points: ProgressPoint[]): ProgressPoint[] {
  const result = [...points];
  let i = 0;
  while (i < result.length) {
    if (result[i].confidence === 0) {
      // Find bounds of the gap
      const gapStart = i;
      let gapEnd = i;
      while (gapEnd < result.length && result[gapEnd].confidence === 0) gapEnd++;

      const prev = gapStart > 0 ? result[gapStart - 1] : null;
      const next = gapEnd < result.length ? result[gapEnd] : null;

      for (let j = gapStart; j < gapEnd; j++) {
        let interpolated = 0;
        if (prev && next) {
          const t = (result[j].timestamp - prev.timestamp) / (next.timestamp - prev.timestamp);
          interpolated = prev.progress + t * (next.progress - prev.progress);
        } else if (prev) {
          interpolated = prev.progress;
        } else if (next) {
          interpolated = next.progress;
        }
        result[j] = { ...result[j], progress: interpolated };
        // keep confidence = 0 for visualization of the gap
      }
      i = gapEnd;
    } else {
      i++;
    }
  }
  return result;
}

// ─── Step 3: Centred moving average (smooths progress only) ─────────────────

export function applyMovingAverage(points: ProgressPoint[], window = 15): ProgressPoint[] {
  const half = Math.floor(window / 2);
  return points.map((p, i) => {
    const lo = Math.max(0, i - half);
    const hi = Math.min(points.length - 1, i + half);
    let sum = 0;
    let count = 0;
    for (let j = lo; j <= hi; j++) {
      sum += points[j].progress;
      count++;
    }
    return { ...p, progress: sum / count };
  });
}

// ─── Step 4: Normalize to [0, 1] using only detected frames ─────────────────

export function normalizeProgressCurve(points: ProgressPoint[]): ProgressPoint[] {
  const detected = points.filter(p => p.confidence > 0).map(p => p.progress);
  if (detected.length === 0) return points;
  const min = Math.min(...detected);
  const max = Math.max(...detected);
  if (max === min) return points.map(p => ({ ...p, progress: 0 }));
  return points.map(p => ({
    ...p,
    progress: (p.progress - min) / (max - min)
  }));
}

// ─── Convenience pipeline ────────────────────────────────────────────────────

/** Build a raw (unnormalized) progress curve. Normalize jointly at compare time. */
export function buildProgressCurve(
  frames: RawFrameResult[],
  smoothWindow = 15
): ProgressPoint[] {
  const sorted = [...frames].sort((a, b) => a.timestampMs - b.timestampMs);
  let curve = extractHipProgress(sorted);
  curve = interpolateGaps(curve);
  curve = applyMovingAverage(curve, smoothWindow);
  // No per-video normalization — curves stay in raw hip-Y space so both
  // videos share the same absolute scale for joint normalization at player time.
  return curve;
}

/**
 * Normalize two curves together using their shared min/max from detected frames.
 * Both curves end up on the same [0,1] scale:
 *   0 = lowest hip position across either attempt (start holds)
 *   1 = highest hip position across either attempt (top of route)
 */
export function normalizeJointCurves(
  curveA: ProgressPoint[],
  curveB: ProgressPoint[]
): [ProgressPoint[], ProgressPoint[]] {
  const detected = [
    ...curveA.filter(p => p.confidence > 0).map(p => p.progress),
    ...curveB.filter(p => p.confidence > 0).map(p => p.progress),
  ];
  if (detected.length === 0) return [curveA, curveB];
  const min = Math.min(...detected);
  const max = Math.max(...detected);
  if (max === min) return [curveA, curveB];
  const norm = (curve: ProgressPoint[]): ProgressPoint[] =>
    curve.map(p => ({ ...p, progress: (p.progress - min) / (max - min) }));
  return [norm(curveA), norm(curveB)];
}

// ─── Query helpers ───────────────────────────────────────────────────────────

/** Binary search + linear interpolation: timestamp (ms) → progress [0,1] */
export function progressAtTime(curve: ProgressPoint[], timestampMs: number): number {
  if (curve.length === 0) return 0;
  if (timestampMs <= curve[0].timestamp) return curve[0].progress;
  if (timestampMs >= curve[curve.length - 1].timestamp) return curve[curve.length - 1].progress;

  let lo = 0, hi = curve.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (curve[mid].timestamp <= timestampMs) lo = mid;
    else hi = mid;
  }
  const a = curve[lo], b = curve[hi];
  const t = (timestampMs - a.timestamp) / (b.timestamp - a.timestamp);
  return a.progress + t * (b.progress - a.progress);
}

/** Inverse lookup: progress → time (ms). Searches forward from searchFromMs, then backward if not found. */
export function timeAtProgress(
  curve: ProgressPoint[],
  targetProgress: number,
  searchFromMs = 0
): number {
  if (curve.length === 0) return 0;
  if (curve.length === 1) return curve[0].timestamp;

  // Find starting index from hint
  let startIdx = 0;
  for (let i = 0; i < curve.length; i++) {
    if (curve[i].timestamp >= searchFromMs) { startIdx = i; break; }
  }

  const interpolate = (i: number): number | null => {
    const a = curve[i], b = curve[i + 1];
    const crosses =
      (a.progress <= targetProgress && b.progress >= targetProgress) ||
      (a.progress >= targetProgress && b.progress <= targetProgress);
    if (!crosses) return null;
    const span = b.progress - a.progress;
    if (Math.abs(span) < 1e-6) return a.timestamp;
    const t = (targetProgress - a.progress) / span;
    return a.timestamp + t * (b.timestamp - a.timestamp);
  };

  // Forward search from hint
  for (let i = startIdx; i < curve.length - 1; i++) {
    const t = interpolate(i);
    if (t !== null) return t;
  }

  // Backward search from hint (handles scrub-backward + non-monotonic leading edge)
  for (let i = Math.min(startIdx - 1, curve.length - 2); i >= 0; i--) {
    const t = interpolate(i);
    if (t !== null) return t;
  }

  // Clamp to nearest endpoint
  const distFirst = Math.abs(curve[0].progress - targetProgress);
  const distLast = Math.abs(curve[curve.length - 1].progress - targetProgress);
  return distFirst <= distLast ? curve[0].timestamp : curve[curve.length - 1].timestamp;
}

/** Group consecutive low-confidence frames into ranges for sparkline shading. */
export function lowConfidenceRanges(
  curve: ProgressPoint[],
  threshold = 0.4
): Array<{ startMs: number; endMs: number }> {
  const ranges: Array<{ startMs: number; endMs: number }> = [];
  let inGap = false;
  let gapStart = 0;

  for (const p of curve) {
    if (p.confidence < threshold && !inGap) {
      inGap = true;
      gapStart = p.timestamp;
    } else if (p.confidence >= threshold && inGap) {
      ranges.push({ startMs: gapStart, endMs: p.timestamp });
      inGap = false;
    }
  }
  if (inGap && curve.length > 0) {
    ranges.push({ startMs: gapStart, endMs: curve[curve.length - 1].timestamp });
  }
  return ranges;
}
