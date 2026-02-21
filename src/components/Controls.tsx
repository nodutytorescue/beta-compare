import type { RefObject } from 'react';

interface ControlsProps {
  isPlaying: boolean;
  playbackSpeed: number;
  scrubberRef: RefObject<HTMLInputElement>;
  onPlayPause: () => void;
  onSpeedChange: (speed: number) => void;
  onScrub: (progress: number) => void;
  onSwapLeader: () => void;
}

const SPEEDS = [0.25, 0.5, 1, 1.5, 2];

export default function Controls({
  isPlaying,
  playbackSpeed,
  scrubberRef,
  onPlayPause,
  onSpeedChange,
  onScrub,
  onSwapLeader
}: ControlsProps) {
  return (
    <div className="flex flex-col gap-2 px-3 py-2 bg-slate-800 rounded-lg select-none">
      {/* Scrubber */}
      <input
        ref={scrubberRef}
        type="range"
        min="0"
        max="1000"
        defaultValue="0"
        step="1"
        className="scrubber"
        onInput={e => onScrub(Number((e.target as HTMLInputElement).value) / 1000)}
        aria-label="Progress scrubber"
      />

      {/* Buttons row */}
      <div className="flex items-center gap-3 justify-between">
        {/* Play/Pause */}
        <button
          onClick={onPlayPause}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-sky-600 hover:bg-sky-500 transition-colors text-white text-lg"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        {/* Speed selector */}
        <div className="flex items-center gap-1">
          {SPEEDS.map(s => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                playbackSpeed === s
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {s}×
            </button>
          ))}
        </div>

        {/* Swap leader */}
        <button
          onClick={onSwapLeader}
          className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded transition-colors"
          aria-label="Swap leader"
        >
          ⇄ Swap
        </button>
      </div>
    </div>
  );
}
