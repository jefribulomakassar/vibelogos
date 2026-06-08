// app/api/upload-cloudinary/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

function checkAdmin(req: NextRequest) {
  const token = req.headers.get('x-admin-token');
  return token === process.env.ADMIN_TOKEN;
}

// ── Upload buffer ke Cloudinary via API (server-side) ─────────────────────────
async function uploadBufferToCloudinary(
  buffer: Buffer,
  mimeType: string,
  folder: string,
  cloudName: string,
  apiKey: string,
  apiSecret: string,
): Promise<string> {
  const timestamp = Math.round(Date.now() / 1000);
  const paramsToSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = crypto
    .createHash('sha256')
    .update(paramsToSign + apiSecret)
    .digest('hex');

  const fd = new FormData();
  const blob = new Blob([buffer], { type: mimeType });
  fd.append('file', blob, `upload_${timestamp}`);
  fd.append('api_key', apiKey);
  fd.append('timestamp', String(timestamp));
  fd.append('signature', signature);
  fd.append('folder', folder);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: 'POST', body: fd },
  );

  const data = await res.json();
  if (data.secure_url) return data.secure_url as string;
  throw new Error(data.error?.message ?? 'Cloudinary upload failed');
}

// POST /api/upload-cloudinary
// Mode 1: { folder } → kembalikan signature untuk upload langsung dari browser
// Mode 2: { folder, external_url } → download gambar server-side lalu upload ke Cloudinary
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey    = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json({ error: 'Cloudinary env vars not set' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({})) as {
    folder?: string;
    external_url?: string;
  };

  const folder = body.folder ?? 'vibelogos';

  // ── Mode 2: upload dari URL eksternal (LogoGround, dll) ───────────────────
  if (body.external_url) {
    const externalUrl = body.external_url.trim();
    if (!externalUrl.startsWith('http')) {
      return NextResponse.json({ error: 'external_url tidak valid' }, { status: 400 });
    }

    try {
      // Download gambar server-side (hindari CORS dari browser)
      const imgRes = await fetch(externalUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
            'AppleWebKit/537.36 (KHTML, like Gecko) ' +
            'Chrome/124.0.0.0 Safari/537.36',
          'Referer': 'https://www.logoground.com/',
        },
        signal: AbortSignal.timeout(20_000),
      });

      if (!imgRes.ok) {
        throw new Error(`Gagal download gambar: HTTP ${imgRes.status}`);
      }

      const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg';
      if (!contentType.startsWith('image/')) {
        throw new Error(`URL bukan gambar (content-type: ${contentType})`);
      }

      const arrayBuffer = await imgRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.byteLength === 0) {
        throw new Error('Gambar kosong / ukuran 0 bytes');
      }

      const secureUrl = await uploadBufferToCloudinary(
        buffer,
        contentType,
        folder,
        cloudName,
        apiKey,
        apiSecret,
      );

      return NextResponse.json({ secure_url: secureUrl });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // ── Mode 1: kembalikan signature untuk upload langsung dari browser ────────
  const timestamp = Math.round(Date.now() / 1000);
  const paramsToSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = crypto
    .createHash('sha256')
    .update(paramsToSign + apiSecret)
    .digest('hex');

  return NextResponse.json({
    signature,
    timestamp,
    apiKey,
    cloudName,
    folder,
  });
}
