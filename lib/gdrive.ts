// lib/gdrive.ts
// Google Drive upload helper — Service Account

import { google } from 'googleapis';
import { Readable } from 'stream';

function getDriveClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

/**
 * Upload buffer ke Google Drive folder tertentu.
 * Return: { fileId, viewUrl }
 * viewUrl = https://drive.google.com/uc?id=FILE_ID  (direct link, bisa dipakai sebagai <img src>)
 */
export async function uploadBufferToDrive(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  parentFolderId: string,
): Promise<{ fileId: string; viewUrl: string }> {
  const drive = getDriveClient();

  const stream = Readable.from(buffer);

  const res = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [parentFolderId],
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: 'id, name',
  });

  const fileId = res.data.id!;

  // Tidak set permission publik — folder sudah shared ke service account
  // URL ini hanya bisa diakses oleh yang punya akses folder
  const viewUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;

  return { fileId, viewUrl };
}

/**
 * Upload dari external URL — download dulu, lalu push ke Drive
 */
export async function uploadUrlToDrive(
  imageUrl: string,
  filename: string,
  parentFolderId: string,
): Promise<{ fileId: string; viewUrl: string }> {
  const resp = await fetch(imageUrl);
  if (!resp.ok) throw new Error(`Gagal download image dari URL: ${resp.status}`);
  const contentType = resp.headers.get('content-type') || 'image/png';
  const buffer = Buffer.from(await resp.arrayBuffer());
  return uploadBufferToDrive(buffer, filename, contentType, parentFolderId);
}

/**
 * Hapus file dari Drive by fileId (opsional, untuk cleanup)
 */
export async function deleteFromDrive(fileId: string): Promise<void> {
  const drive = getDriveClient();
  await drive.files.delete({ fileId });
}
