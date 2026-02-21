import { useAppStore } from '../store/appStore';
import VideoPanel from './VideoPanel';

export default function PlayerScreen() {
  const comparison = useAppStore(s => s.comparison);
  const goToImport = useAppStore(s => s.goToImport);

  if (!comparison) return null;

  return (
    <div className="h-dvh flex flex-col bg-slate-900 text-slate-100">
      <div className="flex-1 min-h-0 flex flex-row gap-1 p-1">
        <VideoPanel attempt={comparison.attemptA} label="A" />
        <VideoPanel attempt={comparison.attemptB} label="B" />
      </div>
      <div className="flex-shrink-0 py-2">
        <button
          onClick={goToImport}
          className="text-xs text-slate-500 hover:text-slate-300 underline w-full text-center transition-colors"
        >
          ← Back to Library
        </button>
      </div>
    </div>
  );
}
