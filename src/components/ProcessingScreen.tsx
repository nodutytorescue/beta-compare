import { useEffect, useRef, useCallback, useState } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { useAppStore } from '../store/appStore';
import { getBlobUrl, updateAttemptRecord, getAttempt } from '../lib/db';
import { buildProgressCurve } from '../lib/progressCurve';
import type { AttemptRecord } from '../types';

const FPS = 10;
const FRAME_STEP = 3;

type Stage = 'loading-video' | 'init-model' | 'processing' | 'saving';

// ─── Module-level landmarker singleton ───────────────────────────────────────
// Persists across ProcessingScreen unmount/remount (e.g. between video 1 & 2).
// MediaPipe's WASM runtime is a singleton — re-initialising it per component
// mount causes silent failures on the second video.
let _landmarkerPromise: Promise<PoseLandmarker> | null = null;

function getLandmarker(): Promise<PoseLandmarker> {
  if (!_landmarkerPromise) {
    _landmarkerPromise = (async () => {
      const origin = window.location.origin;
      const vision = await FilesetResolver.forVisionTasks(`${origin}/wasm`);
      let lastErr: unknown;
      for (const delegate of ['GPU', 'CPU'] as const) {
        try {
          return await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: `${origin}/pose_landmarker_lite.task`,
              delegate
            },
            runningMode: 'IMAGE',
            numPoses: 2
          });
        } catch (e) { lastErr = e; }
      }
      _landmarkerPromise = null; // allow retry on next import
      throw new Error(`Pose model failed to load: ${lastErr}`);
    })();
  }
  return _landmarkerPromise;
}

// ─── Climber picker ───────────────────────────────────────────────────────────
function pickClimber(
  landmarks: Array<Array<{ x: number; y: number; z: number; visibility?: number }>>
): { progress: number; confidence: number } | null {
  if (landmarks.length === 0) return null;

  let bestIdx = -1, bestAvgY = Infinity;
  for (let i = 0; i < landmarks.length; i++) {
    const avgY = landmarks[i].reduce((s, lm) => s + lm.y, 0) / landmarks[i].length;
    if (avgY < bestAvgY) { bestAvgY = avgY; bestIdx = i; }
  }
  if (bestIdx === -1 || bestAvgY > 0.75) return null;

  const pose = landmarks[bestIdx];
  const leftHip = pose[23], rightHip = pose[24];
  if (!leftHip || !rightHip) return null;

  return {
    progress: 1 - (leftHip.y + rightHip.y) / 2,
    confidence: ((leftHip.visibility ?? 0) + (rightHip.visibility ?? 0)) / 2
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ProcessingScreen() {
  const processing = useAppStore(s => s.processing);
  const setTotalFrames = useAppStore(s => s.setTotalFrames);
  const incrementProcessed = useAppStore(s => s.incrementProcessed);
  const addAttempt = useAppStore(s => s.addAttempt);
  const goToImport = useAppStore(s => s.goToImport);

  const abortRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('loading-video');

  const runProcessing = useCallback(async (attemptId: string, fileName: string) => {
    abortRef.current = false;
    setError(null);
    setStage('loading-video');

    // ── 1. Load video ───────────────────────────────────────────────────────
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    const blobUrl = await getBlobUrl(attemptId);
    video.src = blobUrl;
    await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true });
      video.addEventListener('error', () =>
        reject(new Error(`Could not load "${fileName}". Check it's MP4/MOV/WebM.`)),
        { once: true }
      );
    });
    if (abortRef.current) { URL.revokeObjectURL(blobUrl); return; }

    const duration = video.duration;
    canvas.width = 256;
    canvas.height = Math.round(256 * (video.videoHeight / video.videoWidth)) || 256;

    const totalFrames = Math.ceil(duration * (FPS / FRAME_STEP));
    setTotalFrames(totalFrames);

    // ── 2. Get (or init) landmarker ─────────────────────────────────────────
    setStage('init-model');
    const landmarker = await getLandmarker();
    if (abortRef.current) { URL.revokeObjectURL(blobUrl); return; }

    // ── 3. Frame loop ───────────────────────────────────────────────────────
    setStage('processing');
    const results: Array<{ timestampMs: number; progress: number | null; confidence: number }> = [];

    for (let i = 0; i < totalFrames; i++) {
      if (abortRef.current) break;

      const timestampMs = Math.round((i * FRAME_STEP / FPS) * 1000);
      video.currentTime = timestampMs / 1000;
      await new Promise<void>(resolve =>
        video.addEventListener('seeked', () => resolve(), { once: true })
      );
      if (abortRef.current) break;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const result = landmarker.detect(canvas);
      const picked = pickClimber(
        result.landmarks as Array<Array<{ x: number; y: number; z: number; visibility?: number }>>
      );
      results.push({
        timestampMs,
        progress: picked?.progress ?? null,
        confidence: picked?.confidence ?? 0
      });
      incrementProcessed();
      // Yield to the browser so React can commit the update and repaint
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }

    if (abortRef.current) { URL.revokeObjectURL(blobUrl); return; }

    // ── 4. Save ─────────────────────────────────────────────────────────────
    setStage('saving');
    const curve = buildProgressCurve(results);
    const existing = await getAttempt(attemptId);
    if (existing) {
      const updated: AttemptRecord = { ...existing, progressCurve: curve, duration };
      await updateAttemptRecord(updated);
      addAttempt(updated);
    }

    URL.revokeObjectURL(blobUrl);
    goToImport();
  }, [setTotalFrames, incrementProcessed, addAttempt, goToImport]);

  useEffect(() => {
    if (!processing?.attemptId) return;
    runProcessing(processing.attemptId, processing.fileName).catch(err => {
      console.error('Processing failed:', err);
      setError(err instanceof Error ? err.message : String(err));
    });
    return () => { abortRef.current = true; };
  }, [processing?.attemptId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!processing) return null;

  const pct = processing.totalFrames > 0
    ? Math.round((processing.processedFrames / processing.totalFrames) * 100)
    : 0;
  const stageLabel: Record<Stage, string> = {
    'loading-video': 'Loading video…',
    'init-model':    'Loading pose model…',
    'processing':    'Analyzing pose…',
    'saving':        'Saving…',
  };

  if (error) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center gap-6 bg-slate-900 px-6">
        <div className="text-5xl select-none">❌</div>
        <div className="text-center max-w-sm">
          <h2 className="text-lg font-semibold text-red-400 mb-2">Processing Failed</h2>
          <p className="text-sm text-slate-400 bg-slate-800 rounded-lg p-3 text-left font-mono break-words">
            {error}
          </p>
        </div>
        <p className="text-xs text-slate-500 text-center max-w-xs">
          Open the browser console (F12) for more detail.
        </p>
        <button
          onClick={goToImport}
          className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium px-6 py-2 rounded-lg transition-colors"
        >
          ← Back to Library
        </button>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col items-center justify-center gap-6 bg-slate-900 px-6">
      <div className="text-5xl select-none">⚙️</div>
      <div className="text-center">
        <h2 className="text-lg font-semibold text-slate-100 mb-1">Processing</h2>
        <p className="text-sm text-slate-400 truncate max-w-xs">{processing.fileName}</p>
      </div>

      <div className="w-full max-w-sm">
        <div className="text-xs text-slate-500 mb-1">
          {stageLabel[stage]}
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-sky-500 rounded-full transition-all duration-150"
            style={{ width: stage === 'init-model' ? '5%' : `${pct}%` }}
          />
        </div>
        <p className="text-xs text-slate-600 mt-1 text-center">
          {stage === 'processing'
            ? `${processing.processedFrames} / ${processing.totalFrames} frames`
            : stage === 'init-model'
            ? 'First load takes a few seconds…'
            : ''}
        </p>
      </div>

      <button
        onClick={() => { abortRef.current = true; goToImport(); }}
        className="text-xs text-slate-500 hover:text-slate-300 underline transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}
