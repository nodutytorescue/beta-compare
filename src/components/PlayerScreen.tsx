import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { getBlobUrl } from '../lib/db';
import { timeAtProgress, normalizeJointCurves } from '../lib/progressCurve';
import { SyncController } from '../lib/syncLogic';
import type { AttemptRecord, SyncMarker } from '../types';
import VideoPanel from './VideoPanel';
import Controls from './Controls';
import SyncMarkers from './SyncMarkers';

interface PlayerProps {
  attemptA: AttemptRecord;
  attemptB: AttemptRecord;
  leader: 'A' | 'B';
  syncMarkers: SyncMarker[];
  isPlaying: boolean;
}

function Player({ attemptA, attemptB, leader, syncMarkers, isPlaying }: PlayerProps) {
  const setLeader = useAppStore(s => s.setLeader);
  const swapLeader = useAppStore(s => s.swapLeader);
  const setIsPlaying = useAppStore(s => s.setIsPlaying);
  const addSyncMarker = useAppStore(s => s.addSyncMarker);
  const removeSyncMarker = useAppStore(s => s.removeSyncMarker);
  const goToImport = useAppStore(s => s.goToImport);

  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const scrubberRef = useRef<HTMLInputElement>(null);
  const syncRef = useRef(new SyncController());
  const isPlayingRef = useRef(false);
  const maxProgressRef = useRef(0);
  const [videosReady, setVideosReady] = useState(false);

  isPlayingRef.current = isPlaying;

  const leaderVideoRef = leader === 'A' ? videoARef : videoBRef;
  const followerVideoRef = leader === 'A' ? videoBRef : videoARef;
  const leaderAttempt = leader === 'A' ? attemptA : attemptB;
  const followerAttempt = leader === 'A' ? attemptB : attemptA;

  // Load blob URLs and wait for both videos to be ready
  useEffect(() => {
    let cancelled = false;
    setVideosReady(false);
    const urlsToRevoke: string[] = [];

    (async () => {
      try {
        const [urlA, urlB] = await Promise.all([
          getBlobUrl(attemptA.blobKey),
          getBlobUrl(attemptB.blobKey)
        ]);
        if (cancelled) { URL.revokeObjectURL(urlA); URL.revokeObjectURL(urlB); return; }
        urlsToRevoke.push(urlA, urlB);

        const va = videoARef.current;
        const vb = videoBRef.current;
        if (!va || !vb) return;

        // Wait for both to have enough data to play
        const readyPromise = (v: HTMLVideoElement, src: string) =>
          new Promise<void>((resolve) => {
            v.src = src;
            v.addEventListener('canplay', () => resolve(), { once: true });
            // canplay might already have fired if src was cached
            if (v.readyState >= 3) resolve();
          });

        await Promise.all([readyPromise(va, urlA), readyPromise(vb, urlB)]);
        if (!cancelled) {
          // Start both videos at their trim start so playback begins at the climb
          va.currentTime = attemptA.trimStart ?? 0;
          vb.currentTime = attemptB.trimStart ?? 0;
          setVideosReady(true);
        }
      } catch (err) {
        console.error('Failed to load videos:', err);
      }
    })();

    return () => {
      cancelled = true;
      urlsToRevoke.forEach(u => URL.revokeObjectURL(u));
    };
  }, [attemptA.blobKey, attemptB.blobKey]);

  // Configure SyncController when roles/markers/curves change
  useEffect(() => {
    const lv = leaderVideoRef.current;
    const fv = followerVideoRef.current;
    if (!lv || !fv) return;

    const [normLeader, normFollower] = normalizeJointCurves(
      leaderAttempt.progressCurve,
      followerAttempt.progressCurve
    );

    syncRef.current.configure({
      leader: lv,
      follower: fv,
      leaderCurve: normLeader,
      followerCurve: normFollower,
      syncMarkers,
      leaderRole: leader,
      onProgressUpdate: (progress) => {
        // Monotonically advance — hips dipping during a move don't scroll back
        const display = Math.max(maxProgressRef.current, progress);
        maxProgressRef.current = display;
        if (scrubberRef.current) {
          scrubberRef.current.value = String(Math.round(display * 1000));
        }
      }
    });
  }, [leader, syncMarkers, leaderAttempt, followerAttempt, leaderVideoRef, followerVideoRef]);

  // Start/stop rAF loop with isPlaying
  useEffect(() => {
    if (isPlaying) syncRef.current.start();
    else syncRef.current.stop();
    return () => syncRef.current.stop();
  }, [isPlaying]);

  const handlePlayPause = useCallback(() => {
    const lv = leaderVideoRef.current;
    if (!lv) return;

    if (isPlayingRef.current) {
      lv.pause();
      setIsPlaying(false);
    } else {
      lv.play().then(() => setIsPlaying(true)).catch(err => {
        console.error('play() failed:', err);
      });
    }
  }, [leaderVideoRef, setIsPlaying]);

  const normLeaderCurveRef = useRef(leaderAttempt.progressCurve);
  useEffect(() => {
    const [normLeader] = normalizeJointCurves(
      leaderAttempt.progressCurve,
      followerAttempt.progressCurve
    );
    normLeaderCurveRef.current = normLeader;
  }, [leaderAttempt.progressCurve, followerAttempt.progressCurve]);

  const handleScrub = useCallback((progress: number) => {
    const lv = leaderVideoRef.current;
    if (!lv) return;

    // Reset monotonic max so scrubbing backward doesn't lock the thumb
    maxProgressRef.current = progress;

    const curve = normLeaderCurveRef.current;
    const targetTime = curve.length > 0
      ? timeAtProgress(curve, progress) / 1000
      : progress * (lv.duration || 0);

    lv.currentTime = targetTime;
    lv.addEventListener('seeked', () => syncRef.current.syncOnce(), { once: true });
  }, [leaderVideoRef]);

  const handleAddMarker = useCallback((marker: SyncMarker) => {
    addSyncMarker(marker);
  }, [addSyncMarker]);

  // Pause + reset when leader ends
  useEffect(() => {
    const lv = leaderVideoRef.current;
    if (!lv) return;
    const onEnded = () => setIsPlaying(false);
    lv.addEventListener('ended', onEnded);
    return () => lv.removeEventListener('ended', onEnded);
  }, [leaderVideoRef, setIsPlaying]);

  const leaderTime = leaderVideoRef.current?.currentTime ?? 0;
  const followerTime = followerVideoRef.current?.currentTime ?? 0;

  return (
    <div className="h-dvh flex flex-col bg-slate-900 text-slate-100 overflow-hidden">
      {/* Videos — leader always rendered on the left via CSS order */}
      <div className="flex flex-row flex-1 min-h-0 gap-1 p-1">
        <div className="flex-1 min-h-0 flex flex-col" style={{ order: leader === 'A' ? 0 : 1 }}>
          <VideoPanel
            ref={videoARef}
            attempt={attemptA}
            isLeader={leader === 'A'}
            label="A"
            onSetLeader={() => setLeader('A')}
          />
        </div>
        <div className="flex-1 min-h-0 flex flex-col" style={{ order: leader === 'A' ? 1 : 0 }}>
          <VideoPanel
            ref={videoBRef}
            attempt={attemptB}
            isLeader={leader === 'B'}
            label="B"
            onSetLeader={() => setLeader('B')}
          />
        </div>
      </div>

      {/* Controls panel */}
      <div className="flex-shrink-0 flex flex-col gap-2 p-2 bg-slate-900 border-t border-slate-700 overflow-y-auto">
        <Controls
          isPlaying={isPlaying}
          scrubberRef={scrubberRef}
          disabled={!videosReady}
          onPlayPause={handlePlayPause}
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
    />
  );
}
