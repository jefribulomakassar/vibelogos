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

// ─── Model list — urutan prioritas ───────────────────────────────────────────
const OR_MODELS = [
  'google/gemini-2.0-flash-exp:free',          // image-in, text-out (reliable free)
  'google/gemini-2.5-flash-preview:free',       // fallback
  'google/gemini-2.5-flash-image:free',         // image-in + image-out (kalau tersedia)
  'google/gemini-3.1-flash-image-preview:free', // newest, mungkin belum stabil
];

const SCENES = [
  {
    scene: 'tshirt',
    label: '👕 T-Shirt',
    pollinationsPrompt: (title: string) =>
      `photorealistic mockup of "${title}" logo printed centered on chest of clean white t-shirt, flat lay, studio lighting, minimal white background, 4K commercial photography`,
    buildPrompt: (title: string, desc: string, cat: string) =>
      `You are given the logo image of "${title}", a ${cat} brand.${desc ? ` Brand: ${desc}.` : ''}

Using this exact logo (reproduce faithfully — same colors, shapes, typography), generate a photorealistic mockup of the logo printed centered on the chest of a clean white t-shirt. Flat lay, smooth light surface, studio lighting, minimal white/grey background, 4K commercial photography quality.`,
  },
  {
    scene: 'business_card',
    label: '💳 Business Card',
    pollinationsPrompt: (title: string) =>
      `photorealistic business card mockup with "${title}" logo on front of premium matte white card, marble surface, elegant top-down angle, studio photography`,
    buildPrompt: (title: string, desc: string, cat: string) =>
      `You are given the logo image of "${title}", a ${cat} brand.${desc ? ` Brand: ${desc}.` : ''}

Using this exact logo (reproduce faithfully — same colors, shapes, typography), generate a photorealistic business card mockup with the logo on the front of a premium matte white card. Marble or dark surface, slight shadow, elegant top-down angle, studio photography quality.`,
  },
  {
    scene: 'mug',
    label: '☕ Mug',
    pollinationsPrompt: (title: string) =>
      `photorealistic mockup of "${title}" logo on clean white ceramic coffee mug, wooden table, warm cafe lighting, professional photography, logo centered`,
    buildPrompt: (title: string, desc: string, cat: string) =>
      `You are given the logo image of "${title}", a ${cat} brand.${desc ? ` Brand: ${desc}.` : ''}

Using this exact logo (reproduce faithfully — same colors, shapes, typography), generate a photorealistic mockup of the logo on a clean white ceramic coffee mug. Wooden table, warm cafe lighting, professional photography, logo clearly visible and centered.`,
  },
];

// ─── Pollinations AI fallback (no key needed) ─────────────────────────────────
async function generateViaPollinations(prompt: string): Promise<Buffer> {
  const encoded = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true&enhance=true`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Pollinations error ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ─── Call OpenRouter ──────────────────────────────────────────────────────────
async function callOpenRouter(
  model: string,
  prompt: string,
  logoBase64: string,
  logoMime: string,
): Promise<Buffer> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  // Tentukan apakah model ini support image output
  const isImageOutModel =
    model.includes('image') && !model.includes('gemini-2.0-flash-exp');

  const body: Record<string, unknown> = {
    model,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${logoMime};base64,${logoBase64}` },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
    max_tokens: 1024,
  };

  // modalities hanya untuk model image-out
  if (isImageOutModel) {
    body.modalities = ['image', 'text'];
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://vibelogos.vercel.app',
      'X-Title': 'VibeLogo Admin',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });

  const responseText = await res.text();

  if (!res.ok) {
    throw new Error(`OpenRouter ${model} ${res.status}: ${responseText.slice(0, 400)}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Non-JSON response: ${responseText.slice(0, 200)}`);
  }

  const message = (data as {
    choices?: Array<{
      message?: {
        images?: Array<{ imageUrl?: { url?: string } }>;
        content?: Array<{
          type?: string;
          image_url?: { url?: string };
          inline_data?: { data?: string; mime_type?: string };
        }> | string;
      };
    }>;
  })?.choices?.[0]?.message;

  if (!message) {
    throw new Error(`No message in response: ${JSON.stringify(data).slice(0, 200)}`);
  }

  // Format 1: message.images[]
  if (message.images?.length) {
    const imgUrl = message.images[0]?.imageUrl?.url;
    if (imgUrl) {
      if (imgUrl.startsWith('data:')) {
        return Buffer.from(imgUrl.split(',')[1], 'base64');
      }
      const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(30_000) });
      if (!imgRes.ok) throw new Error(`Fetch generated image failed: ${imgRes.status}`);
      return Buffer.from(await imgRes.arrayBuffer());
    }
  }

  // Format 2: content array
  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part.type === 'image_url' && part.image_url?.url) {
        const url = part.image_url.url;
        if (url.startsWith('data:')) return Buffer.from(url.split(',')[1], 'base64');
        const imgRes = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        if (!imgRes.ok) throw new Error(`Fetch image failed: ${imgRes.status}`);
        return Buffer.from(await imgRes.arrayBuffer());
      }
      if (part.type === 'inline_data' && part.inline_data?.data) {
        return Buffer.from(part.inline_data.data, 'base64');
      }
    }
  }

  // Format 3: content string (text-only model → tidak ada image output)
  // Kalau model text-only, throw agar fallback ke Pollinations
  if (typeof message.content === 'string') {
    throw new Error(`Model ${model} returned text-only (no image output). Use image-out model.`);
  }

  throw new Error(`No image found in response: ${JSON.stringify(data).slice(0, 300)}`);
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
    msg.includes('not found') || msg.includes('invalid') ||
    msg.includes('INVALID_ARGUMENT') || msg.includes('not support') ||
    msg.includes('text-only')
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
  const mimeType = contentType.split(';')[0].trim();
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  return { base64, mimeType };
}

// ─── Generate 1 scene: coba OR models dulu, fallback ke Pollinations ──────────
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
  const hasApiKey = !!process.env.OPENROUTER_API_KEY;

  // ── Coba OpenRouter models (hanya image-out models) ──
  if (hasApiKey) {
    // Filter ke model yg support image output saja
    const imageOutModels = OR_MODELS.filter(m =>
      m.includes('image') || m.includes('imagen')
    );

    for (const model of imageOutModels) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          console.log(`[mockup] scene=${sceneConfig.scene} model=${model} attempt=${attempt}`);
          const imgBuffer = await callOpenRouter(model, prompt, logoBase64, logoMime);
          const cloudUrl  = await uploadBufferToCloudinary(imgBuffer);
          console.log(`[mockup] ✓ OR scene=${sceneConfig.scene}`);
          return { scene: sceneConfig.scene, label: sceneConfig.label, url: cloudUrl };
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          const errType = classifyError(msg);
          console.warn(`[mockup] ${model} att${attempt} [${errType}]: ${msg.slice(0, 120)}`);
          errors.push(`${model.split('/')[1]}[${errType}]: ${msg.slice(0, 60)}`);

          if (errType === 'not_retryable') break; // coba model berikutnya

          if (errType === 'rate_limit' && attempt < 2) {
            await sleep(15_000);
            continue;
          }
          break;
        }
      }
    }
    console.warn(`[mockup] OR failed for ${sceneConfig.scene}, falling back to Pollinations`);
  }

  // ── Fallback: Pollinations AI (free, no key) ──
  try {
    console.log(`[mockup] Pollinations fallback: scene=${sceneConfig.scene}`);
    const pollPrompt = sceneConfig.pollinationsPrompt(title);
    const imgBuffer = await generateViaPollinations(pollPrompt);
    const cloudUrl  = await uploadBufferToCloudinary(imgBuffer);
    console.log(`[mockup] ✓ Pollinations scene=${sceneConfig.scene}`);
    return { scene: sceneConfig.scene, label: sceneConfig.label, url: cloudUrl };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`pollinations: ${msg.slice(0, 80)}`);
    console.error(`[mockup] Pollinations also failed: ${msg}`);
  }

  throw new Error(`All sources failed for "${sceneConfig.scene}": ${errors.join(' | ')}`);
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
      console.log(`[mockup] processing scene ${i + 1}/${SCENES.length}: ${scene.scene}`);

      try {
        const result = await generateScene(
          scene, title, description, category, logoBase64, logoMime,
        );
        results.push(result);
      } catch (e) {
        console.error(`[mockup] scene skipped (${scene.scene}):`, e instanceof Error ? e.message : e);
      }

      if (i < SCENES.length - 1) await sleep(2_000);
    }

    if (results.length === 0) {
      return NextResponse.json(
        { error: 'Semua scene gagal. Cek koneksi dan Cloudinary credentials.' },
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
