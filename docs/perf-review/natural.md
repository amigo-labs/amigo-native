# Candidate review: `natural` — Porter/Snowball-Stemmer-Subset

> **Status:** GO (nur als Batch-Only-Subset-Paket `@amigo-labs/stemmer`) · **Predicted:** 🟢 Green (Batch-API) / ⚫ Black (Single-Word-API — bewusst **nicht** exponiert) · **Reviewed:** 2026-04-21

## Verdict

`natural` ist ein riesiges NLP-Toolkit (Stemmer, Tokenizer, Klassifikatoren, Phonetics, Distance-Metriken, WordNet-Interface) — **kein Drop-in-Port möglich**. Der rational tragbare Subset ist **Porter/Snowball-Stemming** via `rust-stemmers`. Die BACKLOG-Warnung ist präzise: `natural.PorterStemmer.stem("word")` ist die typische Call-Form, und ein einzelnes Word-Stem ist in JS ~20–50 ns und in Rust ~40 ns PLUS 109 ns FFI-Floor. Single-Word-API ist **strukturell Black**, es gibt keinen Hebel. Aber `stemMany(words: string[])` oder `stemBuffer(newline-separated: Buffer)` kollabiert 1000+ Stemming-Operationen auf ein FFI-Crossing und ist sauber Green. Der Port verlangt eine bewusste API-Disziplin: **wir bieten keinen `stem(word)`-Einzelaufruf an**.

## JS package

- **npm:** [`natural`](https://www.npmjs.com/package/natural)
- **Downloads:** ~300k/Woche (BACKLOG-Zahl bestätigt, aber gesamtes `natural`-Paket — Stemmer-Subset alleine ist Minderheit)
- **Exports / API surface (relevant subset):**
  - `natural.PorterStemmer.stem(word) → string`
  - `natural.PorterStemmer.tokenizeAndStem(text, keepStops=false) → string[]` ← **das** ist der realistische Call-Path
  - Snowball-Varianten: `PorterStemmerDe`, `PorterStemmerEs`, `PorterStemmerFr`, `PorterStemmerIt`, `PorterStemmerNl`, `PorterStemmerNo`, `PorterStemmerPt`, `PorterStemmerRu`, `PorterStemmerSv`, `AggressiveTokenizerXx`
  - `.attach()`-Pattern: patcht `String.prototype.stem()`. Ignorieren wir.
- **Typical input:**
  - Single-Word: 3–20 Zeichen (den ignorieren wir bewusst)
  - Batch via `tokenizeAndStem(text)`: Text 100 B – 100 KB, tokenize + stem jedes Token
- **Typical output:** Array von gestemmten Tokens, 1–10 000 Tokens
- **Realistic median use-case:** **BM25/TF-IDF-Indexing-Preprocessing** — Dokumente tokenize + stem für Search-Index (siehe `docs/perf-review/wink-bm25-text-search.md` — dort ist der Stemmer ein in-process-Baustein). Zweiter Case: **Klassische Search-Relevanz** als Feature-Prep für eigene Pipelines (elasticsearch-Equivalent im Node-Prozess). Fast NIE ist der Use-Case "ein Wort rein, ein Stem raus" — das ist ein theoretischer Edge-Case, der in Produktions-Code kaum vorkommt.

## Rust replacement

- **Candidate crate(s):**
  - [`rust-stemmers`](https://crates.io/crates/rust-stemmers) — **primär**. Port der Snowball-Reference-Stemmers für 17 Sprachen. MIT, aktiv, von der von Maloku geführten Gruppe mit langer Historie. Kernalgorithmen deterministisch ggü. Snowball-Referenz.
  - [`unicode-segmentation`](https://crates.io/crates/unicode-segmentation) — Baustein für die `tokenizeAndStem`-Integration.
- **Maintenance / license:** `rust-stemmers` MIT/BSD-3-Clause, aktiv. `unicode-segmentation` MIT. Supply-Chain sauber.
- **Known gotchas / divergences:**
  - **Snowball-Output-Parität** gegen `natural` ist ~99 %+ aber nicht 100 %. `natural.PorterStemmerDe` hat historische Abweichungen von der Snowball-Referenz (~10–50 edge-case-Worte pro 10k). Wir folgen **Snowball**, nicht `natural`. Dokumentieren als Divergenz, linken auf snowball.tartarus.org.
  - **Tokenization-Regeln divergieren.** `natural`'s `AggressiveTokenizer` ist sprachsspezifisch. Wir bieten als Default `unicode-words` (via `unicode-segmentation`) und einen `whitespace`-Fallback. Keine 1:1-Parität auf Tokenization.
  - **`.attach()`-Pattern** wird nicht exponiert (String.prototype patching ist API-Sünde).
  - **Stopwords** in `natural` sind hart-eingebaut pro Sprache. Wir bieten sie als optionales Config-Flag an mit Klassifier-Liste (statische Tables, ~100–500 Worte pro Sprache).

## BACKLOG check

Existierender Eintrag: `BACKLOG.md:28`:
> **natural** — Porter/Snowball batch surface only (~300k total). `rust-stemmers`. Single-word-per-call path is a Red trap; port requires deliberately *not* exposing the one-word API.

Die BACKLOG-Analyse ist exakt richtig. Review bestätigt beide Punkte:
1. Batch-API ist Green
2. Single-Word-API ist ⚫ Black (FFI-Floor 109 ns auf 30 ns Rust-Work)

Die Diskussion ist nicht "ob wir porten", sondern "wie diszipliniert wir den Scope ziehen." Antwort: `@amigo-labs/stemmer` ist **kein** Drop-in für `natural`. Es ist ein neues Paket, das den Stemmer-Subset abdeckt.

Kein Eintrag in `docs/packages.json`.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Bimodal.** Single-Word: ~20–50 ns in JS, ~40 ns in Rust. FFI-Floor 109 ns = **>100 % Overhead** — Black. Batch `stemMany(10 000 words)`: ~500 µs – 2 ms JS, Rust ~100–400 µs → **3–5× Speedup**. |
| Input size distribution | Single-String: 3–20 B. Batch als `string[]` 10k × 10 B = 100 KB — Marshalling via `Vec<String>`-Input kostet ~43 ns/Element (BASELINE.md:32 für u32, ~ähnlich für String-Headers) + UTF-Konv. **Muss** als `Buffer` mit internem Delimiter (newline) reinkommen. Dann flat. |
| Output size distribution | Single-Stem: ~3–20 B String. Batch: 10k Output-Strings. Wieder der `Vec<String>`-Antipattern-Fall. Muss als `Buffer` raus (newline-separated). |
| Reusable setup (stateful potential) | **Hoch.** Stemmer-Algorithmus ist per Sprache statisch, aber die Regex-/Lookup-Tables werden Rust-seitig in der Lib eingebettet (`rust-stemmers` ist zero-alloc-init). NAPI-Class `Stemmer('en')` mit Methoden `stemBatch(buf)`, `tokenizeAndStemBatch(text)` ist sauber. Kein Heavy-Setup, aber Class-Scope gehört der Sprach-Auswahl. |
| Batch-usage realism | **Kritisch.** Ohne Batch = Paket unverkäuflich. Mit Batch = Green. Das ist der gesamte Port-Scope. |
| FFI-share estimate vs. Rust work | Batch (10k words): <1 %. Single: >100 % (nicht anbieten). |

## Classification reasoning

Der Kern der Entscheidung ist **API-Disziplin**, nicht Perf:

1. **Single-Word-Stemming ist ein Lehrbuch-Black-Shape.** Gleiche Kategorie wie `mime` (Hashmap-Lookup), `dotenv` (Regex-Parse), `deep-equal` (flat 7-key). Trivial-work-per-call + Short-Input + hot-loop-pattern. Wir haben gelernt: das geht niemals Green. Deshalb **bieten wir die API nicht an**.

2. **Batch-Stemming ist sauber Green.** 10k Words pro Call sind ~200 µs Rust-Work, FFI-Transport via Buffer flat bei ~200 ns. FFI-Share <0,1 %. Snowball-Stemmers sind in `rust-stemmers` hand-optimiert mit statischen Lookup-Tables und kompakten Transform-Regeln.

3. **`tokenizeAndStem(text)` ist der eigentliche Haupt-Hebel.** User rufen NICHT 10000× einzelne `stem()`-Calls. Sie rufen `tokenizeAndStem(document)` auf einem 10 KB-Dokument und bekommen 1000+ gestemmte Tokens. Das ist der Realistic-Median-Case und der ist Green:
   - 10 KB Input → UTF-Konv ~3,5 µs
   - Unicode-segmentation + stemmer-Loop in Rust: ~50–200 µs
   - Output 1000 Tokens in einem Buffer: ~1 KB UTF-Konv ~0,3 µs
   - Total: ~55–210 µs. JS: 500 µs – 2 ms. **Speedup 3–10×**.

4. **Portfolio-Positionierung.** `@amigo-labs/stemmer` würde isoliert ~50k/Woche-TAM (Stemmer-Subset von `natural`-User) bedienen. Das ist low, aber **Integration mit `@amigo-labs/bm25`** ist der eigentliche Value: BM25-Index bauen ohne FFI-Crossing pro Wort. Stemmer wird Rust-intern von BM25 aufgerufen — keine Cross-Crate-FFI.

**Shape-Matching:**
- ✅ Batch-Path wie `xxhash`'s `*Many`-API (nach Phase-C-Fix — Buffer-Output statt Vec<BigInt>)
- ✅ Wie `rust-stemmers` selbst in `tantivy` eingebaut (Stateful-Lib im Search-Stack)
- ❌ Single-Word wie `mime` / `deep-equal` — exakt die Shape, die wir nicht anbieten

**Benchmark-Gap-Flag:** Prediction ist ohne Spike. Szenarien-Gate unten. Ein Single-Word-Vergleichswert muss trotzdem **gemessen** werden um zu zeigen, dass wir ihn zurecht ausschließen — Dokumentations-Artefakt.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/stemmer` (nicht `@amigo-labs/natural` — Drop-in ist nicht Ziel, `natural` ist viel zu groß und vielschichtig)
- **Primary API sketch:**
  ```ts
  export type StemmerLang =
    | 'english' | 'german' | 'french' | 'spanish' | 'italian'
    | 'dutch' | 'portuguese' | 'swedish' | 'norwegian' | 'danish'
    | 'russian' | 'finnish' | 'hungarian' | 'romanian' | 'turkish'
    | 'arabic' | 'greek';

  export class Stemmer {
    constructor(lang: StemmerLang);

    // Batch-only — bewusst KEIN stem(word: string) — das wäre Black
    stemMany(words: string[]): string[];
    stemBuffer(buf: Buffer, delimiter?: '\n' | ' ' | ','): Buffer;   // hot-path

    // Kombiniert tokenize + stem in ein Call
    tokenizeAndStem(text: string, opts?: {
      stopwords?: boolean;
      minTokenLength?: number;
    }): string[];
    tokenizeAndStemToBuffer(text: string, opts?: ...): Buffer;
  }

  // Convenience für einmalige Calls — markiert als slow-path
  export function stemOnce(lang: StemmerLang, word: string): string;
  // ↑ sinnvoll zum Testen, dokumentiert als "don't use in hot loops"
  ```
- **Must-have benchmark scenarios (Gate):**
  - **Batch-10 (stemMany × 10 Wörter):** Ziel ≥1,0× — eigentlich der "kleine Batch"-Grenzfall. Wenn <1×, dokumentieren als Mindest-Batch-Größe 100.
  - **Batch-1000 (stemMany × 1000 Wörter):** Ziel ≥3× (Green-Grenze)
  - **Batch-10 000 (stemMany × 10k):** Ziel ≥5×
  - **tokenizeAndStem auf 10 KB-Text (~1500 Tokens):** Ziel ≥3× (realistic median)
  - **tokenizeAndStem auf 100 KB-Text (~15k Tokens):** Ziel ≥5×
  - **Single-Word (stemOnce, 10k Runs):** Ziel **egal, wird trotzdem gemessen** — wenn <1× dokumentieren wir es als "expected Black for single-word path, use batch API"
- **Acceptance thresholds (Green gate):** ≥3× auf `tokenizeAndStem` 10 KB UND ≥3× auf Batch-1000 UND ≥5× auf Batch-10 000. Single-Word ist nicht Teil des Gates.
- **Risks:**
  - **User-Erwartung an Drop-in-Form** — viele werden `import natural` erwarten. Migration-Guide Pflicht, mit expliziter `stem()` → `stemMany()`-Umschreibung
  - **Snowball-vs-natural-Divergenz** — `natural` ist nicht vollständig Snowball-konform; wir sind. Edge-Case-Wort-Divergenzen dokumentieren
  - **Sprach-Scope** — `natural` hat 10 Sprachen, `rust-stemmers` 17. Wir shippen alle 17. Binary-Size ~500 KB – 1 MB für alle Tables (feature-gated per Sprach-Auswahl in Cargo-Features, User können im Cargo-Config nur ihre Sprachen linken — oder wir bauen separate npm-Pakete pro Sprach-Gruppe, Fast-Follow)
  - **Portfolio-Stand-Alone-Thin** — das Paket lebt hauptsächlich von der Integration mit `@amigo-labs/bm25`. Muss das klar in `docs/packages.json`-Description stehen

## If NO-GO — BACKLOG entry

Nicht zutreffend (GO-Empfehlung, aber mit Scope-Einschränkung).

Section in `BACKLOG.md`: **Under investigation — AI / RAG preprocessing** → Eintrag umstellen auf "Reviewed GO 2026-04-21 als **Batch-Only-Subset** (`@amigo-labs/stemmer`, nicht `natural`-Drop-in). Single-Word-API bewusst nicht exponiert. Empfohlen v1 nach `@amigo-labs/bm25` — beide Pakete teilen Stemmer-State."
