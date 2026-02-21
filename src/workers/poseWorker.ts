import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { MainToWorkerMessage, WorkerToMainMessage } from '../types';

let landmarker: PoseLandmarker | null = null;

/**
 * Pick the climber pose from detected poses.
 * Strategy: pick pose with smallest average Y (highest on screen = furthest up route).
 * If best centroid Y > 0.75 (likely belayer standing at ground), return null.
 */
function pickClimber(
  landmarks: Array<Array<{ x: number; y: number; z: number; visibility?: number }>>
): { hipY: number; confidence: number } | null {
  if (landmarks.length === 0) return null;

  let bestIdx = -1;
  let bestAvgY = Infinity;

  for (let i = 0; i < landmarks.length; i++) {
    const pose = landmarks[i];
    const avgY = pose.reduce((sum, lm) => sum + lm.y, 0) / pose.length;
    if (avgY < bestAvgY) {
      bestAvgY = avgY;
      bestIdx = i;
    }
  }

  if (bestIdx === -1) return null;
  // Belayer filter: if centroid is in lower 25% of frame, discard
  if (bestAvgY > 0.75) return null;

  const pose = landmarks[bestIdx];
  // Hip midpoint: left hip = index 23, right hip = index 24
  const leftHip = pose[23];
  const rightHip = pose[24];
  if (!leftHip || !rightHip) return null;

  const hipY = (leftHip.y + rightHip.y) / 2;
  // Invert: low Y on screen (high up) → high progress
  const progress = 1 - hipY;

  // Confidence from hip landmark visibility
  const leftVis = leftHip.visibility ?? 0;
  const rightVis = rightHip.visibility ?? 0;
  const confidence = (leftVis + rightVis) / 2;

  return { hipY: progress, confidence };
}

self.addEventListener('message', async (event: MessageEvent<MainToWorkerMessage>) => {
  const msg = event.data;

  if (msg.type === 'INIT') {
    try {
      const vision = await FilesetResolver.forVisionTasks(msg.wasmBaseUrl);

      // Try GPU first, fall back to CPU
      const delegates: Array<'GPU' | 'CPU'> = ['GPU', 'CPU'];
      let lastErr: unknown;
      for (const delegate of delegates) {
        try {
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: msg.modelUrl, delegate },
            runningMode: 'IMAGE',
            numPoses: 2
          });
          break;
        } catch (e) {
          lastErr = e;
        }
      }

      if (!landmarker) throw lastErr;
      const reply: WorkerToMainMessage = { type: 'INIT_DONE' };
      self.postMessage(reply);
    } catch (err) {
      const reply: WorkerToMainMessage = { type: 'INIT_ERROR', error: String(err) };
      self.postMessage(reply);
    }
    return;
  }

  if (msg.type === 'PROCESS_FRAME') {
    const { frameIndex, timestampMs, bitmap } = msg;

    if (!landmarker) {
      bitmap.close();
      return;
    }

    try {
      const result = landmarker.detect(bitmap);
      bitmap.close();

      const picked = pickClimber(
        result.landmarks as Array<Array<{ x: number; y: number; z: number; visibility?: number }>>
      );

      const reply: WorkerToMainMessage = {
        type: 'FRAME_RESULT',
        frameIndex,
        timestampMs,
        progress: picked ? picked.hipY : null,
        confidence: picked ? picked.confidence : 0
      };
      self.postMessage(reply);
    } catch {
      bitmap.close();
      const reply: WorkerToMainMessage = {
        type: 'FRAME_RESULT',
        frameIndex,
        timestampMs,
        progress: null,
        confidence: 0
      };
      self.postMessage(reply);
    }
  }
});
