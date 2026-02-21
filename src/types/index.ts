// ─── Domain Types ───────────────────────────────────────────────────────────

export interface ProgressPoint {
  timestamp: number;   // milliseconds from video start
  progress: number;    // 0–1, hip height normalized (higher = further up route)
  confidence: number;  // 0–1 from landmark visibility
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
  createdAt: number;        // Date.now()
}

export type Screen = 'import' | 'trim' | 'processing' | 'player';

export interface TrimState {
  attemptId: string;
  fileName: string;
}

export interface ProcessingState {
  attemptId: string;
  fileName: string;
  trimStart: number;        // seconds
  trimEnd: number;          // seconds
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
