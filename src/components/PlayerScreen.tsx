import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { getBlobUrl } from '../lib/db';
import { timeAtProgress } from '../lib/progressCurve';
import { SyncController } from '../lib/syncLogic';
import type { AttemptRecord, SyncMarker } from '../types';
import VideoPanel from './VideoPanel';
import Controls from './Controls';
import SyncMarkers from './SyncMarkers';

// Inner component receives guaranteed non-null comparison data
interface PlayerProps {
  attemptA: AttemptRecord;
  attemptB: AttemptRecord;
  leader: 'A' | 'B';
  syncMarkers: SyncMarker[];
  isPlaying: boolean;
  playbackSpeed: number;
}

function Player({ attemptA, attemptB, leader, syncMarkers, isPlaying, playbackSpeed }: PlayerProps) {
  const setLeader = useAppStore(s => s.setLeader);
  const swapLeader = useAppStore(s => s.swapLeader);
  const setPlaybackSpeed = useAppStore(s => s.setPlaybackSpeed);
  const setIsPlaying = useAppStore(s => s.setIsPlaying);
  const addSyncMarker = useAppStore(s => s.addSyncMarker);
  const removeSyncMarker = useAppStore(s => s.removeSyncMarker);
  const goToImport = useAppStore(s => s.goToImport);

  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const scrubberRef = useRef<HTMLInputElement>(null);
  const syncRef = useRef(new SyncController());
  const isPlayingRef = useRef(false);

  isPlayingRef.current = isPlaying;

  const leaderVideoRef = leader === 'A' ? videoARef : videoBRef;
  const followerVideoRef = leader === 'A' ? videoBRef : videoARef;
  const leaderAttempt = leader === 'A' ? attemptA : attemptB;
  const followerAttempt = leader === 'A' ? attemptB : attemptA;

  // Load blob URLs
  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];

    (async () => {
      const [urlA, urlB] = await Promise.all([
        getBlobUrl(attemptA.blobKey),
        getBlobUrl(attemptB.blobKey)
      ]);
      if (cancelled) {
        URL.revokeObjectURL(urlA);
        URL.revokeObjectURL(urlB);
        return;
      }
      urls.push(urlA, urlB);
      if (videoARef.current) videoARef.current.src = urlA;
      if (videoBRef.current) videoBRef.current.src = urlB;
    })();

    return () => {
      cancelled = true;
      urls.forEach(u => URL.revokeObjectURL(u));
    };
  }, [attemptA.blobKey, attemptB.blobKey]);

  // Configure SyncController when roles/markers change
  useEffect(() => {
    const lv = leaderVideoRef.current;
    const fv = followerVideoRef.current;
    if (!lv || !fv) return;

    syncRef.current.configure({
      leader: lv,
      follower: fv,
      leaderCurve: leaderAttempt.progressCurve,
      followerCurve: followerAttempt.progressCurve,
      syncMarkers,
      leaderRole: leader,
      onProgressUpdate: (progress) => {
        if (scrubberRef.current) {
          scrubberRef.current.value = String(Math.round(progress * 1000));
        }
      }
    });
  }, [leader, syncMarkers, leaderAttempt, followerAttempt, leaderVideoRef, followerVideoRef]);

  // Start/stop rAF loop
  useEffect(() => {
    if (isPlaying) {
      syncRef.current.start();
    } else {
      syncRef.current.stop();
    }
    return () => syncRef.current.stop();
  }, [isPlaying]);

  const handlePlayPause = useCallback(() => {
    const lv = leaderVideoRef.current;
    if (!lv) return;

    if (isPlayingRef.current) {
      lv.pause();
      setIsPlaying(false);
    } else {
      lv.playbackRate = playbackSpeed;
      lv.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  }, [leaderVideoRef, playbackSpeed, setIsPlaying]);

  const handleSpeedChange = useCallback((speed: number) => {
    setPlaybackSpeed(speed);
    if (leaderVideoRef.current) leaderVideoRef.current.playbackRate = speed;
  }, [leaderVideoRef, setPlaybackSpeed]);

  const handleScrub = useCallback((progress: number) => {
    const lv = leaderVideoRef.current;
    if (!lv) return;
    const curve = leaderAttempt.progressCurve;
    if (curve.length === 0) return;
    const ms = timeAtProgress(curve, progress);
    lv.currentTime = ms / 1000;
    syncRef.current.syncOnce();
  }, [leaderVideoRef, leaderAttempt.progressCurve]);

  const handleAddMarker = useCallback((marker: SyncMarker) => {
    addSyncMarker(marker);
  }, [addSyncMarker]);

  // Read current times for marker display (approximate — not reactive)
  const leaderTime = leaderVideoRef.current?.currentTime ?? 0;
  const followerTime = followerVideoRef.current?.currentTime ?? 0;

  return (
    <div className="h-dvh flex flex-col landscape:flex-row bg-slate-900 text-slate-100 overflow-hidden">
      {/* Videos */}
      <div className="flex flex-col landscape:flex-row flex-1 min-h-0 gap-1 p-1">
        <VideoPanel
          ref={videoARef}
          attempt={attemptA}
          isLeader={leader === 'A'}
          label="A"
          onSetLeader={() => setLeader('A')}
        />
        <VideoPanel
          ref={videoBRef}
          attempt={attemptB}
          isLeader={leader === 'B'}
          label="B"
          onSetLeader={() => setLeader('B')}
        />
      </div>

      {/* Controls panel */}
      <div className="flex-shrink-0 flex flex-col gap-2 p-2 bg-slate-900 border-t landscape:border-t-0 landscape:border-l border-slate-700 landscape:w-64 overflow-y-auto">
        <Controls
          isPlaying={isPlaying}
          playbackSpeed={playbackSpeed}
          scrubberRef={scrubberRef}
          onPlayPause={handlePlayPause}
          onSpeedChange={handleSpeedChange}
          onScrub={handleScrub}
          onSwapLeader={swapLeader}
        />

        <SyncMarkers
          markers={syncMarkers}
          leaderRole={leader}
          leaderCurrentTime={leaderTime}
          followerCurrentTime={followerTime}
          onAdd={handleAddMarker}
          onRemove={removeSyncMarker}
        />

        <button
          onClick={goToImport}
          className="text-xs text-slate-500 hover:text-slate-300 underline self-center mt-auto pt-2 transition-colors"
        >
          ← Back to Library
        </button>
      </div>
    </div>
  );
}

export default function PlayerScreen() {
  const comparison = useAppStore(s => s.comparison);

  if (!comparison) return null;

  return (
    <Player
      attemptA={comparison.attemptA}
      attemptB={comparison.attemptB}
      leader={comparison.leader}
      syncMarkers={comparison.syncMarkers}
      isPlaying={comparison.isPlaying}
      playbackSpeed={comparison.playbackSpeed}
    />
  );
}
