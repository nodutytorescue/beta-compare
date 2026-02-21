import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { AttemptRecord, ComparisonState, ProcessingState, Screen, SyncMarker, TrimState } from '../types';

interface AppState {
  screen: Screen;
  attempts: AttemptRecord[];
  trim: TrimState | null;
  processing: ProcessingState | null;
  comparison: ComparisonState | null;

  // Navigation
  goToImport: () => void;
  goToTrim: (attemptId: string, fileName: string) => void;
  goToProcessing: (attemptId: string, fileName: string, trimStart: number, trimEnd: number) => void;
  goToPlayer: (a: AttemptRecord, b: AttemptRecord) => void;

  // Attempt library
  addAttempt: (record: AttemptRecord) => void;
  removeAttempt: (id: string) => void;
  setAttempts: (records: AttemptRecord[]) => void;

  // Processing progress
  setTotalFrames: (n: number) => void;
  incrementProcessed: () => void;

  // Comparison controls
  setLeader: (leader: 'A' | 'B') => void;
  swapLeader: () => void;
  setPlaybackSpeed: (speed: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setCurrentProgress: (progress: number) => void;
  addSyncMarker: (marker: SyncMarker) => void;
  removeSyncMarker: (index: number) => void;
}

export const useAppStore = create<AppState>()(
  immer((set) => ({
    screen: 'import',
    attempts: [],
    trim: null,
    processing: null,
    comparison: null,

    goToImport: () =>
      set(state => {
        state.screen = 'import';
        state.trim = null;
        state.processing = null;
        state.comparison = null;
      }),

    goToTrim: (attemptId, fileName) =>
      set(state => {
        state.screen = 'trim';
        state.trim = { attemptId, fileName };
      }),

    goToProcessing: (attemptId, fileName, trimStart, trimEnd) =>
      set(state => {
        state.screen = 'processing';
        state.processing = { attemptId, fileName, trimStart, trimEnd, totalFrames: 0, processedFrames: 0 };
      }),

    goToPlayer: (a, b) =>
      set(state => {
        state.screen = 'player';
        state.comparison = {
          attemptA: a,
          attemptB: b,
          leader: 'A',
          syncMarkers: [],
          playbackSpeed: 1,
          isPlaying: false,
          currentProgress: 0
        };
      }),

    addAttempt: (record) =>
      set(state => {
        const idx = state.attempts.findIndex(a => a.id === record.id);
        if (idx >= 0) state.attempts[idx] = record; // upsert
        else state.attempts.push(record);
      }),

    removeAttempt: (id) =>
      set(state => {
        state.attempts = state.attempts.filter(a => a.id !== id);
      }),

    setAttempts: (records) =>
      set(state => { state.attempts = records; }),

    setTotalFrames: (n) =>
      set(state => {
        if (state.processing) state.processing.totalFrames = n;
      }),

    incrementProcessed: () =>
      set(state => {
        if (state.processing) state.processing.processedFrames++;
      }),

    setLeader: (leader) =>
      set(state => {
        if (state.comparison) state.comparison.leader = leader;
      }),

    swapLeader: () =>
      set(state => {
        if (state.comparison) {
          state.comparison.leader = state.comparison.leader === 'A' ? 'B' : 'A';
        }
      }),

    setPlaybackSpeed: (speed) =>
      set(state => {
        if (state.comparison) state.comparison.playbackSpeed = speed;
      }),

    setIsPlaying: (playing) =>
      set(state => {
        if (state.comparison) state.comparison.isPlaying = playing;
      }),

    setCurrentProgress: (progress) =>
      set(state => {
        if (state.comparison) state.comparison.currentProgress = progress;
      }),

    addSyncMarker: (marker) =>
      set(state => {
        if (state.comparison && state.comparison.syncMarkers.length < 8) {
          state.comparison.syncMarkers.push(marker);
          // Keep sorted by videoA time
          state.comparison.syncMarkers.sort((a, b) => a.videoATime - b.videoATime);
        }
      }),

    removeSyncMarker: (index) =>
      set(state => {
        if (state.comparison) {
          state.comparison.syncMarkers.splice(index, 1);
        }
      })
  }))
);
