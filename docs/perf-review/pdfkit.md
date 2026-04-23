# Candidate review: `pdfkit`

> **Status:** GO (als neues Paket, kein Drop-in für `pdfkit`) · **Predicted:** 🟡 Yellow leaning 🟢 Green · **Reviewed:** 2026-04-20
> **Shipped:** v0.1 on branch `claude/crate-performance-audit-6KLOJ` (2026-04-23). Benchmarks pending full bench suite.


## Verdict

`pdfkit`'s fluent-chain API (`doc.text().image().font().addPage().end()`) ist die Bauchform, vor der das `xml`-Post-Mortem direkt warnt: dutzende bis hunderte kleiner FFI-Übergänge pro Dokument. Ein 1:1-Drop-in ist ⚫ Black. Als **neues Paket** mit *document-as-data*-API (ein Spec-Objekt → ein `Buffer`-Return pro Call, plus Batch-API und stateful Font-Cache) läuft es auf dem gleichen Gleis wie `commonmark`/`inflate`: substantieller Compute, Bytes-Out via `Buffer` (flach ~180 ns), keine Chained-Call-Kette über die FFI-Grenze. Für den genannten Median-Use-Case (High-Volume Labels/Tickets) ist die Batch-Form sogar die eigentliche Attraktion.

## JS package

- **npm:** [`pdfkit`](https://www.npmjs.com/package/pdfkit)
- **Downloads:** ~2.3 M/Woche (v0.18.0, Q1 2026)
- **Exports / API surface:** fluent-chainable Builder: `new PDFDocument()`, `.text()`, `.font()`, `.fontSize()`, `.image()`, `.moveTo()`, `.lineTo()`, `.stroke()`, `.addPage()`, `.end()`; `PDFDocument` ist ein readable Node-Stream, typisch via `doc.pipe(fs.createWriteStream(...))` konsumiert
- **Typical input:** imperatives Skript, das dutzende–hunderte Chain-Calls absetzt (Text-Segmente, Koordinaten, Images als Buffer/path, Font-Referenzen)
- **Typical output:** PDF-Bytes, meist 2 KB – 10 MB, über Node-Stream geliefert
- **Realistic median use-case (vom User bestätigt):** **High-Volume Label-/Ticket-Printing** — tausende kleiner PDFs pro Request, jedes ~2–20 KB, fast identische Templates mit variablen Feldern (Adresse, Barcode, ID)

## Rust replacement

- **Candidate crate(s):** `printpdf` (primär — low-level, aktiv gepflegt von fschutt, WASM-tauglich, pure-Rust Deps) · `pdf-writer` (sekundär — minimalistisch, sehr wenig Allocation, aber noch low-leveler) · `krilla` (neuer, high-level, ergonomisch — in Reife-Beobachtung)
- **Maintenance / license:** `printpdf` aktiv, MIT-lizenziert; `genpdf` (als High-Level-Option geprüft) hat seit ~3 Jahren keine Commits → **disqualifiziert**; `lopdf` zu low-level für produktiven Port
- **Known gotchas / divergences:**
  - Font-Embedding: `pdfkit` kommt mit 14 eingebetteten Standard-Type-1-Fonts; in Rust müssen TTFs explizit geladen und subsetted werden (`printpdf` via `ttf-parser`/`owned_ttf_parser`)
  - Bildeinbettung: JPEG direkt, PNG via Decoder — `printpdf` hat beides, aber Color-Space-Handling weicht von `pdfkit` ab
  - Text-Layout: `pdfkit` hat Line-Breaking/Word-Wrapping built-in; `printpdf` erwartet vorgerechnete Koordinaten → v1-Scope auf Labels beschränken, wo Layout trivial ist
  - Pixel-identischer Output mit `pdfkit` **kein Ziel** — das Paket ist explizit nicht kompatibel

## BACKLOG check

Kein bestehender `pdfkit`-Eintrag. Der einzige PDF-Bezug in `BACKLOG.md:12` ist `pdf-parse` (Extraction, nicht Generation) — kein Overlap. Kein Eintrag in `docs/packages.json`.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Pfadabhängig.** Drop-in (pro Chain-Call): trivial (< 1 µs pro `.text()` → FFI dominiert). Neues Paket (pro `generate(spec)`): substantiell (Label ~50–200 µs für Font-Subset + zlib-Stream-Pack) |
| Input size distribution | Drop-in: viele kleine Strings/Zahlen pro Call. Neues Paket: Spec-Objekt (~100 B – 5 KB JSON) pro Label; Batch-Array für 1000 Labels = ~1–5 MB — via `Buffer`/JSON-String beide tolerabel |
| Output size distribution | Labels 2–20 KB, Tickets 5–50 KB, Reports 50 KB – 10 MB. `Buffer`-Return ist flach ~180 ns von 1 KB bis 10 MB (siehe `docs/BASELINE.md:26–30`) — Output-FFI-Kosten vernachlässigbar |
| Reusable setup (stateful potential) | **Hoch.** Font-Parsing + Glyph-Cache kostet pro Font ~5–15 ms cold. Bei 1000 Labels mit gleichem Font wäre das pro Call ein Killer — ein stateful `PdfBuilder`-Class-Pattern (Font einmal laden, viele `generate()` darauf) ist die entscheidende Optimierung |
| Batch-usage realism | **Sehr hoch für den genannten Use-Case.** Label-Printing ist per Definition Batch; `generateMany(specs: LabelSpec[]): Buffer[]` kollabiert 1000 FFI-Crossings zu einem |
| FFI-share estimate vs. Rust work | Drop-in Chain-API: >90% FFI (→ ⚫ Black). Neues Paket single: ~30% bei kleinen Labels (~50 µs Rust-Arbeit, ~15 µs Input-Marshal). Batch 1000: <2% FFI (ein Crossing amortisiert über 1000 Labels) |

## Classification reasoning

Zwei Pfade — zwei Klassifikationen. Die Entscheidung ist API-Form, nicht Rust-vs-JS.

**Pfad A — Drop-in (1:1 Spiegelung der Chain-API) → ⚫ Black.** Jeder `.text()`, `.moveTo()`, `.stroke()` ist ein FFI-Crossing mit String-Args. 1000 Labels × ~30 Chain-Calls = 30 000 FFI-Crossings pro Request. Das ist die exakte Bauchform, die `docs/post-mortems/xml.md:32–40` als katastrophal beschreibt ("~10k FFI crossings — more than the `sax` library's entire JS execution"). Parity-Kosten (Stream-Protocol, Chain-Return-Semantik, Image-Pipeline, Font-Registry) sind hoch, und am Ende ist das Ding langsamer als `pdfkit` in JS. Keine C-Hebel-Kombination rettet das.

**Pfad B — Neues Paket, document-as-data → 🟡 Yellow mit 🟢-Green-Gate erreichbar.** Caller baut ein plain-JS-Spec-Objekt (`{ width, height, elements: [{type: 'text', x, y, value, font}, {type: 'barcode', ...}] }`), ein NAPI-Call konsumiert das und gibt den PDF-`Buffer` zurück. Stateful `PdfBuilder`-Class cached Fonts. `generateMany(specs)` für echten Batch. Das Muster reproduziert exakt `commonmark`'s Green-Form (siehe `docs/perf-review/commonmark.md:1–3`): Bytes-In, Bytes-Out, substantieller Compute pro Byte, kein Object-Traversal, kein Callback-Boundary. Für Labels ist die Layoutarbeit trivial genug, dass `printpdf`'s low-level-Interface ausreicht — das v1-Feature-Set kann bewusst klein bleiben.

Reference patterns: shape resembles `commonmark` (GO neues Paket, bytes-out) und `inflate` (shipped, `Buffer` flat via BASELINE) → 🟢 Green-Shape. NICHT `nanoid`/`mime` (kleine Inputs, trivial per-call).

**Benchmark-Gap-Flag:** Prediction ist qualitativ. Vor Green-Gate müssen die drei Szenarien unten gemessen werden — ohne Zahlen bleibt das Paket auf 🟡 Yellow.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/pdf`
- **Primary API sketch:**
  ```ts
  type FontSpec = { name: string; data: Buffer };
  type LabelSpec = {
    width: number;   // pt
    height: number;  // pt
    elements: Array<
      | { type: 'text'; x: number; y: number; font: string; size: number; value: string }
      | { type: 'barcode'; x: number; y: number; encoding: 'code128' | 'ean13'; value: string }
      | { type: 'image'; x: number; y: number; w: number; h: number; data: Buffer }
      | { type: 'line'; x1: number; y1: number; x2: number; y2: number; width: number }
    >;
  };

  export class PdfBuilder {
    constructor(opts: { fonts: FontSpec[] });  // Fonts einmal laden, parsen, subset-ready cachen
    generate(spec: LabelSpec): Buffer;
    generateMany(specs: LabelSpec[]): Buffer[];   // kritisch für den High-Volume-Use-Case
  }
  ```
  Explizit **nicht** `pdfkit`-kompatibel. Keine chainable Methoden über die FFI-Grenze.
- **Must-have benchmark scenarios:**
  - **Small-single:** ein 4×6-Adresslabel (~2 KB Output, ein Font, 3 Text-Elemente, ein Barcode). Cold-Start und Hot-Path getrennt messen.
  - **Batch-1000 (der eigentliche Median-Case):** ein `generateMany` mit 1000 identisch-geformten Labels, variable Felder. Misst, ob Stateful-Font-Cache + Batch-FFI-Amortisation den versprochenen Gewinn bringen.
  - **Medium 10-Page-Receipt (~50 KB Output):** mehrseitig, mehrere Fonts, Text + Linien + ein Image. Sanity-Check, dass die Architektur über Labels hinaus skaliert.
- **Acceptance thresholds (Green gate):**
  - Batch-1000 ≥ **5×** node `pdfkit` (gesamte Wall-Clock von Build → alle 1000 Buffer)
  - Small-single hot-path ≥ **2×** `pdfkit`
  - Medium 10-Page ≥ **2×** `pdfkit`
  - Cold-Start-Kosten (erster `generate()`-Call inkl. Font-Load) müssen ausgewiesen werden, auch wenn nicht Green-gating — Transparenz-Anforderung aus der Skill-Regel "realistic median explicitly stated"
- **Risks:**
  - **Feature-Scope-Creep:** Sobald User komplexes Text-Wrapping, Tables, SVG oder kerning-akkurates Multi-Font-Layout verlangen, sprengt das `printpdf`'s low-level-Surface. v1 muss dokumentiert auf Labels/Tickets/einfache Receipts beschränkt sein — sonst kippt der Scope in Richtung `genpdf`-Komplexität (und der ist stale).
  - **Font-Subset-Qualität:** `printpdf`-Subsetting ist funktional, aber nicht so glyph-effizient wie `pdfkit`'s fontkit. Output-PDFs könnten ~10–20% größer sein — für Labels irrelevant, für Reports evtl. sichtbar.
  - **Migrations-Positionierung:** Kommunikation muss eindeutig sein: neues Paket für Batch/Label-Workloads, **kein** `pdfkit`-Migrationsziel. Fehl-Positionierung würde GitHub-Issues für pdfkit-Parity generieren, die per Design nicht lösbar sind.
  - **Baseline-Nuancierung:** `docs/BASELINE.md` deckt `echoBuffer` ab, nicht PDF-Compute. FFI-Share-Schätzung oben ist abgeleitet, nicht gemessen. Nach Port sollte ein `_ffi-bench`-Case für PDF-Input-Spec-Marshaling ergänzt werden.

## If NO-GO — BACKLOG entry

Falls der User nach diesem Review auf NO-GO entscheidet (z.B. weil Scope-Risiko über Labels hinaus zu hoch), oder falls wir explizit den Drop-in-Pfad begraben wollen:

```markdown
- **pdfkit (als Drop-in)** (~2.3M/Woche, PDF-Generation via chainable Builder-API). Abgelehnt nach Candidate-Review `docs/perf-review/pdfkit.md`: die Chain-API (`doc.text().image().addPage().end()`) erzeugt dutzende bis hunderte FFI-Crossings pro Dokument — exakt die Form, vor der `docs/post-mortems/xml.md` warnt. Ein *neues* Paket `@amigo-labs/pdf` mit document-as-data-API (ein Spec-Objekt → ein Buffer, plus Batch) ist eine eigenständige Option und nicht durch diese Ablehnung blockiert.
```

Section in `BACKLOG.md`: **FFI overhead > gain / Parity too expensive**
