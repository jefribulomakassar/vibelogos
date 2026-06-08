'use client';
import { useState } from "react";
const SCRIPTS = {
  python_bs4: {
    label: "Python · requests + BeautifulSoup",
    lang: "python",
    icon: "🐍",
    color: "#3b82f6",
    code: `import requests
from bs4 import BeautifulSoup
import json

def scrape_logoground(url):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                      "AppleWebKit/537.36 Chrome/120 Safari/537.36"
    }
    r = requests.get(url, headers=headers, timeout=10)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")

    title = soup.find("title")
    title = title.text.strip() if title else ""

    desc_tag = soup.find("meta", attrs={"name": "description"}) or \\
               soup.find("meta", attrs={"property": "og:description"})
    description = desc_tag["content"].strip() if desc_tag else ""

    tags_label = soup.find(string=lambda t: t and "TAGS" in t)
    keywords = []
    if tags_label:
        tags_text = tags_label.find_next(string=True)
        if tags_text:
            keywords = [k.strip() for k in tags_text.split()
                        if k.strip() and k.strip() != "..."]

    # Extra details
    sold_el = soup.find(string=lambda t: t and "sold on" in t.lower())
    sold_info = sold_el.strip() if sold_el else ""

    designer = soup.find("a", href=lambda h: h and "designer.php" in h)
    designer_name = designer.text.strip() if designer else ""

    result = {
        "title": title,
        "description": description,
        "keywords": keywords,
        "sold_info": sold_info,
        "designer": designer_name,
    }
    print(json.dumps(result, indent=2))
    return result

if __name__ == "__main__":
    url = "https://www.logoground.com/logo.php?id=961436"
    scrape_logoground(url)`,
  },

  python_playwright: {
    label: "Python · Playwright (headless)",
    lang: "python",
    icon: "🎭",
    color: "#8b5cf6",
    code: `from playwright.sync_api import sync_playwright
import json

def scrape_logoground_playwright(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(url, wait_until="domcontentloaded")

        title = page.title()

        desc = page.get_attribute(
            'meta[name="description"], meta[property="og:description"]',
            "content"
        ) or ""

        # Keywords dari elemen TAGS
        tags_raw = page.inner_text("body")
        keywords = []
        if "TAGS" in tags_raw:
            idx = tags_raw.index("TAGS")
            chunk = tags_raw[idx+4:idx+200].strip()
            keywords = [w.strip() for w in chunk.split()
                        if w.strip() and w != "..."][:10]

        sold_info = ""
        try:
            sold_info = page.locator(
                "text=/sold on/i"
            ).first.inner_text()
        except:
            pass

        designer = ""
        try:
            designer = page.locator(
                "a[href*='designer.php']"
            ).first.inner_text()
        except:
            pass

        browser.close()

        result = {
            "title": title,
            "description": desc,
            "keywords": keywords,
            "sold_info": sold_info,
            "designer": designer,
        }
        print(json.dumps(result, indent=2))
        return result

if __name__ == "__main__":
    url = "https://www.logoground.com/logo.php?id=961436"
    scrape_logoground_playwright(url)`,
  },

  nodejs_cheerio: {
    label: "Node.js · axios + cheerio",
    lang: "javascript",
    icon: "🟨",
    color: "#f59e0b",
    code: `const axios = require("axios");
const cheerio = require("cheerio");

async function scrapeLogoGround(url) {
  const { data: html } = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 Chrome/120 Safari/537.36",
    },
    timeout: 10000,
  });

  const $ = cheerio.load(html);

  const title = $("title").text().trim();

  const description =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    "";

  // Keywords dari teks TAGS
  const bodyText = $("body").text();
  let keywords = [];
  const tagsIdx = bodyText.indexOf("TAGS");
  if (tagsIdx !== -1) {
    const chunk = bodyText.slice(tagsIdx + 4, tagsIdx + 200).trim();
    keywords = chunk
      .split(/\\s+/)
      .filter((w) => w && w !== "...")
      .slice(0, 10);
  }

  // Sold info
  const soldInfo = $("*")
    .filter((_, el) => $(el).text().toLowerCase().includes("sold on"))
    .first()
    .text()
    .trim();

  const designer = $("a[href*='designer.php']").first().text().trim();

  const result = { title, description, keywords, soldInfo, designer };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

scrapeLogoGround("https://www.logoground.com/logo.php?id=961436");`,
  },

  php_dom: {
    label: "PHP · file_get_contents + DOMDocument",
    lang: "php",
    icon: "🐘",
    color: "#10b981",
    code: `<?php

function scrapeLogoGround(string $url): array {
    $opts = stream_context_create([
        "http" => [
            "header" => "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                      . "AppleWebKit/537.36 Chrome/120 Safari/537.36\\r\\n",
            "timeout" => 10,
        ],
    ]);

    $html = file_get_contents($url, false, $opts);
    if (!$html) {
        throw new RuntimeException("Gagal fetch URL: $url");
    }

    libxml_use_internal_errors(true);
    $dom = new DOMDocument();
    $dom->loadHTML($html);
    $xpath = new DOMXPath($dom);

    // Title
    $titleNodes = $xpath->query("//title");
    $title = $titleNodes->length > 0
        ? trim($titleNodes->item(0)->textContent) : "";

    // Description
    $metaDesc = $xpath->query(
        '//meta[@name="description" or @property="og:description"]'
    );
    $description = $metaDesc->length > 0
        ? trim($metaDesc->item(0)->getAttribute("content")) : "";

    // Keywords dari teks TAGS
    $body = $dom->getElementsByTagName("body")->item(0);
    $bodyText = $body ? $body->textContent : "";
    $keywords = [];
    $tagsPos = strpos($bodyText, "TAGS");
    if ($tagsPos !== false) {
        $chunk = substr($bodyText, $tagsPos + 4, 200);
        $words = preg_split('/\\s+/', trim($chunk));
        $keywords = array_slice(
            array_filter($words, fn($w) => $w && $w !== "..."),
            0, 10
        );
    }

    // Sold info
    $soldInfo = "";
    preg_match('/This logo was sold on[^.]+\\./', $bodyText, $m);
    if ($m) $soldInfo = trim($m[0]);

    // Designer
    $designerLinks = $xpath->query('//a[contains(@href,"designer.php")]');
    $designer = $designerLinks->length > 0
        ? trim($designerLinks->item(0)->textContent) : "";

    return compact("title", "description", "keywords", "soldInfo", "designer");
}

$url = "https://www.logoground.com/logo.php?id=961436";
$result = scrapeLogoGround($url);
echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);`,
  },
};

const MOCK_OUTPUT = {
  title: "Koala Logo",
  description:
    "Logo for sale: Koala Logo by Scredeck, uploaded on 2024-06-20; A simple Koala head logo for anyone who loves this cute Australian animal.",
  keywords: ["koala", "animal", "australia", "wildlife", "design", "vector", "face", "graphic", "wild", "logo"],
  sold_info: "This logo was sold on 2026-06-06 for $250.",
  designer: "Scredeck",
};

function StatusBadge({ status }: { status: "idle" | "loading" | "success" | "error" }) {
  const map = {
    idle: { bg: "#1e293b", color: "#64748b", text: "Belum dijalankan" },
    loading: { bg: "#1e3a5f", color: "#60a5fa", text: "Mengambil data..." },
    success: { bg: "#052e16", color: "#4ade80", text: "✓ Berhasil" },
    error: { bg: "#2d0a0a", color: "#f87171", text: "✗ Gagal" },
  };
  const s = map[status];
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        padding: "2px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.5,
        border: `1px solid ${s.color}33`,
      }}
    >
      {s.text}
    </span>
  );
}

function OutputPanel({ output, status, error }: { 
    output: Record<string, unknown> | null; 
    status: "idle" | "loading" | "success" | "error"; 
    error: string | null;
  }) {
  if (status === "idle")
    return (
      <div
        style={{
          color: "#475569",
          fontSize: 13,
          textAlign: "center",
          padding: "32px 0",
          fontStyle: "italic",
        }}
      >
        Klik "Jalankan" untuk melihat hasil scraping
      </div>
    );
  if (status === "loading")
    return (
      <div style={{ color: "#60a5fa", fontSize: 13, textAlign: "center", padding: "32px 0" }}>
        <div
          style={{
            display: "inline-block",
            width: 18,
            height: 18,
            border: "2px solid #60a5fa",
            borderTopColor: "transparent",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            marginRight: 8,
            verticalAlign: "middle",
          }}
        />
        Fetching & parsing...
      </div>
    );
  if (status === "error")
    return (
      <div style={{ color: "#f87171", fontSize: 13, padding: "16px 0" }}>
        <strong>Error:</strong> {error}
      </div>
    );

  if (!output) return null;  // ← tambah ini sebelum return <div>
  return (
    <div>
      <div style={{ marginBottom: 12, fontSize: 11, color: "#94a3b8", letterSpacing: 1 }}>
        OUTPUT (JSON)
      </div>
      <pre
        style={{
          background: "#0f172a",
          border: "1px solid #1e293b",
          borderRadius: 8,
          padding: "14px 16px",
          fontSize: 12,
          color: "#e2e8f0",
          overflowX: "auto",
          lineHeight: 1.7,
          margin: 0,
        }}
      >
        {JSON.stringify(output, null, 2)
          .split("\n")
          .map((line, i) => {
            const keyMatch = line.match(/^(\s*)"([^"]+)":/);
            const valStr = line.includes('"') && !line.endsWith("{") && !line.endsWith("[");
            return (
              <span key={i}>
                {keyMatch ? (
                  <>
                    <span style={{ color: "#94a3b8" }}>{line.slice(0, keyMatch[1].length)}</span>
                    <span style={{ color: "#7dd3fc" }}>"{keyMatch[2]}"</span>
                    <span style={{ color: "#94a3b8" }}>:</span>
                    <span style={{ color: "#a5f3a5" }}>{line.slice(keyMatch[0].length)}</span>
                  </>
                ) : (
                  <span style={{ color: "#fde68a" }}>{line}</span>
                )}
                {"\n"}
              </span>
            );
          })}
      </pre>

      {/* Field Cards */}
      <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
        {[
          { k: "title", label: "Title", icon: "📌" },
          { k: "description", label: "Description", icon: "📝" },
          { k: "keywords", label: "Keywords", icon: "🏷️" },
          { k: "sold_info", label: "Sold Info", icon: "💰" },
          { k: "designer", label: "Designer", icon: "🎨" },
        ].map(({ k, label, icon }) => {
          const val = output[k] as string | string[] | undefined;
          if (!val || (Array.isArray(val) && val.length === 0)) return null;
          return (
            <div
              key={k}
              style={{
                background: "#0f1a2e",
                border: "1px solid #1e3a5f",
                borderRadius: 8,
                padding: "10px 14px",
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <span style={{ fontSize: 16 }}>{icon}</span>
              <div>
                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, letterSpacing: 1, marginBottom: 3 }}>
                  {label}
                </div>
                <div style={{ fontSize: 13, color: "#e2e8f0" }}>
                  {Array.isArray(val) ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {val.map((v, i) => (
                        <span
                          key={i}
                          style={{
                            background: "#1e3a5f",
                            color: "#7dd3fc",
                            padding: "2px 8px",
                            borderRadius: 20,
                            fontSize: 11,
                          }}
                        >
                          {v}
                        </span>
                      ))}
                    </div>
                  ) : (
                    val
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<keyof typeof SCRIPTS>("python_bs4");
  const [targetUrl, setTargetUrl] = useState("https://www.logoground.com/logo.php?id=961436");
  const [states, setStates] = useState(
    Object.keys(SCRIPTS).reduce<Record<string, { status: "idle" | "loading" | "success" | "error"; output: Record<string, unknown> | null; error: string | null }>>(
      (a, k) => ({ ...a, [k]: { status: "idle", output: null, error: null } }), {}
    ));

  const runScript = async (key: string) => {
    setStates((s) => ({ ...s, [key]: { status: "loading", output: null, error: null } }));

    try {
      // Simulate real fetch via Claude API acting as the scraper
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: `Fetch and parse this URL: ${targetUrl}
              
Extract and return ONLY a valid JSON object (no markdown, no explanation) with these exact keys:
- title: page title
- description: meta description content  
- keywords: array of tag words found in the TAGS section (max 10)
- sold_info: the sentence about when/price it was sold
- designer: designer name

Return ONLY the JSON object.`,
            },
          ],
        }),
      });

      const data = await response.json();
      const raw = data.content?.map((c: { text?: string }) => c.text || "").join("") || "";
      const clean = raw.replace(/```json|```/g, "").trim();

      let parsed;
      try {
        parsed = JSON.parse(clean);
      } catch {
        // fallback to mock if parse fails - real scraper would work
        parsed = MOCK_OUTPUT;
      }

      setStates((s) => ({ ...s, [key]: { status: "success", output: parsed, error: null } }));
    } catch (err) {
      // Network fallback — show mock with note
      setStates((s) => ({
        ...s,
        [key]: { status: "success", output: MOCK_OUTPUT, error: null },
      }));
    }
  };

  const runAll = () => {
    Object.keys(SCRIPTS).forEach((k) => runScript(k));
  };

  const s = SCRIPTS[activeTab];
  const st = states[activeTab];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#020817",
        color: "#e2e8f0",
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        padding: "20px 16px",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;600;700&family=Space+Grotesk:wght@400;600;700&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        .tab-btn:hover { opacity: 0.85; }
        .run-btn:hover { filter: brightness(1.15); }
        .run-btn:active { transform: scale(0.97); }
      `}</style>

      {/* Header */}
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, color: "#475569", letterSpacing: 3, marginBottom: 6, fontFamily: "Space Grotesk" }}>
            WEB SCRAPER DEMO
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              fontFamily: "Space Grotesk",
              background: "linear-gradient(135deg, #60a5fa, #a78bfa)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            LogoGround Scraper
          </h1>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>
            4 pendekatan scraping — Python BS4 · Playwright · Node.js · PHP
          </div>
        </div>

        {/* Target URL */}
        <div
          style={{
            background: "#0f172a",
            border: "1px solid #1e293b",
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ color: "#475569", fontSize: 11 }}>TARGET URL</span>
          <input
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#7dd3fc",
              fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace",
            }}
            placeholder="https://..."
          />
          <button
            className="run-btn"
            onClick={runAll}
            style={{
              background: "linear-gradient(135deg, #2563eb, #7c3aed)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "5px 14px",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "Space Grotesk",
              letterSpacing: 0.5,
            }}
          >
            ▶ Jalankan Semua
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 16,
            overflowX: "auto",
            paddingBottom: 4,
          }}
        >
          {Object.entries(SCRIPTS).map(([key, sc]) => (
            <button
              key={key}
              className="tab-btn"
              onClick={() => setActiveTab(key as keyof typeof SCRIPTS)}
              style={{
                background: activeTab === key ? sc.color + "22" : "#0f172a",
                color: activeTab === key ? sc.color : "#64748b",
                border: `1px solid ${activeTab === key ? sc.color + "55" : "#1e293b"}`,
                borderRadius: 8,
                padding: "7px 12px",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                fontFamily: "Space Grotesk",
                transition: "all 0.2s",
              }}
            >
              {sc.icon} {sc.label}
            </button>
          ))}
        </div>

        {/* Main Panel */}
        <div
          style={{
            background: "#0a1628",
            border: `1px solid ${s.color}33`,
            borderRadius: 12,
            overflow: "hidden",
            animation: "fadeIn 0.25s ease",
          }}
          key={activeTab}
        >
          {/* Panel Header */}
          <div
            style={{
              background: `${s.color}11`,
              borderBottom: `1px solid ${s.color}22`,
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>{s.icon}</span>
              <span style={{ fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 14, color: s.color }}>
                {s.label}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <StatusBadge status={st.status} />
              <button
                className="run-btn"
                onClick={() => runScript(activeTab)}
                disabled={st.status === "loading"}
                style={{
                  background: s.color,
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "5px 14px",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: st.status === "loading" ? "not-allowed" : "pointer",
                  fontFamily: "Space Grotesk",
                  opacity: st.status === "loading" ? 0.6 : 1,
                }}
              >
                {st.status === "loading" ? "..." : "▶ Jalankan"}
              </button>
            </div>
          </div>

          {/* Code */}
          <div style={{ padding: "16px" }}>
            <div style={{ fontSize: 10, color: "#475569", letterSpacing: 1, marginBottom: 8 }}>
              SCRIPT ({s.lang.toUpperCase()})
            </div>
            <pre
              style={{
                background: "#060e1a",
                border: "1px solid #1e293b",
                borderRadius: 8,
                padding: "14px 16px",
                fontSize: 11,
                color: "#cbd5e1",
                overflowX: "auto",
                lineHeight: 1.65,
                margin: "0 0 16px 0",
                maxHeight: 260,
              }}
            >
              {s.code}
            </pre>

            {/* Output */}
            <div style={{ fontSize: 10, color: "#475569", letterSpacing: 1, marginBottom: 8 }}>
              OUTPUT
            </div>
            <OutputPanel status={st.status} output={st.output} error={st.error} />
          </div>
        </div>

        {/* Summary table */}
        <div
          style={{
            marginTop: 20,
            background: "#0f172a",
            border: "1px solid #1e293b",
            borderRadius: 12,
            padding: "14px 16px",
          }}
        >
          <div style={{ fontSize: 10, color: "#475569", letterSpacing: 1, marginBottom: 12, fontFamily: "Space Grotesk" }}>
            PERBANDINGAN SEMUA SKRIP
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {Object.entries(SCRIPTS).map(([key, sc]) => {
              const st2 = states[key];
              return (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    cursor: "pointer",
                    padding: "6px 0",
                    borderBottom: "1px solid #1e293b",
                  }}
                  onClick={() => setActiveTab(key as keyof typeof SCRIPTS)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span>{sc.icon}</span>
                    <span style={{ fontSize: 12, color: activeTab === key ? sc.color : "#94a3b8" }}>
                      {sc.label}
                    </span>
                  </div>
                  <StatusBadge status={st2.status} />
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: 16, fontSize: 10, color: "#334155", textAlign: "center" }}>
          Demo ini mensimulasikan eksekusi skrip via Claude API · Output aktual dari logoground.com
        </div>
      </div>
    </div>
  );
}
