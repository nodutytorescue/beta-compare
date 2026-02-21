import { openDB, type IDBPDatabase } from 'idb';
import type { AttemptRecord } from '../types';

const DB_NAME = 'beta-compare';
const DB_VERSION = 1;

interface BetaCompareDB {
  attempts: {
    key: string;
    value: AttemptRecord;
    indexes: { 'by-createdAt': number };
  };
  blobs: {
    key: string;
    value: ArrayBuffer;
  };
}

let _db: IDBPDatabase<BetaCompareDB> | null = null;

async function getDb(): Promise<IDBPDatabase<BetaCompareDB>> {
  if (_db) return _db;
  _db = await openDB<BetaCompareDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const attemptStore = db.createObjectStore('attempts', { keyPath: 'id' });
      attemptStore.createIndex('by-createdAt', 'createdAt');
      db.createObjectStore('blobs');
    }
  });
  return _db;
}

export async function saveAttempt(
  record: AttemptRecord,
  videoBuffer: ArrayBuffer
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['attempts', 'blobs'], 'readwrite');
  await Promise.all([
    tx.objectStore('attempts').put(record),
    tx.objectStore('blobs').put(videoBuffer, record.blobKey),
    tx.done
  ]);
}

export async function getAllAttempts(): Promise<AttemptRecord[]> {
  const db = await getDb();
  return db.getAllFromIndex('attempts', 'by-createdAt');
}

export async function getAttempt(id: string): Promise<AttemptRecord | undefined> {
  const db = await getDb();
  return db.get('attempts', id);
}

export async function deleteAttempt(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['attempts', 'blobs'], 'readwrite');
  await Promise.all([
    tx.objectStore('attempts').delete(id),
    tx.objectStore('blobs').delete(id),
    tx.done
  ]);
}

export async function updateAttemptRecord(record: AttemptRecord): Promise<void> {
  const db = await getDb();
  await db.put('attempts', record);
}

export async function getBlobUrl(blobKey: string): Promise<string> {
  const db = await getDb();
  const buffer = await db.get('blobs', blobKey);
  if (!buffer) throw new Error(`Blob not found: ${blobKey}`);
  const blob = new Blob([buffer], { type: 'video/mp4' });
  return URL.createObjectURL(blob);
}
