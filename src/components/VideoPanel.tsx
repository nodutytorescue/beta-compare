import { forwardRef } from 'react';
import type { AttemptRecord } from '../types';
import SparklineChart from './SparklineChart';

interface VideoPanelProps {
  attempt: AttemptRecord;
  isLeader: boolean;
  label: string;
  onSetLeader: () => void;
}

const VideoPanel = forwardRef<HTMLVideoElement, VideoPanelProps>(
  ({ attempt, isLeader, label, onSetLeader }, ref) => {
    return (
      <div className="relative flex flex-col flex-1 min-h-0 bg-slate-800 rounded-lg overflow-hidden">
        {/* Leader badge */}
        <div className="absolute top-2 left-2 z-10 flex gap-2 items-center">
          <span className="text-xs font-semibold text-slate-300 bg-slate-900/70 px-2 py-0.5 rounded">
            {label}
          </span>
          {isLeader ? (
            <span className="text-xs font-bold text-sky-400 bg-slate-900/70 px-2 py-0.5 rounded">
              LEADER
            </span>
          ) : (
            <button
              onClick={onSetLeader}
              className="text-xs text-slate-400 hover:text-sky-400 bg-slate-900/70 px-2 py-0.5 rounded transition-colors"
            >
              Set Leader
            </button>
          )}
        </div>

        {/* Video */}
        <video
          ref={ref}
          playsInline
          muted
          className="w-full h-full object-contain bg-black"
        />

        {/* Sparkline */}
        <div className="h-12 bg-slate-900/50 px-1 pt-1 pb-0.5 flex-shrink-0">
          <SparklineChart curve={attempt.progressCurve} />
        </div>

        {/* Attempt name */}
        <div className="px-2 py-1 text-xs text-slate-400 truncate flex-shrink-0">
          {attempt.name}
        </div>
      </div>
    );
  }
);
VideoPanel.displayName = 'VideoPanel';

export default VideoPanel;
