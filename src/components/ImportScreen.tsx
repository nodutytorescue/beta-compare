import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { saveAttempt } from '../lib/db';
import type { AttemptRecord } from '../types';

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export default function ImportScreen() {
  const addAttempt = useAppStore(s => s.addAttempt);
  const selectedA = useAppStore(s => s.selectedA);
  const selectedB = useAppStore(s => s.selectedB);
  const goToTrim = useAppStore(s => s.goToTrim);
  const goToPlayer = useAppStore(s => s.goToPlayer);

  const [importingA, setImportingA] = useState(false);
  const [importingB, setImportingB] = useState(false);

  const handleFileChange = (slot: 'A' | 'B') => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;

    if (slot === 'A') setImportingA(true); else setImportingB(true);
    try {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const buffer = await file.arrayBuffer();
      const record: AttemptRecord = {
        id,
        name: file.name.replace(/\.[^.]+$/, ''),
        blobKey: id,
        mimeType: file.type || 'video/mp4',
        duration: 0,
        trimStart: 0,
        trimEnd: 0,
        createdAt: Date.now(),
      };
      await saveAttempt(record, buffer);
      addAttempt(record);
      goToTrim(id, file.name, slot);
    } catch (err) {
      console.error('Import failed:', err);
      if (slot === 'A') setImportingA(false); else setImportingB(false);
    }
  };

  const canCompare = selectedA !== null && selectedB !== null;

  return (
    <div className="h-dvh flex flex-col bg-slate-900 text-slate-100">
      <header
        className="flex-shrink-0 flex items-center justify-center px-4 pb-3"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <h1 className="text-base font-bold tracking-tight text-slate-400">Beta Compare</h1>
      </header>

      <div className="flex-1 min-h-0 flex flex-row gap-1 px-1">
        <SlotPanel
          slot="A"
          selected={selectedA}
          importing={importingA}
          onChange={handleFileChange('A')}
        />
        <SlotPanel
          slot="B"
          selected={selectedB}
          importing={importingB}
          onChange={handleFileChange('B')}
        />
      </div>

      <div
        className="flex-shrink-0 px-4 pt-3"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={() => canCompare && goToPlayer(selectedA!, selectedB!)}
          disabled={!canCompare}
          className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors"
        >
          Compare →
        </button>
      </div>
    </div>
  );
}

function SlotPanel({ slot, selected, importing, onChange }: {
  slot: 'A' | 'B';
  selected: AttemptRecord | null;
  importing: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="flex-1 flex flex-col rounded-lg bg-slate-800">
      <label className="relative flex-1 flex flex-col items-center justify-center cursor-pointer gap-3 border-2 border-dashed border-slate-700 rounded-lg active:bg-slate-700 transition-colors">
        {importing ? (
          <p className="text-sm text-slate-400">Reading…</p>
        ) : selected ? (
          <>
            <div className="w-10 h-10 flex items-center justify-center rounded-full bg-sky-600 text-white font-bold text-lg">
              {slot}
            </div>
            <div className="text-center px-4">
              <p className="text-sm font-medium truncate max-w-[120px]">{selected.name}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {formatDuration(selected.trimEnd - selected.trimStart)}
              </p>
            </div>
            <p className="text-xs text-slate-500">tap to replace</p>
          </>
        ) : (
          <>
            <div className="w-10 h-10 flex items-center justify-center rounded-full border-2 border-slate-600 text-slate-500 font-bold text-lg">
              {slot}
            </div>
            <p className="text-sm text-slate-500">Tap to pick video</p>
          </>
        )}
        <input
          type="file"
          accept="video/*,video/mp4,video/quicktime,video/webm,video/x-m4v"
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          onChange={onChange}
          disabled={importing}
        />
      </label>
    </div>
  );
}
