// lib/google-drive.ts
// Service Account Google Drive helper

import { Readable } from 'stream';

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const DRIVE_API = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_META = 'https://www.googleapis.com/drive/v3/files';

// ── JWT / Access Token ────────────────────────────────────────────────────────
let _cachedToken: { token: string; exp: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (_cachedToken && _cachedToken.exp > now + 60) return _cachedToken.token;

  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env tidak ada');

  const sa = JSON.parse(serviceAccountJson);
  const iat = now;
  const exp = now + 3600;

  // Build JWT header.payload
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payload = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: SCOPES.join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp,
  })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const signingInput = `${header}.${payload}`;

  // Import private key
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const keyData = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyData.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  // Sign
  const enc = new TextEncoder();
  const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, enc.encode(signingInput));
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${signingInput}.${sig}`;

  // Exchange for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('Gagal dapat access token: ' + JSON.stringify(tokenData));

  _cachedToken = { token: tokenData.access_token, exp };
  return _cachedToken.token;
}

// ── Upload file buffer ke Google Drive ───────────────────────────────────────
export async function uploadToDrive(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  folderId?: string,
): Promise<{ fileId: string; url: string }> {
  const token = await getAccessToken();

  const metadata: Record<string, unknown> = { name: filename };
  if (folderId) metadata.parents = [folderId];

  // Multipart upload
  const boundary = '-------vibelogos_boundary';
  const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const filePart = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;

  const metaBytes = new TextEncoder().encode(metaPart);
  const fileBytes = new Uint8Array(buffer);
  const filePartBytes = new TextEncoder().encode(filePart);
  const closingBytes = new TextEncoder().encode(closing);

  const body = new Uint8Array(metaBytes.length + filePartBytes.length + fileBytes.length + closingBytes.length);
  body.set(metaBytes, 0);
  body.set(filePartBytes, metaBytes.length);
  body.set(fileBytes, metaBytes.length + filePartBytes.length);
  body.set(closingBytes, metaBytes.length + filePartBytes.length + fileBytes.length);

  const res = await fetch(`${DRIVE_API}?uploadType=multipart&fields=id,name`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  const data = await res.json();
  if (!data.id) throw new Error('Upload Drive gagal: ' + JSON.stringify(data));

  const fileId: string = data.id;
  const url = `/api/file/${fileId}`;
  return { fileId, url };
}

// ── Download file dari Drive (untuk proxy) ───────────────────────────────────
export async function downloadFromDrive(fileId: string): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
  const token = await getAccessToken();

  // Get metadata dulu
  const metaRes = await fetch(`${DRIVE_META}/${fileId}?fields=name,mimeType`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) throw new Error(`File tidak ditemukan: ${fileId}`);
  const meta = await metaRes.json();

  // Download content
  const fileRes = await fetch(`${DRIVE_META}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!fileRes.ok) throw new Error(`Download gagal: ${fileId}`);

  const arrayBuffer = await fileRes.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: meta.mimeType || 'application/octet-stream',
    filename: meta.name || fileId,
  };
}

// ── Delete file dari Drive ────────────────────────────────────────────────────
export async function deleteFromDrive(fileId: string): Promise<void> {
  const token = await getAccessToken();
  await fetch(`${DRIVE_META}/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Upload dari external URL → Drive ─────────────────────────────────────────
export async function uploadUrlToDrive(
  imageUrl: string,
  filename: string,
  folderId?: string,
): Promise<{ fileId: string; url: string }> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Gagal fetch image dari URL: ${imageUrl}`);
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return uploadToDrive(buffer, filename, contentType, folderId);
}
