// app/api/scrape-logoground/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

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
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, ' ')
    .trim();
}

function parseHTML(html: string, logogroundUrl: string): LogoGroundData {
  // ── Title ──────────────────────────────────────────────────────────────────
  // Prioritas: og:title meta tag
  const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = ogTitleMatch
    ? cleanText(ogTitleMatch[1])
    : titleTagMatch
      ? cleanText(titleTagMatch[1].replace(/\s*[-|].*$/, '')) // hapus "| LogoGround" suffix
      : '';

  // ── Logo Image URL ─────────────────────────────────────────────────────────
  // og:image → URL gambar asli resolusi tinggi
  const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  const logo_url = ogImageMatch ? ogImageMatch[1].trim() : '';

  // ── Description ────────────────────────────────────────────────────────────
  // Cari section "DESIGNER'S DESCRIPTION" di HTML
  let description = '';
  const descSectionMatch = html.match(/DESIGNER'S DESCRIPTION\s*([\s\S]*?)(?:TAGS|<\/|$)/i);
  if (descSectionMatch) {
    // Strip HTML tags dari content
    description = cleanText(descSectionMatch[1].replace(/<[^>]+>/g, ' '));
  }
  if (!description) {
    // Fallback: og:description (berisi "Logo for sale: X by Y; description...")
    const ogDescMatch = html.match(/<meta[^>]+(?:name=["']description["']|property=["']og:description["'])[^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name=["']description["']|property=["']og:description["'])/i);
    if (ogDescMatch) {
      // Format: "Logo for sale: Title by Designer, uploaded on DATE; ACTUAL_DESCRIPTION"
      const raw = ogDescMatch[1];
      const semiColonIdx = raw.indexOf(';');
      description = semiColonIdx !== -1
        ? cleanText(raw.slice(semiColonIdx + 1))
        : cleanText(raw);
    }
  }

  // ── Tags / Keywords ────────────────────────────────────────────────────────
  let keywords: string[] = [];
  const tagsSectionMatch = html.match(/TAGS\s*([\s\S]*?)(?:<\/div>|<div|Similar logos|RELATED|$)/i);
  if (tagsSectionMatch) {
    const tagsRaw = cleanText(tagsSectionMatch[1].replace(/<[^>]+>/g, ' '));
    // Keywords dipisahkan spasi di LogoGround, hapus "..." trailing
    keywords = tagsRaw
      .replace(/\.\.\./g, '')
      .split(/\s+/)
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 1 && k.length < 30);
  }

  // ── Price ──────────────────────────────────────────────────────────────────
  // Cari harga di halaman — biasanya $400 atau format $1,200
  const priceMatch = html.match(/>(\$[\d,]+)<\/(?:div|span|p|h[1-6]|strong)/);
  const price = priceMatch ? parsePrice(priceMatch[1]) : 0;

  // ── Categories ─────────────────────────────────────────────────────────────
  // Format: "Logo Category <a>Security Logos</a>"
  let main_category = '';
  const mainCatMatch = html.match(/Logo Category[\s\S]*?<a[^>]*>([^<]+Logos)<\/a>/i);
  if (mainCatMatch) {
    main_category = cleanText(mainCatMatch[1].replace(/\s*Logos\s*$/i, ''));
  }

  // Sub-Categories
  const secondary_categories: string[] = [];
  const subCatSection = html.match(/Sub-Categories([\s\S]*?)(?:Published|<\/ul>|<\/td>)/i);
  if (subCatSection) {
    const subMatches = subCatSection[1].matchAll(/<a[^>]*>([^<]+Logos)<\/a>/gi);
    for (const m of subMatches) {
      const cat = cleanText(m[1].replace(/\s*Logos\s*$/i, ''));
      if (cat && cat !== main_category) {
        secondary_categories.push(cat);
      }
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

// ─── GET /api/scrape-logoground?url=... ───────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const logogroundUrl = searchParams.get('url')?.trim();

  if (!logogroundUrl) {
    return NextResponse.json({ error: 'url parameter is required' }, { status: 400 });
  }

  // Validasi URL format
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
    // Fetch halaman LogoGround — server-side, tidak ada CORS issue
    const res = await fetch(`https://www.logoground.com/logo.php?id=${logoId}`, {
      headers: {
        // Gunakan User-Agent browser biasa agar tidak diblokir
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.logoground.com/',
      },
      signal: AbortSignal.timeout(15_000),
      // Jangan cache — selalu fresh
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `LogoGround returned ${res.status}. Cek ID logo.` },
        { status: 502 },
      );
    }

    const html = await res.text();

    // Pastikan ini halaman logo valid (bukan 404 page)
    if (html.includes('Logo not found') || html.includes('does not exist')) {
      return NextResponse.json({ error: 'Logo tidak ditemukan di LogoGround' }, { status: 404 });
    }

    const data = parseHTML(html, logogroundUrl);

    // Validasi minimal — harus ada title dan logo_url
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
