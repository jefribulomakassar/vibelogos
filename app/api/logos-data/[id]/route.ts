import { NextRequest, NextResponse } from 'next/server';
import { readDB, writeDB } from '@/lib/db';

function checkAdmin(req: NextRequest) {
  const token = req.headers.get('x-admin-token');
  return token === process.env.ADMIN_TOKEN;
}

// PUT /api/logos-data/[id] — update logo
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const db = await readDB();

  const idx = db.logos.findIndex(l => l.id === Number(id));
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  db.logos[idx] = {
    ...db.logos[idx],
    title: body.title ?? db.logos[idx].title,
    description: body.description ?? db.logos[idx].description,
    keywords: body.keywords ?? db.logos[idx].keywords,
    price: body.price !== undefined ? Number(body.price) : db.logos[idx].price,
    main_category: body.main_category ?? db.logos[idx].main_category,
    secondary_categories: body.secondary_categories ?? db.logos[idx].secondary_categories,
    logo_url: body.logo_url ?? db.logos[idx].logo_url,
    mockups: body.mockups ?? db.logos[idx].mockups,
    logoground_url: body.logoground_url ?? db.logos[idx].logoground_url,
    account: body.account ?? db.logos[idx].account,
  };

  await writeDB(db);
  return NextResponse.json({ logo: db.logos[idx] });
}

// DELETE /api/logos-data/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const db = await readDB();

  const before = db.logos.length;
  db.logos = db.logos.filter(l => l.id !== Number(id));
  if (db.logos.length === before) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await writeDB(db);
  return NextResponse.json({ ok: true });
}
