# Candidate review: `franc` / `cld`

> **Status:** GO (als neues Paket, Min-Input-Length gated) · **Predicted:** 🟡 Yellow (Green auf Paragraph, Red auf Short-String) · **Reviewed:** 2026-04-21

## Verdict

Language-Detection ist ein **input-length-getriebener Shape**: auf einem Absatz (500+ Zeichen) ist Trigramm-Matching gegen 100+ Sprach-Modelle echte CPU-Arbeit und `whatlang`/`lingua-rs` liefert saubere 3–8×-Speedups. Auf kurzen Strings (50 Zeichen Tweet, "Hello world") ist der Rust-Kernel selbst <10 µs und FFI-Floor dominiert — `franc` in pure JS hat dort strukturell keinen FFI-Abstand zu überbrücken. Die BACKLOG-Warnung ist exakt korrekt: **gate on realistic median string length**. Empfehlung: Port mit dokumentierter **Min-Input-Length von 100 Zeichen** im Paket-README, plus eine `detectIfLong(text, minLength=100)`-Convenience, die unter der Grenze `null` zurückgibt statt zu "raten". Das verhindert die Falle, dass User den Tweet-Use-Case fälschlicherweise benchen.

## JS package

- **npm:**
  - [`franc`](https://www.npmjs.com/package/franc) — Trigramm-basiert, 414 Sprachen, "franc-min" (82 Spr.) und "franc-all" (414 Spr.). ~250k/Woche.
  - [`cld`](https://www.npmjs.com/package/cld) — Wrapper um Google's Compact Language Detector 2 (C++). ~150k/Woche.
  - [`languagedetect`](https://www.npmjs.com/package/languagedetect) — alternative pure-JS Detection. ~100k/Woche.
- **Downloads:** `franc` ~250k, `cld` ~150k, `languagedetect` ~100k ≈ **~500k/Woche kombiniert** (BACKLOG-Zahl bestätigt, Q1 2026)
- **Exports / API surface:**
  - `franc(text, opts?) → ISO-639-3-code` ("eng", "deu", etc.)
  - `francAll(text, opts?) → Array<[code, score]>` (top-N mit Confidence)
  - Options: `minLength=10`, `only=[...]`, `ignore=[...]`, `whitelist=[...]`
  - `cld.detect(text) → Promise<{ reliable, textBytes, languages: [...] }>`
- **Typical input:**
  - Tweet: 50–280 B (problematisch)
  - Chat-Message: 100–2000 B (grenzwertig)
  - Paragraph: 500 B – 10 KB (Green)
  - Article: 10 KB – 1 MB (klar Green)
- **Typical output:** 3-Buchstaben-Sprach-Code + optional Confidence-Scores für Top-N. Sehr klein.
- **Realistic median use-case:** **Inbound-Content-Filter für Multilingual-Apps** — eingehende User-Content (Kommentare, Reviews, Support-Tickets) bekommt Sprach-Tag für Routing/Übersetzung. Median-Input ~200–500 B (gelegentlich Tweet-klein). Zweiter Case: **Content-Corpus-Classification** für Batch-Pipelines (Web-Scrape-Output klassifizieren bevor NLP). Dort sind Inputs deutlich länger (Paragraph+).

## Rust replacement

- **Candidate crate(s):**
  - [`whatlang`](https://crates.io/crates/whatlang) — **primär**. ~87 Sprachen, Trigramm-basiert wie `franc`, sehr kleiner Footprint (~200 KB inkl. Tables), MIT. Aktiv.
  - [`lingua-rs`](https://crates.io/crates/lingua) — Rust-Port von [`lingua-py`](https://github.com/pemistahl/lingua-py). ~75 Sprachen, deutlich höhere Genauigkeit auf kurzen Strings durch statistische Language-Models (nicht nur Trigramme). ABER: Binary ist ~100+ MB wegen eingebetteter Language-Models. Nicht shipbar für `@amigo-labs`-Policy.
  - [`cld2`](https://crates.io/crates/cld2) — Rust-Binding zu C++ CLD2. Das wäre der `hnswlib-node`-Fehler (native-Lib-Wrapper).
- **Maintenance / license:** `whatlang` MIT, aktiv, solide. Supply-Chain sauber.
- **Known gotchas / divergences:**
  - **Sprach-Set-Divergenz.** `franc-all` hat 414 Sprachen (inkl. Konstruierte, historische, minimale Datenbasis), `whatlang` 87. Für `@amigo-labs` ist 87 die richtige Wahl — die restlichen 300+ Sprachen haben in `franc-all` ohnehin unreliable Detection (<5 % Precision auf kurzen Inputs).
  - **`franc-min` vs. `whatlang`:** `franc-min` (82 Sprachen) ist nahezu 1:1-Abdeckung mit `whatlang`. Dort ist Parität machbar.
  - **Confidence-Score-Skala ist arbiträr.** `franc` gibt Trigramm-Match-Score (0–1), `whatlang` hat eigene Confidence-API. Scores sind **nicht** direkt vergleichbar zwischen Libraries. Wir dokumentieren unsere Scale.
  - **ISO-639-3 vs. ISO-639-1.** `franc` nutzt 639-3 (3-Buchstaben, "eng"), `whatlang` hat beide. Drop-in-Kompatibilität mit `franc` = 639-3 Default.
  - **Short-string Unreliability** ist **nicht** divergenz-spezifisch, sondern fundamental. Alle Libraries sind unreliable unter ~20 Zeichen. `lingua-rs` etwas besser, aber der Binary-Cost steht in keinem Verhältnis.

## BACKLOG check

Existierender Eintrag: `BACKLOG.md:29`:
> **franc** / **cld** — language detection (~500k combined). `whatlang` / `lingua-rs`. Paragraph-size green, short-string red — gate on realistic median string length.

Die BACKLOG-Analyse ist exakt. Review bestätigt beide Punkte und fügt hinzu: `lingua-rs` ist aus Binary-Size-Gründen disqualifiziert. `whatlang` ist das einzige praktische Target.

Abgrenzung zu bestehenden Reviews:
- Gegen `docs/perf-review/natural.md` (Stemmer-Batch): beides sind NLP-Preprocessing, aber language-detection ist typischerweise **ein-Call-pro-Inhalt** (nicht batch-dominant wie Stemmer).
- Keine Overlap mit bestehenden Crates.

Kein Eintrag in `docs/packages.json`.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Stark input-abhängig.** 50 B Input: Trigramm-Scan über ~10 Trigramme × 87 Sprach-Modelle ≈ 5 µs Rust. JS ~10–20 µs. Speedup <2× wegen 1–2 µs FFI-Share. 500 B: ~50 µs Rust, ~200 µs JS → 3–4×. 5 KB: ~400 µs Rust, ~2 ms JS → 4–5×. 50 KB: ~4 ms Rust, ~20 ms JS → 5×. |
| Input size distribution | String-Input. UTF-Konv ~0,35 ns/byte (BASELINE.md). 50 B Input: ~20 ns Konversion, vernachlässigbar. 50 KB: ~17 µs Konversion, 0,5 % von Rust-Compute. OK über die gesamte Distribution. |
| Output size distribution | `franc()` → 3-Byte-String. `francAll()` → kleines Array (Top-10 mit Scores). Alles <1 KB Output. Negligible. |
| Reusable setup (stateful potential) | **Hoch, aber anders gewichtet.** Sprach-Modelle (Trigramm-Tables) werden bei Lib-Init einmal geladen, nicht pro Call. Wenn User `only=['eng','deu','fra']` setzt, wäre eine `Detector({only: [...]})`-Class günstig (pre-filtered Models). NAPI-Class optional, nicht kritisch für v1. |
| Batch-usage realism | **Mittel.** Viele User haben Listen von Strings (Review-Corpus, Chat-Message-Log). `detectMany(texts: string[]) → string[]` ist ein reasonable Hebel. Rayon-parallelisierbar. |
| FFI-share estimate vs. Rust work | Tweet (50 B): ~50 %. Paragraph (500 B): ~5 %. Article (50 KB): <0,5 %. |

## Classification reasoning

Language-Detection scheidet sich scharf am Input-Length:

1. **Tweet-Bucket (<100 B): Red-zu-Black.** Rust-Work ist <10 µs, FFI-Floor 109 ns + Input-UTF-Konv ~50 ns + Output-String-Return ~200 ns ≈ **350 ns Overhead auf ~10 µs Work = 3,5 %**, klingt OK, aber pure-JS-`franc` auf derselben Mini-Call ist ~10–20 µs. Speedup ~1,5–2× — Yellow-grenzig. Bei sehr kurzen Inputs (unter 50 B, "test", "hello") kippt das auf <1,5×. Also:
   - >100 B Input: klar Green (4–5×)
   - 50–100 B: Yellow (2–3×)
   - <50 B: Red (≤1,5×)

2. **Paragraph/Article-Bucket (>500 B): klar Green.** 4–5× Speedup, FFI-Share <5 %. Hauptsell.

3. **Detection-Genauigkeit ist unabhängige Variable.** Die BACKLOG-Warnung ist perf-fokussiert, aber der funktionale Grund für Min-Length ist **Reliability**: alle Language-Detector sind unter 20 B Bullshit. Das ist nicht unser Problem — das ist physikalisch. Wir dokumentieren `minLength=10` als Default-Guard (analog `franc`).

4. **Rust-Gewinn kommt nicht von Trigramm-Loop sondern von Unicode-Normalization.** `franc` macht relativ viel Overhead in JS für Unicode-Normalisierung und Trigramm-Extraktion (Regex-basiert). Rust `whatlang` nutzt optimierte Char-Iteration. Der Hot-Loop ist kompakter.

5. **`lingua-rs` wäre die perf+accuracy-Option, ist aber disqualifiziert.** 100+ MB Binary × 6 Plattformen = 600+ MB Paket-Gesamt-Größe. Das bricht die "Zero Dependencies + Small Bundle"-Positionierung fundamental. Auch feature-gating die eingebetteten Modelle runterkürzt kaum unter 30 MB per Target (Sprach-Modelle sind das Paket). Permanent NO-GO für lingua-rs.

**Shape-Matching:**
- ⚠️ Bimodale Shape wie `@langchain/textsplitters` (Tweet = Red-Zone, Paragraph = Green)
- ✅ Stateless-Compute wie `slugify` (kein NAPI-Class nötig, ein Call pro Operation)
- ❌ Nicht wie `deep-equal` (keine Hashmap-Lookup — echte Statistik pro Char)
- ❌ Nicht wie `mime` (keine Einzel-Lookup — Trigramm-Scan ist Algorithmus)

**Benchmark-Gap-Flag:** Kritisch — fünf Input-Size-Buckets nötig (10 B / 50 B / 200 B / 500 B / 5 KB / 50 KB). Ohne den 50 B-Cut-Off-Punkt kennen wir den Break-Even nicht. Gate-Regel: Cut-Off muss unter 100 B liegen, sonst müssen wir die Min-Length-Guard höher setzen und das schadet der Drop-in-Nutzbarkeit.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/language-detect` (nicht `@amigo-labs/franc` — wir matchen `franc`-API aber sind Superset in Semantik; auch nicht `@amigo-labs/lang` weil zu generisch)
- **Primary API sketch:**
  ```ts
  // ISO-639-3 Codes, kompatibel mit franc
  export type LangCode = 'eng' | 'deu' | 'fra' | 'spa' | ... ;  // 87 whatlang-Sprachen

  export interface DetectOptions {
    minLength?: number;          // default 10 (wie franc)
    only?: LangCode[];           // nur diese Sprachen prüfen
    ignore?: LangCode[];         // diese Sprachen ausschließen
  }

  // Default: franc-kompatibler Return-Code ('eng', 'deu', 'und' wenn unklar/zu kurz)
  export function detect(text: string, opts?: DetectOptions): LangCode;

  // Top-N Alternative mit Confidence
  export function detectAll(
    text: string,
    opts?: DetectOptions & { limit?: number }
  ): Array<[LangCode, number]>;

  // Batch-Hebel
  export function detectMany(texts: string[], opts?: DetectOptions): LangCode[];

  // Safe-Default: returns null für Inputs unter minLength statt 'und' zu raten
  export function detectIfLong(text: string, opts?: DetectOptions): LangCode | null;

  // Stateful für repeat-Calls mit gleicher only-Liste (optional v0.2)
  export class LanguageDetector {
    constructor(opts?: DetectOptions);
    detect(text: string): LangCode;
    detectAll(text: string, limit?: number): Array<[LangCode, number]>;
  }
  ```
- **Must-have benchmark scenarios (Gate):**
  - **Tiny (10 B, "hello"):** Ziel ≥1,0× (Parität minimum, unter 1× ist Red)
  - **Tweet (50 B):** Ziel ≥1,5× (Yellow-Grenze)
  - **Short-Chat (200 B):** Ziel ≥2× (Green-Grenze)
  - **Paragraph (500 B – 2 KB):** Ziel ≥3× (Green-Hauptfall)
  - **Article (10–50 KB):** Ziel ≥5× (Green-Large)
  - **Batch 1000 × Paragraph:** Ziel ≥4× (rayon-Hebel)
  - **Cross-Baseline:** zusätzlich gegen `cld` (Native-Wrapper) und `languagedetect` (pure JS) laufen, um Kategorie-Position zu platzieren
- **Acceptance thresholds (Green gate):** ≥3× auf Paragraph UND ≥2× auf Short-Chat UND ≥1× auf Tiny. Tweet-Grenze (≥1,5×) ist Yellow-OK wenn dokumentiert.
- **Risks:**
  - **Confidence-Score-Drift vs. franc** — User die auf Score-Thresholds parsen (z.B. "ignore if score < 0.3") brechen. Migration-Guide Pflicht
  - **Sprach-Set-Divergenz** — `franc-all`-User mit seltenen Sprachen (Klingon, Mittelhochdeutsch) sind nicht migrierbar. Dokumentieren als akzeptable Scope-Einschränkung
  - **Short-String-Unreliability** — physikalische Grenze, nicht Bug. README muss explizit warnen
  - **Batch-Output-Marshalling** — `Vec<LangCode>` (3-Byte-Strings) ist Rohstoff der `xxhash`-Batch-Falle. Für Batch entweder `Buffer` mit fixen 4-Byte-Slots (3-Byte-Code + \0) oder die Pro-Element-Konversions-Kosten akzeptieren (pro-Code ist klein; 180 ns × 1000 = 180 µs, OK wenn Rust-Work 1000× mehr ist)
  - **Binary-Size** — `whatlang` + Trigramm-Tables ~300–500 KB pro Target. Akzeptabel

## If NO-GO — BACKLOG entry

Nicht zutreffend (GO-Empfehlung).

Section in `BACKLOG.md`: **Under investigation — AI / RAG preprocessing** → Eintrag bleibt, Status-Update auf "Reviewed GO 2026-04-21 (Yellow-predicted, Green auf Paragraph/Article). `whatlang` als Engine; `lingua-rs` disqualifiziert (Binary-Size 100+ MB). Min-Length-Guard im API explizit."
