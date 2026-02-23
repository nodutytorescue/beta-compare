import { useRef, useState, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import VideoPanel from './VideoPanel';

export default function PlayerScreen() {
  const comparison = useAppStore(s => s.comparison);
  const goToImport = useAppStore(s => s.goToImport);

  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlayPause = useCallback(() => {
    const va = videoARef.current;
    const vb = videoBRef.current;
    if (!va || !vb || !comparison) return;

    if (isPlaying) {
      va.pause();
      vb.pause();
      setIsPlaying(false);
    } else {
      if (va.currentTime >= comparison.attemptA.trimEnd) va.currentTime = comparison.attemptA.trimStart;
      if (vb.currentTime >= comparison.attemptB.trimEnd) vb.currentTime = comparison.attemptB.trimStart;
      Promise.all([va.play(), vb.play()])
        .then(() => setIsPlaying(true))
        .catch(console.error);
    }
  }, [isPlaying, comparison]);

  const handleTrimEnd = useCallback(() => {
    videoARef.current?.pause();
    videoBRef.current?.pause();
    setIsPlaying(false);
  }, []);

  if (!comparison) return null;

  return (
    <div className="h-dvh flex flex-col bg-slate-900 text-slate-100">
      {/* Videos */}
      <div className="flex-1 min-h-0 flex flex-row gap-1 px-1 pb-1" style={{ paddingTop: 'max(0.25rem, env(safe-area-inset-top))' }}>
        <VideoPanel ref={videoARef} attempt={comparison.attemptA} label="A" onTrimEnd={handleTrimEnd} />
        <VideoPanel ref={videoBRef} attempt={comparison.attemptB} label="B" onTrimEnd={handleTrimEnd} />
      </div>

      {/* Master controls */}
      <div className="flex-shrink-0 flex flex-col items-center gap-2 pt-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <button
          onClick={handlePlayPause}
          className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-700 hover:bg-slate-600 text-white text-lg transition-colors"
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button
          onClick={goToImport}
          className="text-xs text-slate-500 hover:text-slate-300 underline transition-colors"
        >
          ← Back to Library
        </button>
      </div>
    </div>
  );
}
