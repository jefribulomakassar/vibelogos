import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

function checkAdmin(req: NextRequest) {
  return req.headers.get('x-admin-token') === process.env.ADMIN_TOKEN;
}

const MOCKUP_SCENES = [
  {
    id: 'business_card',
    label: 'Business Card',
    template: (logoDesc: string, colors: string) =>
      `Professional business card mockup on a dark marble surface, the card features ${logoDesc}, color palette ${colors}, elegant typography, soft studio lighting, top-down perspective, photorealistic, 4k`,
  },
  {
    id: 'tshirt',
    label: 'T-Shirt',
    template: (logoDesc: string, colors: string) =>
      `Mockup of a premium white t-shirt on a mannequin with ${logoDesc} printed on the chest, ${colors} ink colors, clean studio background, soft shadows, lifestyle product photography, 4k`,
  },
  {
    id: 'signage',
    label: 'Storefront Sign',
    template: (logoDesc: string, colors: string) =>
      `Modern storefront sign mockup on a minimalist building facade, ${logoDesc} as illuminated signage, ${colors} color scheme, golden hour lighting, architectural photography, wide angle, 4k`,
  },
  {
    id: 'phone_screen',
    label: 'Phone App Icon',
    template: (logoDesc: string, colors: string) =>
      `Smartphone screen mockup showing an app icon with ${logoDesc}, ${colors} theme, modern UI, floating phone on gradient background, product photography, 4k`,
  },
];

// Fetch Pollinations image as buffer, retry up to maxRetries times
async function fetchPollinationsImage(prompt: string, maxRetries = 3): Promise<Buffer> {
  const encoded = encodeURIComponent(prompt);
  const seed = Math.floor(Math.random() * 999999);
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&seed=${seed}&nologo=true&enhance=true`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45_000); // 45s timeout per attempt

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`Pollinations returned ${res.status}`);

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) {
        throw new Error(`Expected image, got ${contentType}`);
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 5000) throw new Error('Image too small, likely failed'); // <5KB = bad response

      return buffer;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      // Wait 3s before retry
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  throw new Error('All Pollinations retries failed');
}

async function uploadBufferToCloudinary(
  imageBuffer: Buffer,
  title: string,
  scene: string,
  cloudName: string,
  apiKey: string,
  apiSecret: string,
): Promise<string> {
  const crypto = await import('crypto');
  const timestamp = Math.round(Date.now() / 1000);
  const folder = 'vibelogos/mockups';
  const publicId = `mockup_${title.toLowerCase().replace(/\s+/g, '_')}_${scene}_${timestamp}`;

  const signStr = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto.createHash('sha256').update(signStr + apiSecret).digest('hex');

  // Convert buffer to base64 data URI for Cloudinary upload
  const base64 = imageBuffer.toString('base64');
  const dataUri = `data:image/jpeg;base64,${base64}`;

  const formData = new FormData();
  formData.append('file', dataUri);
  formData.append('api_key', apiKey);
  formData.append('timestamp', String(timestamp));
  formData.append('signature', signature);
  formData.append('folder', folder);
  formData.append('public_id', publicId);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  });

  const data = await res.json();
  if (!data.secure_url) throw new Error(data.error?.message || 'Cloudinary upload failed');
  return data.secure_url;
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { logo_url, title, category } = await req.json();

  if (!logo_url) {
    return NextResponse.json({ error: 'logo_url required' }, { status: 400 });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json({ error: 'Cloudinary env vars not set' }, { status: 500 });
  }

  // ── Step 1: Claude AI analyzes the logo ──────────────────────────────────
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let logoDescription = `${title} logo design`;
  let colorPalette = 'professional modern colors';

  try {
    const imgRes = await fetch(logo_url);
    const imgBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(imgBuffer).toString('base64');
    const mimeType = (imgRes.headers.get('content-type') || 'image/png') as 'image/png';

    const analysis = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          {
            type: 'text',
            text: `Analyze this logo for "${title}" (category: ${category || 'Brand'}).
Respond ONLY with a JSON object, no markdown:
{
  "description": "concise visual description of the logo design for image generation (max 30 words)",
  "colors": "main color palette description (e.g. deep navy and gold, vibrant red and white)",
  "style": "one word style: modern/vintage/minimal/bold/playful/elegant"
}`,
          },
        ],
      }],
    });

    const text = analysis.content[0].type === 'text' ? analysis.content[0].text : '';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    logoDescription = parsed.description || logoDescription;
    colorPalette = parsed.colors || colorPalette;
  } catch {
    // Keep fallback values
  }

  // ── Step 2: Generate & upload mockups (parallel) ─────────────────────────
  const results: { scene: string; label: string; url: string }[] = [];

  await Promise.all(
    MOCKUP_SCENES.map(async (scene) => {
      try {
        const prompt = scene.template(logoDescription, colorPalette);

        // Fetch actual image bytes from Pollinations (with retry)
        const imageBuffer = await fetchPollinationsImage(prompt);

        // Upload buffer directly to Cloudinary
        const cloudinaryUrl = await uploadBufferToCloudinary(
          imageBuffer, title, scene.id, cloudName, apiKey, apiSecret,
        );

        results.push({ scene: scene.id, label: scene.label, url: cloudinaryUrl });
      } catch (err) {
        console.error(`Mockup ${scene.id} failed:`, err);
        // Skip failed scenes rather than breaking the whole request
      }
    }),
  );

  // Sort results to match original scene order
  const ordered = MOCKUP_SCENES
    .map(s => results.find(r => r.scene === s.id))
    .filter(Boolean) as typeof results;

  return NextResponse.json({
    ok: true,
    logo_description: logoDescription,
    color_palette: colorPalette,
    mockups: ordered,
  });
}
