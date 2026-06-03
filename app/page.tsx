'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';

interface Logo {
  id: string;
  title: string;
  category: string;
  description: string;
  imageUrl: string;
  createdTime: string;
}

const CATEGORIES = ['All'];

function LogoCard({ logo, onClick }: { logo: Logo; onClick: () => void }) {
  const [imgError, setImgError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="logo-card" onClick={onClick}>
      <div style={{ aspectRatio: '1', background: 'var(--bg3)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {!loaded && !imgError && (
          <div className="skeleton" style={{ position: 'absolute', inset: 0 }} />
        )}
        {imgError ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, opacity: 0.3 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>
            </svg>
            <span style={{ fontSize: 11 }}>No preview</span>
          </div>
        ) : (
          <Image
            src={logo.imageUrl}
            alt={logo.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            style={{ objectFit: 'contain', padding: 24, opacity: loaded ? 1 : 0, transition: 'opacity 0.3s' }}
            onLoad={() => setLoaded(true)}
            onError={() => setImgError(true)}
          />
        )}
      </div>
      <div style={{ padding: '14px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <span className="tag">{logo.category}</span>
        </div>
        <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14, color: 'var(--text)', lineHeight: 1.3 }}>
          {logo.title}
        </p>
        {logo.description && (
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>
            {logo.description}
          </p>
        )}
      </div>
    </div>
  );
}

function Modal({ logo, onClose }: { logo: Logo; onClose: () => void }) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        animation: 'fadeUp 0.2s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16,
          maxWidth: 600, width: '100%', overflow: 'hidden',
        }}
      >
        <div style={{ position: 'relative', aspectRatio: '1', background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {!imgError ? (
            <Image
              src={logo.imageUrl}
              alt={logo.title}
              fill
              sizes="600px"
              style={{ objectFit: 'contain', padding: 40 }}
              onError={() => setImgError(true)}
            />
          ) : (
            <span style={{ opacity: 0.3, fontSize: 13 }}>Preview unavailable</span>
          )}
          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: 12, right: 12,
              background: 'rgba(0,0,0,0.6)', border: '1px solid var(--border)',
              color: 'white', borderRadius: 8, width: 32, height: 32,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>
        <div style={{ padding: '20px 24px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <span className="tag" style={{ marginBottom: 8, display: 'inline-flex' }}>{logo.category}</span>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 22, color: 'var(--text)', marginTop: 8 }}>
                {logo.title}
              </h2>
              {logo.description && (
                <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6, lineHeight: 1.6 }}>{logo.description}</p>
              )}
            </div>
          </div>
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
            <a
              href="https://wa.me/6285XXXXXXXXX?text=Hi%2C+I%27m+interested+in+logo%3A+{logo.title}"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
              style={{ flex: 1, justifyContent: 'center', textDecoration: 'none' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.534 5.857L.057 23.882l6.214-1.431A11.946 11.946 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.795 9.795 0 01-5.032-1.387l-.361-.214-3.741.861.896-3.617-.236-.374A9.791 9.791 0 012.182 12C2.182 6.579 6.579 2.182 12 2.182S21.818 6.579 21.818 12 17.421 21.818 12 21.818z"/>
              </svg>
              Order via WhatsApp
            </a>
            <a
              href="mailto:hello@vibelogos.com?subject=Interest in logo: {logo.title}"
              className="btn-primary"
              style={{ flex: 1, justifyContent: 'center', textDecoration: 'none', background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', boxShadow: 'none' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7"/>
              </svg>
              Email Us
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [logos, setLogos] = useState<Logo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Logo | null>(null);

  useEffect(() => {
    fetch('/api/logos')
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error);
        else setLogos(data.logos || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const categories = ['All', ...Array.from(new Set(logos.map(l => l.category))).sort()];

  const filtered = logos.filter(l => {
    const matchCat = activeCategory === 'All' || l.category === activeCategory;
    const q = search.toLowerCase();
    const matchSearch = !q || l.title.toLowerCase().includes(q) || l.category.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const handleClose = useCallback(() => setSelected(null), []);

  const marqueeItems = ['Brand Identity', 'Tech & SaaS', 'Food & Beverage', 'Fashion', 'Real Estate', 'Health & Wellness', 'Education', 'Sports', 'Creative Agency', 'Finance'];

  return (
    <>
      {/* Marquee ticker */}
      <div style={{ background: 'var(--accent)', color: '#0a0a0a', padding: '8px 0', overflow: 'hidden', position: 'relative' }}>
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#0a0a0a">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em' }}>
            vibe<span style={{ color: 'var(--accent)' }}>logos</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animation: 'pulse-dot 2s infinite' }} />
            {logos.length} logos available
          </span>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: '80px 32px 60px', textAlign: 'center', position: 'relative', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 999, border: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)', marginBottom: 24, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          ✦ Logo Showcase Gallery
        </div>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 'clamp(36px, 6vw, 72px)', lineHeight: 1.05, letterSpacing: '-0.03em', marginBottom: 20 }}>
          Premium Logo<br/>
          <span style={{ color: 'var(--accent)' }}>Designs</span> for Every Vibe
        </h1>
        <p style={{ fontSize: 17, color: 'var(--muted)', lineHeight: 1.7, maxWidth: 520, margin: '0 auto 40px', fontWeight: 300 }}>
          Browse our curated collection of ready-made logos. Find the perfect identity for your brand — instant ownership, no revisions needed.
        </p>

        {/* Search */}
        <div style={{ maxWidth: 480, margin: '0 auto', position: 'relative' }}>
          <svg style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Search by name or category..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '14px 16px 14px 44px',
              background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: 12, color: 'var(--text)', fontSize: 15,
              outline: 'none', fontFamily: 'DM Sans, sans-serif',
              transition: 'border-color 0.2s',
            }}
            onFocus={e => (e.target.style.borderColor = 'rgba(200,245,66,0.5)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          />
        </div>
      </section>

      {/* Category Filter */}
      {!loading && categories.length > 1 && (
        <div style={{ padding: '0 32px 32px', display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: '8px 18px', borderRadius: 999, fontSize: 13, fontWeight: 500,
                cursor: 'pointer', transition: 'all 0.2s', border: '1px solid',
                fontFamily: 'DM Sans, sans-serif',
                background: activeCategory === cat ? 'var(--accent)' : 'var(--bg2)',
                borderColor: activeCategory === cat ? 'var(--accent)' : 'var(--border)',
                color: activeCategory === cat ? '#0a0a0a' : 'var(--muted)',
              }}
            >
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

        {error && (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
            <p style={{ color: 'var(--muted)', fontFamily: 'Syne, sans-serif', fontSize: 16 }}>Could not load logos</p>
            <p style={{ color: '#555', fontSize: 13, marginTop: 8, fontFamily: 'monospace' }}>{error}</p>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
            <p style={{ color: 'var(--muted)', fontFamily: 'Syne, sans-serif', fontSize: 16 }}>No logos found</p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {filtered.map((logo, i) => (
              <div key={logo.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i * 40, 400)}ms`, opacity: 0 }}>
                <LogoCard logo={logo} onClick={() => setSelected(logo)} />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 16 }}>vibe<span style={{ color: 'var(--accent)' }}>logos</span></span>
          <span style={{ color: 'var(--border)' }}>—</span>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Premium logo showcase</span>
        </div>
        <p style={{ fontSize: 12, color: '#444' }}>© {new Date().getFullYear()} VibeLogo. All logos are exclusive and ready-made.</p>
      </footer>

      {selected && <Modal logo={selected} onClose={handleClose} />}
    </>
  );
}
