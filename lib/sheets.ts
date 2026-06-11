/**
 * lib/sheets.ts
 * Fetch logo metadata dari Google Sheets (public, no auth needed)
 * Sheet harus di-set: Share → Anyone with link → Viewer
 */

import type { Logo, MockupItem } from './types';

const SHEET_ID = '1PzZUFsoWL2wAvJGjBIzBpO_2lwRHbBSicys01rEDU_I';
const SHEET_GID = '0';

// Google Sheets CSV export URL (public sheet, no API key needed)
const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;

// Cache sederhana di memory (revalidate tiap 5 menit)
let cache: { logos: Logo[]; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 menit

export interface SheetRow {
  num: string;
  title: string;
  description: string;
  keywords: string;
  price: string;
  main_category: string;
  second_categories: string;
  logo_file_id: string;
  mockups: string;          // logoground ID → dipakai sebagai nama folder di Drive
  logo_url: string;         // logoground URL
  creator: string;
  published: string;
}

/**
 * Parse CSV sederhana — handle quoted fields dengan koma di dalamnya
 */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols: string[] = [];
    let cur = '';
    let inQuote = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (ch === ',' && !inQuote) {
        cols.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cols.push(cur.trim());
    rows.push(cols);
  }

  return rows;
}

/**
 * Extract logoground ID dari URL
 * "https://www.logoground.com/logo.php?id=761026" → "761026"
 */
export function extractLogogroundId(url: string): string {
  if (!url) return '';
  const match = url.match(/[?&]id=(\d+)/);
  return match ? match[1] : '';
}

/**
 * Buat slug dari title
 */
function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Parse array dari string — support koma dan newline sebagai separator
 */
function parseArray(val: string): string[] {
  if (!val) return [];
  return val
    .split(/[,\n]/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Fetch dan parse semua logo dari Google Sheet
 */
export async function fetchLogosFromSheet(force = false): Promise<Logo[]> {
  // Return cache jika masih fresh
  if (!force && cache && Date.now() - cache.ts < CACHE_TTL) {
    return cache.logos;
  }

  const res = await fetch(SHEET_CSV_URL, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);

  const text = await res.text();
  const rows = parseCSV(text);

  if (rows.length < 2) return [];

  // Skip header row (row[0])
  const dataRows = rows.slice(1);

  const logos: Logo[] = dataRows
    .filter(row => row[0] && row[1]) // harus ada # dan TITLE
    .map((row, index) => {
      const [
        num,
        title,
        description,
        keywords,
        price,
        main_category,
        second_categories,
        logo_file_id,
        mockups_col,
        logo_url,
        creator,
        published,
      ] = row;

      const lgId = extractLogogroundId(logo_url);
      const slug = toSlug(title) || `logo-${num || index + 1}`;
      const keywordArr = parseArray(keywords);
      const secondCatArr = parseArray(second_categories);

      // mockups_col bisa berisi folder ID drive langsung, atau logoground ID
      // Kita simpan sebagai string — akan di-resolve saat fetch mockup files
      const mockupFolderRef = mockups_col?.trim() || lgId;

      return {
        id: parseInt(num) || index + 1,
        slug,
        title: title || '',
        description: description || '',
        keywords: keywordArr,
        price: parseFloat(price) || 0,
        main_category: main_category?.trim() || 'General',
        secondary_categories: secondCatArr,
        logo_file_id: logo_file_id?.trim() || '',
        logo_url: logo_url?.trim() || '',           // logoground URL
        mockups: [],                                  // di-populate oleh drive helper
        mockup_folder_ref: mockupFolderRef,          // folder ID atau lgId untuk lookup
        logoground_url: logo_url?.trim() || '',
        account: creator?.trim() || '',
        published: published?.trim() || null,
        created_at: published?.trim() || '',
      } as Logo & { mockup_folder_ref: string };
    });

  cache = { logos, ts: Date.now() };
  return logos;
}

/**
 * Fetch single logo by slug
 */
export async function fetchLogoBySlug(slug: string): Promise<(Logo & { mockup_folder_ref: string }) | null> {
  const logos = await fetchLogosFromSheet() as (Logo & { mockup_folder_ref: string })[];
  return logos.find(l => l.slug === slug) ?? null;
}
