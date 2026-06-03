import { google } from 'googleapis';
import { NextResponse } from 'next/server';

export const revalidate = 300;

function getAuth() {
  const sa = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!sa) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');
  const credentials = JSON.parse(sa);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
}

export async function GET() {
  try {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!folderId) {
      return NextResponse.json({ error: 'GOOGLE_DRIVE_FOLDER_ID not set' }, { status: 500 });
    }
    const auth = getAuth();
    const drive = google.drive({ version: 'v3', auth });

    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: 'files(id, name, description, mimeType, createdTime)',
      orderBy: 'createdTime desc',
      pageSize: 100,
    });

    const files = res.data.files || [];
    const logos = files.map((f) => {
      const rawName = f.name?.replace(/\.[^.]+$/, '') || '';
      const parts = rawName.split(' - ');
      const category = parts.length > 1 ? parts[0].trim() : 'Brand';
      const title = parts.length > 1 ? parts.slice(1).join(' - ').trim() : rawName;
      return {
        id: f.id,
        title,
        category,
        description: f.description || '',
        imageUrl: `/api/logos/${f.id}/image`,
        createdTime: f.createdTime,
      };
    });

    return NextResponse.json({ logos });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[logos/route]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
