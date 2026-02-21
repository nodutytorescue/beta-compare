import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { getBlobUrl, updateAttemptRecord, getAttempt } from '../lib/db';
import { buildProgressCurve } from '../lib/progressCurve';
import type { WorkerToMainMessage, WorkerFrameResultMessage, AttemptRecord } from '../types';

const FPS = 10;          // sample rate
const FRAME_STEP = 3;    // process every Nth frame

export default function ProcessingScreen() {
  const processing = useAppStore(s => s.processing);
  const setTotalFrames = useAppStore(s => s.setTotalFrames);
  const incrementProcessed = useAppStore(s => s.incrementProcessed);
  const addAttempt = useAppStore(s => s.addAttempt);
  const goToImport = useAppStore(s => s.goToImport);

  const workerRef = useRef<Worker | null>(null);
  const abortRef = useRef(false);

  const runProcessing = useCallback(async (attemptId: string, fileName: string) => {
    abortRef.current = false;

    // Create hidden video + canvas
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    // Load video
    const blobUrl = await getBlobUrl(attemptId);
    video.src = blobUrl;

    await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true });
      video.addEventListener('error', () => reject(new Error(`Video load error: ${fileName}`)), { once: true });
    });

    const duration = video.duration;
    canvas.width = 256;
    canvas.height = Math.round(256 * (video.videoHeight / video.videoWidth)) || 256;

    const sampledFps = FPS / FRAME_STEP;
    const totalFrames = Math.ceil(duration * sampledFps);
    setTotalFrames(totalFrames);

    // Spawn worker
    const worker = new Worker(
      new URL('../workers/poseWorker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    // Init worker
    const modelUrl = `${window.location.origin}/pose_landmarker_lite.task`;
    await new Promise<void>((resolve, reject) => {
      const onInit = (e: MessageEvent<WorkerToMainMessage>) => {
        if (e.data.type === 'INIT_DONE') { worker.removeEventListener('message', onInit); resolve(); }
        if (e.data.type === 'INIT_ERROR') { worker.removeEventListener('message', onInit); reject(new Error(e.data.error)); }
      };
      worker.addEventListener('message', onInit);
      worker.postMessage({ type: 'INIT', modelUrl });
    });

    // Frame processing loop — one frame at a time (await seeked before next seek)
    const results = new Map<number, WorkerFrameResultMessage>();

    const processFrame = (frameIndex: number): Promise<void> => new Promise((resolve, reject) => {
      const timestampMs = Math.round((frameIndex * FRAME_STEP / FPS) * 1000);
      video.currentTime = timestampMs / 1000;

      video.addEventListener('seeked', async function onSeeked() {
        video.removeEventListener('seeked', onSeeked);
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const bitmap = await createImageBitmap(canvas);

          const onResult = (e: MessageEvent<WorkerToMainMessage>) => {
            if (e.data.type === 'FRAME_RESULT' && e.data.frameIndex === frameIndex) {
              worker.removeEventListener('message', onResult);
              results.set(frameIndex, e.data);
              incrementProcessed();
              resolve();
            }
          };
          worker.addEventListener('message', onResult);
          // Transfer ImageBitmap — avoids ~8MB structured-clone per frame
          worker.postMessage(
            { type: 'PROCESS_FRAME', frameIndex, timestampMs, bitmap },
            [bitmap]
          );
        } catch (err) {
          reject(err);
        }
      }, { once: true });
    });

    for (let i = 0; i < totalFrames; i++) {
      if (abortRef.current) break;
      await processFrame(i);
    }

    // Build progress curve from collected results
    const rawFrames = Array.from({ length: totalFrames }, (_, i) => {
      const r = results.get(i);
      const timestampMs = Math.round((i * FRAME_STEP / FPS) * 1000);
      return r
        ? { timestampMs: r.timestampMs, progress: r.progress, confidence: r.confidence }
        : { timestampMs, progress: null, confidence: 0 };
    });

    const curve = buildProgressCurve(rawFrames);

    // Persist updated attempt record (blob already saved by ImportScreen)
    const existing = await getAttempt(attemptId);
    if (existing) {
      const updated: AttemptRecord = { ...existing, progressCurve: curve, duration };
      await updateAttemptRecord(updated);
      addAttempt(updated);
    }

    // Cleanup
    URL.revokeObjectURL(blobUrl);
    worker.terminate();
    workerRef.current = null;
    goToImport();
  }, [setTotalFrames, incrementProcessed, addAttempt, goToImport]);

  useEffect(() => {
    if (!processing?.attemptId) return;
    runProcessing(processing.attemptId, processing.fileName).catch(err => {
      console.error('Processing failed:', err);
      goToImport();
    });

    return () => {
      abortRef.current = true;
      workerRef.current?.terminate();
    };
  }, [processing?.attemptId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!processing) return null;

  const pct = processing.totalFrames > 0
    ? Math.round((processing.processedFrames / processing.totalFrames) * 100)
    : 0;

  return (
    <div className="h-dvh flex flex-col items-center justify-center gap-6 bg-slate-900 px-6">
      <div className="text-5xl select-none">⚙️</div>
      <div className="text-center">
        <h2 className="text-lg font-semibold text-slate-100 mb-1">Processing</h2>
        <p className="text-sm text-slate-400 truncate max-w-xs">{processing.fileName}</p>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-sm">
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>Analyzing pose…</span>
          <span>{pct}%</span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-sky-500 rounded-full transition-all duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-slate-600 mt-1 text-center">
          {processing.processedFrames} / {processing.totalFrames} frames
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
