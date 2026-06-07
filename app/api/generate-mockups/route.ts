import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Vercel: perpanjang timeout route ini hingga 60 detik (free plan max)
// Upgrade ke Vercel Pro → ganti jadi 300
export const maxDuration = 300; // Vercel Pro: 300s, Free: max 60s (upgrade recommended)

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

// ─── Gemini Image Models (hanya yang support image output) ──────────────────────
// gemini-2.5-flash & lite TIDAK support image output (text only) — jangan dipakai
// Rate limit free tier: 15 req/menit per key → pakai multi-key rotation
const GEMINI_IMAGE_MODELS = [
  'gemini-3.1-flash-image',         // primary — Nano Banana 2
  'gemini-3.1-flash-image-preview', // fallback
];

// ─── Multi API Key Rotation ───────────────────────────────────────────────────
// Set di Vercel env: GEMINI_API_KEY (wajib), GEMINI_API_KEY_2, GEMINI_API_KEY_3, dst
// Makin banyak key → makin kecil kemungkinan 429
function getApiKeys(): string[] {
  const keys: string[] = [];
  if (process.env.GEMINI_API_KEY)   keys.push(process.env.GEMINI_API_KEY);
  if (process.env.GEMINI_API_KEY_2) keys.push(process.env.GEMINI_API_KEY_2);
  if (process.env.GEMINI_API_KEY_3) keys.push(process.env.GEMINI_API_KEY_3);
  if (process.env.GEMINI_API_KEY_4) keys.push(process.env.GEMINI_API_KEY_4);
  return keys;
}

// ─── 6 Scene Definitions ──────────────────────────────────────────────────────
const SCENES = [
  {
    scene: 'tshirt',
    label: '👕 T-Shirt',
    buildPrompt: (title: string, desc: string, cat: string) =>
      `You are given the logo image of "${title}", a ${cat} brand. ${desc ? `Brand description: ${desc}.` : ''}

Generate a photorealistic product mockup showing this EXACT logo (reproduce the logo faithfully — same colors, shapes, typography) printed centered on the chest of a clean white t-shirt. The t-shirt should be displayed as a flat lay on a smooth light surface. Studio lighting, minimal white/grey background, commercial photography quality, 4K resolution. The logo must be clearly visible and accurate.`,
  },
  {
    scene: 'business_card',
    label: '💳 Business Card',
    buildPrompt: (title: string, desc: string, cat: string) =>
      `You are given the logo image of "${title}", a ${cat} brand. ${desc ? `Brand description: ${desc}.` : ''}

Generate a photorealistic business card mockup showing this EXACT logo (reproduce faithfully — same colors, shapes, typography) prominently on the front of a premium matte white business card. The card should rest on a marble or dark textured surface, slight shadow, elegant top-down angle. Studio photography quality. The logo must be clearly visible and accurate.`,
  },
  {
    scene: 'mug',
    label: '☕ Mug',
    buildPrompt: (title: string, desc: string, cat: string) =>
      `You are given the logo image of "${title}", a ${cat} brand. ${desc ? `Brand description: ${desc}.` : ''}

Generate a photorealistic product mockup showing this EXACT logo (reproduce faithfully — same colors, shapes, typography) printed on the side of a clean white ceramic coffee mug. Place the mug on a wooden table or minimal surface, warm cafe-like lighting, professional photography. The logo must be clearly visible, accurate, and centered on the mug.`,
  },
  {
    scene: 'tote_bag',
    label: '🛍️ Tote Bag',
    buildPrompt: (title: string, desc: string, cat: string) =>
      `You are given the logo image of "${title}", a ${cat} brand. ${desc ? `Brand description: ${desc}.` : ''}

Generate a photorealistic product mockup showing this EXACT logo (reproduce faithfully — same colors, shapes, typography) screen-printed on the front of a natural canvas tote bag. The bag should hang or be displayed upright on a clean white or light background. Lifestyle photography quality, soft studio lighting. The logo must be clearly visible and accurate.`,
  },
  {
    scene: 'poster',
    label: '🖼️ Poster',
    buildPrompt: (title: string, desc: string, cat: string) =>
      `You are given the logo image of "${title}", a ${cat} brand. ${desc ? `Brand description: ${desc}.` : ''}

Generate a photorealistic brand mockup showing this EXACT logo (reproduce faithfully — same colors, shapes, typography) featured large and prominently on an A2 poster mounted on a clean white interior wall. Contemporary gallery or office setting, minimal design, professional interior photography. The logo must dominate the poster and be clearly accurate.`,
  },
  {
    scene: 'billboard',
    label: '🏙️ Billboard',
    buildPrompt: (title: string, desc: string, cat: string) =>
      `You are given the logo image of "${title}", a ${cat} brand. ${desc ? `Brand description: ${desc}.` : ''}

Generate a photorealistic outdoor advertising mockup showing this EXACT logo (reproduce faithfully — same colors, shapes, typography) displayed large on a billboard in an urban street scene. Daytime, natural lighting, realistic city background. Wide-angle commercial visualization, high quality render. The logo must be clearly visible, dominant, and accurate.`,
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
          { inline_data: { mime_type: logoMime, data: logoBase64 } },
          { text: prompt },
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
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini ${model} error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inline_data?.data) {
      return Buffer.from(part.inline_data.data, 'base64');
    }
  }

  throw new Error(`Gemini ${model} returned no image. Response: ${JSON.stringify(data).slice(0, 200)}`);
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

// ─── Generate 1 scene dengan assigned key + model fallback ───────────────────
// assignedKey = key yang dialokasikan untuk scene ini (round-robin dari POST)
// Kalau assignedKey 429 → fallback ke key lain → fallback model lain
async function generateScene(
  sceneConfig: (typeof SCENES)[0],
  title: string,
  description: string,
  category: string,
  logoBase64: string,
  logoMime: string,
  apiKeys: string[],
  assignedKeyIndex: number, // index key utama untuk scene ini
): Promise<MockupResult> {
  const prompt = sceneConfig.buildPrompt(title, description, category);
  const errors: string[] = [];

  // Susun urutan key: mulai dari assignedKey, lalu key lain sebagai fallback
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
        const is429 = msg.includes('429');
        console.warn(`[mockup] ${keyLabel}+${model} failed (${is429 ? 'RATE LIMIT' : 'ERROR'}): ${msg.slice(0, 120)}`);
        errors.push(`${keyLabel}+${model}: ${msg.slice(0, 80)}`);
        // Kalau 429, langsung skip ke key berikutnya (jangan retry model lain di key yang sama)
        if (is429) break;
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

    // Sequential + round-robin key assignment:
    // scene[0]→key[0], scene[1]→key[1], scene[2]→key[2], scene[3]→key[0], dst
    // Tiap key dapat jeda alami ~N×10s sebelum dipanggil lagi → hindari 429
    // Kalau key yang ditugaskan 429 → otomatis fallback ke key lain
    const results: MockupResult[] = [];

    for (let i = 0; i < SCENES.length; i++) {
      const scene = SCENES[i];
      const assignedKeyIndex = i % apiKeys.length; // round-robin
      console.log(`[mockup] scene ${i + 1}/${SCENES.length} (${scene.scene}) → key_${assignedKeyIndex + 1}`);

      try {
        const result = await generateScene(
          scene, title, description, category, logoBase64, logoMime, apiKeys, assignedKeyIndex,
        );
        results.push(result);
        console.log(`[mockup] ✓ ${i + 1}/${SCENES.length} done`);
      } catch (e) {
        console.error(`[mockup] scene skipped (${scene.scene}):`, e);
      }
    }

    if (results.length === 0) {
      return NextResponse.json(
        { error: 'Semua scene gagal. Periksa GEMINI_API_KEY atau coba lagi.' },
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
