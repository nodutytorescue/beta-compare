import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { getBlobUrl } from '../lib/db';

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${m}:${sec.padStart(4, '0')}`;
}

export default function TrimScreen() {
  const trim = useAppStore(s => s.trim);
  const goToProcessing = useAppStore(s => s.goToProcessing);
  const goToImport = useAppStore(s => s.goToImport);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!trim?.attemptId) return;
    let url = '';
    getBlobUrl(trim.attemptId).then(u => { url = u; setBlobUrl(u); });
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
    v.currentTime = t;
    setCurrentTime(t);
  };

  const handlePlayPause = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setIsPlaying(true); }
    else { v.pause(); setIsPlaying(false); }
  };

  const handleSetStart = () => {
    setTrimStart(currentTime);
    if (currentTime >= trimEnd) setTrimEnd(duration);
  };

  const handleSetEnd = () => {
    setTrimEnd(currentTime);
    if (currentTime <= trimStart) setTrimStart(0);
  };

  const handleProcess = () => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    goToProcessing(trim.attemptId, trim.fileName, trimStart, trimEnd);
  };

  const isFullVideo = trimStart === 0 && trimEnd === duration;

  return (
    <div className="h-dvh flex flex-col bg-slate-900 text-slate-100">
      {/* Header */}
      <header className="flex items-center px-4 py-3 bg-slate-800 border-b border-slate-700 flex-shrink-0">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Mark climbing portion</p>
          <p className="text-sm font-medium truncate max-w-xs">{trim.fileName}</p>
        </div>
      </header>

      {/* Video */}
      <div className="flex-1 min-h-0 bg-black flex items-center justify-center">
        {blobUrl && (
          <video
            ref={videoRef}
            src={blobUrl}
            className="max-h-full max-w-full"
            playsInline
            muted
            onLoadedMetadata={handleMetadata}
            onTimeUpdate={handleTimeUpdate}
            onEnded={() => setIsPlaying(false)}
          />
        )}
      </div>

      {/* Controls */}
      <div className="flex-shrink-0 p-4 bg-slate-900 flex flex-col gap-3">
        {/* Time */}
        <div className="flex justify-between text-xs text-slate-500">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>

        {/* Seek scrubber */}
        <input
          type="range"
          min="0"
          max="1000"
          value={duration > 0 ? Math.round((currentTime / duration) * 1000) : 0}
          className="scrubber"
          onChange={handleScrub}
        />

        {/* Mark buttons + play */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSetStart}
            className="flex-1 text-xs bg-emerald-900 hover:bg-emerald-800 text-emerald-300 py-2.5 rounded-lg transition-colors font-medium"
          >
            ← Set Start
          </button>
          <button
            onClick={handlePlayPause}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-slate-700 hover:bg-slate-600 text-white transition-colors flex-shrink-0"
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button
            onClick={handleSetEnd}
            className="flex-1 text-xs bg-sky-900 hover:bg-sky-800 text-sky-300 py-2.5 rounded-lg transition-colors font-medium"
          >
            Set End →
          </button>
        </div>

        {/* Trim summary */}
        <p className="text-center text-xs text-slate-400 min-h-[1rem]">
          {isFullVideo
            ? 'Scrub and mark where the climb starts and ends'
            : `${formatTime(trimStart)} → ${formatTime(trimEnd)} · ${(trimEnd - trimStart).toFixed(1)}s selected`}
        </p>

        {/* Process */}
        <button
          onClick={handleProcess}
          disabled={!blobUrl || duration === 0}
          className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors"
        >
          Process Video →
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
