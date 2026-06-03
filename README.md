# VibeLogo — Logo Showcase Platform

Platform showcase logo premium dengan admin panel, Cloudinary upload, dan Vercel Blob storage.

## 🗂 Struktur

```
app/
  page.tsx                    → Front page (public)
  admin/page.tsx              → Admin panel (token-protected)
  api/
    logos-data/route.ts       → GET list / POST new logo
    logos-data/[id]/route.ts  → PUT edit / DELETE logo
    upload-cloudinary/route.ts → Signed upload to Cloudinary
lib/
  types.ts  → Logo interface
  db.ts     → Vercel Blob JSON read/write
  slug.ts   → Auto slug generator
```

## 🚀 Deploy ke Vercel

### 1. Push ke GitHub
```bash
git init && git add . && git commit -m "init vibelogos"
git remote add origin https://github.com/USERNAME/vibelogos.git
git push -u origin main
```

### 2. Import di vercel.com/new → pilih repo

### 3. Environment Variables di Vercel Settings

| Key | Value |
|-----|-------|
| `ADMIN_TOKEN` | Password admin sesukamu, e.g. `vl_rahasia123` |
| `BLOB_READ_WRITE_TOKEN` | Token dari Vercel Blob (lihat bawah) |
| `CLOUDINARY_CLOUD_NAME` | Cloud name dari Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | API Key dari Cloudinary |
| `CLOUDINARY_API_SECRET` | API Secret dari Cloudinary |

### 4. Setup Vercel Blob
- Di Vercel project → Storage → Create → Blob
- Copy token `BLOB_READ_WRITE_TOKEN` ke env vars

### 5. Setup Cloudinary
- Daftar/login di cloudinary.com
- Dashboard → API Keys → copy Cloud Name, API Key, API Secret

---

## 🎛 Cara pakai Admin Panel

1. Buka `https://vibelogos.vercel.app/admin`
2. Masukkan ADMIN_TOKEN
3. Klik **Add Logo** → isi form:
   - **Title** + **Price** (wajib)
   - **Description**, **Keywords** (pisah koma)
   - **Main Category** + **Secondary Categories**
   - **Logo Image** → drag & drop atau paste URL Cloudinary
   - **Mockup Images** → bisa multiple
   - **LogoGround URL** → link beli di logoground.com
   - **Account** → nama akun seller

ID dan Slug di-generate otomatis.

## 📁 Naming konvensi file di Cloudinary
Bebas — nama file tidak affect tampilan karena title diisi manual di form.

## 💡 Tips
- Logo yang punya `logoground_url` → tombol modal jadi **"Buy on LogoGround"**
- Yang tidak ada URL → tombol jadi **"Tanya via WhatsApp"**
- Ganti nomor WA di `app/page.tsx` (cari `wa.me`)
