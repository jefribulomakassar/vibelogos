'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import type { Logo } from '@/lib/types';
import { toDriveDirectUrl } from '@/lib/drive';

export default function LogoDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [logo, setLogo] = useState<Logo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeImg, setActiveImg] = useState('');
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    fetch(`/api/logos/${slug}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then(d => {
        if (d?.logo) {
          setLogo(d.logo);
          setActiveImg(toDriveDirectUrl(d.logo.logo_url));
        }
      })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    </div>
  );

  if (notFound || !logo) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <div style={{ fontSize: 48 }}>🔍</div>
      <p style={{ fontFamily: 'Syne, sans-serif', color: 'var(--muted)', fontSize: 16 }}>Logo tidak ditemukan.</p>
      <button onClick={() => router.push('/')} style={{ padding: '10px 22px', background: 'var(--accent)', color: '#0a0a0a', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontFamily: 'Syne, sans-serif' }}>
        ← Kembali
      </button>
    </div>
  );

  const allImages = [toDriveDirectUrl(logo.logo_url), ...logo.mockups.map(toDriveDirectUrl)].filter(Boolean);
  const waMsg = encodeURIComponent(`Halo, saya tertarik dengan logo: *${logo.title}* (ID: ${logo.id})\nhttps://vibelogos.vercel.app/logos/${logo.slug}`);

  return (
    <>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid var(--border)', padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, position: 'sticky', top: 0, background: 'rgba(10,10,10,0.9)', backdropFilter: 'blur(20px)', zIndex: 100 }}>
        <button onClick={() => router.push('/')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
          Semua Logo
        </button>
        <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em' }}>
          vibe<span style={{ color: 'var(--accent)' }}>logos</span>
        </span>
        <div style={{ width: 80 }} />
      </nav>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 80px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,420px)', gap: 48, alignItems: 'start' }}>

        {/* Kiri: gambar */}
        <div>
          {/* Main image */}
          <div style={{ position: 'relative', aspectRatio: '1', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
            {imgError ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.3 }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                <span style={{ fontSize: 12 }}>No preview</span>
              </div>
            ) : (
              <Image
                src={activeImg}
                alt={logo.title}
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, 640px"
                style={{ objectFit: 'contain', padding: 48 }}
                onError={() => setImgError(true)}
              />
            )}
          </div>

          {/* Thumbnail strip */}
          {allImages.length > 1 && (
            <div style={{ display: 'flex', gap: 10, marginTop: 12, overflowX: 'auto', paddingBottom: 4 }}>
              {allImages.map((img, i) => (
                <button
                  key={i}
                  onClick={() => { setActiveImg(img); setImgError(false); }}
                  style={{ width: 72, height: 72, borderRadius: 10, flexShrink: 0, position: 'relative', cursor: 'pointer', border: `2px solid ${activeImg === img ? 'var(--accent)' : 'var(--border)'}`, background: 'var(--bg2)', padding: 0, overflow: 'hidden' }}
                >
                  <Image src={img} alt="" fill unoptimized sizes="72px" style={{ objectFit: 'contain', padding: 6 }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Kanan: info */}
        <div style={{ position: 'sticky', top: 88 }}>
          {/* Category tags */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            <span className="tag">{logo.main_category}</span>
            {logo.secondary_categories.map(c => (
              <span key={c} className="tag" style={{ opacity: 0.6 }}>{c}</span>
            ))}
          </div>

          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 'clamp(24px, 3vw, 36px)', lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: 10 }}>
            {logo.title}
          </h1>

          {logo.description && (
            <p style={{ color: 'var(--muted)', fontSize: 15, lineHeight: 1.75, marginBottom: 16 }}>
              {logo.description}
            </p>
          )}

          {/* Keywords */}
          {logo.keywords.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
              {logo.keywords.map(k => (
                <span key={k} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 4, background: 'var(--bg3)', color: '#666', fontFamily: 'monospace' }}>
                  #{k}
                </span>
              ))}
            </div>
          )}

          {/* Harga */}
          <div style={{ padding: '20px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', marginBottom: 24, display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 40, color: 'var(--accent)' }}>
              ${logo.price}
            </span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>one-time payment</span>
          </div>

          {/* CTA */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {logo.logoground_url ? (
              <a href={logo.logoground_url} target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ justifyContent: 'center', textDecoration: 'none', padding: '14px 24px', fontSize: 15 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                Buy on LogoGround
              </a>
            ) : (
              <a href={`https://wa.me/?text=${waMsg}`} target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ justifyContent: 'center', textDecoration: 'none', padding: '14px 24px', fontSize: 15 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.534 5.857L.057 23.882l6.214-1.431A11.946 11.946 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.795 9.795 0 01-5.032-1.387l-.361-.214-3.741.861.896-3.617-.236-.374A9.791 9.791 0 012.182 12C2.182 6.579 6.579 2.182 12 2.182S21.818 6.579 21.818 12 17.421 21.818 12 21.818z"/></svg>
                Tanya via WhatsApp
              </a>
            )}
            <button onClick={() => router.push('/')} style={{ padding: '12px 24px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--muted)', fontSize: 14, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
              ← Lihat logo lainnya
            </button>
          </div>
        </div>
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          main { grid-template-columns: 1fr !important; gap: 32px !important; }
          div[style*="position: sticky"] { position: static !important; }
        }
      `}</style>
    </>
  );
}
