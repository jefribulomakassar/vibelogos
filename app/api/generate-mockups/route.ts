// app/api/generate-mockups/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export const maxDuration = 300;

function checkAdmin(req: NextRequest) {
  return req.headers.get('x-admin-token') === process.env.ADMIN_TOKEN;
}

interface MockupResult {
  scene: string;
  label: string;
  url: string;
}

// ─── Scenes ───────────────────────────────────────────────────────────────────
const SCENES = [
  {
    scene: 'tshirt',
    label: '👕 T-Shirt',
    buildPrompt: (title: string, cat: string) =>
      `Photorealistic product mockup: a clean white t-shirt flat lay on a light grey studio background. The shirt has the text "${title}" printed in bold centered on the chest, clean modern typography, professional branding for a ${cat} company. Studio lighting, commercial photography, 4K quality. No people, just the shirt.`,
  },
  {
    scene: 'business_card',
    label: '💳 Business Card',
    buildPrompt: (title: string, cat: string) =>
      `Photorealistic product mockup: a premium matte white business card on a marble surface, top-down angle. The card displays "${title}" in elegant centered typography, minimal design, professional ${cat} brand identity. Soft shadow, studio lighting, commercial photography quality.`,
  },
  {
    scene: 'mug',
    label: '☕ Mug',
    buildPrompt: (title: string, cat: string) =>
      `Photorealistic product mockup: a clean white ceramic coffee mug on a wooden table with warm cafe lighting. The mug has "${title}" printed clearly in modern typography centered on the front, ${cat} brand. Professional product photography, soft bokeh background.`,
  },
];

// ─── HuggingFace FLUX.1-dev — free ~300 req/hour ──────────────────────────────
async function callHuggingFace(prompt: string): Promise<Buffer> {
  const token = process.env.HF_TOKEN;
  if (!token) throw new Error('HF_TOKEN not set');

  // Model options (fallback chain):
  // 1. black-forest-labs/FLUX.1-schnell — lebih cepat, free
  // 2. stabilityai/stable-diffusion-xl-base-1.0 — fallback
  const models = [
    'black-forest-labs/FLUX.1-schnell',
    'black-forest-labs/FLUX.1-dev',
    'stabilityai/stable-diffusion-xl-base-1.0',
  ];

  for (const model of models) {
    try {
      console.log(`[mockup] trying HF model: ${model}`);
      const res = await fetch(
        `https://api-inference.huggingface.co/models/${model}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'x-wait-for-model': 'true', // tunggu kalau model cold start
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
              width: 1024,
              height: 1024,
              num_inference_steps: 4, // schnell optimal di 4 steps
            },
          }),
          signal: AbortSignal.timeout(120_000),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        // 503 = model loading, coba model berikutnya
        // 429 = rate limit, throw langsung
        if (res.status === 429) throw new Error(`HF rate limit 429: ${errText.slice(0, 200)}`);
        throw new Error(`HF ${model} error ${res.status}: ${errText.slice(0, 200)}`);
      }

      // Response langsung berupa binary image
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('image')) {
        const text = await res.text();
        throw new Error(`HF returned non-image: ${text.slice(0, 200)}`);
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 1000) throw new Error(`HF returned empty image (${buffer.length} bytes)`);

      console.log(`[mockup] ✓ HF ${model} OK, size=${buffer.length}`);
      return buffer;

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Rate limit — stop mencoba
      if (msg.includes('429')) throw new Error(msg);
      console.warn(`[mockup] HF ${model} failed: ${msg.slice(0, 100)}, trying next...`);
    }
  }

  throw new Error('All HuggingFace models failed');
}

// ─── Upload Buffer → Cloudinary ───────────────────────────────────────────────
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

  const blob = new Blob([new Uint8Array(buffer)], { type: 'image/png' });
  const fd = new FormData();
  fd.append('file', blob, 'mockup.png');
  fd.append('api_key', apiKey);
  fd.append('timestamp', String(timestamp));
  fd.append('signature', signature);
  fd.append('folder', folder);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: 'POST', body: fd, signal: AbortSignal.timeout(30_000) },
  );

  const result = await res.json();
  if (!result.secure_url) throw new Error(result.error?.message || 'Cloudinary upload failed');
  return result.secure_url as string;
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Generate 1 scene ─────────────────────────────────────────────────────────
async function generateScene(
  sceneConfig: (typeof SCENES)[0],
  title: string,
  category: string,
): Promise<MockupResult> {
  const prompt = sceneConfig.buildPrompt(title, category);
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[mockup] scene=${sceneConfig.scene} attempt=${attempt}`);
      const imgBuffer = await callHuggingFace(prompt);
      const cloudUrl  = await uploadBufferToCloudinary(imgBuffer);
      return { scene: sceneConfig.scene, label: sceneConfig.label, url: cloudUrl };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[mockup] scene=${sceneConfig.scene} att=${attempt}: ${msg.slice(0, 150)}`);
      if (attempt < maxAttempts) await sleep(5_000);
      else throw new Error(msg);
    }
  }

  throw new Error('unreachable');
}

// ─── POST /api/generate-mockups ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const {
    logo_url,
    title    = 'Logo',
    category = 'Brand',
  } = await req.json().catch(() => ({}));

  if (!logo_url) {
    return NextResponse.json({ error: 'logo_url is required' }, { status: 400 });
  }

  if (!process.env.HF_TOKEN) {
    return NextResponse.json({ error: 'HF_TOKEN env var not set' }, { status: 500 });
  }

  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    return NextResponse.json({ error: 'Cloudinary env vars not configured' }, { status: 500 });
  }

  const results: MockupResult[] = [];

  for (let i = 0; i < SCENES.length; i++) {
    const scene = SCENES[i];
    console.log(`[mockup] scene ${i + 1}/${SCENES.length}: ${scene.scene}`);
    try {
      const result = await generateScene(scene, title, category);
      results.push(result);
    } catch (e) {
      console.error(`[mockup] scene skipped (${scene.scene}):`, e instanceof Error ? e.message : e);
    }
    if (i < SCENES.length - 1) await sleep(3_000);
  }

  if (results.length === 0) {
    return NextResponse.json(
      { error: 'Semua scene gagal. Cek HF_TOKEN di Vercel env vars.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ mockups: results, total: results.length });
}
