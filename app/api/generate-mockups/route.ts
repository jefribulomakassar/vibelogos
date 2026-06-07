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

// ─── Model untuk image generation + image input ──────────────────────────────
// gemini-2.5-flash-image        = GA sejak Okt 2025 (nano-banana), RECOMMENDED
// gemini-2.5-flash-image-preview = alias preview (fallback kalau GA down)
// gemini-2.0-flash-preview-image-generation = fallback lama (masih aktif per mid-2025)
// JANGAN pakai: imagen-3.0 (tidak support image input)
// JANGAN pakai: gemini-2.5-flash / gemini-2.0-flash-exp-image-generation (sudah 404)
const GEMINI_IMAGE_MODELS = [
  'gemini-2.5-flash-image',                    // primary — GA, nano-banana
  'gemini-2.5-flash-image-preview',             // fallback 1 — preview alias
  'gemini-2.0-flash-preview-image-generation',  // fallback 2 — versi lama yg masih jalan
];

// ─── Multi API Key Rotation ───────────────────────────────────────────────────
// ⚠️  PENTING: Gemini rate limit berjalan di level PROJECT, bukan per API key.
//     Key dari project yang sama = berbagi quota yang sama = rotasi key tidak membantu
//     untuk rate limit. Rotasi key hanya berguna jika key dari PROJECT BERBEDA.
//     Free tier image generation: 2 IPM (images per minute) per project.
//     → Solusi: delay 35s antar scene (safety margin dari 30s/image minimum).
function getApiKeys(): string[] {
  const keys: string[] = [];
  if (process.env.GEMINI_API_KEY)   keys.push(process.env.GEMINI_API_KEY);
  if (process.env.GEMINI_API_KEY_2) keys.push(process.env.GEMINI_API_KEY_2);
  if (process.env.GEMINI_API_KEY_3) keys.push(process.env.GEMINI_API_KEY_3);
  if (process.env.GEMINI_API_KEY_4) keys.push(process.env.GEMINI_API_KEY_4);
  return keys;
}

// ─── Error classification ─────────────────────────────────────────────────────
function classifyError(msg: string): 'rate_limit' | 'not_retryable' | 'retryable' {
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
    return 'rate_limit';
  }
  // 400 / 404 / model not found → tidak ada gunanya retry ke model/key lain
  if (
    msg.includes('400') ||
    msg.includes('404') ||
    msg.includes('not found') ||
    msg.includes('invalid') ||
    msg.includes('API_KEY_INVALID') ||
    msg.includes('INVALID_ARGUMENT')
  ) {
    return 'not_retryable';
  }
  return 'retryable';
}

// ─── 6 Scene Definitions ──────────────────────────────────────────────────────
const SCENES = [
  {
    scene: 'tshirt',
    label: '👕 T-Shirt',
    buildPrompt: (title: string, desc: string, cat: string) =>
      `You are given the logo image of "${title}", a ${cat} brand.${desc ? ` Brand description: ${desc}.` : ''}

Using this exact logo (reproduce faithfully — same colors, shapes, typography), generate a photorealistic product mockup showing the logo printed centered on the chest of a clean white t-shirt. Flat lay on a smooth light surface. Studio lighting, minimal white/grey background, commercial photography quality, 4K resolution. The logo must be clearly visible and accurate.`,
  },
  {
    scene: 'business_card',
    label: '💳 Business Card',
    buildPrompt: (title: string, desc: string, cat: string) =>
      `You are given the logo image of "${title}", a ${cat} brand.${desc ? ` Brand description: ${desc}.` : ''}

Using this exact logo (reproduce faithfully — same colors, shapes, typography), generate a photorealistic business card mockup with the logo prominently on the front of a premium matte white card. Resting on a marble or dark textured surface, slight shadow, elegant top-down angle. Studio photography quality.`,
  },
  {
    scene: 'mug',
    label: '☕ Mug',
    buildPrompt: (title: string, desc: string, cat: string) =>
      `You are given the logo image of "${title}", a ${cat} brand.${desc ? ` Brand description: ${desc}.` : ''}

Using this exact logo (reproduce faithfully — same colors, shapes, typography), generate a photorealistic mockup of the logo printed on the side of a clean white ceramic coffee mug. Wooden table or minimal surface, warm cafe-like lighting, professional photography. Logo clearly visible and centered.`,
  },
  {
    scene: 'tote_bag',
    label: '🛍️ Tote Bag',
    buildPrompt: (title: string, desc: string, cat: string) =>
      `You are given the logo image of "${title}", a ${cat} brand.${desc ? ` Brand description: ${desc}.` : ''}

Using this exact logo (reproduce faithfully — same colors, shapes, typography), generate a photorealistic mockup of the logo screen-printed on a natural canvas tote bag. Displayed upright on a clean white or light background. Lifestyle photography quality, soft studio lighting.`,
  },
  {
    scene: 'poster',
    label: '🖼️ Poster',
    buildPrompt: (title: string, desc: string, cat: string) =>
      `You are given the logo image of "${title}", a ${cat} brand.${desc ? ` Brand description: ${desc}.` : ''}

Using this exact logo (reproduce faithfully — same colors, shapes, typography), generate a photorealistic brand mockup with the logo on an A2 poster mounted on a clean white interior wall. Contemporary gallery or office setting, minimal design, professional interior photography.`,
  },
  {
    scene: 'billboard',
    label: '🏙️ Billboard',
    buildPrompt: (title: string, desc: string, cat: string) =>
      `You are given the logo image of "${title}", a ${cat} brand.${desc ? ` Brand description: ${desc}.` : ''}

Using this exact logo (reproduce faithfully — same colors, shapes, typography), generate a photorealistic outdoor advertising mockup of the logo on a billboard in an urban street scene. Daytime, natural lighting, realistic city background. Wide-angle commercial visualization.`,
  },
];

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

// ─── Call Gemini Image Generation API ────────────────────────────────────────
// Model: gemini-2.0-flash-exp-image-generation
// Endpoint: generateContent (standard) — BUKAN /predict seperti Imagen
async function callGemini(
  model: string,
  prompt: string,
  logoBase64: string,
  logoMime: string,
  apiKey: string,
): Promise<Buffer> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        parts: [
          // Image input dulu, lalu text prompt
          { inline_data: { mime_type: logoMime, data: logoBase64 } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      // IMAGE + TEXT wajib keduanya, model butuh ini untuk aktifkan image output
      responseModalities: ['IMAGE', 'TEXT'],
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(50_000),
  });

  // Baca body sekali, simpan ke variable
  const responseText = await res.text();

  if (!res.ok) {
    throw new Error(`Gemini ${model} error ${res.status}: ${responseText.slice(0, 400)}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Gemini ${model} returned non-JSON: ${responseText.slice(0, 200)}`);
  }

  const parts = (data as { candidates?: Array<{ content?: { parts?: Array<{ inline_data?: { data?: string } }> } }> })
    ?.candidates?.[0]?.content?.parts ?? [];

  for (const part of parts) {
    if (part.inline_data?.data) {
      return Buffer.from(part.inline_data.data, 'base64');
    }
  }

  throw new Error(`Gemini ${model} returned no image. Response: ${JSON.stringify(data).slice(0, 300)}`);
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

// ─── Generate 1 scene dengan key rotation + error classification ──────────────
async function generateScene(
  sceneConfig: (typeof SCENES)[0],
  title: string,
  description: string,
  category: string,
  logoBase64: string,
  logoMime: string,
  apiKeys: string[],
  assignedKeyIndex: number,
): Promise<MockupResult> {
  const prompt = sceneConfig.buildPrompt(title, description, category);
  const errors: string[] = [];

  // Urutan key: mulai dari assignedKey, lalu fallback ke key lain
  const keyOrder = [
    assignedKeyIndex,
    ...apiKeys.map((_, i) => i).filter(i => i !== assignedKeyIndex),
  ];

  for (const keyIdx of keyOrder) {
    const key = apiKeys[keyIdx];
    const keyLabel = `key_${keyIdx + 1}`;

    for (const model of GEMINI_IMAGE_MODELS) {
      try {
        console.log(`[mockup] scene=${sceneConfig.scene} trying ${keyLabel}+${model}`);
        const imgBuffer = await callGemini(model, prompt, logoBase64, logoMime, key);
        const cloudUrl  = await uploadBufferToCloudinary(imgBuffer);
        console.log(`[mockup] scene=${sceneConfig.scene} ✓ ${keyLabel}+${model}`);
        return { scene: sceneConfig.scene, label: sceneConfig.label, url: cloudUrl };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        const errorType = classifyError(msg);

        console.warn(`[mockup] ${keyLabel}+${model} failed [${errorType.toUpperCase()}]: ${msg.slice(0, 150)}`);
        errors.push(`${keyLabel}+${model}[${errorType}]: ${msg.slice(0, 80)}`);

        if (errorType === 'rate_limit') {
          // Key ini kena rate limit → skip semua model di key ini, coba key berikutnya
          console.warn(`[mockup] ${keyLabel} rate limited, switching key…`);
          break;
        }

        if (errorType === 'not_retryable') {
          // 400/404/invalid → tidak ada gunanya retry model/key lain, langsung throw
          throw new Error(`Non-retryable error on scene "${sceneConfig.scene}": ${msg}`);
        }

        // retryable → coba model berikutnya di key yang sama (kalau ada)
      }
    }
  }

  throw new Error(`All keys/models failed for "${sceneConfig.scene}": ${errors.join(' | ')}`);
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

  const apiKeys = getApiKeys();
  if (apiKeys.length === 0) {
    return NextResponse.json({ error: 'GEMINI_API_KEY env var not set' }, { status: 500 });
  }
  console.log(`[mockup] using ${apiKeys.length} API key(s)`);

  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    return NextResponse.json({ error: 'Cloudinary env vars not configured' }, { status: 500 });
  }

  try {
    console.log('[mockup] fetching logo:', logo_url);
    const { base64: logoBase64, mimeType: logoMime } = await fetchLogoAsBase64(logo_url);
    console.log(`[mockup] logo fetched, mime=${logoMime}, size=${logoBase64.length} chars`);

    const results: MockupResult[] = [];

    for (let i = 0; i < SCENES.length; i++) {
      const scene = SCENES[i];
      // Round-robin: scene[0]→key[0], scene[1]→key[1], dst
      const assignedKeyIndex = i % apiKeys.length;
      console.log(`[mockup] scene ${i + 1}/${SCENES.length} (${scene.scene}) → key_${assignedKeyIndex + 1}`);

      try {
        const result = await generateScene(
          scene, title, description, category, logoBase64, logoMime, apiKeys, assignedKeyIndex,
        );
        results.push(result);
        console.log(`[mockup] ✓ ${i + 1}/${SCENES.length} done`);
      } catch (e) {
        // Non-retryable error → skip scene ini, lanjut ke scene berikutnya
        console.error(`[mockup] scene skipped (${scene.scene}):`, e instanceof Error ? e.message : e);
      }

      // Delay 35s antar scene — wajib untuk free tier image generation
      // Free tier IPM limit: 2 images/menit = 1 image per 30s minimum
      // 35s = safety margin ~17% di atas limit → hindari 429
      // ⚠️ Rotasi API key TIDAK membantu jika key dari project yang sama (shared quota)
      if (i < SCENES.length - 1) {
        console.log(`[mockup] waiting 35s before next scene (free tier IPM limit)…`);
        await new Promise(r => setTimeout(r, 35_000));
      }
    }

    if (results.length === 0) {
      return NextResponse.json(
        { error: 'Rate limit tercapai. Free tier Gemini hanya 2 images/menit per project. Coba lagi dalam 2–3 menit, atau gunakan API key dari Google Cloud project yang berbeda.' },
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
