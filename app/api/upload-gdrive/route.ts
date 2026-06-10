// app/api/upload-gdrive/route.ts
// Upload file atau external URL ke Google Drive (Service Account)

import { NextRequest, NextResponse } from 'next/server';
import { uploadBufferToDrive, uploadUrlToDrive } from '@/lib/gdrive';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN!;

// Folder IDs dari env
// GDRIVE_FOLDER_LOGOS   = ID folder Drive khusus logos
// GDRIVE_FOLDER_MOCKUPS = ID folder Drive khusus mockups
function getFolderId(folder: 'logos' | 'mockups'): string {
  const id =
    folder === 'logos'
      ? process.env.GDRIVE_FOLDER_LOGOS
      : process.env.GDRIVE_FOLDER_MOCKUPS;
  if (!id) throw new Error(`GDRIVE_FOLDER_${folder.toUpperCase()} belum diset di env`);
  return id;
}

export async function POST(req: NextRequest) {
  // Auth check
  const adminToken = req.headers.get('x-admin-token');
  if (adminToken !== ADMIN_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const contentType = req.headers.get('content-type') || '';

    // ── Mode 1: Upload file (multipart/form-data) ──────────────────────────
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      const folderKey = (formData.get('folder') as string) || 'logos';

      if (!file) return NextResponse.json({ error: 'File tidak ditemukan' }, { status: 400 });

      const folderId = getFolderId(folderKey as 'logos' | 'mockups');
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = file.name.split('.').pop() || 'png';
      const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      const { fileId, viewUrl } = await uploadBufferToDrive(buffer, filename, file.type, folderId);

      return NextResponse.json({ fileId, viewUrl, secure_url: viewUrl });
    }

    // ── Mode 2: Upload dari external URL (JSON body) ───────────────────────
    const body = await req.json();
    const { external_url, folder = 'logos' } = body as {
      external_url?: string;
      folder?: string;
    };

    if (!external_url) {
      return NextResponse.json({ error: 'external_url diperlukan' }, { status: 400 });
    }

    const folderId = getFolderId(folder as 'logos' | 'mockups');
    const ext = external_url.split('.').pop()?.split('?')[0] || 'png';
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { fileId, viewUrl } = await uploadUrlToDrive(external_url, filename, folderId);

    return NextResponse.json({ fileId, viewUrl, secure_url: viewUrl });
  } catch (err: unknown) {
    console.error('[upload-gdrive]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload gagal' },
      { status: 500 },
    );
  }
}
