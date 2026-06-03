import { put, head, list } from '@vercel/blob';
import type { LogosDB } from './types';

const BLOB_KEY = 'vibelogos-db.json';

const EMPTY_DB: LogosDB = { logos: [], last_id: 0 };

export async function readDB(): Promise<LogosDB> {
  try {
    // Find the blob by prefix
    const { blobs } = await list({ prefix: BLOB_KEY });
    if (!blobs.length) return { ...EMPTY_DB };

    const blob = blobs[0];
    const res = await fetch(blob.url);
    if (!res.ok) return { ...EMPTY_DB };
    return await res.json();
  } catch {
    return { ...EMPTY_DB };
  }
}

export async function writeDB(db: LogosDB): Promise<void> {
  await put(BLOB_KEY, JSON.stringify(db, null, 2), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}
