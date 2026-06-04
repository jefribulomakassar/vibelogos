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

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { logo_url, title, category } = await req.json();
  if (!logo_url) return NextResponse.json({ error: 'logo_url required' }, { status: 400 });

  // Claude analyzes logo, returns description + prompts only
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let logoDescription = `${title} logo design`;
  let colorPalette = 'professional modern colors';

  try {
    const imgRes = await fetch(logo_url);
    const base64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64');
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
Respond ONLY with JSON, no markdown:
{
  "description": "concise visual description for image generation (max 30 words)",
  "colors": "main color palette (e.g. deep navy and gold)"
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

  // Return Pollinations URLs — browser fetches them directly (avoids 402 from server IP)
  const mockups = MOCKUP_SCENES.map(scene => {
    const prompt = scene.template(logoDescription, colorPalette);
    const encoded = encodeURIComponent(prompt);
    const seed = Math.floor(Math.random() * 999999);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&seed=${seed}&nologo=true&enhance=true`;
    return { scene: scene.id, label: scene.label, url };
  });

  return NextResponse.json({ ok: true, logo_description: logoDescription, color_palette: colorPalette, mockups });
}
