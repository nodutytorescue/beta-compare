import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { AttemptRecord, ComparisonState, Screen, TrimState } from '../types';

interface AppState {
  screen: Screen;
  attempts: AttemptRecord[];
  trim: TrimState | null;
  comparison: ComparisonState | null;
  selectedA: AttemptRecord | null;
  selectedB: AttemptRecord | null;

  goToImport: () => void;
  goToTrim: (attemptId: string, fileName: string, slot: 'A' | 'B') => void;
  goToPlayer: (a: AttemptRecord, b: AttemptRecord) => void;

  setSlotA: (attempt: AttemptRecord | null) => void;
  setSlotB: (attempt: AttemptRecord | null) => void;
  addAttempt: (record: AttemptRecord) => void;
  removeAttempt: (id: string) => void;
  setAttempts: (records: AttemptRecord[]) => void;
}

export const useAppStore = create<AppState>()(
  immer((set) => ({
    screen: 'import',
    attempts: [],
    trim: null,
    comparison: null,
    selectedA: null,
    selectedB: null,

    goToImport: () =>
      set(state => {
        state.screen = 'import';
        state.trim = null;
        state.comparison = null;
      }),

    goToTrim: (attemptId, fileName, slot) =>
      set(state => {
        state.screen = 'trim';
        state.trim = { attemptId, fileName, slot };
      }),

    goToPlayer: (a, b) =>
      set(state => {
        state.screen = 'player';
        state.comparison = { attemptA: a, attemptB: b };
      }),

    setSlotA: (attempt) =>
      set(state => { state.selectedA = attempt; }),

    setSlotB: (attempt) =>
      set(state => { state.selectedB = attempt; }),

    addAttempt: (record) =>
      set(state => {
        const idx = state.attempts.findIndex(a => a.id === record.id);
        if (idx >= 0) state.attempts[idx] = record;
        else state.attempts.push(record);
      }),

    removeAttempt: (id) =>
      set(state => {
        state.attempts = state.attempts.filter(a => a.id !== id);
      }),

    setAttempts: (records) =>
      set(state => { state.attempts = records; }),
  }))
);
