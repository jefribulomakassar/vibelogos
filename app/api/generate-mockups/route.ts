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

const SCENES = [
  {
    scene: 'tshirt',
    label: '👕 T-Shirt',
    buildPrompt: (title: string, desc: string, cat: string) =>
      `Using this exact logo of "${title}" (a ${cat} brand${desc ? `, ${desc}` : ''}), reproduce the logo faithfully with same colors, shapes, and typography on a photorealistic mockup: logo printed centered on chest of a clean white t-shirt. Flat lay, studio lighting, minimal white/grey background, 4K commercial photography quality.`,
  },
  {
    scene: 'business_card',
    label: '💳 Business Card',
    buildPrompt: (title: string, desc: string, cat: string) =>
      `Using this exact logo of "${title}" (a ${cat} brand${desc ? `, ${desc}` : ''}), reproduce the logo faithfully with same colors, shapes, and typography on a photorealistic mockup: logo on front of a premium matte white business card. Marble surface, slight shadow, elegant top-down angle, studio photography quality.`,
  },
  {
    scene: 'mug',
    label: '☕ Mug',
    buildPrompt: (title: string, desc: string, cat: string) =>
      `Using this exact logo of "${title}" (a ${cat} brand${desc ? `, ${desc}` : ''}), reproduce the logo faithfully with same colors, shapes, and typography on a photorealistic mockup: logo on a clean white ceramic coffee mug. Wooden table, warm cafe lighting, professional photography, logo clearly visible and centered.`,
  },
];

// ─── Google AI SDK — gemini-2.5-flash-image (free 500 req/day) ────────────────
// Docs: https://ai.google.dev/gemini-api/docs/image-generation
// Model: gemini-2.5-flash-image (Nano Banana) — image-in + image-out
async function callGeminiImageAPI(
  prompt: string,
  logoBase64: string,
  logoMime: string,
): Promise<Buffer> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY not set');

  // Gunakan generateContent endpoint dengan responseModalities: ["IMAGE", "TEXT"]
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        parts: [
          // Logo image sebagai input
          {
            inline_data: {
              mime_type: logoMime,
              data: logoBase64,
            },
          },
          // Text prompt
          {
            text: prompt,
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });

  const responseText = await res.text();

  if (!res.ok) {
    throw new Error(`Gemini API error ${res.status}: ${responseText.slice(0, 400)}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Non-JSON from Gemini: ${responseText.slice(0, 200)}`);
  }

  // Parse response: candidates[0].content.parts[] — cari part yang type image
  const parts = (data as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          inlineData?: { mimeType?: string; data?: string };
        }>;
      };
    }>;
  })?.candidates?.[0]?.content?.parts;

  if (!parts || parts.length === 0) {
    // Log full response untuk debug
    throw new Error(`Gemini returned no parts. Response: ${JSON.stringify(data).slice(0, 400)}`);
  }

  for (const part of parts) {
    if (part.inlineData?.data) {
      return Buffer.from(part.inlineData.data, 'base64');
    }
  }

  // Kalau semua parts adalah text (model nolak generate image)
  const textParts = parts.filter(p => p.text).map(p => p.text).join(' ');
  throw new Error(`Gemini returned text only: ${textParts.slice(0, 200)}`);
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

function classifyError(msg: string): 'rate_limit' | 'not_retryable' | 'retryable' {
  if (
    msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('quota') || msg.includes('rate limit') ||
    msg.includes('too many') || msg.includes('capacity')
  ) return 'rate_limit';

  if (
    msg.includes('400') || msg.includes('404') ||
    msg.includes('INVALID_ARGUMENT') || msg.includes('not support') ||
    msg.includes('text only') || msg.includes('API_KEY_INVALID')
  ) return 'not_retryable';

  return 'retryable';
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchLogoAsBase64(logoUrl: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(logoUrl, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Failed to fetch logo: ${res.status}`);
  const contentType = res.headers.get('content-type') || 'image/png';
  // Gemini tidak support SVG — normalkan ke image/png kalau SVG
  let mimeType = contentType.split(';')[0].trim();
  if (mimeType === 'image/svg+xml' || mimeType === 'image/svg') {
    mimeType = 'image/png'; // akan tetap dikirim, tapi Gemini mungkin reject — di-handle di error
  }
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  return { base64, mimeType };
}

// ─── Generate 1 scene dengan retry ───────────────────────────────────────────
async function generateScene(
  sceneConfig: (typeof SCENES)[0],
  title: string,
  description: string,
  category: string,
  logoBase64: string,
  logoMime: string,
): Promise<MockupResult> {
  const prompt = sceneConfig.buildPrompt(title, description, category);
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[mockup] scene=${sceneConfig.scene} attempt=${attempt}`);
      const imgBuffer = await callGeminiImageAPI(prompt, logoBase64, logoMime);
      const cloudUrl  = await uploadBufferToCloudinary(imgBuffer);
      console.log(`[mockup] ✓ scene=${sceneConfig.scene}`);
      return { scene: sceneConfig.scene, label: sceneConfig.label, url: cloudUrl };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const errType = classifyError(msg);
      console.warn(`[mockup] scene=${sceneConfig.scene} att=${attempt} [${errType}]: ${msg.slice(0, 150)}`);

      if (errType === 'not_retryable') {
        throw new Error(`Non-retryable error: ${msg}`);
      }

      if (attempt < maxAttempts) {
        // Rate limit → tunggu lebih lama; retryable → tunggu sebentar
        const delay = errType === 'rate_limit' ? 20_000 : 5_000;
        console.log(`[mockup] retry in ${delay / 1000}s…`);
        await sleep(delay);
      } else {
        throw new Error(`Failed after ${maxAttempts} attempts: ${msg}`);
      }
    }
  }

  throw new Error(`generateScene unreachable: ${sceneConfig.scene}`);
}

// ─── POST /api/generate-mockups ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const {
    logo_url,
    title       = 'Logo',
    description = '',
    category    = 'Brand',
  } = await req.json().catch(() => ({}));

  if (!logo_url) {
    return NextResponse.json({ error: 'logo_url is required' }, { status: 400 });
  }

  if (!process.env.GOOGLE_API_KEY) {
    return NextResponse.json({ error: 'GOOGLE_API_KEY env var not set' }, { status: 500 });
  }

  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    return NextResponse.json({ error: 'Cloudinary env vars not configured' }, { status: 500 });
  }

  try {
    console.log('[mockup] fetching logo:', logo_url);
    const { base64: logoBase64, mimeType: logoMime } = await fetchLogoAsBase64(logo_url);
    console.log(`[mockup] logo fetched mime=${logoMime} size=${logoBase64.length}`);

    const results: MockupResult[] = [];

    for (let i = 0; i < SCENES.length; i++) {
      const scene = SCENES[i];
      console.log(`[mockup] scene ${i + 1}/${SCENES.length}: ${scene.scene}`);

      try {
        const result = await generateScene(
          scene, title, description, category, logoBase64, logoMime,
        );
        results.push(result);
      } catch (e) {
        console.error(`[mockup] scene skipped (${scene.scene}):`, e instanceof Error ? e.message : e);
      }

      // Jaga rate limit Gemini free (~10 RPM) — tunggu 7s antar scene
      if (i < SCENES.length - 1) {
        await sleep(7_000);
      }
    }

    if (results.length === 0) {
      return NextResponse.json(
        { error: 'Semua scene gagal. Cek GOOGLE_API_KEY di Vercel env vars.' },
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
