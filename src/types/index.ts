// ─── Domain Types ───────────────────────────────────────────────────────────

export interface ProgressPoint {
  timestamp: number;   // milliseconds from video start
  progress: number;    // 0–1, position along route (higher = further up)
  confidence: number;  // 0–1 from landmark visibility
}

export interface Hold {
  x: number;  // normalized 0–1 within video frame
  y: number;  // normalized 0–1 within video frame
}

export interface SyncMarker {
  videoATime: number;  // seconds
  videoBTime: number;  // seconds
}

export interface AttemptRecord {
  id: string;
  name: string;
  blobKey: string;          // key into idb 'blobs' store (same as id)
  progressCurve: ProgressPoint[];
  duration: number;         // seconds
  trimStart?: number;       // seconds — start of climbing portion
  trimEnd?: number;         // seconds — end of climbing portion
  holds?: Hold[];           // route holds in order, normalized video coords
  createdAt: number;        // Date.now()
}

export type Screen = 'import' | 'trim' | 'hold-marking' | 'processing' | 'player';

export interface TrimState {
  attemptId: string;
  fileName: string;
}

export interface HoldMarkingState {
  attemptId: string;
  fileName: string;
  trimStart: number;
  trimEnd: number;
}

export interface ProcessingState {
  attemptId: string;
  fileName: string;
  trimStart: number;        // seconds
  trimEnd: number;          // seconds
  holds: Hold[];            // route holds from marking step
  totalFrames: number;
  processedFrames: number;
}

export interface ComparisonState {
  attemptA: AttemptRecord;
  attemptB: AttemptRecord;
  leader: 'A' | 'B';
  syncMarkers: SyncMarker[];  // max 8
  playbackSpeed: number;
  isPlaying: boolean;
  currentProgress: number;   // 0–1, updated from rAF
}

// ─── Worker Message Protocol ────────────────────────────────────────────────

export interface WorkerInitMessage {
  type: 'INIT';
  modelUrl: string;
  wasmBaseUrl: string;
}

export interface WorkerProcessFrameMessage {
  type: 'PROCESS_FRAME';
  frameIndex: number;
  timestampMs: number;
  bitmap: ImageBitmap;
}

export interface WorkerInitDoneMessage {
  type: 'INIT_DONE';
}

export interface WorkerInitErrorMessage {
  type: 'INIT_ERROR';
  error: string;
}

export interface WorkerFrameResultMessage {
  type: 'FRAME_RESULT';
  frameIndex: number;
  timestampMs: number;
  progress: number | null;   // null = no climber detected
  confidence: number;
}

export type MainToWorkerMessage = WorkerInitMessage | WorkerProcessFrameMessage;
export type WorkerToMainMessage =
  | WorkerInitDoneMessage
  | WorkerInitErrorMessage
  | WorkerFrameResultMessage;
