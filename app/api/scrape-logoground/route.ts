// app/api/scrape-logoground/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

function checkAdmin(req: NextRequest) {
  return req.headers.get('x-admin-token') === process.env.ADMIN_TOKEN;
}

interface LogoGroundData {
  title: string;
  description: string;
  keywords: string[];
  price: number;
  main_category: string;
  secondary_categories: string[];
  logo_url: string;
  logoground_url: string;
}

function extractLogoId(url: string): string | null {
  const match = url.match(/[?&]id=(\d+)/);
  return match ? match[1] : null;
}

function parsePrice(text: string): number {
  const match = text.match(/\$\s*([\d,]+)/);
  if (!match) return 0;
  return parseInt(match[1].replace(/,/g, ''), 10);
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/\n+/g, ' ').trim();
}

function parseHTML(html: string, logogroundUrl: string): LogoGroundData {
  // ── Title ──────────────────────────────────────────────────────────────────
  const ogTitleMatch =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = ogTitleMatch
    ? cleanText(ogTitleMatch[1])
    : titleTagMatch
    ? cleanText(titleTagMatch[1].replace(/\s*[-|].*$/, ''))
    : '';

  // ── Logo Image URL ─────────────────────────────────────────────────────────
  const ogImageMatch =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  const logo_url = ogImageMatch ? ogImageMatch[1].trim() : '';

  // ── Description ────────────────────────────────────────────────────────────
  let description = '';
  const descSectionMatch = html.match(/DESIGNER'S DESCRIPTION\s*([\s\S]*?)(?:TAGS|<\/|$)/i);
  if (descSectionMatch) {
    description = cleanText(descSectionMatch[1].replace(/<[^>]+>/g, ' '));
  }
  if (!description) {
    const ogDescMatch =
      html.match(/<meta[^>]+(?:name=["']description["']|property=["']og:description["'])[^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name=["']description["']|property=["']og:description["'])/i);
    if (ogDescMatch) {
      const raw = ogDescMatch[1];
      const semiIdx = raw.indexOf(';');
      description = semiIdx !== -1 ? cleanText(raw.slice(semiIdx + 1)) : cleanText(raw);
    }
  }

  // ── Keywords/Tags ──────────────────────────────────────────────────────────
  let keywords: string[] = [];
  const tagsSectionMatch = html.match(/TAGS\s*([\s\S]*?)(?:<\/div>|<div|Similar logos|RELATED|$)/i);
  if (tagsSectionMatch) {
    const tagsRaw = cleanText(tagsSectionMatch[1].replace(/<[^>]+>/g, ' '));
    keywords = tagsRaw
      .replace(/\.\.\./g, '')
      .split(/\s+/)
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k.length > 1 && k.length < 30);
  }

  // ── Price ──────────────────────────────────────────────────────────────────
  const priceMatch = html.match(/>(\$[\d,]+)<\/(?:div|span|p|h[1-6]|strong)/);
  const price = priceMatch ? parsePrice(priceMatch[1]) : 0;

  // ── Main Category ──────────────────────────────────────────────────────────
  let main_category = '';
  const mainCatMatch = html.match(/Logo Category[\s\S]*?<a[^>]*>([^<]+Logos)<\/a>/i);
  if (mainCatMatch) {
    main_category = cleanText(mainCatMatch[1].replace(/\s*Logos\s*$/i, ''));
  }

  // ── Secondary Categories ───────────────────────────────────────────────────
  const secondary_categories: string[] = [];
  const subCatSection = html.match(/Sub-Categories([\s\S]*?)(?:Published|<\/ul>|<\/td>)/i);
  if (subCatSection) {
    const subMatches = subCatSection[1].matchAll(/<a[^>]*>([^<]+Logos)<\/a>/gi);
    for (const m of subMatches) {
      const cat = cleanText(m[1].replace(/\s*Logos\s*$/i, ''));
      if (cat && cat !== main_category) secondary_categories.push(cat);
    }
  }

  return {
    title,
    description,
    keywords,
    price,
    main_category,
    secondary_categories,
    logo_url,
    logoground_url: logogroundUrl,
  };
}

// ── Ambil HTML via Anthropic web_fetch server tool ────────────────────────────
async function fetchViaClaudeWebFetch(url: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY tidak ditemukan di env');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'web-fetch-2025-09-10',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', // model paling murah, cukup untuk fetch
      max_tokens: 8000,
      tools: [
        {
          type: 'web_fetch_20250910',
          name: 'web_fetch',
          max_uses: 1,
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Fetch the raw HTML content of this URL and return ONLY the full HTML, nothing else: ${url}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }

  const data = await response.json();

  // Kumpulkan semua text dari content blocks (termasuk web_fetch_tool_result)
  let html = '';
  for (const block of data.content ?? []) {
    if (block.type === 'text' && block.text) {
      html += block.text;
    } else if (block.type === 'web_fetch_tool_result') {
      // Hasil fetch ada di block.content.source.data
      const fetched = block.content?.source?.data ?? block.content?.data ?? '';
      if (fetched) html += fetched;
    }
  }

  if (!html) throw new Error('web_fetch tidak mengembalikan konten HTML');
  return html;
}

export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const logogroundUrl = searchParams.get('url')?.trim();

  if (!logogroundUrl) {
    return NextResponse.json({ error: 'url parameter is required' }, { status: 400 });
  }

  if (!logogroundUrl.includes('logoground.com/logo.php')) {
    return NextResponse.json(
      { error: 'URL harus dari logoground.com/logo.php?id=...' },
      { status: 400 },
    );
  }

  const logoId = extractLogoId(logogroundUrl);
  if (!logoId) {
    return NextResponse.json({ error: 'ID logo tidak ditemukan di URL' }, { status: 400 });
  }

  try {
    const targetUrl = `https://www.logoground.com/logo.php?id=${logoId}`;

    // Gunakan Anthropic web_fetch — sama persis seperti cara Claude.ai fetch halaman
    const html = await fetchViaClaudeWebFetch(targetUrl);

    if (html.includes('Logo not found') || html.includes('does not exist')) {
      return NextResponse.json({ error: 'Logo tidak ditemukan di LogoGround' }, { status: 404 });
    }

    const data = parseHTML(html, logogroundUrl);

    if (!data.title) {
      return NextResponse.json(
        { error: 'Gagal mengekstrak data. Coba refresh atau cek URL.' },
        { status: 422 },
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('timeout') || msg.includes('TimeoutError')) {
      return NextResponse.json({ error: 'Timeout mengambil halaman LogoGround' }, { status: 504 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
