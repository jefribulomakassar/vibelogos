'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import type { Logo } from '@/lib/types';

// ─── Cloudinary Upload Helper ────────────────────────────────────────────────
async function uploadToCloudinary(
  file: File, folder: string, adminToken: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  const sigRes = await fetch('/api/upload-cloudinary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
    body: JSON.stringify({ folder }),
  });
  const { signature, timestamp, apiKey, cloudName } = await sigRes.json();
  const fd = new FormData();
  fd.append('file', file);
  fd.append('api_key', apiKey);
  fd.append('timestamp', String(timestamp));
  fd.append('signature', signature);
  fd.append('folder', folder);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress?.(Math.round(e.loaded / e.total * 100)); };
    xhr.onload = () => {
      const d = JSON.parse(xhr.responseText);
      if (d.secure_url) resolve(d.secure_url);
      else reject(new Error(d.error?.message || 'Upload failed'));
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(fd);
  });
}

// ─── Upload image from external URL → Cloudinary (via server proxy) ──────────
async function uploadUrlToCloudinary(
  imageUrl: string, folder: string, adminToken: string,
): Promise<string> {
  const res = await fetch('/api/upload-cloudinary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
    body: JSON.stringify({ folder, external_url: imageUrl }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Upload from URL failed (${res.status})`);
  }
  const data = await res.json();
  if (data.secure_url) return data.secure_url as string;
  throw new Error(data.error || 'Upload from URL failed');
}

// ─── LogoGround Importer ──────────────────────────────────────────────────────
interface LogoGroundData {
  title: string;
  description: string;
  keywords: string[];
  price: number;
  main_category: string;
  secondary_categories: string[];
  logo_url: string;
  logoground_url: string;
}

interface LogoGroundImporterProps {
  adminToken: string;
  onImport: (data: LogoGroundData & { cloudinary_logo_url?: string }) => void;
  defaultUrl?: string;
}

function LogoGroundImporter({ adminToken, onImport, defaultUrl = '' }: LogoGroundImporterProps) {
  const [url, setUrl] = useState(defaultUrl);
  const [loading, setLoading] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<LogoGroundData | null>(null);
  const [imported, setImported] = useState(false);

  const handleScrape = async () => {
    const trimmed = url.trim();
    if (!trimmed) { setError('Masukkan URL LogoGround terlebih dahulu'); return; }
    if (!trimmed.includes('logoground.com/logo.php')) {
      setError('URL harus dari logoground.com/logo.php?id=...');
      return;
    }
    setLoading(true);
    setError('');
    setPreview(null);
    setImported(false);
    try {
      const res = await fetch(
        `/api/scrape-logoground?url=${encodeURIComponent(trimmed)}`,
        { headers: { 'x-admin-token': adminToken } },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Scrape gagal');
      setPreview(json.data as LogoGroundData);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleImportDirect = () => {
    if (!preview) return;
    onImport(preview);
    setImported(true);
  };

  const handleImportWithUpload = async () => {
    if (!preview) return;
    setUploadingImg(true);
    try {
      const cloudUrl = await uploadUrlToCloudinary(preview.logo_url, 'vibelogos/logos', adminToken);
      onImport({ ...preview, cloudinary_logo_url: cloudUrl });
      setImported(true);
    } catch (e: unknown) {
      setError('Upload logo ke Cloudinary gagal: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setUploadingImg(false);
    }
  };

  const isLoading = loading || uploadingImg;

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(200,245,66,0.05) 0%, rgba(200,245,66,0.02) 100%)',
      border: '1px solid rgba(200,245,66,0.25)',
      borderRadius: 14,
      padding: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'rgba(200,245,66,0.15)',
          border: '1px solid rgba(200,245,66,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, flexShrink: 0,
        }}>⚡</div>
        <div>
          <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, color: 'var(--accent)' }}>
            Import dari LogoGround
          </div>
          <div style={{ fontSize: 11, color: '#666', marginTop: 1 }}>
            Auto-isi title, deskripsi, keywords, kategori, harga & gambar logo
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          placeholder="https://www.logoground.com/logo.php?id=580706"
          value={url}
          onChange={e => { setUrl(e.target.value); setError(''); setImported(false); }}
          onKeyDown={e => e.key === 'Enter' && !isLoading && handleScrape()}
          style={{
            ...inputStyle, flex: 1, fontSize: 13,
            borderColor: error ? 'rgba(255,68,68,0.5)' : 'rgba(200,245,66,0.2)',
          }}
          disabled={isLoading}
        />
        <button
          onClick={handleScrape}
          disabled={isLoading || !url.trim()}
          style={{
            padding: '10px 16px', borderRadius: 8,
            background: isLoading || !url.trim() ? 'var(--bg3)' : 'rgba(200,245,66,0.15)',
            color: isLoading || !url.trim() ? 'var(--muted)' : 'var(--accent)',
            cursor: isLoading || !url.trim() ? 'not-allowed' : 'pointer',
            fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
            border: '1px solid rgba(200,245,66,0.2)',
            transition: 'all 0.2s',
          }}
        >
          {loading ? (
            <>
              <span style={{ display: 'inline-block', width: 13, height: 13, border: '2px solid rgba(200,245,66,0.3)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              Mengambil…
            </>
          ) : '🔍 Ambil Data'}
        </button>
      </div>

      {error && (
        <div style={{ background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#ff6b6b', display: 'flex', gap: 6 }}>
          ⚠️ {error}
        </div>
      )}

      {imported && !error && (
        <div style={{ background: 'rgba(200,245,66,0.1)', border: '1px solid rgba(200,245,66,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--accent)', display: 'flex', gap: 6, alignItems: 'center' }}>
          ✓ Data berhasil diimport ke form!
        </div>
      )}

      {preview && (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            {preview.logo_url && (
              <div style={{ width: 72, height: 72, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview.logo_url}
                  alt={preview.title}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8 }}
                  crossOrigin="anonymous"
                />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                {preview.title}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {preview.price > 0 && (
                  <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>${preview.price}</span>
                )}
                {preview.main_category && (
                  <span className="tag">{preview.main_category}</span>
                )}
                {preview.secondary_categories.map(c => (
                  <span key={c} className="tag" style={{ opacity: 0.6 }}>{c}</span>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {preview.description && (
              <div>
                <div style={{ ...labelStyle, marginBottom: 4 }}>Description preview</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, maxHeight: 60, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {preview.description}
                </div>
              </div>
            )}
            {preview.keywords.length > 0 && (
              <div>
                <div style={{ ...labelStyle, marginBottom: 4 }}>Keywords ({preview.keywords.length})</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {preview.keywords.slice(0, 12).map(k => (
                    <span key={k} style={{ fontSize: 11, background: 'rgba(200,245,66,0.08)', border: '1px solid rgba(200,245,66,0.15)', borderRadius: 4, padding: '2px 6px', color: 'var(--muted)' }}>{k}</span>
                  ))}
                  {preview.keywords.length > 12 && (
                    <span style={{ fontSize: 11, color: '#555' }}>+{preview.keywords.length - 12} lagi</span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
            <button
              onClick={handleImportDirect}
              disabled={isLoading}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 8, fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 600,
                background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)',
                cursor: isLoading ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
              }}
              title="Logo pakai URL LogoGround langsung (bisa berubah sewaktu-waktu)"
            >
              📋 Import Data + Logo URL
            </button>
            <button
              onClick={handleImportWithUpload}
              disabled={isLoading}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 8, fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 700,
                background: 'rgba(200,245,66,0.1)', border: '1px solid rgba(200,245,66,0.3)', color: 'var(--accent)',
                cursor: isLoading ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
              title="Upload logo ke Cloudinary dulu, lebih permanen"
            >
              {uploadingImg ? (
                <>
                  <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(200,245,66,0.3)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  Uploading…
                </>
              ) : '☁️ Import + Upload ke Cloudinary'}
            </button>
          </div>

          <p style={{ fontSize: 11, color: '#555', margin: 0 }}>
            💡 <strong>"Import Data + Logo URL"</strong> = cepat, logo langsung dari LogoGround. <strong>"Upload ke Cloudinary"</strong> = lebih aman & permanen.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Logo Upload Zone ─────────────────────────────────────────────────────────
function LogoUploadZone({ value, onChange, adminToken }: {
  value: string; onChange: (url: string) => void; adminToken: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<'upload' | 'url'>('upload');
  const [externalUrl, setExternalUrl] = useState('');
  const [loadingUrl, setLoadingUrl] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadToCloudinary(file, 'vibelogos/logos', adminToken, setProgress);
      onChange(url);
    } catch (e: unknown) {
      alert('Upload error: ' + (e instanceof Error ? e.message : String(e)));
    } finally { setUploading(false); setProgress(0); }
  }, [adminToken, onChange]);

  const handleLoadFromUrl = async () => {
    const trimmed = externalUrl.trim();
    if (!trimmed) return;
    setLoadingUrl(true);
    try {
      const cloudUrl = await uploadUrlToCloudinary(trimmed, 'vibelogos/logos', adminToken);
      onChange(cloudUrl);
      setExternalUrl('');
    } catch (e: unknown) {
      alert('Load dari URL gagal: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoadingUrl(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={labelStyle}>Logo Image *</label>
        <div style={{ display: 'flex', background: 'var(--bg3)', borderRadius: 6, padding: 2, gap: 2 }}>
          {(['upload', 'url'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: '3px 10px', borderRadius: 5, border: 'none', fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 600,
                background: mode === m ? 'rgba(200,245,66,0.15)' : 'transparent',
                color: mode === m ? 'var(--accent)' : '#555',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {m === 'upload' ? '📁 Upload File' : '🔗 Load dari URL'}
            </button>
          ))}
        </div>
      </div>

      {value && (
        <div style={{ position: 'relative', width: 100, height: 100 }}>
          <Image src={value} alt="logo" fill sizes="100px" style={{ objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', padding: 8 }} />
          <button onClick={() => onChange('')} style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: '50%', background: '#ff4444', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
      )}

      {mode === 'upload' && (
        <>
          <div
            onClick={() => !uploading && inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            style={{ border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10, padding: '20px 16px', textAlign: 'center', cursor: uploading ? 'default' : 'pointer', transition: 'all 0.2s', background: dragging ? 'rgba(200,245,66,0.04)' : 'transparent' }}
          >
            {uploading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{ width: '100%', height: 4, background: 'var(--border)', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width 0.2s' }} />
                </div>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Uploading {progress}%…</span>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 24, marginBottom: 6 }}>🖼️</div>
                <p style={{ fontSize: 13, color: 'var(--muted)' }}>Drop logo here or <span style={{ color: 'var(--accent)' }}>click to browse</span></p>
                <p style={{ fontSize: 11, color: '#555', marginTop: 4 }}>PNG, JPG, SVG, WEBP</p>
              </>
            )}
          </div>
          <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </>
      )}

      {mode === 'url' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              placeholder="https://www.logoground.com/uploads10/... atau URL gambar lain"
              value={externalUrl}
              onChange={e => setExternalUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !loadingUrl && handleLoadFromUrl()}
              style={{ ...inputStyle, flex: 1, fontSize: 12, borderColor: 'rgba(200,245,66,0.2)' }}
              disabled={loadingUrl}
            />
            <button
              onClick={handleLoadFromUrl}
              disabled={loadingUrl || !externalUrl.trim()}
              style={{
                padding: '10px 14px', borderRadius: 8, fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 700, flexShrink: 0,
                background: loadingUrl || !externalUrl.trim() ? 'var(--bg3)' : 'rgba(200,245,66,0.1)',
                border: '1px solid rgba(200,245,66,0.2)',
                color: loadingUrl || !externalUrl.trim() ? 'var(--muted)' : 'var(--accent)',
                cursor: loadingUrl || !externalUrl.trim() ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s',
              }}
            >
              {loadingUrl ? (
                <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(200,245,66,0.3)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              ) : '⬇️'}
              {loadingUrl ? 'Loading…' : 'Load'}
            </button>
          </div>
          <p style={{ fontSize: 11, color: '#555', margin: 0 }}>
            Gambar akan didownload server-side lalu diupload ke Cloudinary (aman dari CORS)
          </p>
        </div>
      )}
    </div>
  );
}

// ─── AI Mockup Generator ──────────────────────────────────────────────────────
interface MockupResult { scene: string; label: string; url: string; }

const STEP_MESSAGES = [
  '🤖 Mengirim logo ke Gemini AI…',
  '👕 Scene 1/3 — T-Shirt mockup…',
  '💳 Scene 2/3 — Business Card mockup…',
  '☕ Scene 3/3 — Mug mockup…',
  '☁️ Uploading ke Cloudinary…',
];

function AIMockupGenerator({ logoUrl, title, category, adminToken, mockups, onMockupsChange }: {
  logoUrl: string; title: string; category: string;
  adminToken: string; mockups: string[]; onMockupsChange: (urls: string[]) => void;
}) {
  const [activeTab, setActiveTab] = useState<'ai' | 'upload'>('ai');
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<MockupResult[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [error, setError] = useState('');
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Upload manual state
  const [dragging, setDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mockups.length > 0 && results.length === 0) {
      setResults(mockups.map((url, i) => ({ scene: `scene_${i}`, label: `Mockup ${i + 1}`, url })));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startStepTimer = () => {
    setStepIdx(0);
    stepTimerRef.current = setInterval(() => {
      setStepIdx(prev => Math.min(prev + 1, STEP_MESSAGES.length - 1));
    }, 20_000);
  };

  const stopStepTimer = () => {
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  };

  // ── AI Generate ────────────────────────────────────────────────────────────
  const generate = async () => {
    if (!logoUrl) { alert('Upload logo dulu sebelum generate mockup!'); return; }
    setGenerating(true);
    setError('');
    setResults([]);
    startStepTimer();
    try {
      const res = await fetch('/api/generate-mockups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
        body: JSON.stringify({ logo_url: logoUrl, title: title || 'Logo', category: category || 'Brand' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      const newResults: MockupResult[] = data.mockups || [];
      setResults(newResults);
      onMockupsChange(newResults.map(m => m.url));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      stopStepTimer();
      setGenerating(false);
      setStepIdx(0);
    }
  };

  // ── Upload Manual: multiple files ──────────────────────────────────────────
  const handleManualFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (arr.length === 0) return;

    const newResults: MockupResult[] = [...results];

    for (const file of arr) {
      const key = file.name + Date.now();
      setUploadProgress(prev => ({ ...prev, [key]: 0 }));
      try {
        const url = await uploadToCloudinary(
          file,
          'vibelogos/mockups',
          adminToken,
          (pct) => setUploadProgress(prev => ({ ...prev, [key]: pct }))
        );
        const idx = newResults.length;
        newResults.push({ scene: `manual_${idx}`, label: file.name.replace(/\.[^/.]+$/, ''), url });
        setResults([...newResults]);
        onMockupsChange(newResults.map(r => r.url));
      } catch (e: unknown) {
        alert(`Gagal upload ${file.name}: ` + (e instanceof Error ? e.message : String(e)));
      } finally {
        setUploadProgress(prev => { const n = { ...prev }; delete n[key]; return n; });
      }
    }
  };

  const removeResult = (i: number) => {
    const next = results.filter((_, j) => j !== i);
    setResults(next);
    onMockupsChange(next.map(r => r.url));
  };

  const updateLabel = (i: number, label: string) => {
    setResults(prev => prev.map((r, j) => j === i ? { ...r, label } : r));
  };

  const isUploadingManual = Object.keys(uploadProgress).length > 0;

  const tabBtn = (tab: 'ai' | 'upload'): React.CSSProperties => ({
    flex: 1, padding: '9px 12px', borderRadius: 8, border: 'none', fontSize: 12,
    fontFamily: 'Syne, sans-serif', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
    background: activeTab === tab ? 'rgba(200,245,66,0.12)' : 'transparent',
    color: activeTab === tab ? 'var(--accent)' : '#555',
    borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={labelStyle}>Mockup Images</label>
        {results.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{results.length} gambar</span>
        )}
      </div>

      {/* Tab Bar */}
      <div style={{
        display: 'flex', background: 'var(--bg3)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 4, gap: 4,
      }}>
        <button style={tabBtn('ai')} onClick={() => setActiveTab('ai')}>✨ AI Generate</button>
        <button style={tabBtn('upload')} onClick={() => setActiveTab('upload')}>📁 Upload Manual</button>
      </div>

      {/* ── Tab: AI Generate ───────────────────────────────────────────────── */}
      {activeTab === 'ai' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 11, color: '#555' }}>Powered by Gemini 2.0 Flash</div>

          {!generating && logoUrl && (
            <div style={{ background: 'rgba(200,245,66,0.06)', border: '1px solid rgba(200,245,66,0.15)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              ⏱️ Estimasi ~1–2 menit untuk 3 scene mockup
            </div>
          )}

          <button
            onClick={generate}
            disabled={generating || !logoUrl}
            style={{
              padding: '14px 20px', borderRadius: 10, border: '2px solid',
              borderColor: generating ? 'var(--border)' : logoUrl ? 'var(--accent)' : 'var(--border)',
              background: generating ? 'var(--bg3)' : logoUrl ? 'rgba(200,245,66,0.08)' : 'var(--bg3)',
              color: logoUrl && !generating ? 'var(--accent)' : 'var(--muted)',
              cursor: generating || !logoUrl ? 'not-allowed' : 'pointer',
              fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              transition: 'all 0.2s',
            }}
          >
            {generating ? (
              <>
                <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid var(--muted)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                {STEP_MESSAGES[stepIdx]}
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
                {results.length > 0 ? '🔄 Regenerate Mockups' : '✨ Generate AI Mockups'}
              </>
            )}
          </button>

          {!logoUrl && (
            <p style={{ fontSize: 12, color: '#555', textAlign: 'center' }}>Upload logo terlebih dahulu untuk generate mockup</p>
          )}

          {error && (
            <div style={{ background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#ff6b6b' }}>
              ⚠️ {error}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Upload Manual ─────────────────────────────────────────────── */}
      {activeTab === 'upload' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            onClick={() => !isUploadingManual && uploadInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) handleManualFiles(e.dataTransfer.files); }}
            style={{
              border: `2px dashed ${dragging ? 'var(--accent)' : 'rgba(200,245,66,0.25)'}`,
              borderRadius: 12, padding: '28px 20px', textAlign: 'center',
              cursor: isUploadingManual ? 'default' : 'pointer', transition: 'all 0.2s',
              background: dragging ? 'rgba(200,245,66,0.04)' : 'transparent',
            }}
          >
            {isUploadingManual ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <span style={{ display: 'inline-block', width: 24, height: 24, border: '3px solid rgba(200,245,66,0.3)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                  Uploading {Object.keys(uploadProgress).length} file…
                </span>
                <div style={{ width: '100%', maxWidth: 260, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Object.entries(uploadProgress).map(([key, pct]) => (
                    <div key={key}>
                      <div style={{ fontSize: 11, color: '#555', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {key.replace(/\d+$/, '')}
                      </div>
                      <div style={{ height: 4, background: 'var(--border)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width 0.2s' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🖼️</div>
                <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
                  Drop multiple mockup images atau <span style={{ color: 'var(--accent)' }}>klik untuk pilih</span>
                </p>
                <p style={{ fontSize: 11, color: '#555' }}>PNG, JPG, WEBP · Bisa pilih banyak sekaligus</p>
              </>
            )}
          </div>
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.length) handleManualFiles(e.target.files); e.target.value = ''; }}
          />
          <p style={{ fontSize: 11, color: '#555', margin: 0 }}>
            💡 Hasil upload akan bergabung dengan mockup yang sudah ada di grid bawah.
          </p>
        </div>
      )}

      {/* ── Mockup Grid — shared, tampil di kedua tab ──────────────────────── */}
      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Semua Mockup ({results.length})
            </span>
            <button
              onClick={() => { setResults([]); onMockupsChange([]); }}
              style={{ fontSize: 11, color: '#ff6b6b', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
            >
              Hapus Semua
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {results.map((r, i) => (
              <div key={i} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg3)', aspectRatio: '1', display: 'flex', flexDirection: 'column' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <Image src={r.url} alt={r.label} fill sizes="200px" unoptimized style={{ objectFit: 'cover' }} />
                </div>
                {/* Label editable */}
                <div style={{ padding: '6px 8px', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}>
                  <input
                    type="text"
                    value={r.label}
                    onChange={e => updateLabel(i, e.target.value)}
                    style={{
                      background: 'transparent', border: 'none', outline: 'none',
                      fontSize: 11, fontWeight: 600, fontFamily: 'Syne, sans-serif',
                      color: '#fff', width: '100%', padding: 0,
                    }}
                  />
                </div>
                {/* Remove */}
                <button
                  onClick={() => removeResult(i)}
                  style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >✕</button>
                {/* Source badge */}
                <div style={{ position: 'absolute', top: 6, left: 6, fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.6)', color: r.scene.startsWith('manual') ? '#aaa' : 'var(--accent)', fontWeight: 600 }}>
                  {r.scene.startsWith('manual') ? '📁' : '✨ AI'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text)', padding: '10px 14px', fontSize: 14, width: '100%',
  fontFamily: 'DM Sans, sans-serif', outline: 'none',
};
const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
};

const emptyForm = () => ({
  title: '', description: '', keywords: '', price: '',
  main_category: '', secondary_categories: '',
  logo_url: '', mockups: [] as string[],
  logoground_url: '', account: '',
});

const STORAGE_KEY = 'vl_admin_token';

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [token, setToken] = useState('');
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [logos, setLogos] = useState<Logo[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const tokenRef = useRef(token);
  useEffect(() => { tokenRef.current = token; }, [token]);
  const getHeaders = () => ({ 'Content-Type': 'application/json', 'x-admin-token': tokenRef.current });

  const fetchLogos = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/logos-data', {
      headers: { 'x-admin-token': tokenRef.current },
      cache: 'no-store',
    });
    const data = await res.json();
    setLogos(data.logos || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) { setChecking(false); return; }
    fetch('/api/logos-data', { headers: { 'x-admin-token': saved } })
      .then(res => {
        if (res.ok) {
          setToken(saved);
          tokenRef.current = saved;
          setAuthed(true);
          fetchLogos();
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      })
      .catch(() => localStorage.removeItem(STORAGE_KEY))
      .finally(() => setChecking(false));
  }, [fetchLogos]);

  const handleLogin = async () => {
    const res = await fetch('/api/logos-data', { headers: { 'x-admin-token': token } });
    if (res.ok) {
      localStorage.setItem(STORAGE_KEY, token);
      setAuthed(true);
      fetchLogos();
    } else {
      alert('Token salah!');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setAuthed(false);
    setToken('');
    setLogos([]);
    setShowForm(false);
    setDeleteId(null);
  };

  const openAdd = () => { setEditId(null); setForm(emptyForm()); setShowForm(true); };

  const openEdit = (logo: Logo) => {
    setEditId(logo.id);
    setForm({
      title: logo.title, description: logo.description,
      keywords: logo.keywords.join(', '), price: String(logo.price),
      main_category: logo.main_category,
      secondary_categories: logo.secondary_categories.join(', '),
      logo_url: logo.logo_url, mockups: logo.mockups,
      logoground_url: logo.logoground_url, account: logo.account,
    });
    setShowForm(true);
  };

  const handleLogoGroundImport = (data: LogoGroundData & { cloudinary_logo_url?: string }) => {
    setForm(prev => ({
      ...prev,
      title: data.title || prev.title,
      description: data.description || prev.description,
      keywords: data.keywords.length > 0 ? data.keywords.join(', ') : prev.keywords,
      price: data.price > 0 ? String(data.price) : prev.price,
      main_category: data.main_category || prev.main_category,
      secondary_categories: data.secondary_categories.length > 0
        ? data.secondary_categories.join(', ')
        : prev.secondary_categories,
      logo_url: data.cloudinary_logo_url || data.logo_url || prev.logo_url,
      logoground_url: data.logoground_url || prev.logoground_url,
    }));
    showToast('✓ Data LogoGround diimport!');
  };

  const handleSave = async () => {
    if (!form.title.trim()) return alert('Title wajib diisi!');
    if (!form.logo_url.trim()) return alert('Logo URL wajib diisi!');
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(), description: form.description.trim(),
        keywords: form.keywords.split(',').map(k => k.trim()).filter(Boolean),
        price: Number(form.price) || 0, main_category: form.main_category.trim(),
        secondary_categories: form.secondary_categories.split(',').map(s => s.trim()).filter(Boolean),
        logo_url: form.logo_url.trim(), mockups: form.mockups,
        logoground_url: form.logoground_url.trim(), account: form.account.trim(),
      };
      const res = await fetch(
        editId ? `/api/logos-data/${editId}` : '/api/logos-data',
        { method: editId ? 'PUT' : 'POST', headers: getHeaders(), body: JSON.stringify(payload) }
      );
      if (!res.ok) throw new Error(await res.text());
      const saved = await res.json(); // ← ambil data returned dari API
  
      // Optimistic: langsung update state tanpa tunggu fetchLogos
      if (editId) {
        setLogos(prev => prev.map(l => l.id === editId ? { ...l, ...payload, id: editId, slug: l.slug } : l));
      } else {
        // saved.logo berisi data dengan id & slug dari DB
        if (saved?.logo) setLogos(prev => [saved.logo, ...prev]);
      }
  
      showToast(editId ? '✓ Logo diupdate!' : '✓ Logo ditambahkan!');
      setShowForm(false);
  
      // Background refetch untuk sync (tanpa blocking UI)
      fetchLogos();
    } catch (e: unknown) {
      alert('Error: ' + (e instanceof Error ? e.message : String(e)));
    } finally { setSaving(false); }
  };
  
  // ── Optimistic delete ─────────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    // Optimistic: hapus dari state dulu
    setLogos(prev => prev.filter(l => l.id !== id));
    setDeleteId(null);
  
    const res = await fetch(`/api/logos-data/${id}`, { method: 'DELETE', headers: getHeaders() });
    if (res.ok) {
      showToast('🗑 Logo dihapus');
    } else {
      // Rollback kalau gagal
      showToast('⚠️ Hapus gagal, reload...');
      await fetchLogos(); // refetch untuk restore state
    }
  };

  const f = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  if (checking) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <span style={{ display: 'inline-block', width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (!authed) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 40, width: 360, textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, background: 'var(--accent)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="#0a0a0a"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        </div>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 22, fontWeight: 800, marginBottom: 6 }}>VibeLogo <span style={{ color: 'var(--accent)' }}>Admin</span></h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>Masukkan admin token untuk lanjut</p>
        <input type="password" placeholder="Admin token" value={token} onChange={e => setToken(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
          style={{ ...inputStyle, marginBottom: 12, textAlign: 'center' }} autoFocus />
        <button onClick={handleLogin} className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>Masuk →</button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: 'var(--accent)', color: '#0a0a0a', padding: '10px 20px', borderRadius: 10, fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, boxShadow: '0 8px 24px rgba(200,245,66,0.4)', animation: 'fadeUp 0.3s ease' }}>{toast}</div>
      )}

      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border)', padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(10,10,10,0.9)', backdropFilter: 'blur(20px)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>← Back to site</a>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 17 }}>vibe<span style={{ color: 'var(--accent)' }}>logos</span> admin</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{logos.length} logos</span>
          <button
            onClick={handleLogout}
            style={{ padding: '6px 14px', fontSize: 12, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--muted)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
          >
            Logout
          </button>
          <button onClick={openAdd} className="btn-primary"><span style={{ fontSize: 16 }}>+</span> Add Logo</button>
        </div>
      </div>

      {/* Table */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 20, marginBottom: 20 }}>All Logos</h2>

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 10 }} />)}
          </div>
        )}

        {!loading && logos.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', border: '2px dashed var(--border)', borderRadius: 16 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <p style={{ fontFamily: 'Syne, sans-serif' }}>Belum ada logo. Tambah yang pertama!</p>
          </div>
        )}

        {!loading && logos.map(logo => (
          <div key={logo.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8, transition: 'border-color 0.2s' }}>
            <div style={{ width: 56, height: 56, borderRadius: 8, background: 'var(--bg3)', flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
              {logo.logo_url && <Image src={logo.logo_url} alt={logo.title} fill sizes="56px" style={{ objectFit: 'contain', padding: 6 }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15 }}>{logo.title}</span>
                <span className="tag">{logo.main_category}</span>
                <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>${logo.price}</span>
                <span style={{ fontSize: 11, color: '#444', fontFamily: 'monospace' }}>#{logo.id} · {logo.slug}</span>
                {logo.mockups.length > 0 && <span style={{ fontSize: 11, color: 'var(--muted)' }}>🖼 {logo.mockups.length} mockup</span>}
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{logo.description || <em>No description</em>}</p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {logo.logoground_url && (
                <a href={logo.logoground_url} target="_blank" rel="noopener noreferrer" style={{ padding: '6px 12px', fontSize: 12, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--muted)', textDecoration: 'none' }}>↗ LGround</a>
              )}
              <button onClick={() => openEdit(logo)} style={{ padding: '6px 12px', fontSize: 12, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text)', cursor: 'pointer' }}>✏️ Edit</button>
              <button onClick={() => setDeleteId(logo.id)} style={{ padding: '6px 12px', fontSize: 12, background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 7, color: '#ff6b6b', cursor: 'pointer' }}>🗑</button>
            </div>
          </div>
        ))}
      </div>

      {/* Delete Confirm */}
      {deleteId !== null && (
        <div onClick={() => setDeleteId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 32, maxWidth: 360, width: '90%', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: 18, marginBottom: 8 }}>Hapus logo ini?</h3>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>Tindakan ini tidak bisa diurungkan.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteId(null)} style={{ flex: 1, padding: '10px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Batal</button>
              <button onClick={() => handleDelete(deleteId)} style={{ flex: 1, padding: '10px', background: '#ff4444', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontWeight: 700 }}>Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', zIndex: 1000, overflowY: 'auto', display: 'flex', justifyContent: 'center', padding: '32px 16px' }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, maxWidth: 720, width: '100%', height: 'fit-content' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 20 }}>
                {editId ? '✏️ Edit Logo' : '➕ Add New Logo'}
              </h2>
              <button onClick={() => setShowForm(false)} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

              <LogoGroundImporter
                adminToken={token}
                onImport={handleLogoGroundImport}
                defaultUrl={form.logoground_url}
              />

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: 11, color: '#555', flexShrink: 0 }}>atau isi manual</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Title *</label>
                  <input type="text" placeholder="e.g. Nexacloud Pro" value={form.title} onChange={f('title')} style={{ ...inputStyle, marginTop: 6 }} />
                </div>
                <div>
                  <label style={labelStyle}>Price (USD)</label>
                  <input type="number" placeholder="29" value={form.price} onChange={f('price')} style={{ ...inputStyle, marginTop: 6 }} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Description</label>
                <textarea value={form.description} onChange={f('description')} placeholder="Deskripsi singkat logo ini..." rows={3} style={{ ...inputStyle, marginTop: 6, resize: 'vertical' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Main Category *</label>
                  <input type="text" placeholder="e.g. Technology" value={form.main_category} onChange={f('main_category')} style={{ ...inputStyle, marginTop: 6 }} />
                </div>
                <div>
                  <label style={labelStyle}>Secondary Categories</label>
                  <input type="text" placeholder="Startup, SaaS" value={form.secondary_categories} onChange={f('secondary_categories')} style={{ ...inputStyle, marginTop: 6 }} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Keywords</label>
                <input type="text" placeholder="modern, minimal, tech (comma-separated)" value={form.keywords} onChange={f('keywords')} style={{ ...inputStyle, marginTop: 6 }} />
              </div>

              <LogoUploadZone
                value={form.logo_url}
                onChange={url => setForm(p => ({ ...p, logo_url: url }))}
                adminToken={token}
              />

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 4 }} />

              <AIMockupGenerator
                logoUrl={form.logo_url}
                title={form.title}
                category={form.main_category}
                adminToken={token}
                mockups={form.mockups}
                onMockupsChange={urls => setForm(p => ({ ...p, mockups: urls }))}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={labelStyle}>LogoGround URL</label>
                  <input type="text" placeholder="https://www.logoground.com/logo.php?id=..." value={form.logoground_url} onChange={f('logoground_url')} style={{ ...inputStyle, marginTop: 6 }} />
                </div>
                <div>
                  <label style={labelStyle}>Account / Seller Name</label>
                  <input type="text" placeholder="nama_akun" value={form.account} onChange={f('account')} style={{ ...inputStyle, marginTop: 6 }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: '12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 15 }}>Batal</button>
                <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ flex: 2, justifyContent: 'center', fontSize: 15, padding: 12, opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Menyimpan…' : (editId ? '✓ Update Logo' : '✓ Simpan Logo')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
