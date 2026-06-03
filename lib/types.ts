export interface Logo {
  id: number;
  title: string;
  slug: string;
  description: string;
  keywords: string[];
  price: number;
  main_category: string;
  secondary_categories: string[];
  logo_url: string;
  mockups: string[];
  logoground_url: string;
  account: string;
  created_at: string;
}

export interface LogosDB {
  logos: Logo[];
  last_id: number;
}
