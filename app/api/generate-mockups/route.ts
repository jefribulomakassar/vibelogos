import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// ─── Auth ─────────────────────────────────────────────────────────────────────
function checkAdmin(req: NextRequest) {
  return req.headers.get('x-admin-token') === process.env.ADMIN_TOKEN;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface MockupResult {
  scene: string;
  label: string;
  url: string;
}

interface PollinationsModel {
  name: string;
  model: string;
}

// ─── Pollinations Models (free, no API key) ───────────────────────────────────
// Rotasi antar model berbeda di Pollinations — jika satu rate-limit, pakai berikutnya
const POLLINATIONS_MODELS: PollinationsModel[] = [
  { name: 'flux',        model: 'flux' },
  { name: 'flux-realism',model: 'flux-realism' },
  { name: 'flux-pro',    model: 'flux-pro' },
  { name: 'turbo',       model: 'turbo' },
  { name: 'flux-anime',  model: 'flux-anime' },
  { name: 'dall-e-3',    model: 'dall-e-3' },
];

// ─── 6 Scene Definitions ──────────────────────────────────────────────────────
const SCENES = [
  {
    scene: 'tshirt',
    label: '👕 T-Shirt',
    buildPrompt: (title: string, cat: string) =>
      `Professional product mockup, white t-shirt flat lay on clean surface, "${title}" ${cat} brand logo printed centered on chest, soft studio lighting, minimal background, high quality commercial photography, 4k`,
  },
  {
    scene: 'business_card',
    label: '💳 Business Card',
    buildPrompt: (title: string, cat: string) =>
      `Professional business card mockup, premium matte white card on marble surface, "${title}" ${cat} brand logo on front, elegant minimal design, soft shadow, top-down view, studio photography, 4k`,
  },
  {
    scene: 'mug',
    label: '☕ Mug',
    buildPrompt: (title: string, cat: string) =>
      `Product mockup, white ceramic coffee mug on wooden table, "${title}" ${cat} brand logo printed on mug, cozy cafe background, warm lighting, professional photography, high resolution`,
  },
  {
    scene: 'tote_bag',
    label: '🛍 Tote Bag',
    buildPrompt: (title: string, cat: string) =>
      `Product mockup, natural canvas tote bag hanging, "${title}" ${cat} brand logo screen printed on front, clean white background, professional studio lighting, lifestyle photography, 4k`,
  },
  {
    scene: 'poster',
    label: '🖼 Poster',
    buildPrompt: (title: string, cat: string) =>
      `Brand mockup, A2 poster on modern wall interior, "${title}" ${cat} logo featured prominently, contemporary minimalist design, gallery wall setting, professional photography, high quality`,
  },
  {
    scene: 'billboard',
    label: '🏙 Billboard',
    buildPrompt: (title: string, cat: string) =>
      `Outdoor advertising mockup, large billboard on urban street, "${title}" ${cat} brand logo displayed, city background, daylight, realistic 3D render, professional commercial visualization, wide angle`,
  },
];

// ─── Pollinations Fetch (single attempt) ─────────────────────────────────────
async function fetchPollinations(
  prompt: string,
  model: string,
  seed: number,
): Promise<string> {
  const encoded = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encoded}?model=${model}&width=1024&height=1024&seed=${seed}&nologo=true&enhance=true`;

  const res = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(25_000), // 25s timeout per model
  });

  if (!res.ok) throw new Error(`Pollinations ${model} responded ${res.status}`);

  // Pollinations returns the image directly — re-upload ke Cloudinary
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength < 10_000) throw new Error(`${model} returned suspiciously small image`);

  return uploadBufferToCloudinary(Buffer.from(buffer));
}

// ─── Upload Buffer → Cloudinary (unsigned won't work server-side for buffers,
//     jadi pakai signed upload via API secret langsung) ───────────────────────
async function uploadBufferToCloudinary(buffer: Buffer): Promise<string> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME!;
  const apiKey    = process.env.CLOUDINARY_API_KEY!;
  const apiSecret = process.env.CLOUDINARY_API_SECRET!;
  const folder    = 'vibelogos/mockups';

  const timestamp = Math.round(Date.now() / 1000);
  const paramsToSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = crypto
    .createHash('sha256')
    .update(paramsToSign + apiSecret)
    .digest('hex');

  // Convert buffer → Blob for FormData
  const blob = new Blob([buffer], { type: 'image/jpeg' });
  const fd = new FormData();
  fd.append('file', blob, 'mockup.jpg');
  fd.append('api_key', apiKey);
  fd.append('timestamp', String(timestamp));
  fd.append('signature', signature);
  fd.append('folder', folder);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: 'POST', body: fd, signal: AbortSignal.timeout(20_000) },
  );

  const data = await res.json();
  if (!data.secure_url) throw new Error(data.error?.message || 'Cloudinary upload failed');
  return data.secure_url as string;
}

// ─── Generate 1 scene dengan model rotation ──────────────────────────────────
async function generateScene(
  sceneConfig: (typeof SCENES)[0],
  title: string,
  category: string,
): Promise<MockupResult> {
  const prompt = sceneConfig.buildPrompt(title, category);
  const seed   = Math.floor(Math.random() * 999_999);

  const errors: string[] = [];

  for (const provider of POLLINATIONS_MODELS) {
    try {
      console.log(`[mockup] scene=${sceneConfig.scene} trying model=${provider.model}`);
      const url = await fetchPollinations(prompt, provider.model, seed);
      console.log(`[mockup] scene=${sceneConfig.scene} ✓ model=${provider.model}`);
      return { scene: sceneConfig.scene, label: sceneConfig.label, url };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[mockup] scene=${sceneConfig.scene} model=${provider.model} failed: ${msg}`);
      errors.push(`${provider.model}: ${msg}`);
      // Jeda singkat sebelum coba model berikutnya
      await new Promise(r => setTimeout(r, 800));
    }
  }

  throw new Error(`All providers failed for scene "${sceneConfig.scene}": ${errors.join(' | ')}`);
}

// ─── POST /api/generate-mockups ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { logo_url, title = 'Logo', category = 'Brand' } = await req.json().catch(() => ({}));

  if (!logo_url) {
    return NextResponse.json({ error: 'logo_url is required' }, { status: 400 });
  }

  // Validasi env Cloudinary
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    return NextResponse.json({ error: 'Cloudinary env vars not configured' }, { status: 500 });
  }

  try {
    // Generate semua 6 scene secara PARALEL (lebih cepat)
    // Tapi batasi concurrency 3 agar tidak langsung rate-limit semua
    const results: MockupResult[] = [];
    const batches = [SCENES.slice(0, 3), SCENES.slice(3, 6)];

    for (const batch of batches) {
      const batchResults = await Promise.allSettled(
        batch.map(scene => generateScene(scene, title, category)),
      );

      for (const r of batchResults) {
        if (r.status === 'fulfilled') {
          results.push(r.value);
        } else {
          // Scene gagal semua provider — log tapi jangan stop semua
          console.error('[mockup] scene skipped:', r.reason);
        }
      }
    }

    if (results.length === 0) {
      return NextResponse.json(
        { error: 'Semua scene gagal digenerate. Coba lagi beberapa saat.' },
        { status: 502 },
      );
    }

    return NextResponse.json({ mockups: results, total: results.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[mockup] fatal error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
