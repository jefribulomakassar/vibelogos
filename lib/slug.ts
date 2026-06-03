// Generate readable slug: "Nexacloud Pro" + id=42 => "nexacloud-pro-a4k2"
export function generateSlug(title: string, id: number): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);

  // Short alphanumeric suffix from id + random chars for uniqueness
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let n = id;
  let suffix = '';
  while (suffix.length < 4) {
    suffix += chars[n % chars.length];
    n = Math.floor(n / chars.length) + (suffix.length * 7);
  }

  return `${base}-${suffix}`;
}
