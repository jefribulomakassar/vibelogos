// app/api/file/[fileId]/route.ts
// Proxy: serve Google Drive private file ke browser

import { NextRequest, NextResponse } from 'next/server';
import { downloadFromDrive } from '@/lib/google-drive';

const CACHE_CONTROL = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;
  if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 });

  try {
    const { buffer, mimeType, filename } = await downloadFromDrive(fileId);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(buffer.length),
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': CACHE_CONTROL,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[file-proxy]', fileId, msg);
    return NextResponse.json({ error: msg }, { status: 404 });
  }
}
