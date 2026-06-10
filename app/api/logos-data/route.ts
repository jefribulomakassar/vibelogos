// app/api/logos-data/route.ts
// GET semua logos, POST tambah logo baru

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@libsql/client/web';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';

function getDb() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

function parseRow(row: Record<string, unknown>) {
  return {
    id: row.id as number,
    slug: row.slug as string,
    title: row.title as string,
    description: row.description as string,
    keywords: JSON.parse((row.keywords as string) || '[]'),
    price: row.price as number,
    main_category: row.main_category as string,
    secondary_categories: JSON.parse((row.secondary_categories as string) || '[]'),
    logo_file_id: row.logo_file_id as string,
    logo_url: row.logo_url as string,
    mockups: JSON.parse((row.mockups as string) || '[]'),
    logoground_url: row.logoground_url as string,
    account: row.account as string,
    published: row.published as string | null,
    created_at: row.created_at as string,
  };
}

// ── GET /api/logos-data ───────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const token = req.headers.get('x-admin-token') ?? '';
  if (!token || token !== ADMIN_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getDb();
    const result = await db.execute('SELECT * FROM logos ORDER BY created_at DESC');
    const logos = result.rows.map(r => parseRow(r as Record<string, unknown>));
    return NextResponse.json({ logos });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// ── POST /api/logos-data ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const token = req.headers.get('x-admin-token') ?? '';
  if (!token || token !== ADMIN_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const db = getDb();

    // Generate unique slug
    let slug = slugify(body.title || 'logo');
    const existing = await db.execute({ sql: 'SELECT id FROM logos WHERE slug = ?', args: [slug] });
    if (existing.rows.length > 0) slug = `${slug}-${Date.now()}`;

    const result = await db.execute({
      sql: `INSERT INTO logos
              (slug, title, description, keywords, price, main_category,
               secondary_categories, logo_file_id, logo_url, mockups,
               logoground_url, account, published)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *`,
      args: [
        slug,
        body.title ?? '',
        body.description ?? '',
        JSON.stringify(body.keywords ?? []),
        body.price ?? 0,
        body.main_category ?? '',
        JSON.stringify(body.secondary_categories ?? []),
        body.logo_file_id ?? '',
        body.logo_url ?? '',
        JSON.stringify(body.mockups ?? []),
        body.logoground_url ?? '',
        body.account ?? '',
        body.published ?? null,
      ],
    });

    const logo = parseRow(result.rows[0] as Record<string, unknown>);
    return NextResponse.json({ logo }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
