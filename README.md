# VibeLogo — Logo Showcase Platform

Platform showcase logo premium untuk klien, dengan backend Google Drive (service account).

## 🚀 Deploy ke Vercel

### 1. Push ke GitHub
```bash
git init
git add .
git commit -m "Initial VibeLogo showcase"
git remote add origin https://github.com/USERNAME/vibelogos.git
git push -u origin main
```

### 2. Import di Vercel
- Buka https://vercel.com/new → Import Git Repository
- Pilih repo `vibelogos`

### 3. Set Environment Variables di Vercel
Di **Settings → Environment Variables**, tambahkan:

| Key | Value |
|-----|-------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Paste isi file JSON service account (satu baris) |
| `GOOGLE_DRIVE_FOLDER_ID` | ID folder Google Drive (dari URL) |

**Cara dapat GOOGLE_DRIVE_FOLDER_ID:**
URL folder: `https://drive.google.com/drive/folders/1aBcDeFgH...`
Ambil bagian setelah `/folders/` → itulah folder ID-nya.

**Cara share folder ke service account:**
1. Buka Google Drive folder
2. Klik Share
3. Tambahkan email service account (`...@project.iam.gserviceaccount.com`)
4. Set permission: **Viewer**

### 4. Naming convention logo (opsional)
Untuk auto-kategorisasi, namai file seperti ini:
```
Fashion - Bella Couture.png
Tech - NexaCloud.png
Food - Bumblebee Cafe.png
```
Format: `Kategori - Nama Logo.png`

Jika tidak pakai format ini, kategori default = "Brand".

## 🛠 Development lokal
```bash
cp .env.example .env.local
# Edit .env.local dengan credentials asli
npm install
npm run dev
```
