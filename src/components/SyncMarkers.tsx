import type { SyncMarker } from '../types';

interface SyncMarkersProps {
  markers: SyncMarker[];
  leaderRole: 'A' | 'B';
  leaderCurrentTime: number;   // seconds
  followerCurrentTime: number; // seconds
  onAdd: (marker: SyncMarker) => void;
  onRemove: (index: number) => void;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1).padStart(4, '0');
  return `${m}:${sec}`;
}

export default function SyncMarkers({
  markers,
  leaderRole,
  leaderCurrentTime,
  followerCurrentTime,
  onAdd,
  onRemove
}: SyncMarkersProps) {
  const handleMark = () => {
    if (markers.length >= 8) return;
    const marker: SyncMarker =
      leaderRole === 'A'
        ? { videoATime: leaderCurrentTime, videoBTime: followerCurrentTime }
        : { videoATime: followerCurrentTime, videoBTime: leaderCurrentTime };
    onAdd(marker);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Sync Markers ({markers.length}/8)
        </span>
        <button
          onClick={handleMark}
          disabled={markers.length >= 8}
          className="text-xs bg-pink-600 hover:bg-pink-500 disabled:opacity-40 text-white px-2 py-0.5 rounded transition-colors"
        >
          Mark Here
        </button>
      </div>

      {markers.length === 0 && (
        <p className="text-xs text-slate-500 italic">
          Pause on a matching moment in both videos, then add a marker.
        </p>
      )}

      <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto">
        {markers.map((m, i) => (
          <div key={i} className="flex items-center justify-between text-xs bg-slate-700 rounded px-2 py-0.5">
            <span className="text-slate-300">
              A: {formatTime(m.videoATime)} → B: {formatTime(m.videoBTime)}
            </span>
            <button
              onClick={() => onRemove(i)}
              className="text-slate-500 hover:text-red-400 ml-2 transition-colors"
              aria-label="Remove marker"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
