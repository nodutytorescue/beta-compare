import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { getBlobUrl } from '../lib/db';
import type { Hold } from '../types';

/** Compute the actual displayed rect of an object-contain video within its element. */
function getVideoRect(v: HTMLVideoElement): { x: number; y: number; w: number; h: number } | null {
  if (!v.videoWidth || !v.videoHeight) return null;
  const vr = v.videoWidth / v.videoHeight;
  const ew = v.clientWidth, eh = v.clientHeight;
  const er = ew / eh;
  if (vr > er) {
    const h = ew / vr;
    return { x: 0, y: (eh - h) / 2, w: ew, h };
  } else {
    const w = eh * vr;
    return { x: (ew - w) / 2, y: 0, w, h: eh };
  }
}

export default function HoldMarkingScreen() {
  const holdMarking = useAppStore(s => s.holdMarking);
  const attempts = useAppStore(s => s.attempts);
  const goToProcessing = useAppStore(s => s.goToProcessing);
  const goToImport = useAppStore(s => s.goToImport);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [holds, setHolds] = useState<Hold[]>([]);
  const [prepopFrom, setPrepopFrom] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // force re-render for hold positioning after layout

  // Load video blob
  useEffect(() => {
    if (!holdMarking?.attemptId) return;
    let url = '';
    getBlobUrl(holdMarking.attemptId).then(u => { url = u; setBlobUrl(u); });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [holdMarking?.attemptId]);

  // Pre-populate from most recent attempt that has holds
  useEffect(() => {
    const last = [...attempts]
      .filter(a => a.holds && a.holds.length >= 2 && a.id !== holdMarking?.attemptId)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (last?.holds) {
      setHolds(last.holds);
      setPrepopFrom(last.name);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render when video is resized so hold markers reposition correctly
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const obs = new ResizeObserver(() => setTick(n => n + 1));
    obs.observe(v);
    return () => obs.disconnect();
  }, [blobUrl]);

  if (!holdMarking) return null;

  const handleMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = holdMarking.trimStart;
    setTick(n => n + 1);
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const rect = getVideoRect(v);
    if (!rect) return;
    const el = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - el.left - rect.x;
    const cy = e.clientY - el.top - rect.y;
    if (cx < 0 || cy < 0 || cx > rect.w || cy > rect.h) return;
    setHolds(prev => [...prev, { x: cx / rect.w, y: cy / rect.h }]);
  };

  const removeHold = (i: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setHolds(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const span = holdMarking.trimEnd - holdMarking.trimStart;
    v.currentTime = holdMarking.trimStart + (Number(e.target.value) / 1000) * span;
  };

  const handleProcess = () => {
    goToProcessing(holdMarking.attemptId, holdMarking.fileName, holdMarking.trimStart, holdMarking.trimEnd, holds);
  };

  // Compute hold pixel positions for rendering (recalculated on tick)
  void tick;
  const vr = videoRef.current ? getVideoRect(videoRef.current) : null;

  return (
    <div className="h-dvh flex flex-col bg-slate-900 text-slate-100">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Mark route holds</p>
          <p className="text-sm font-medium truncate max-w-xs">{holdMarking.fileName}</p>
        </div>
        <span className="text-sm font-bold text-yellow-400">{holds.length} hold{holds.length !== 1 ? 's' : ''}</span>
      </header>

      {/* Pre-populate banner */}
      {prepopFrom && (
        <div className="flex-shrink-0 mx-3 mt-2 flex items-center gap-2 text-xs bg-slate-800 rounded-lg px-3 py-2">
          <span className="flex-1 text-slate-300">Pre-filled from "{prepopFrom}" — adjust if needed</span>
          <button
            onClick={() => { setHolds([]); setPrepopFrom(null); }}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Video + overlay */}
      <div className="flex-1 min-h-0 relative bg-black overflow-hidden">
        {blobUrl && (
          <video
            ref={videoRef}
            src={blobUrl}
            className="absolute inset-0 w-full h-full object-contain"
            playsInline
            muted
            onLoadedMetadata={handleMetadata}
          />
        )}

        {/* Click overlay */}
        <div
          className="absolute inset-0 cursor-crosshair"
          onClick={handleOverlayClick}
        />

        {/* Route line */}
        {vr && holds.length >= 2 && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
            <polyline
              points={holds.map(h => `${vr.x + h.x * vr.w},${vr.y + h.y * vr.h}`).join(' ')}
              stroke="rgba(250,204,21,0.55)"
              strokeWidth="2"
              fill="none"
              strokeDasharray="6,4"
            />
          </svg>
        )}

        {/* Hold markers — tap to remove */}
        {vr && holds.map((hold, i) => (
          <button
            key={i}
            className="absolute flex items-center justify-center w-7 h-7 rounded-full border-2 border-yellow-400 bg-slate-900/80 text-yellow-300 text-xs font-bold hover:border-red-400 hover:text-red-300 hover:bg-red-900/80 transition-colors"
            style={{
              left: vr.x + hold.x * vr.w,
              top: vr.y + hold.y * vr.h,
              transform: 'translate(-50%, -50%)',
            }}
            onClick={e => removeHold(i, e)}
          >
            {i + 1}
          </button>
        ))}

        {/* Empty state hint */}
        {holds.length === 0 && (
          <div className="absolute inset-0 flex items-end justify-center pb-6 pointer-events-none">
            <p className="text-slate-500 text-sm bg-slate-900/70 px-3 py-2 rounded-lg">
              Tap holds in order — start hold first
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex-shrink-0 p-4 flex flex-col gap-3">
        <div className="flex justify-between text-xs text-slate-500">
          <span>Scrub to a frame where all holds are visible</span>
          <span>Tap a number to remove</span>
        </div>

        <input
          type="range"
          min="0"
          max="1000"
          defaultValue="0"
          className="scrubber"
          onChange={handleScrub}
        />

        <button
          onClick={handleProcess}
          disabled={holds.length < 2}
          className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors"
        >
          {holds.length < 2
            ? `Mark at least ${2 - holds.length} more hold${holds.length === 0 ? 's' : ''}`
            : `Process with ${holds.length} holds →`}
        </button>

        <button
          onClick={goToImport}
          className="text-xs text-slate-500 hover:text-slate-300 underline text-center transition-colors"
        >
          ← Cancel
        </button>
      </div>
    </div>
  );
}
