import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { saveAttempt, deleteAttempt } from '../lib/db';
import type { AttemptRecord } from '../types';

export default function ImportScreen() {
  const attempts = useAppStore(s => s.attempts);
  const addAttempt = useAppStore(s => s.addAttempt);
  const removeAttempt = useAppStore(s => s.removeAttempt);
  const goToProcessing = useAppStore(s => s.goToProcessing);
  const goToPlayer = useAppStore(s => s.goToPlayer);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : prev.length < 2
        ? [...prev, id]
        : [prev[1], id]
    );
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;

    setImportError(null);
    setImporting(true);
    try {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const buffer = await file.arrayBuffer();

      const record: AttemptRecord = {
        id,
        name: file.name.replace(/\.[^.]+$/, ''),
        blobKey: id,
        progressCurve: [],
        duration: 0,
        createdAt: Date.now()
      };

      await saveAttempt(record, buffer);
      addAttempt(record);
      goToProcessing(id, file.name);
    } catch (err) {
      console.error('Import failed:', err);
      setImportError(err instanceof Error ? err.message : 'Failed to read file. Try a smaller video.');
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteAttempt(id);
    removeAttempt(id);
    setSelectedIds(prev => prev.filter(x => x !== id));
  };

  const canCompare = selectedIds.length === 2;
  const handleCompare = () => {
    if (!canCompare) return;
    const a = attempts.find(x => x.id === selectedIds[0])!;
    const b = attempts.find(x => x.id === selectedIds[1])!;
    goToPlayer(a, b);
  };

  return (
    <div className="h-dvh flex flex-col bg-slate-900 text-slate-100">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700 flex-shrink-0">
        <h1 className="text-lg font-bold tracking-tight">Beta Compare</h1>
        {/* <label> natively triggers the file picker without needing JS .click() */}
        <label className={`cursor-pointer bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors ${importing ? 'opacity-50 pointer-events-none' : ''}`}>
          {importing ? 'Reading…' : '+ Import Video'}
          <input
            type="file"
            accept="video/*,video/mp4,video/quicktime,video/webm,video/x-m4v"
            className="sr-only"
            onChange={handleFileChange}
            disabled={importing}
          />
        </label>
      </header>

      {/* Import error */}
      {importError && (
        <div className="mx-4 mt-3 flex-shrink-0 bg-red-900/40 border border-red-700 rounded-lg px-3 py-2 text-sm text-red-300 flex items-start gap-2">
          <span className="flex-shrink-0">⚠️</span>
          <span>{importError}</span>
          <button onClick={() => setImportError(null)} className="ml-auto flex-shrink-0 text-red-500 hover:text-red-300">✕</button>
        </div>
      )}

      {/* Attempt list */}
      <main className="flex-1 overflow-y-auto p-4">
        {attempts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500">
            <div className="text-6xl">🧗</div>
            <p className="text-center text-sm max-w-xs">
              Import two climbing attempts to compare route progress side-by-side.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {attempts.map(attempt => {
              const isSelected = selectedIds.includes(attempt.id);
              const selIdx = selectedIds.indexOf(attempt.id);
              return (
                <li
                  key={attempt.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-sky-500 bg-sky-900/30'
                      : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                  }`}
                  onClick={() => toggleSelect(attempt.id)}
                >
                  <div className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold flex-shrink-0 border-2 ${
                    isSelected ? 'border-sky-400 bg-sky-600 text-white' : 'border-slate-600 text-slate-500'
                  }`}>
                    {isSelected ? selIdx + 1 : ''}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">{attempt.name}</p>
                    <p className="text-xs text-slate-500">
                      {attempt.progressCurve.length > 0
                        ? `${attempt.progressCurve.length} frames · ${attempt.duration.toFixed(1)}s`
                        : 'Not yet processed'}
                    </p>
                  </div>

                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(attempt.id); }}
                    className="text-slate-600 hover:text-red-400 transition-colors px-1"
                    aria-label="Delete attempt"
                  >
                    🗑
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {canCompare && (
        <footer className="px-4 py-3 bg-slate-800 border-t border-slate-700 flex-shrink-0">
          <button
            onClick={handleCompare}
            className="w-full bg-sky-600 hover:bg-sky-500 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            Compare Selected →
          </button>
        </footer>
      )}
    </div>
  );
}
