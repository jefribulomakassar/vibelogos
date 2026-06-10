// app/api/logos-data/[id]/route.ts
// PUT update logo, DELETE hapus logo (+ file di Drive)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@libsql/client';
import { deleteFromDrive } from '@/lib/google-drive';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';

function getDb() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
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

// ── PUT /api/logos-data/[id] ──────────────────────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = req.headers.get('x-admin-token') ?? '';
  if (!token || token !== ADMIN_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = Number(params.id);
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const body = await req.json();
    const db = getDb();

    const result = await db.execute({
      sql: `UPDATE logos SET
              title = ?, description = ?, keywords = ?, price = ?,
              main_category = ?, secondary_categories = ?,
              logo_file_id = ?, logo_url = ?, mockups = ?,
              logoground_url = ?, account = ?, published = ?
            WHERE id = ?
            RETURNING *`,
      args: [
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
        id,
      ],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Logo tidak ditemukan' }, { status: 404 });
    }

    const logo = parseRow(result.rows[0] as Record<string, unknown>);
    return NextResponse.json({ logo });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// ── DELETE /api/logos-data/[id] ───────────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = req.headers.get('x-admin-token') ?? '';
  if (!token || token !== ADMIN_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = Number(params.id);
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const db = getDb();

    // Ambil data dulu untuk dapat fileId
    const existing = await db.execute({ sql: 'SELECT * FROM logos WHERE id = ?', args: [id] });
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'Logo tidak ditemukan' }, { status: 404 });
    }

    const logo = parseRow(existing.rows[0] as Record<string, unknown>);

    // Hapus dari DB dulu
    await db.execute({ sql: 'DELETE FROM logos WHERE id = ?', args: [id] });

    // Hapus file Drive (best-effort, tidak block response)
    const cleanupPromises: Promise<void>[] = [];

    if (logo.logo_file_id) {
      cleanupPromises.push(deleteFromDrive(logo.logo_file_id).catch(console.error));
    }

    // Hapus semua mockup files
    const mockups = logo.mockups as Array<{ fileId?: string }>;
    for (const m of mockups) {
      if (m.fileId) {
        cleanupPromises.push(deleteFromDrive(m.fileId).catch(console.error));
      }
    }

    // Fire and forget
    Promise.all(cleanupPromises).catch(console.error);

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
