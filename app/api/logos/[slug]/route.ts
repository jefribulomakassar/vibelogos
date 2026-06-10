import { NextResponse } from 'next/server';
import { turso } from '@/lib/turso';

export const runtime = 'edge';

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const result = await turso.execute({
      sql: `SELECT id, slug, title, description, keywords, price,
                   main_category, secondary_categories,
                   logo_url, mockups, logoground_url, account
            FROM logos
            WHERE slug = ?
            LIMIT 1`,
      args: [params.slug],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const row = result.rows[0];
    const logo = {
      id:                   row.id,
      slug:                 row.slug,
      title:                row.title,
      description:          row.description ?? '',
      keywords:             parseJson(row.keywords as string, []),
      price:                row.price,
      main_category:        row.main_category,
      secondary_categories: parseJson(row.secondary_categories as string, []),
      logo_url:             row.logo_url,
      mockups:              parseJson(row.mockups as string, []),
      logoground_url:       row.logoground_url ?? '',
      account:              row.account ?? '',
    };

    return NextResponse.json({ logo });
  } catch (err) {
    console.error('[logo-detail]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

function parseJson<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val) as T; } catch { return fallback; }
}
