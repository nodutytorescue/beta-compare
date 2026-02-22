import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { getBlobUrl, updateAttemptRecord } from '../lib/db';

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${m}:${sec.padStart(4, '0')}`;
}

export default function TrimScreen() {
  const trim = useAppStore(s => s.trim);
  const attempts = useAppStore(s => s.attempts);
  const addAttempt = useAppStore(s => s.addAttempt);
  const goToImport = useAppStore(s => s.goToImport);

  const videoRef = useRef<HTMLVideoElement>(null);
  const unlockedRef = useRef(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!trim?.attemptId) return;
    const mimeType = attempts.find(a => a.id === trim.attemptId)?.mimeType ?? 'video/mp4';
    let url = '';
    getBlobUrl(trim.attemptId, mimeType).then(u => { url = u; setBlobUrl(u); });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [trim?.attemptId]);

  if (!trim) return null;

  const handleMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    setTrimEnd(v.duration);
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (v) setCurrentTime(v.currentTime);
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v || duration === 0) return;
    const t = (Number(e.target.value) / 1000) * duration;
    const seek = () => { v.currentTime = t; setCurrentTime(t); };
    // First scrub on iOS: play() inside a user gesture unlocks frame rendering
    if (!unlockedRef.current) {
      unlockedRef.current = true;
      v.play().then(() => { v.pause(); seek(); }).catch(() => seek());
    } else {
      seek();
    }
  };

  const handleSetStart = () => {
    setTrimStart(currentTime);
    if (currentTime >= trimEnd) setTrimEnd(duration);
  };

  const handleSetEnd = () => {
    setTrimEnd(currentTime);
    if (currentTime <= trimStart) setTrimStart(0);
  };

  const handleDone = async () => {
    const v = videoRef.current;
    if (!v || duration === 0) return;
    v.pause();
    setSaving(true);

    const existing = attempts.find(a => a.id === trim.attemptId);
    if (existing) {
      const updated = { ...existing, duration, trimStart, trimEnd };
      await updateAttemptRecord(updated);
      addAttempt(updated);
    }
    goToImport();
  };

  const isFullVideo = trimStart === 0 && trimEnd === duration;

  return (
    <div className="h-dvh flex flex-col bg-slate-900 text-slate-100">
      <header className="flex items-center px-4 pb-3 bg-slate-800 border-b border-slate-700 flex-shrink-0" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Mark climbing portion</p>
          <p className="text-sm font-medium truncate max-w-xs">{trim.fileName}</p>
        </div>
      </header>

      <div className="flex-1 min-h-0 bg-black flex items-center justify-center">
        {blobUrl && (
          <video
            ref={videoRef}
            src={blobUrl}
            className="max-h-full max-w-full"
            playsInline
            muted
            preload="auto"
            onLoadedMetadata={handleMetadata}
            onTimeUpdate={handleTimeUpdate}
          />
        )}
      </div>

      <div className="flex-shrink-0 px-4 pt-4 bg-slate-900 flex flex-col gap-3" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="flex justify-between text-xs text-slate-500">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>

        <input
          type="range"
          min="0"
          max="1000"
          value={duration > 0 ? Math.round((currentTime / duration) * 1000) : 0}
          className="scrubber"
          onChange={handleScrub}
        />

        <div className="flex gap-2">
          <button
            onClick={handleSetStart}
            className="flex-1 text-xs bg-emerald-900 hover:bg-emerald-800 text-emerald-300 py-2.5 rounded-lg transition-colors font-medium"
          >
            ← Set Start
          </button>
          <button
            onClick={handleSetEnd}
            className="flex-1 text-xs bg-sky-900 hover:bg-sky-800 text-sky-300 py-2.5 rounded-lg transition-colors font-medium"
          >
            Set End →
          </button>
        </div>

        <p className="text-center text-xs text-slate-400 min-h-[1rem]">
          {isFullVideo
            ? 'Scrub and mark where the climb starts and ends'
            : `${formatTime(trimStart)} → ${formatTime(trimEnd)} · ${(trimEnd - trimStart).toFixed(1)}s selected`}
        </p>

        <button
          onClick={handleDone}
          disabled={!blobUrl || duration === 0 || saving}
          className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : 'Done →'}
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
