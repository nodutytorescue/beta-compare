export interface AttemptRecord {
  id: string;
  name: string;
  blobKey: string;
  mimeType: string;    // original file MIME type (e.g. video/quicktime for iPhone .mov)
  duration: number;    // full video duration in seconds
  trimStart: number;   // seconds — start of climbing portion
  trimEnd: number;     // seconds — end of climbing portion
  createdAt: number;
}

export type Screen = 'import' | 'trim' | 'player';

export interface TrimState {
  attemptId: string;
  fileName: string;
  slot: 'A' | 'B';
}

export interface ComparisonState {
  attemptA: AttemptRecord;
  attemptB: AttemptRecord;
}
