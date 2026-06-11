/**
 * lib/google-drive.ts
 * List files dari Google Drive folder menggunakan Google Drive API v3
 * Requires: GOOGLE_API_KEY di environment variables
 *
 * Cara dapat API Key:
 * 1. Google Cloud Console → APIs & Services → Credentials → Create API Key
 * 2. Restrict key: Drive API only
 * 3. Tambah ke .env.local: GOOGLE_API_KEY=your_key_here
 */

import type { MockupItem } from './types';

const LOGOS_FOLDER_ID   = '1UhykOJWcIl7JSgADXYphCCK6JQ5BH-eo';
const MOCKUPS_FOLDER_ID = '1QFZ6HzsdZ8qh1nv5s135ltGVrnWDFdPu';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

// Image MIME types yang di-support
const IMAGE_MIMES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
];

/**
 * Konversi Drive fileId ke direct view URL
 */
export function toDriveDirectUrl(fileId: string): string {
  if (!fileId) return '';
  // Jika sudah full URL, extract fileId dulu
  if (fileId.includes('drive.google.com')) {
    const m = fileId.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
              fileId.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m) fileId = m[1];
    else return fileId;
  }
  return `https://drive.google.com/uc?export=view&id=${fileId}`;
}

/**
 * Thumbnail URL (lebih cepat load, ukuran tertentu)
 */
export function toDriveThumbnail(fileId: string, size = 400): string {
  if (!fileId) return '';
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${size}`;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

interface DriveFolder {
  id: string;
  name: string;
}

/**
 * List files dalam sebuah folder Drive
 */
async function listFilesInFolder(folderId: string): Promise<DriveFile[]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error('[drive] GOOGLE_API_KEY tidak ditemukan di environment');
    return [];
  }

  const params = new URLSearchParams({
    key: apiKey,
    q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id,name,mimeType)',
    pageSize: '50',
    orderBy: 'name',
  });

  const res = await fetch(`${DRIVE_API}/files?${params}`, {
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[drive] listFiles error:', err);
    return [];
  }

  const data = await res.json();
  return (data.files || []) as DriveFile[];
}

/**
 * List subfolders dalam sebuah folder Drive
 */
async function listSubfolders(parentFolderId: string): Promise<DriveFolder[]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return [];

  const params = new URLSearchParams({
    key: apiKey,
    q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id,name)',
    pageSize: '200',
    orderBy: 'name',
  });

  const res = await fetch(`${DRIVE_API}/files?${params}`, {
    next: { revalidate: 300 },
  });

  if (!res.ok) return [];
  const data = await res.json();
  return (data.files || []) as DriveFolder[];
}

// Cache subfolder list agar tidak hit API berkali-kali
let mockupSubfolderCache: { folders: DriveFolder[]; ts: number } | null = null;
let logoSubfolderCache:   { folders: DriveFolder[]; ts: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000; // 10 menit

async function getMockupSubfolders(): Promise<DriveFolder[]> {
  if (mockupSubfolderCache && Date.now() - mockupSubfolderCache.ts < CACHE_TTL) {
    return mockupSubfolderCache.folders;
  }
  const folders = await listSubfolders(MOCKUPS_FOLDER_ID);
  mockupSubfolderCache = { folders, ts: Date.now() };
  return folders;
}

async function getLogoSubfolders(): Promise<DriveFolder[]> {
  if (logoSubfolderCache && Date.now() - logoSubfolderCache.ts < CACHE_TTL) {
    return logoSubfolderCache.folders;
  }
  const folders = await listSubfolders(LOGOS_FOLDER_ID);
  logoSubfolderCache = { folders, ts: Date.now() };
  return folders;
}

/**
 * Fetch mockup images untuk satu logo
 * @param folderRef - bisa berupa: folder ID Drive langsung, atau logoground ID (misal "761026")
 */
export async function fetchMockupsForLogo(folderRef: string): Promise<MockupItem[]> {
  if (!folderRef) return [];

  let folderId = folderRef;

  // Kalau bukan Drive folder ID format (Drive ID biasanya panjang & mixed),
  // coba lookup by name di subfolders mockup
  const isDriveFolderId = /^[a-zA-Z0-9_-]{20,}$/.test(folderRef);

  if (!isDriveFolderId) {
    // folderRef adalah logoground ID, cari subfolder bernama itu
    const subfolders = await getMockupSubfolders();
    const match = subfolders.find(f => f.name === folderRef);
    if (!match) {
      console.warn(`[drive] Mockup folder "${folderRef}" tidak ditemukan`);
      return [];
    }
    folderId = match.id;
  }

  const files = await listFilesInFolder(folderId);
  const imageFiles = files.filter(f => IMAGE_MIMES.includes(f.mimeType));

  return imageFiles.map((f, i) => ({
    fileId: f.id,
    label: `Mockup ${i + 1}`,
    url: toDriveDirectUrl(f.id),
    scene: f.name.replace(/\.[^.]+$/, ''), // nama file tanpa ekstensi
  }));
}

/**
 * Fetch logo image file ID untuk satu logo
 * @param logogroundId - ID dari logoground URL, misal "761026"
 * Struktur Drive: logos_folder/761026/logo_file.png
 */
export async function fetchLogoFileId(logogroundId: string): Promise<string> {
  if (!logogroundId) return '';

  const subfolders = await getLogoSubfolders();
  const match = subfolders.find(f => f.name === logogroundId);
  if (!match) return '';

  const files = await listFilesInFolder(match.id);
  const img = files.find(f => IMAGE_MIMES.includes(f.mimeType));
  return img?.id || '';
}

/**
 * Fetch logo image URL untuk satu logo
 */
export async function fetchLogoImageUrl(logogroundId: string): Promise<string> {
  const fileId = await fetchLogoFileId(logogroundId);
  return fileId ? toDriveDirectUrl(fileId) : '';
}
