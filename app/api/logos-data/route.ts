/**
 * app/api/logos-data/route.ts
 * Fetch semua logo dari Google Sheets + mockups dari Google Drive
 */

import { NextResponse } from 'next/server';
import { fetchLogosFromSheet, extractLogogroundId } from '@/lib/sheets';
import { fetchMockupsForLogo, fetchLogoImageUrl, toDriveDirectUrl } from '@/lib/google-drive';
import type { Logo } from '@/lib/types';

export const runtime = 'nodejs'; // Drive API butuh nodejs runtime (bukan edge)
export const revalidate = 300;   // ISR: revalidate tiap 5 menit

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === '1';

    // 1. Fetch semua logo dari Google Sheet
    const rawLogos = await fetchLogosFromSheet(force) as (Logo & { mockup_folder_ref: string })[];

    // 2. Untuk tiap logo, fetch mockups dari Drive secara paralel
    //    (batched 5 concurrent agar tidak overwhelm Drive API)
    const BATCH = 5;
    const logos: Logo[] = [];

    for (let i = 0; i < rawLogos.length; i += BATCH) {
      const batch = rawLogos.slice(i, i + BATCH);

      const resolved = await Promise.all(
        batch.map(async (logo) => {
          const lgId = extractLogogroundId(logo.logoground_url);

          // Fetch mockups dari Drive folder bernama lgId
          const mockups = await fetchMockupsForLogo(logo.mockup_folder_ref || lgId);

          // Fetch logo image dari Drive folder bernama lgId
          // Fallback: kalau tidak ada di Drive, logo_url tetap logoground URL
          let driveLogoUrl = '';
          if (lgId) {
            driveLogoUrl = await fetchLogoImageUrl(lgId);
          }

          const { mockup_folder_ref, ...rest } = logo as Logo & { mockup_folder_ref: string };

          return {
            ...rest,
            mockups,
            // logo_url: pakai Drive URL jika ada, fallback ke logoground URL
            logo_url: driveLogoUrl || logo.logo_url,
            drive_logo_url: driveLogoUrl,
          } as Logo;
        })
      );

      logos.push(...resolved);
    }

    return NextResponse.json(
      { logos, source: 'sheets+drive', count: logos.length },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
        },
      }
    );
  } catch (err) {
    console.error('[logos-data]', err);
    return NextResponse.json(
      { logos: [], error: String(err) },
      { status: 500 }
    );
  }
}
