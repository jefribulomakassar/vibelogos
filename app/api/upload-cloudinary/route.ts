import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

function checkAdmin(req: NextRequest) {
  const token = req.headers.get('x-admin-token');
  return token === process.env.ADMIN_TOKEN;
}

// POST /api/upload-cloudinary
// Returns a signed upload signature so browser can upload directly to Cloudinary
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json({ error: 'Cloudinary env vars not set' }, { status: 500 });
  }

  const { folder = 'vibelogos' } = await req.json().catch(() => ({}));

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
