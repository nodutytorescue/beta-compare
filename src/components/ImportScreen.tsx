import { useState, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { saveAttempt } from '../lib/db';
import type { AttemptRecord } from '../types';

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export default function ImportScreen() {
  const attempts = useAppStore(s => s.attempts);
  const addAttempt = useAppStore(s => s.addAttempt);
  const selectedA = useAppStore(s => s.selectedA);
  const selectedB = useAppStore(s => s.selectedB);
  const setSlotA = useAppStore(s => s.setSlotA);
  const setSlotB = useAppStore(s => s.setSlotB);
  const goToTrim = useAppStore(s => s.goToTrim);
  const goToPlayer = useAppStore(s => s.goToPlayer);

  const [activeSlot, setActiveSlot] = useState<'A' | 'B' | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const trimmedAttempts = attempts.filter(a => a.duration > 0);
  const canCompare = selectedA !== null && selectedB !== null;

  const openPicker = (slot: 'A' | 'B') => {
    setActiveSlot(slot);
  };

  const closePicker = () => setActiveSlot(null);

  const handlePickExisting = (attempt: AttemptRecord) => {
    if (activeSlot === 'A') setSlotA(attempt);
    else setSlotB(attempt);
    closePicker();
  };

  const handleImportNew = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.currentTarget.value = '';
    if (!file || !activeSlot) return;

    setImporting(true);
    const slot = activeSlot;
    closePicker();

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
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="h-dvh flex flex-col bg-slate-900 text-slate-100">
      {/* Header */}
      <header
        className="flex-shrink-0 flex items-center justify-center px-4 pb-3 bg-slate-900"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <h1 className="text-base font-bold tracking-tight text-slate-400">Beta Compare</h1>
      </header>

      {/* Two-pane split */}
      <div className="flex-1 min-h-0 flex flex-row gap-1 px-1">
        <SlotPanel
          label="A"
          selected={selectedA}
          onTap={() => openPicker('A')}
        />
        <SlotPanel
          label="B"
          selected={selectedB}
          onTap={() => openPicker('B')}
        />
      </div>

      {/* Compare button */}
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

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,video/mp4,video/quicktime,video/webm,video/x-m4v"
        className="sr-only"
        onChange={handleFileChange}
        disabled={importing}
      />

      {/* Picker sheet */}
      {activeSlot && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end" onClick={closePicker}>
          <div
            className="bg-slate-800 rounded-t-2xl flex flex-col max-h-[70vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-700 flex-shrink-0">
              <span className="font-semibold text-sm">Video {activeSlot}</span>
              <button onClick={closePicker} className="text-slate-400 hover:text-slate-200 text-lg leading-none">✕</button>
            </div>

            <div className="overflow-y-auto flex-1">
              {trimmedAttempts.length > 0 && (
                <ul className="p-3 flex flex-col gap-2">
                  {trimmedAttempts.map(attempt => (
                    <li
                      key={attempt.id}
                      onClick={() => handlePickExisting(attempt)}
                      className="flex items-center gap-3 p-3 rounded-lg bg-slate-700 hover:bg-slate-600 cursor-pointer transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{attempt.name}</p>
                        <p className="text-xs text-slate-400">
                          {formatDuration(attempt.trimEnd - attempt.trimStart)} climbing
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="p-4 border-t border-slate-700 flex-shrink-0">
              <button
                onClick={handleImportNew}
                disabled={importing}
                className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
              >
                {importing ? 'Reading…' : '+ Import New Video'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SlotPanel({ label, selected, onTap }: {
  label: 'A' | 'B';
  selected: AttemptRecord | null;
  onTap: () => void;
}) {
  return (
    <div
      onClick={onTap}
      className="flex-1 flex flex-col items-center justify-center rounded-lg bg-slate-800 border-2 border-dashed border-slate-700 cursor-pointer hover:border-slate-500 hover:bg-slate-750 transition-colors gap-3 active:bg-slate-700"
    >
      {selected ? (
        <>
          <div className="w-10 h-10 flex items-center justify-center rounded-full bg-sky-600 text-white font-bold text-lg">
            {label}
          </div>
          <div className="text-center px-4">
            <p className="text-sm font-medium truncate max-w-[120px]">{selected.name}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {formatDuration(selected.trimEnd - selected.trimStart)}
            </p>
          </div>
          <p className="text-xs text-slate-500">tap to change</p>
        </>
      ) : (
        <>
          <div className="w-10 h-10 flex items-center justify-center rounded-full border-2 border-slate-600 text-slate-500 font-bold text-lg">
            {label}
          </div>
          <p className="text-sm text-slate-500">Tap to pick video</p>
        </>
      )}
    </div>
  );
}
