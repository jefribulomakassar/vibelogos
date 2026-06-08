// app/api/scrape-logoground/route.ts
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';

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

// ── Parse HTML menggunakan cheerio (akurat, DOM-aware) ────────────────────────
function parseWithCheerio(html: string, logogroundUrl: string): LogoGroundData {
  const $ = cheerio.load(html);

  // ── Title ──────────────────────────────────────────────────────────────────
  const title =
    cleanText($('meta[property="og:title"]').attr('content') ?? '') ||
    cleanText($('title').text().replace(/\s*[-|].*$/, ''));

  // ── Logo Image URL ─────────────────────────────────────────────────────────
  const logo_url =
    $('meta[property="og:image"]').attr('content')?.trim() ?? '';

  // ── Description ────────────────────────────────────────────────────────────
  let description = '';

  // Cari section "DESIGNER'S DESCRIPTION" di teks body
  const bodyHtml = $('body').html() ?? '';
  const descSectionMatch = bodyHtml.match(
    /DESIGNER'S DESCRIPTION\s*([\s\S]*?)(?:TAGS|<\/td>|<\/div>|$)/i,
  );
  if (descSectionMatch) {
    description = cleanText(
      cheerio.load(descSectionMatch[1]).text(),
    );
  }

  // Fallback ke meta description
  if (!description) {
    const metaDesc =
      $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') ||
      '';
    if (metaDesc) {
      // Meta description logoground format: "Logo for sale: Title; <actual desc>"
      const semiIdx = metaDesc.indexOf(';');
      description =
        semiIdx !== -1
          ? cleanText(metaDesc.slice(semiIdx + 1))
          : cleanText(metaDesc);
    }
  }

  // ── Keywords/Tags ──────────────────────────────────────────────────────────
  let keywords: string[] = [];

  // Cari teks "TAGS" lalu ambil konten setelahnya
  const tagsSectionMatch = bodyHtml.match(
    /TAGS\s*([\s\S]*?)(?:Similar logos|RELATED|<\/table>|<\/td>|<\/div>|$)/i,
  );
  if (tagsSectionMatch) {
    const tagsText = cleanText(
      cheerio.load(tagsSectionMatch[1]).text(),
    );
    keywords = tagsText
      .replace(/\.\.\./g, '')
      .split(/[\s,]+/)
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k.length > 1 && k.length < 30 && /^[a-z0-9 &-]+$/i.test(k));
  }

  // Fallback: ambil dari meta keywords jika ada
  if (keywords.length === 0) {
    const metaKw = $('meta[name="keywords"]').attr('content') ?? '';
    if (metaKw) {
      keywords = metaKw
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter((k) => k.length > 1);
    }
  }

  // ── Price ──────────────────────────────────────────────────────────────────
  let price = 0;
  $('div, span, p, strong, h1, h2, h3, h4, h5, h6').each((_, el) => {
    if (price > 0) return false; // break
    const txt = $(el).text().trim();
    if (/^\$[\d,]+$/.test(txt)) {
      price = parsePrice(txt);
    }
  });

  // Fallback regex
  if (price === 0) {
    const priceMatch = bodyHtml.match(/>(\$[\d,]+)<\/(?:div|span|p|h[1-6]|strong)/);
    if (priceMatch) price = parsePrice(priceMatch[1]);
  }

  // ── Main Category ──────────────────────────────────────────────────────────
  let main_category = '';

  // Cari link di sekitar "Logo Category"
  const catSection = bodyHtml.match(/Logo Category[\s\S]*?(<a[^>]*>[^<]+Logos<\/a>)/i);
  if (catSection) {
    main_category = cleanText(
      cheerio.load(catSection[1])('a').text().replace(/\s*Logos\s*$/i, ''),
    );
  }

  // Fallback: ambil dari breadcrumb atau kategori link
  if (!main_category) {
    $('a[href*="category"]').each((_, el) => {
      const txt = $(el).text().trim();
      if (txt.endsWith('Logos') && !main_category) {
        main_category = cleanText(txt.replace(/\s*Logos\s*$/i, ''));
      }
    });
  }

  // ── Secondary Categories ───────────────────────────────────────────────────
  const secondary_categories: string[] = [];
  const subCatSection = bodyHtml.match(
    /Sub-Categories([\s\S]*?)(?:Published|<\/ul>|<\/td>|<\/table>)/i,
  );
  if (subCatSection) {
    const subHtml = subCatSection[1];
    const $sub = cheerio.load(subHtml);
    $sub('a').each((_, el) => {
      const txt = $sub(el).text().trim();
      if (txt.endsWith('Logos')) {
        const cat = cleanText(txt.replace(/\s*Logos\s*$/i, ''));
        if (cat && cat !== main_category) {
          secondary_categories.push(cat);
        }
      }
    });
  }

  return {
    title,
    description,
    keywords,
    price,
    main_category,
    secondary_categories,
    logo_url,
    logoground_url,
  };
}

// ── Fetch HTML via axios (primary) ────────────────────────────────────────────
async function fetchViaAxios(url: string): Promise<string> {
  const res = await axios.get<string>(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.logoground.com/',
    },
    timeout: 20_000,
    responseType: 'text',
    maxRedirects: 5,
  });
  return res.data;
}

// ── Fetch HTML via Anthropic web_fetch (fallback) ─────────────────────────────
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
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8000,
      tools: [{ type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 1 }],
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

  let html = '';
  for (const block of data.content ?? []) {
    if (block.type === 'text' && block.text) html += block.text;
    else if (block.type === 'web_fetch_tool_result') {
      const fetched =
        block.content?.source?.data ?? block.content?.data ?? '';
      if (fetched) html += fetched;
    }
  }

  if (!html) throw new Error('web_fetch tidak mengembalikan konten HTML');
  return html;
}

// ── Main fetch dengan fallback ─────────────────────────────────────────────────
async function fetchHTML(url: string): Promise<{ html: string; method: string }> {
  // Primary: axios langsung (lebih cepat, gratis)
  try {
    const html = await fetchViaAxios(url);
    if (html && html.includes('logoground')) {
      return { html, method: 'axios' };
    }
  } catch (e) {
    console.warn('[scrape-logoground] axios gagal, fallback ke Claude web_fetch:', e);
  }

  // Fallback: Anthropic web_fetch
  const html = await fetchViaClaudeWebFetch(url);
  return { html, method: 'claude-web-fetch' };
}

// ── GET handler ───────────────────────────────────────────────────────────────
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
    const { html, method } = await fetchHTML(targetUrl);

    if (html.includes('Logo not found') || html.includes('does not exist')) {
      return NextResponse.json({ error: 'Logo tidak ditemukan di LogoGround' }, { status: 404 });
    }

    // Parse dengan cheerio (lebih akurat dari regex)
    const data = parseWithCheerio(html, logogroundUrl);

    if (!data.title) {
      return NextResponse.json(
        { error: 'Gagal mengekstrak data. Coba refresh atau cek URL.' },
        { status: 422 },
      );
    }

    return NextResponse.json({ success: true, data, _method: method });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('timeout') || msg.includes('TimeoutError')) {
      return NextResponse.json({ error: 'Timeout mengambil halaman LogoGround' }, { status: 504 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
