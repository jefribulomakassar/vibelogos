import { NextRequest, NextResponse } from 'next/server';
import { readDB, writeDB } from '@/lib/db';
import { generateSlug } from '@/lib/slug';
import type { Logo } from '@/lib/types';

function checkAdmin(req: NextRequest) {
  const token = req.headers.get('x-admin-token');
  return token === process.env.ADMIN_TOKEN;
}

// GET /api/logos-data — public
export async function GET() {
  const db = await readDB();
  return NextResponse.json({ logos: db.logos });
}

// POST /api/logos-data — admin only
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();

  const db = await readDB();
  const newId = db.last_id + 1;

  const logo: Logo = {
    id: newId,
    title: body.title?.trim() || 'Untitled',
    slug: generateSlug(body.title || 'logo', newId),
    description: body.description?.trim() || '',
    keywords: Array.isArray(body.keywords) ? body.keywords : [],
    price: Number(body.price) || 0,
    main_category: body.main_category?.trim() || 'Brand',
    secondary_categories: Array.isArray(body.secondary_categories) ? body.secondary_categories : [],
    logo_url: body.logo_url || '',
    mockups: Array.isArray(body.mockups) ? body.mockups : [],
    logoground_url: body.logoground_url || '',
    account: body.account?.trim() || '',
    created_at: new Date().toISOString(),
  };

  db.logos.unshift(logo); // newest first
  db.last_id = newId;

  await writeDB(db);
  return NextResponse.json({ logo }, { status: 201 });
}
