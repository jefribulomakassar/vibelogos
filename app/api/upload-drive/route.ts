// app/api/upload-drive/route.ts
// Replace /api/upload-cloudinary — upload file/URL ke Google Drive

import { NextRequest, NextResponse } from 'next/server';
import { uploadToDrive, uploadUrlToDrive } from '@/lib/google-drive';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';
const LOGO_FOLDER_ID = process.env.GOOGLE_DRIVE_LOGO_FOLDER_ID ?? '';
const MOCKUP_FOLDER_ID = process.env.GOOGLE_DRIVE_MOCKUP_FOLDER_ID ?? '';

function getFolderId(folder: string): string {
  if (folder.includes('mockup')) return MOCKUP_FOLDER_ID;
  return LOGO_FOLDER_ID;
}

export async function POST(req: NextRequest) {
  // Auth check
  const token = req.headers.get('x-admin-token') ?? '';
  if (!token || token !== ADMIN_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const contentType = req.headers.get('content-type') ?? '';

    // ── Case 1: JSON body dengan external_url ─────────────────────────────
    if (contentType.includes('application/json')) {
      const body = await req.json();
      const { external_url, folder = 'vibelogos/logos', filename } = body;

      if (!external_url) {
        return NextResponse.json({ error: 'external_url required' }, { status: 400 });
      }

      const folderId = getFolderId(folder);
      const name = filename || `logo_${Date.now()}.jpg`;
      const { fileId, url } = await uploadUrlToDrive(external_url, name, folderId || undefined);

      return NextResponse.json({ fileId, url, secure_url: url });
    }

    // ── Case 2: multipart/form-data (file upload langsung) ────────────────
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      const folder = (formData.get('folder') as string) || 'vibelogos/logos';

      if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 });

      const buffer = Buffer.from(await file.arrayBuffer());
      const folderId = getFolderId(folder);
      const { fileId, url } = await uploadToDrive(buffer, file.name, file.type, folderId || undefined);

      return NextResponse.json({ fileId, url, secure_url: url });
    }

    return NextResponse.json({ error: 'Content-Type tidak didukung' }, { status: 400 });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[upload-drive]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
