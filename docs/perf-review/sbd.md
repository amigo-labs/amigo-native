# Candidate review: `sbd` — Sentence Boundary Detection

> **Status:** GO (als neues Paket `@amigo-labs/sentences`, mit offset-basierter Zero-Copy-API als Kernhebel) · **Predicted:** 🟡 Yellow leaning 🟢 (bei Offset-API), 🟡 Yellow (bei Strings-Array-API) · **Reviewed:** 2026-04-21

## Verdict

Sentence Boundary Detection ist **Regeln-basiert** (Abkürzungs-Liste + Quote-/Ellipsis-Heuristiken + UTF-8-aware Tokenisierung) und hat genau die richtige Compute-Größenordnung für FFI-Wins auf Paragraph-Inputs: ~50–500 µs Rust-Arbeit pro Call, Input ist ein einzelner String. Der Knackpunkt ist die **Output-Form**. Wenn wir `Vec<String>` zurückgeben (100–500 Sätze × Marshalling-Kosten), fressen wir den Rust-Gewinn teilweise wieder auf — Yellow-Range. Wenn wir eine **Offset-basierte API** als Haupt-Pfad bauen (`splitToOffsets(text) → Uint32Array`), bleibt das FFI-Crossing flat und die JS-Seite kann lazy slicen. Das ist die `xxhash`-Lehre (Buffer-Output statt Vec<BigInt>) auf Segment-Offsets angewendet. Parity gegen `sbd` auf der Abkürzungs-Tabelle ist tractable — `sbd` ist klein und gut dokumentiert — aber wird nicht bit-exakt. Parity gegen **Pragmatic Segmenter** (die Ruby-Referenz hinter `sbd`) ist das realistische Ziel.

## JS package

- **npm:** [`sbd`](https://www.npmjs.com/package/sbd)
- **Downloads:** ~200k/Woche (BACKLOG-Zahl bestätigt, Q1 2026)
- **Exports / API surface:**
  - `sbd.sentences(text, options?) → string[]`
  - Options: `newline_boundaries`, `html_boundaries`, `html_boundaries_tags`, `sanitize`, `allowed_tags`, `preserve_whitespace`, `abbreviations`
  - Kein Stateful-API, kein Callback
- **Typical input:** Paragraph/Document. 100 B – 100 KB. Median 2–20 KB (typischer Blog-Artikel / Nachrichtentext)
- **Typical output:** Array von Sentence-Strings. Typisch 5–500 Sätze, je 50–300 Zeichen
- **Realistic median use-case:** **NLP-Preprocessing** — Text → Sätze für (a) Embedding-per-Sentence (RAG-Fine-Grain-Retrieval), (b) Translation-per-Sentence (Chunk-Granular-Translate), (c) Summarization-Input-Splitting, (d) Sentence-Level-Classification (Sentiment). In allen Fällen: **ein Call pro Dokument**, Dokument-Anzahl variabel (online ~1/User-Action, batch ~1k–100k/Job).

## Rust replacement

- **Candidate crate(s):**
  - [`pragmatic-segmenter`](https://crates.io/crates/pragmatic-segmenter) — **primär.** Rust-Port der Ruby `pragmatic_segmenter` (die Referenz-Implementation, die `sbd` als Inspiration nutzt). MIT, ~2k⭐ aus Research-Community, aber **Maintenance-Status Q1 2026 prüfenswert** (letzte Commits älter als 6 Monate beim letzten Check). Bei fehlender Pflege: Fork oder eigene Impl.
  - [`rust-nlp`](https://crates.io/search?q=rust-nlp) Sentence-Splitter ist fragmentiert, keine dominante Crate.
  - [`unicode-segmentation`](https://crates.io/crates/unicode-segmentation) — Baustein für Grapheme-Cluster-Boundaries (UTF-8-aware tokenisieren).
  - **Custom-Port**: `sbd` selbst ist <500 Zeilen JS, direkt portierbar. Plus `pragmatic_segmenter`'s Abkürzungs-Tabelle (public domain, ~2000 Einträge). Total ~1500 Zeilen Rust — tractable.
  - [`nnsplit`](https://crates.io/crates/nnsplit) — ML-basierter Ansatz (ONNX-Modell). Disqualifiziert aus Binary-Size + Reproducibility-Gründen (ML-Modell-Updates = Divergenzen pro Release).
- **Maintenance / license:** `pragmatic-segmenter` MIT, Maintenance-Zustand zu verifizieren. Bei Issues: Fork oder eigene Impl. Supply-Chain bei custom port sauber.
- **Known gotchas / divergences:**
  - **Abkürzungs-Liste** — `sbd` hat einen built-in englischen Satz (~400 Einträge) plus User-Custom-Liste. `pragmatic_segmenter` hat sprachspezifische Listen für 12+ Sprachen (~2000 Gesamt). Wir shippen die `pragmatic_segmenter`-Menge als default. Divergenz zu `sbd` auf edge-cases mit ungewöhnlichen Abkürzungen.
  - **HTML-Handling.** `sbd` hat `html_boundaries` und `allowed_tags` — wir ziehen das aus dem Scope (HTML-Sanitization ist `@amigo-labs/sanitize-html`-Job, keine Doppel-Logik). Dokumentieren als: "preprocess your HTML to plain text first."
  - **Newline-Semantik.** Ob `\n\n` ein Sentence-Boundary ist oder nicht, hängt von `newline_boundaries`-Option ab. Wir matchen das 1:1.
  - **Quote-Balancing** — "He said 'Hello. World.'" soll NICHT nach "Hello." splitten wenn innerhalb Quote. Das ist eine der Stellen wo Implementierungen divergieren.
  - **`preserve_whitespace`.** `sbd` hat Option zum Trim-ing oder Beibehalten. Parity-relevant für Downstream-Tools die auf exact-offsets rechnen.

## BACKLOG check

Existierender Eintrag: `BACKLOG.md:30`:
> **sbd** — sentence boundary detection (~200k). `pragmatic_segmenter`-style Rust. Parity with Pragmatic's abbreviation rules is real work but tractable.

Die BACKLOG-Analyse ist präzise. Review bestätigt: Parity ist tractable, aber Output-Shape ist der verstecktere Hebel.

Abgrenzung:
- Gegen `docs/perf-review/langchain__textsplitters.md`: Sentence-Splitting ist **ein** Text-Splitting-Ansatz (char-basiert ist der andere). `@langchain/textsplitters.MarkdownTextSplitter` nutzt intern Sentence-aware-Logik. Integration denkbar — wenn wir beide Pakete bauen, könnte `@amigo-labs/text-splitters` die Sentence-SPD als Option haben.
- Gegen `docs/perf-review/natural.md` (Stemmer-Batch): komplementär, nicht Konflikt. Sätze splitten → Worte tokenisieren → Worte stemmen ist die klassische Pipeline.

Kein Eintrag in `docs/packages.json`.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Medium.** 2 KB Input (~10 Sätze): ~20–50 µs Rust-Compute (Tokenize + Regex-Pattern-Match auf Abbrev-Table + Boundary-Emit). JS ~100–300 µs. 20 KB Input (~100 Sätze): ~200–500 µs Rust, ~1–3 ms JS. Speedup 3–6×. FFI-Share ~1–5 %. |
| Input size distribution | String 100 B – 100 KB. UTF-Konv 0,35 ns/byte = 35 µs für 100 KB — auf ~5 ms Rust-Compute = 0,7 %. Akzeptabel über ganze Distribution. |
| Output size distribution | **Das ist das Design-Risiko.** 100 Sätze × (UTF-8→UTF-16-Konversion + V8-String-Object-Alloc) ≈ 100 × (~200 ns + 150-Zeichen × 0,35 ns/byte) = ~60 µs allein für Output-Marshalling. Auf 500 µs Rust-Compute = **12 % Overhead**. 500 Sätze → ~300 µs Overhead auf 2 ms Rust = 15 %. Beides grenzwertig Green. **Offset-API eliminiert das:** `Uint32Array` mit N×2 Werten (start, end per sentence) ist <10 µs für 500 Sätze. |
| Reusable setup (stateful potential) | **Mittel.** Abkürzungs-Tables pre-kompiliert in Rust, kein Setup pro Call. Regex-Patterns werden lazy-static einmal kompiliert. Kein stark-gewinnender NAPI-Class-Fall. `LanguageDetector(lang='en')`-Class optional als v0.2. |
| Batch-usage realism | **Hoch.** Batch-Workloads (Document-Corpus-Processing) profitieren stark. `splitBatch(texts: string[]) → string[][]` oder `splitBatchToOffsets(texts) → Buffer`. Rayon-parallelisierbar, jeder Doc unabhängig. |
| FFI-share estimate vs. Rust work | Mit Strings-Output: 10–20 % (Yellow-Territorium bei kleinen Inputs). Mit Offset-Output: <2 % (klar Green über Distribution). |

## Classification reasoning

`sbd` ist ein **Klassik-Output-Shape-Problem** — Rust-Compute dominiert, aber der Retour-Weg frisst den Win teilweise auf:

1. **Standard `Vec<String>`-Output klassifiziert Yellow.** 500 Sätze × Marshalling-Overhead = non-trivial. Speedup realistisch 2,5–4× je nach Input-Größe — Yellow-Territorium (≥2× aber <3× konsistent).

2. **Offset-basierter API-Hot-Path holt Green.** Rust gibt `Uint32Array` von (start, end)-Paaren zurück. JS-Caller slice nach Bedarf. Für Downstream-Tools (Embedding-per-Sentence) ist das sogar angemessener weil sie die Offsets behalten wollen (für Highlighting). Dieser Pfad pusht auf 3–5× Speedup, klar Green.

3. **Parity-Frage ist das eigentlich-harte Stück**, nicht Perf. `sbd`-User erwarten Drop-in-Sentence-Arrays. Wir haben zwei Optionen:
   - **Tight-Parity-Mode:** emuliere `sbd`'s Abbrev-Liste + Heuristiken exakt. Aufwand: 2–4 Tage Conformance-Work. Divergenzen dokumentiert in `__conformance__/divergences.md`.
   - **Pragmatic-Segmenter-Mode:** nutze die Ruby-Referenz. Divergenzen von `sbd` sind explizit erwartet. Migrations-Guide: "we're closer to pragmatic-segmenter than to sbd."
   Empfehlung: Pragmatic-Mode als Default, `sbd`-Compat-Flag als Option für Legacy-User.

4. **Multi-language-Support ist unerwartet-großer Win.** `sbd` ist englisch-zentriert; `pragmatic_segmenter` hat 12+ Sprachen. Wenn wir multilingual shippen, ist das ein Feature-Vorteil, nicht nur Speed.

5. **Weder `languageDetect`-Dependency noch ML.** `sbd` verlangt Sprach-Annahme vom Caller (english default). Wir übernehmen das: Sprach-Option im API, kein Auto-Detection. Sonst hätten wir eine Dep-Kette auf `@amigo-labs/language-detect`.

**Shape-Matching:**
- ✅ Output-Shape wie `xxhash` pre-fix (`Vec<BigInt>` war Yellow, Buffer-Output wurde Green) — **gleiche Lehre anwenden**
- ✅ Per-Document-Call wie `commonmark` (String-in / Array-out, aber wir können Output-Typ wählen)
- ⚠️ Output-Heavy Shape: die Anzahl Output-Elemente (Sätze) kann mit Input linear wachsen, daher Offset-API-Empfehlung
- ❌ Nicht wie `mime` (Regel-Engine ist echter Compute, nicht Hash-Lookup)

**Benchmark-Gap-Flag:** Drei Bench-Dimensionen nötig:
1. Input-Größe (2 KB / 20 KB / 100 KB)
2. Output-API (`sentences(text) → string[]` vs. `splitToOffsets(text) → Uint32Array`)
3. Batch (`splitBatchToOffsets(100 × 10 KB)`)

Ohne die zweite Dimension (Output-Variante) können wir nicht entscheiden, ob der Offset-Hot-Path den Green-Push liefert.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/sentences` (nicht `@amigo-labs/sbd` — Drop-in ist scoped auf Pragmatic-Segmenter-Parity, nicht `sbd`-bit-exact)
- **Primary API sketch:**
  ```ts
  export type SbdLanguage = 'en' | 'de' | 'fr' | 'es' | 'it' | 'nl' | 'pt' | 'ru' | 'ja' | 'zh' | 'ar';

  export interface SplitOptions {
    language?: SbdLanguage;         // default 'en'
    newlineBoundaries?: boolean;     // default false
    preserveWhitespace?: boolean;    // default false
    customAbbreviations?: string[];  // merge in Rust
  }

  // Haupt-Drop-in Form — string[]-Output (Yellow-path, dokumentiert)
  export function split(text: string, opts?: SplitOptions): string[];

  // Zero-copy-Hot-Path — Offset-API (Green-path)
  export function splitToOffsets(text: string, opts?: SplitOptions): Uint32Array;
  // Return: [start0, end0, start1, end1, ...]; caller: text.slice(start, end)

  // Batch-Hebel
  export function splitBatch(texts: string[], opts?: SplitOptions): string[][];
  export function splitBatchToOffsets(texts: string[], opts?: SplitOptions): Uint32Array[];

  // Stateful für repeat-Calls mit gleicher lang/custom-abbrev (v0.2)
  export class SentenceSplitter {
    constructor(opts?: SplitOptions);
    split(text: string): string[];
    splitToOffsets(text: string): Uint32Array;
  }
  ```
- **Must-have benchmark scenarios (Gate):**
  - **Short (500 B, ~3 Sätze):** `split()` Ziel ≥1,5×. `splitToOffsets()` Ziel ≥2×.
  - **Medium (5 KB, ~25 Sätze):** `split()` Ziel ≥2,5×. `splitToOffsets()` Ziel ≥4× (Green-Grenze).
  - **Long (50 KB, ~250 Sätze):** `split()` Ziel ≥3× (Yellow-Upgrade). `splitToOffsets()` Ziel ≥5× (Green).
  - **Very long (100 KB, ~500 Sätze):** `splitToOffsets()` Ziel ≥5×. `split()` wird hier am wahrscheinlichsten Yellow.
  - **Batch 100 × 5 KB:** `splitBatchToOffsets` Ziel ≥5× (rayon-Hebel).
  - **Parity corpus:** 1000 Pragmatic-Segmenter Testfälle müssen mindestens 98 % matchen. `sbd`-Parity: ≥95 % akzeptabel mit dokumentierten Divergenzen.
- **Acceptance thresholds (Green gate):** `splitToOffsets` muss ≥4× auf Medium UND ≥5× auf Long treffen. `split` darf Yellow bleiben (dokumentiert); wenn wir ≥3× auf Medium treffen, upgrade auf Green. Single-Entry-API `split` ≤1,5× auf Short ist Red.
- **Risks:**
  - **Maintenance von `pragmatic-segmenter` crate** — bei Inaktivität: Fork oder Custom-Impl planen. ~3-5 Tage Aufwand
  - **Abbrev-Liste Dritt-Sprache-Coverage** — Russisch/Chinesisch/Arabisch sind in der Ruby-Referenz weniger getestet. Shipping mit `en/de/fr/es/it` erst + Fast-Follow für die anderen
  - **Parity-Erwartung gegen `sbd`** — drop-in-Anspruch nicht stellen; explicit "Pragmatic-Segmenter-Portierung, `sbd`-kompatibel für 95 % der Inputs"
  - **Output-API-Diskussion im README** — User müssen aktiv zum Offset-Pfad gedreht werden für Hot-Paths. Migrations-Beispiele mit Before/After-Benchmarks
  - **Binary-Size** — Abbrev-Tables + Unicode-Tables ~200–400 KB, akzeptabel

## If NO-GO — BACKLOG entry

Nicht zutreffend (GO-Empfehlung).

Section in `BACKLOG.md`: **Under investigation — AI / RAG preprocessing** → Eintrag bleibt, Status-Update auf "Reviewed GO 2026-04-21 (Yellow predicted mit Vec<String>, Green mit `splitToOffsets`-Hot-Path). Multi-language via `pragmatic-segmenter` (oder Fork falls unmaintained). `sbd`-bit-parity ist nicht Ziel; Pragmatic-Segmenter-Parity ist."
