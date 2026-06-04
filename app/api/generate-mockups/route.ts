import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

function checkAdmin(req: NextRequest) {
  return req.headers.get('x-admin-token') === process.env.ADMIN_TOKEN;
}

// Mockup scene templates - each scene describes a real-world placement
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

async function generateMockupImage(prompt: string): Promise<string> {
  // Pollinations AI - free, no API key needed
  const encoded = encodeURIComponent(prompt);
  const seed = Math.floor(Math.random() * 999999);
  // Returns a direct image URL
  return `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&seed=${seed}&nologo=true&enhance=true`;
}

async function uploadToCloudinary(imageUrl: string, title: string, scene: string, cloudName: string, apiKey: string, apiSecret: string): Promise<string> {
  const crypto = await import('crypto');
  const timestamp = Math.round(Date.now() / 1000);
  const folder = 'vibelogos/mockups';
  const publicId = `mockup_${title.toLowerCase().replace(/\s+/g, '_')}_${scene}_${timestamp}`;

  const paramsToSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}&upload_preset=`;
  // Sign without upload_preset
  const signStr = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto.createHash('sha256').update(signStr + apiSecret).digest('hex');

  const formData = new FormData();
  formData.append('file', imageUrl);
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

  // ── Step 1: Claude AI analyzes the logo and produces mockup descriptions ──
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let logoDescription = '';
  let colorPalette = '';

  try {
    // Fetch logo as base64 for vision analysis
    const imgRes = await fetch(logo_url);
    const imgBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(imgBuffer).toString('base64');
    const mimeType = imgRes.headers.get('content-type') || 'image/png';

    const analysis = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType as 'image/png', data: base64 },
          },
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
    logoDescription = parsed.description || `${title} logo design`;
    colorPalette = parsed.colors || 'professional color scheme';
  } catch {
    // Fallback if vision fails
    logoDescription = `${title} logo design`;
    colorPalette = 'professional modern colors';
  }

  // ── Step 2: Generate mockup images via Pollinations AI ──
  const results: { scene: string; label: string; url: string; cloudinary_url?: string }[] = [];

  for (const scene of MOCKUP_SCENES) {
    try {
      const prompt = scene.template(logoDescription, colorPalette);
      const pollinationsUrl = await generateMockupImage(prompt);

      // Upload Pollinations result to Cloudinary for permanent storage
      let finalUrl = pollinationsUrl;
      try {
        finalUrl = await uploadToCloudinary(pollinationsUrl, title, scene.id, cloudName, apiKey, apiSecret);
      } catch {
        // Keep Pollinations URL as fallback if Cloudinary upload fails
        finalUrl = pollinationsUrl;
      }

      results.push({ scene: scene.id, label: scene.label, url: finalUrl });
    } catch (err) {
      console.error(`Mockup ${scene.id} failed:`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    logo_description: logoDescription,
    color_palette: colorPalette,
    mockups: results,
  });
}
