// lib/types.ts

export interface MockupItem {
  fileId: string;
  label: string;
  url: string; // /api/file/{fileId}
  scene?: string;
}

export interface Logo {
  id: number;
  slug: string;
  title: string;
  description: string;
  keywords: string[];
  price: number;
  main_category: string;
  secondary_categories: string[];
  logo_file_id: string;       // Google Drive fileId
  logo_url: string;           // /api/file/{fileId}
  mockups: MockupItem[];
  logoground_url: string;
  account: string;
  published: string | null;   // ISO date string e.g. "2024-06-10" atau null (draft)
  created_at: string;
}
