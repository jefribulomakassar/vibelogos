import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export const maxDuration = 300;

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

// ─── OpenRouter model untuk image generation + image input ───────────────────
// google/gemini-2.5-flash-image  = Nano Banana GA, support image-in + image-out
// google/gemini-3.1-flash-image-preview = Nano Banana 2, lebih baru
// Endpoint: /api/v1/chat/completions (OpenAI-compatible)
// modalities: ["image", "text"] wajib untuk dapat image output
const OR_MODELS = [
  'google/gemini-2.5-flash-image:free',
  'google/gemini-3.1-flash-image-preview:free',
];

// ─── 3 Scene Definitions ──────────────────────────────────────────────────────
const SCENES = [
  {
    scene: 'tshirt',
    label: '👕 T-Shirt',
    buildPrompt: (title: string, desc: string, cat: string) =>
      `You are given the logo image of "${title}", a ${cat} brand.${desc ? ` Brand: ${desc}.` : ''}

Using this exact logo (reproduce faithfully — same colors, shapes, typography), generate a photorealistic mockup of the logo printed centered on the chest of a clean white t-shirt. Flat lay, smooth light surface, studio lighting, minimal white/grey background, 4K commercial photography quality.`,
  },
  {
    scene: 'business_card',
    label: '💳 Business Card',
    buildPrompt: (title: string, desc: string, cat: string) =>
      `You are given the logo image of "${title}", a ${cat} brand.${desc ? ` Brand: ${desc}.` : ''}

Using this exact logo (reproduce faithfully — same colors, shapes, typography), generate a photorealistic business card mockup with the logo on the front of a premium matte white card. Marble or dark surface, slight shadow, elegant top-down angle, studio photography quality.`,
  },
  {
    scene: 'mug',
    label: '☕ Mug',
    buildPrompt: (title: string, desc: string, cat: string) =>
      `You are given the logo image of "${title}", a ${cat} brand.${desc ? ` Brand: ${desc}.` : ''}

Using this exact logo (reproduce faithfully — same colors, shapes, typography), generate a photorealistic mockup of the logo on a clean white ceramic coffee mug. Wooden table, warm cafe lighting, professional photography, logo clearly visible and centered.`,
  },
];

// ─── Call OpenRouter image generation ────────────────────────────────────────
// OpenRouter pakai /api/v1/chat/completions (OpenAI-compatible)
// Image output ada di: choices[0].message.images[].imageUrl.url (base64 data URL)
// Image input dikirim sebagai content part type "image_url"
async function callOpenRouter(
  model: string,
  prompt: string,
  logoBase64: string,
  logoMime: string,
): Promise<Buffer> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY env var not set');

  const body = {
    model,
    messages: [
      {
        role: 'user',
        content: [
          // Image input (logo) sebagai base64 data URL
          {
            type: 'image_url',
            image_url: {
              url: `data:${logoMime};base64,${logoBase64}`,
            },
          },
          // Text prompt
          {
            type: 'text',
            text: prompt,
          },
        ],
      },
    ],
    // Wajib untuk dapat image output dari Gemini via OpenRouter
    modalities: ['image', 'text'],
  };

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://vibelogos.vercel.app',
      'X-Title': 'VibeLogo Admin',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  const responseText = await res.text();

  if (!res.ok) {
    throw new Error(`OpenRouter ${model} error ${res.status}: ${responseText.slice(0, 400)}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`OpenRouter non-JSON response: ${responseText.slice(0, 200)}`);
  }

  // Cek response format OpenRouter: choices[0].message.images[] atau inline_data di content
  const message = (data as {
    choices?: Array<{
      message?: {
        images?: Array<{ imageUrl?: { url?: string } }>;
        content?: Array<{ type?: string; image_url?: { url?: string }; inline_data?: { data?: string } }> | string;
      };
    }>;
  })?.choices?.[0]?.message;

  // Format 1: message.images (OpenRouter SDK format)
  if (message?.images && message.images.length > 0) {
    const imgUrl = message.images[0]?.imageUrl?.url;
    if (imgUrl) {
      // Bisa berupa data URL (data:image/png;base64,...) atau URL biasa
      if (imgUrl.startsWith('data:')) {
        const base64Part = imgUrl.split(',')[1];
        return Buffer.from(base64Part, 'base64');
      }
      // Kalau URL biasa, fetch dulu
      const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(20_000) });
      if (!imgRes.ok) throw new Error(`Failed to fetch generated image: ${imgRes.status}`);
      return Buffer.from(await imgRes.arrayBuffer());
    }
  }

  // Format 2: message.content sebagai array (Gemini multimodal format via OR)
  if (Array.isArray(message?.content)) {
    for (const part of message.content) {
      if (part.type === 'image_url' && part.image_url?.url) {
        const url = part.image_url.url;
        if (url.startsWith('data:')) {
          return Buffer.from(url.split(',')[1], 'base64');
        }
        const imgRes = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);
        return Buffer.from(await imgRes.arrayBuffer());
      }
      if (part.type === 'inline_data' && part.inline_data?.data) {
        return Buffer.from(part.inline_data.data, 'base64');
      }
    }
  }

  throw new Error(`OpenRouter ${model} returned no image. Response: ${JSON.stringify(data).slice(0, 300)}`);
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
    { method: 'POST', body: fd, signal: AbortSignal.timeout(20_000) },
  );

  const result = await res.json();
  if (!result.secure_url) throw new Error(result.error?.message || 'Cloudinary upload failed');
  return result.secure_url as string;
}

// ─── Classify error ────────────────────────────────────────────────────────────
function classifyError(msg: string): 'rate_limit' | 'not_retryable' | 'retryable' {
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('rate limit')) {
    return 'rate_limit';
  }
  if (msg.includes('400') || msg.includes('404') || msg.includes('not found') ||
      msg.includes('invalid') || msg.includes('INVALID_ARGUMENT')) {
    return 'not_retryable';
  }
  return 'retryable';
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Fetch logo sebagai base64 ────────────────────────────────────────────────
async function fetchLogoAsBase64(logoUrl: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(logoUrl, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Failed to fetch logo: ${res.status}`);
  const contentType = res.headers.get('content-type') || 'image/png';
  const mimeType = contentType.split(';')[0].trim();
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  return { base64, mimeType };
}

// ─── Generate 1 scene dengan model fallback + retry ───────────────────────────
async function generateScene(
  sceneConfig: (typeof SCENES)[0],
  title: string,
  description: string,
  category: string,
  logoBase64: string,
  logoMime: string,
): Promise<MockupResult> {
  const prompt = sceneConfig.buildPrompt(title, description, category);
  const errors: string[] = [];

  for (const model of OR_MODELS) {
    // Retry max 2x untuk rate limit, backoff 10s / 20s
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[mockup] scene=${sceneConfig.scene} model=${model} attempt=${attempt}`);
        const imgBuffer = await callOpenRouter(model, prompt, logoBase64, logoMime);
        const cloudUrl  = await uploadBufferToCloudinary(imgBuffer);
        console.log(`[mockup] ✓ scene=${sceneConfig.scene} model=${model}`);
        return { scene: sceneConfig.scene, label: sceneConfig.label, url: cloudUrl };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        const errType = classifyError(msg);
        console.warn(`[mockup] scene=${sceneConfig.scene} model=${model} attempt=${attempt} [${errType}]: ${msg.slice(0, 150)}`);
        errors.push(`${model}[${errType}]att${attempt}: ${msg.slice(0, 80)}`);

        if (errType === 'not_retryable') throw new Error(`Non-retryable: ${msg}`);

        if (errType === 'rate_limit' && attempt < 2) {
          await sleep(attempt * 10_000); // 10s lalu 20s
          continue;
        }

        // retryable atau rate_limit habis attempt → coba model berikutnya
        break;
      }
    }
  }

  throw new Error(`All models failed for "${sceneConfig.scene}": ${errors.join(' | ')}`);
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

  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json({ error: 'OPENROUTER_API_KEY env var not set' }, { status: 500 });
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
        console.log(`[mockup] ✓ ${i + 1}/${SCENES.length} done`);
      } catch (e) {
        console.error(`[mockup] scene skipped (${scene.scene}):`, e instanceof Error ? e.message : e);
      }

      // Delay ringan antar scene — OpenRouter tidak punya per-project shared quota
      if (i < SCENES.length - 1) {
        await sleep(3_000);
      }
    }

    if (results.length === 0) {
      return NextResponse.json(
        { error: 'Semua scene gagal. Cek OPENROUTER_API_KEY dan saldo di openrouter.ai/credits.' },
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
