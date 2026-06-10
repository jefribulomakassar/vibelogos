'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { Logo } from '@/lib/types';
import { toDriveDirectUrl } from '@/lib/drive';

function LogoCard({ logo }: { logo: Logo }) {
  const router = useRouter();
  const [imgError, setImgError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imgSrc = toDriveDirectUrl(logo.logo_url);

  return (
    <div className="logo-card" onClick={() => router.push(`/logos/${logo.slug}`)}>
      <div style={{ aspectRatio: '1', background: 'var(--bg3)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {!loaded && !imgError && <div className="skeleton" style={{ position: 'absolute', inset: 0 }} />}
        {imgError ? (
          <div style={{ opacity: 0.25, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
            <span style={{ fontSize: 10 }}>No preview</span>
          </div>
        ) : (
          <Image
            src={imgSrc}
            alt={logo.title}
            fill
            unoptimized
            sizes="(max-width: 640px) 50vw, 280px"
            style={{ objectFit: 'contain', padding: 24, opacity: loaded ? 1 : 0, transition: 'opacity 0.3s' }}
            onLoad={() => setLoaded(true)}
            onError={() => setImgError(true)}
          />
        )}
        <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(10,10,10,0.8)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontWeight: 700, fontFamily: 'Syne, sans-serif', backdropFilter: 'blur(8px)' }}>
          ${logo.price}
        </div>
      </div>
      <div style={{ padding: '14px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
          <span className="tag">{logo.main_category}</span>
          {logo.secondary_categories.slice(0, 1).map(c => (
            <span key={c} className="tag" style={{ opacity: 0.6 }}>{c}</span>
          ))}
        </div>
        <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14, color: 'var(--text)', lineHeight: 1.3 }}>{logo.title}</p>
        {logo.description && (
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {logo.description}
          </p>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [logos, setLogos] = useState<Logo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/logos-data')
      .then(r => r.json())
      .then(d => setLogos(d.logos || []))
      .finally(() => setLoading(false));
  }, []);

  const categories = ['All', ...Array.from(new Set(logos.map(l => l.main_category))).sort()];

  const filtered = logos.filter(l => {
    const matchCat = activeCategory === 'All' || l.main_category === activeCategory;
    const q = search.toLowerCase();
    const matchSearch = !q || l.title.toLowerCase().includes(q) || l.main_category.toLowerCase().includes(q) || l.keywords.some(k => k.toLowerCase().includes(q));
    return matchCat && matchSearch;
  });

  const marqueeItems = ['Brand Identity', 'Tech & SaaS', 'Food & Beverage', 'Fashion', 'Real Estate', 'Health & Wellness', 'Education', 'Sports', 'Creative Agency', 'Finance'];

  return (
    <>
      {/* Ticker */}
      <div style={{ background: 'var(--accent)', color: '#0a0a0a', padding: '8px 0', overflow: 'hidden' }}>
        <div className="animate-marquee" style={{ display: 'flex', gap: 0, whiteSpace: 'nowrap', width: 'max-content' }}>
          {[...marqueeItems, ...marqueeItems].map((item, i) => (
            <span key={i} style={{ fontFamily: 'Syne, sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0 24px' }}>
              {item} <span style={{ opacity: 0.4 }}>✦</span>
            </span>
          ))}
        </div>
      </div>

      {/* Nav */}
      <nav style={{ borderBottom: '1px solid var(--border)', padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, position: 'sticky', top: 0, background: 'rgba(10,10,10,0.9)', backdropFilter: 'blur(20px)', zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'var(--accent)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#0a0a0a"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          </div>
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em' }}>
            vibe<span style={{ color: 'var(--accent)' }}>logos</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animation: 'pulse-dot 2s infinite' }} />
            {logos.length} logos
          </span>
          <a href="/admin" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none', padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 7 }}>Admin</a>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: '80px 32px 60px', textAlign: 'center', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 999, border: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)', marginBottom: 24, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          ✦ Premium Logo Showcase
        </div>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 'clamp(36px, 6vw, 72px)', lineHeight: 1.05, letterSpacing: '-0.03em', marginBottom: 20 }}>
          Premium Logo<br/>
          <span style={{ color: 'var(--accent)' }}>Designs</span> for Every Vibe
        </h1>
        <p style={{ fontSize: 17, color: 'var(--muted)', lineHeight: 1.7, maxWidth: 520, margin: '0 auto 40px', fontWeight: 300 }}>
          Browse our curated collection of ready-made logos. Find the perfect identity — instant ownership, one-time payment.
        </p>
        <div style={{ maxWidth: 480, margin: '0 auto', position: 'relative' }}>
          <svg style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            type="text"
            placeholder="Search by name, category, or keyword..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '14px 16px 14px 44px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)', fontSize: 15, outline: 'none', fontFamily: 'DM Sans, sans-serif' }}
            onFocus={e => (e.target.style.borderColor = 'rgba(200,245,66,0.5)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          />
        </div>
      </section>

      {/* Category Filter */}
      {!loading && categories.length > 1 && (
        <div style={{ padding: '0 32px 32px', display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)} style={{ padding: '8px 18px', borderRadius: 999, fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s', border: '1px solid', fontFamily: 'DM Sans, sans-serif', background: activeCategory === cat ? 'var(--accent)' : 'var(--bg2)', borderColor: activeCategory === cat ? 'var(--accent)' : 'var(--border)', color: activeCategory === cat ? '#0a0a0a' : 'var(--muted)' }}>
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '0 24px 80px' }}>
        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <div className="skeleton" style={{ aspectRatio: '1' }} />
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="skeleton" style={{ height: 16, width: '40%' }} />
                  <div className="skeleton" style={{ height: 14, width: '70%' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>{logos.length === 0 ? '📭' : '🔍'}</div>
            <p style={{ color: 'var(--muted)', fontFamily: 'Syne, sans-serif', fontSize: 16 }}>
              {logos.length === 0 ? 'Belum ada logo. Tambah via Admin.' : 'Tidak ada logo yang cocok.'}
            </p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {filtered.map((logo, i) => (
              <div key={logo.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i * 40, 400)}ms`, opacity: 0 }}>
                <LogoCard logo={logo} />
              </div>
            ))}
          </div>
        )}
      </main>

      <footer style={{ borderTop: '1px solid var(--border)', padding: '32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 16 }}>vibe<span style={{ color: 'var(--accent)' }}>logos</span></span>
        <p style={{ fontSize: 12, color: '#444' }}>© {new Date().getFullYear()} VibeLogo. All logos are exclusive and ready-made.</p>
      </footer>
    </>
  );
}
