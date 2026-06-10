/**
 * Konversi berbagai format Google Drive URL ke direct-view URL.
 * Mendukung:
 *  - https://drive.google.com/file/d/FILE_ID/view
 *  - https://drive.google.com/uc?id=FILE_ID
 *  - https://drive.google.com/open?id=FILE_ID
 *  - URL yang sudah berupa thumbnail/uc export (dikembalikan apa adanya)
 */
export function toDriveDirectUrl(url: string): string {
  if (!url) return url;

  // Sudah direct export
  if (url.includes('drive.google.com/uc?export=view')) return url;

  // Format /file/d/FILE_ID/
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) {
    return `https://drive.google.com/uc?export=view&id=${fileMatch[1]}`;
  }

  // Format ?id=FILE_ID atau open?id=
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) {
    return `https://drive.google.com/uc?export=view&id=${idMatch[1]}`;
  }

  return url;
}
