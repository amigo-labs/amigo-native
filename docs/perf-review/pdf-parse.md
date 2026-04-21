# Candidate review: `pdf-parse`

> **Status:** GO (als neues Paket, scoped auf Text-Extraction) · **Predicted:** 🟢 Green · **Reviewed:** 2026-04-21

## Verdict

`pdf-parse` ist ein dünner Wrapper um **Mozilla's pdf.js** — einen ~500k-LOC pure-JS-PDF-Renderer. Für den reinen Text-Extraction-Pfad ist das massiver Overhead: kompletter Page-Layout-Graph, Font-Decode, CIDMap-Auflösung, alles in JS-Land. Rust-`lopdf` + `pdf-extract` laufen auf SIMD-beschleunigten Byte-Parsern, nutzen native zlib/LZW-Dekompressoren und überspringen die Render-Pipeline komplett. Shape ist Lehrbuch-Green: **Buffer-in / String-out, ein FFI-Crossing pro Dokument**, substantielle CPU-Arbeit pro Call. Der eigentliche Vorbehalt ist **Parität auf pathologischen PDFs** — verschlüsselt, JBIG2, CJK-CID-Mappings, malformed cross-reference tables — nicht Perf.

## JS package

- **npm:** [`pdf-parse`](https://www.npmjs.com/package/pdf-parse)
- **Downloads:** ~1M/Woche (Q1 2026 estimate, BACKLOG-Zahl bestätigt)
- **Exports / API surface:** `pdf(dataBuffer, opts?) → Promise<{ text, numpages, numrender, info, metadata, version }>`. Minimalistisch; der zweite Argument erlaubt `pagerender`-Callback (wir ignorieren den in einem Port — Callback über FFI-Grenze = Antipattern).
- **Typical input:** PDF-Buffer 50 KB – 10 MB. Median ~500 KB – 2 MB (Whitepaper, Rechnung, Report)
- **Typical output:** Plaintext-String der Länge 5 KB – 500 KB. Plus Metadata-Objekt (klein, <1 KB)
- **Realistic median use-case:** **RAG-Ingestion-Batch** — 100–10 000 PDFs durch die Pipeline schieben, pro PDF einmal `text` extrahieren und chunken. Zweiter Use-Case: **Ad-hoc-Server-Extract** (Upload-Form, ein PDF pro Request). Beide haben dasselbe Shape: ein PDF rein, ein Text raus, keine Per-Page-Callbacks nötig.

## Rust replacement

- **Candidate crate(s):**
  - [`pdf-extract`](https://crates.io/crates/pdf-extract) — **primär**. High-Level-API `extract_text(bytes) → Result<String>`, maintained (jrmuizel), MIT. Deckt die 80/20-Häufigen-PDF-Features ab: Text-Streams, Ligaturen, CID-Decoding, Layout-Reordering.
  - [`lopdf`](https://crates.io/crates/lopdf) — Low-Level-PDF-Parser als Backend. `pdf-extract` baut darauf. Eigene Nutzung falls wir mehr als nur Text wollen (Metadata-Felder, Forms, Attachments — Fast-Follow).
  - [`pdf`](https://crates.io/crates/pdf) — alternative Parser (pdf-rs/pdf), aktiver, aber API instabil zwischen 0.x-Releases.
  - **Nicht geeignet:** `mupdf`-bindings — das wäre wieder ein C-Lib-Wrapper (MuPDF in C), derselbe `hnswlib-node`-Fehler.
- **Maintenance / license:** `pdf-extract` MIT, `lopdf` MIT, beide aktiv (Q1 2026 Releases). Kein Supply-Chain-Risiko.
- **Known gotchas / divergences:**
  - **Encrypted PDFs**: `pdf-extract` v0.7 unterstützt RC4 und AES-128 Standard-Encryption, aber **kein** Public-Key-Security. Für typische Corporate-PDFs (AES-128) reicht das.
  - **JBIG2-komprimierte Images**: irrelevant für Text-Extraction, aber Parser muss den Stream gracefully skippen.
  - **CJK-Fonts mit proprietären CMaps**: die nicht-Unicode Adobe-CMaps (GB-EUC-H etc.) sind in `pdf-extract` partiell implementiert. Korpus von chinesischen/japanischen Geschäfts-PDFs muss gegen `pdf-parse` parallel geprüft werden.
  - **Text-Reordering**: `pdf-parse` gibt Text in Page-Stream-Reihenfolge, `pdf-extract` versucht geometrisches Reorder. Kein Bug, aber Output-Divergenz — Konsumenten die regex-basiert auf Positions-Kontext matchen werden brechen.
  - **Formular-Felder (AcroForms)**: `pdf-parse` ignoriert sie, `pdf-extract` teilweise. Divergenz dokumentieren.
  - **Malformed Cross-Reference**: pdf.js hat jahrzehntelange Recovery-Heuristiken für kaputte PDFs. `lopdf`/`pdf-extract` weniger. Für edge-case-PDFs (Scanner-Output, alte Adobe-Versionen) kann Parity fehlen.

## BACKLOG check

Existierender Eintrag: `BACKLOG.md:12`:
> **pdf-parse** (~1M, text-extraction path). Per-document parsing via `pdf-extract` / `lopdf`. Parity on edge-case PDFs is the main risk.

Kategorisierung als "Predicted Green". Dieses Review bestätigt die Vorhersage mit dem expliziten Scope-Caveat: **Text-Extraction only, nicht pdf.js-Parity**.

Abgrenzung zu bestehenden Reviews:
- `docs/perf-review/pdfkit.md` und der `typst`-Review adressieren die **Write-Seite** (PDF erzeugen). `pdf-parse` ist die **Read-Seite**. Kein Overlap, perfekt komplementär.
- Binary-Size-Frage ist hier deutlich geringer als bei `typst` — `pdf-extract` + `lopdf` + Deps landen bei ~3–5 MB pro Target, in etwa `zip`-/`commonmark`-Kategorie, nicht `typst`-Kategorie (15–25 MB).

Kein Eintrag in `docs/packages.json`.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Hoch.** Text-Extract eines 1 MB-PDFs mit 50 Seiten: pdf-parse/pdf.js ~200–500 ms in V8, `pdf-extract` erwartbar 20–80 ms. Substantielle Compute, FFI-Share <0,5 %. |
| Input size distribution | Buffer 50 KB – 10 MB. Zero-copy durch V8-Buffer-Handle (`docs/BASELINE.md:30` — flat <200 ns bis 10 MB). Kein Marshalling-Problem auf der Input-Seite. |
| Output size distribution | String 5 KB – 500 KB. UTF-16-Konversion kostet ~0,35 ns/byte (`docs/BASELINE.md:27`). 500 KB Output = ~175 µs Konversions-Overhead — bei >20 ms Rust-Compute irrelevant (<1 %). |
| Reusable setup (stateful potential) | Niedrig. Kein Modell/Key/Schema pro Call. Document-Parser-State existiert pro Dokument, nicht pro API-Consumer. Keine NAPI-Class nötig. |
| Batch-usage realism | Hoch. RAG-Ingestion-Workload = "verarbeite 1000 PDFs". `extractTextMany(buffers: Buffer[]) → string[]` oder `extractTextManyAsync` mit rayon-Pool wäre der zweite Hebel über Single-Call hinaus — rechtfertigt Phase-C1-Sprint nach v1. |
| FFI-share estimate vs. Rust work | <1 % bei Median (1 MB → 30 ms Rust). Skaliert noch besser bei großen Dokumenten. |

## Classification reasoning

PDF-Text-Extraction ist **der kanonische Green-Shape aus dem `inflate`/`commonmark`-Spielbuch**:

1. **Pure-JS-Baseline ist langsam.** pdf.js ist ein kompletter PDF-Renderer — Interpretation der PostScript-ähnlichen Content-Streams, Font-Subset-Decoding, CIDMap-Auflösung, Layout-Compositing. Für Text-Extract wird alles außer den Text-Showing-Operatoren (`Tj`, `TJ`, `'`, `"`) verworfen — das ist massiver Waste. Rust kann den Hot-Path direkt fahren: Content-Stream tokenize → nur Text-Operatoren behalten → Font-Mapping applizieren → concat. V8-Optimierung ändert daran nichts, weil der Ballast im Parser-Graph sitzt.

2. **Compute ist substantiell.** 1 MB-PDF mit 50 Seiten entspricht oft 5–15 MB an dekomprimierten Content-Streams, durch die ein Tokenizer durchmuss. Das ist echtes Work, nicht Hashmap-Lookup. FFI-Floor von 109 ns ist buchstäblich im 0,0005 %-Bereich.

3. **Input ist Buffer, Output ist String.** Die beiden FFI-sichersten Typen. Kein `Vec<Object>`, kein `Vec<String>`, kein Callback. Lehrbuch.

4. **Parität ist der einzige Kostenpunkt, und die Industry-Praxis kennt das.** Tika, PDFBox, `pdftotext` (poppler), `pdf-parse` selbst — alle divergieren auf edge-case-PDFs. Wir dokumentieren unsere Divergenzen (`__conformance__/divergences.md` wie bei `commonmark`), und der Use-Case "RAG-Ingestion" verträgt 1–2 % Dokument-Failure-Rate problemlos, weil Upstream-Pipelines sowieso Fallback-Loops haben.

**Shape-Matching:**
- ✅ Wie `inflate` (Buffer-in / Buffer-out, substantieller Compute, zlib-rs als Engine)
- ✅ Wie `commonmark` (spec-Parser, neues Paket, keine Drop-in-Parität-Pflicht, "we're the CommonMark renderer, nicht der marked-Clone")
- ❌ Nicht wie `hnswlib-node` (keine native Konkurrenz — pdf.js ist pure JS, nicht C++ durchgeschliffen)
- ❌ Nicht wie `deep-equal` (keine Short-Input-Hot-Loop-Falle — wir verarbeiten Dokumente, nicht Bytes)

**Benchmark-Gap-Flag:** Prediction ist ohne Spike. Vor Shipping müssen vier Szenarien gemessen werden (siehe unten). Realistischer Median (1 MB PDF) muss ≥3× treffen. 50 KB-Bucket muss ≥2× treffen oder als Yellow-Kante dokumentiert werden.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/pdf-parse` (Drop-in-orientierter Name; API-Shape matcht; Divergenzen dokumentiert wie bei `commonmark` gegen Spec)
- **Primary API sketch:**
  ```ts
  export interface PdfParseResult {
    text: string;
    numpages: number;
    info: Record<string, string>;   // Title, Author, Producer, Creator, CreationDate, ModDate
    metadata: Record<string, string> | null;  // XMP, falls vorhanden
    version: string;   // "1.7" etc.
  }

  export function parse(buf: Buffer | Uint8Array, opts?: {
    max?: number;      // max pages to process (default: all)
    password?: string; // für AES-128 encrypted PDFs
  }): Promise<PdfParseResult>;

  // Synchroner Pfad für kleine PDFs (<500 KB)
  export function parseSync(buf: Buffer | Uint8Array, opts?: ...): PdfParseResult;

  // Batch-Hebel (Fast-Follow in v0.2)
  export function parseMany(
    bufs: Buffer[],
    opts?: { concurrency?: number }
  ): Promise<PdfParseResult[]>;
  ```
- **Must-have benchmark scenarios (Gate):**
  - Small: 50 KB PDF (5 Seiten, englisch, einfacher Text) — Ziel ≥2× vs. `pdf-parse`
  - Medium: 1 MB PDF (50 Seiten, gemischter Text + Tabellen) — Ziel ≥3× (Green-Gate-Hauptfall)
  - Large: 10 MB PDF (500 Seiten, Report mit Grafiken) — Ziel ≥3×
  - Batch: 100 × 200 KB PDFs via `parseMany` — Ziel ≥4× (rayon-Hebel)
- **Acceptance thresholds (Green gate):** ≥2× auf kleinem PDF UND ≥3× auf Median UND ≥3× auf Large. Alles andere wird Yellow-Sprint oder Scope-Cut.
- **Risks:**
  - **Parität auf CJK-Fonts** — muss mit Korpus aus chinesischen/japanischen PDFs validiert werden, Divergenzen dokumentiert
  - **Encrypted-PDF-Coverage** — nur AES-128 + RC4, kein Public-Key
  - **Edge-case-Recovery** — pdf.js hat mehr Recovery-Heuristiken. Corpus-Fuzz-Test nötig (`fast-check` mit malformed byte flips)
  - **Binary-Size** — ~3–5 MB pro Plattform-Target × 6 Targets. Unterhalb `typst`, aber nicht trivial. `lto=true, strip=symbols, panic=abort` Pflicht.
  - **Sync-Interface** — `pdf-parse` ist async (wegen pdf.js), wir können sync anbieten und das ist ein Feature, aber User die auf `await pdf(buf)` stehen müssen ihre Code-Form nicht ändern

## If NO-GO — BACKLOG entry

Nicht zutreffend (GO-Empfehlung).

Section in `BACKLOG.md`: **Under investigation — AI / RAG preprocessing** → Eintrag kann bleiben wo er ist, Status-Update auf "Reviewed GO 2026-04-21, ready for v0.1 spike."
