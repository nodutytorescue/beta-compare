import { useEffect, useRef, useState } from 'react';
import { getBlobUrl } from '../lib/db';
import type { AttemptRecord } from '../types';

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${m}:${sec.padStart(4, '0')}`;
}

interface VideoPanelProps {
  attempt: AttemptRecord;
  label: string;
}

export default function VideoPanel({ attempt, label }: VideoPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(attempt.trimStart);

  useEffect(() => {
    let url = '';
    getBlobUrl(attempt.blobKey).then(u => { url = u; setBlobUrl(u); });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [attempt.blobKey]);

  const handleMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = attempt.trimStart;
    setCurrentTime(attempt.trimStart);
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    if (v.currentTime >= attempt.trimEnd) {
      v.pause();
      setIsPlaying(false);
    }
  };

  const handlePlayPause = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (v.currentTime >= attempt.trimEnd) {
        v.currentTime = attempt.trimStart;
      }
      v.play().then(() => setIsPlaying(true)).catch(console.error);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const span = attempt.trimEnd - attempt.trimStart;
    const t = attempt.trimStart + (Number(e.target.value) / 1000) * span;
    v.currentTime = t;
    setCurrentTime(t);
  };

  const clipLen = attempt.trimEnd - attempt.trimStart;
  const relTime = Math.max(0, Math.min(clipLen, currentTime - attempt.trimStart));
  const scrubValue = clipLen > 0 ? Math.round((relTime / clipLen) * 1000) : 0;

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-slate-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-2 py-1.5 flex items-center justify-between bg-slate-800 border-b border-slate-700">
        <span className="text-xs font-semibold text-slate-200">{label} · {attempt.name}</span>
        <span className="text-xs text-slate-500 tabular-nums">
          {formatTime(relTime)} / {formatTime(clipLen)}
        </span>
      </div>

      {/* Video */}
      <div className="flex-1 min-h-0 bg-black">
        {blobUrl && (
          <video
            ref={videoRef}
            src={blobUrl}
            className="w-full h-full object-contain"
            playsInline
            muted
            onLoadedMetadata={handleMetadata}
            onTimeUpdate={handleTimeUpdate}
            onEnded={() => setIsPlaying(false)}
          />
        )}
      </div>

      {/* Controls */}
      <div className="flex-shrink-0 px-3 py-2 flex flex-col gap-2 bg-slate-900">
        <input
          type="range"
          min="0"
          max="1000"
          value={scrubValue}
          className="scrubber w-full"
          onChange={handleScrub}
        />
        <div className="flex justify-center">
          <button
            onClick={handlePlayPause}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-700 hover:bg-slate-600 text-white text-sm transition-colors"
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
        </div>
      </div>
    </div>
  );
}
