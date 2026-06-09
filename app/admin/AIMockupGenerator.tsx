// ─── AI Mockup Generator ──────────────────────────────────────────────────────
// PATH: components/admin/AIMockupGenerator.tsx  (atau inline di page admin)
// Perubahan: tambah tab "Upload Manual" untuk unggah mockup images secara multiple
import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
interface MockupResult { scene: string; label: string; url: string; }

const STEP_MESSAGES = [
  '🤖 Mengirim logo ke Gemini AI…',
  '👕 Scene 1/3 — T-Shirt mockup…',
  '💳 Scene 2/3 — Business Card mockup…',
  '☕ Scene 3/3 — Mug mockup…',
  '☁️ Uploading ke Cloudinary…',
];

// ─── Upload helper (reuse dari luar komponen) ─────────────────────────────────
// Pastikan fungsi uploadToCloudinary sudah tersedia di scope yang sama.

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
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [dragging, setDragging] = useState(false);
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

  // ── Upload Manual: handle multiple files ───────────────────────────────────
  const handleManualFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (arr.length === 0) return;
    setUploading(true);

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
    setUploading(false);
  };

  const removeResult = (i: number) => {
    const next = results.filter((_, j) => j !== i);
    setResults(next);
    onMockupsChange(next.map(r => r.url));
  };

  const updateLabel = (i: number, label: string) => {
    const next = results.map((r, j) => j === i ? { ...r, label } : r);
    setResults(next);
  };

  const isUploadingAny = Object.keys(uploadProgress).length > 0;

  // ── Tab styles ─────────────────────────────────────────────────────────────
  const tabBtn = (tab: 'ai' | 'upload'): React.CSSProperties => ({
    flex: 1, padding: '9px 12px', borderRadius: 8, border: 'none', fontSize: 12,
    fontFamily: 'Syne, sans-serif', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
    background: activeTab === tab ? 'rgba(200,245,66,0.12)' : 'transparent',
    color: activeTab === tab ? 'var(--accent)' : '#555',
    borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Header + Tab toggle ───────────────────────────────────────────── */}
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
        <button style={tabBtn('ai')} onClick={() => setActiveTab('ai')}>
          ✨ AI Generate
        </button>
        <button style={tabBtn('upload')} onClick={() => setActiveTab('upload')}>
          📁 Upload Manual
        </button>
      </div>

      {/* ── Tab: AI Generate ─────────────────────────────────────────────── */}
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

      {/* ── Tab: Upload Manual ───────────────────────────────────────────── */}
      {activeTab === 'upload' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Drop Zone */}
          <div
            onClick={() => !uploading && uploadInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) handleManualFiles(e.dataTransfer.files); }}
            style={{
              border: `2px dashed ${dragging ? 'var(--accent)' : 'rgba(200,245,66,0.25)'}`,
              borderRadius: 12, padding: '28px 20px', textAlign: 'center',
              cursor: uploading ? 'default' : 'pointer', transition: 'all 0.2s',
              background: dragging ? 'rgba(200,245,66,0.04)' : 'transparent',
            }}
          >
            {isUploadingAny ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <span style={{ display: 'inline-block', width: 24, height: 24, border: '3px solid rgba(200,245,66,0.3)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                  Uploading {Object.keys(uploadProgress).length} file…
                </span>
                {/* Progress bars per file */}
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
            💡 Hasil upload akan bergabung dengan mockup yang sudah ada di bawah.
          </p>
        </div>
      )}

      {/* ── Mockup Grid — shared, tampil di kedua tab ─────────────────────── */}
      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
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
                {/* Image */}
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
                {/* Remove button */}
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
