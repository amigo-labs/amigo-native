# Candidate review: `minisearch`

> **Status:** GO (als neues Paket, zusammen mit `@amigo-labs/bm25` aus geteiltem Rust-Core) · **Predicted:** 🟢 Green (Build + Fuzzy-Search) / 🟡→🟢 (Exact-Query) · **Reviewed:** 2026-04-21

## Verdict

`minisearch` ist die Portfolio-**Kategorie-Spitze** im lexikalischen Search-Markt (~100k/Woche gegen `wink-bm25-text-search`'s ~10k) — es hat BM25 plus Fuzzy-Match plus Autosuggest in einem Paket. Die Green-Shape ist identisch zu `wink-bm25-text-search` (stateful Index als NAPI-Class, Build→Serialize→viele-Queries), aber der Fuzzy-Match-Path (Levenshtein-distance-tolerant term matching) hat **zusätzlichen Rust-Compute-Hebel** weil Fuzzy-Search in JS über Strings brutforce-ig ist. Die Strategie: **ein Rust-Core** (`@amigo-labs/search-core`-Crate, nicht publiziert), zwei npm-Pakete darüber (`@amigo-labs/bm25` für wink-kompatible Shape, `@amigo-labs/minisearch` für mini-kompatible Shape). Das verdoppelt Markt-Abdeckung bei marginalem Extra-Aufwand. BM25-Core + Fuzzy-Match via `rust-fst`-LevenshteinAutomaton + Prefix-Autosuggest via `fst` wäre elegant.

## JS package

- **npm:** [`minisearch`](https://www.npmjs.com/package/minisearch)
- **Downloads:** ~100k/Woche (Q1 2026), der klare Kategorie-Marktführer für in-process JS-Search
- **Exports / API surface:**
  - `new MiniSearch({fields, storeFields?, searchOptions?, tokenize?, processTerm?})` — Constructor
  - `.add(doc)`, `.addAll(docs)`, `.addAllAsync(docs)` — Index-Build
  - `.discard(id)`, `.replace(doc)` — Mutation
  - `.search(query, opts?) → SearchResult[]` — mit `opts.fuzzy`, `opts.prefix`, `opts.combineWith`, `opts.filter`, `opts.boost`
  - `.autoSuggest(queryPrefix, opts?) → Suggestion[]`
  - `.toJSON()` / `MiniSearch.loadJSON(json, opts)` — Persistence
  - `.has(id)`, `.getStoredFields(id)`, `.documentCount`
- **Typical input:**
  - **Build:** 1k – 100k Docs. Jedes Doc ist Object mit Fields (title, body, tags, etc.). Field-Content 20 B – 50 KB.
  - **Query:** String 1–10 Wörter. Fuzzy-Option = Levenshtein-distance-Toleranz (z.B. 0.2 → 20 % Toleranz).
  - **Autosuggest:** Prefix-String 1–10 Zeichen.
- **Typical output:**
  - Search: Array von `{id, score, terms, match, ...storedFields}`
  - Autosuggest: Array von `{suggestion, score, terms}`
- **Realistic median use-case:** **Doc-Site-Suche** (Algolia-Alternative für statische Sites — Docusaurus/Astro/VitePress bauen Build-Time-Index, deployen als JSON, laden im Browser; wir würden primär den Build-Time-Pfad gewinnen). **Client-Side-Search in SPAs** (Kleiner-Mittlerer Corpus, ~1–10k Docs, im Browser gehalten). **RAG-Hybrid-Retrieval** (gemeinsam mit Vector-Search). Zweiter Case: **Server-Side-In-Memory-Search** für kleine Datasets wo ElasticSearch-Overhead nicht lohnt.

## Rust replacement

- **Candidate crate(s):**
  - **Custom BM25-Core** (shared mit `@amigo-labs/bm25`-Port aus `docs/perf-review/wink-bm25-text-search.md`): ~500 Zeilen Rust. Tokenize via `unicode-segmentation`, Stem via `rust-stemmers`, Posting-Listen als `FxHashMap<TermId, Vec<(DocId, Freq, FieldId)>>`.
  - [`fst`](https://crates.io/crates/fst) — BurntSushi. Levenshtein-Automaton für Fuzzy-Match (effizienter als Brute-Force-Distance-per-Term) und Prefix-Autosuggest über Sorted-Keys.
  - [`tantivy`](https://crates.io/crates/tantivy) — wäre natürliche Alternative für Fuzzy + BM25 + Autosuggest in einem. Aber Overkill für unseren Scope (wir wollen kein Inverted-Index-Persistence-Framework, wir wollen in-memory). Dennoch: wenn der Custom-Core aufwendig wird, ist tantivy die Fast-Follow-Option für `@amigo-labs/tantivy` als separates Paket.
- **Maintenance / license:** `fst` Apache-2.0, BurntSushi-Qualität. `rust-stemmers` MIT. Supply-Chain sauber.
- **Known gotchas / divergences:**
  - **`processTerm` / `tokenize`-Custom-Funktions** — minisearch erlaubt User-Funktionen für Tokenization und Term-Processing. Kann nicht über FFI reichen. Wir bieten vorgekaufte Enums (`tokenizer: 'whitespace' | 'unicode-word'`, `stemmer: 'none' | 'porter' | 'snowball-xx'`, `lowercase: true`). Custom-Funktionen = API-Bruch, Migration-Guide Pflicht.
  - **Fuzzy-Match-Semantik** — minisearch's Fuzzy ist "terms within Levenshtein distance of k/ratio". `fst` Levenshtein-Automaton matcht bit-exakt die Toleranz, aber Scoring-Details (wie wird Fuzzy-Match relativ zu Exact-Match gewichtet) sind implementation-spezifisch. Parity-Ranking-Reihenfolge = realistisches Ziel, nicht Score-Gleichheit.
  - **Autosuggest-Algorithmus** — minisearch macht Prefix-Match + BM25-Score-Rerank. `fst` liefert Prefix-Completion nativ, Re-Scoring müssen wir selbst implementieren.
  - **JSON-Format-Parity** — `toJSON()`/`loadJSON()` ist ein minisearch-spezifisches Schema. Parity = Aufwand, aber machbar (500 Zeilen Serde-Config). Alternative: eigenes Binärformat wie bei `bm25`, plus einen JSON-Importer für Migration.

## BACKLOG check

Vorhandener Eintrag in `BACKLOG.md` (Section "Under investigation — General utilities → Predicted Green"): ergänzt 2026-04-21. Review bestätigt GO-Empfehlung.

Abgrenzung:
- Gegen `docs/perf-review/wink-bm25-text-search.md`: **komplementäres Paket**, geteilter Rust-Core. minisearch hat größere Adoption und zusätzliche Features (Fuzzy, Autosuggest) — wahrscheinlich das primäre Portfolio-Paket in der Kategorie.
- Gegen `BACKLOG.md:35` `hnswlib-node` (ruled out — C++-Wrapper): komplementär — minisearch ist der **lexikalische** Pfad (keyword, token-based), ANN ist **semantisch** (vector, embedding-based). Hybrid-RAG nutzt beides.
- Gegen **tantivy** (potential Fast-Follow-Paket `@amigo-labs/tantivy`): tantivy ist der schwergewichtige Lucene-Style-Full-Text-Engine für große Corpora mit Disk-Persistence. minisearch ist der leichtgewichtige In-Memory-Index. Beide könnten koexistieren; tantivy braucht eigenes Review.

Kein Eintrag in `docs/packages.json`.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Build: hoch** (Tokenize + Stem + Posting-List-Inserts für 10k Docs × 5 KB ≈ 200 ms JS, ~30 ms Rust → **6–8×**). **Exact-Query: mittel** (Posting-List-Merge + BM25-Score, Top-10 auf 10k-Index ~100–500 µs). **Fuzzy-Query: hoch** (Brute-Force-Distance in JS auf tausende Terms = 2–10 ms, Levenshtein-Automaton in Rust ~50–300 µs → **20–40× Speedup**). **Autosuggest: mittel** (Prefix-Match + Re-Score ~50–200 µs Rust). |
| Input size distribution | Build-batch: ~50 MB Gesamt-Corpus als Docs-Array. Query: 20–100 B String. OK via Buffer für Batch-Input (NDJSON oder Arrow-ähnlich). |
| Output size distribution | Search-Results: Top-10 als `Vec<{id, score, terms, match}>`. Marshalling ~10 × 300 ns = 3 µs auf 200 µs Rust-Query = 1,5 %. OK. Wenn `storeFields` gesetzt ist, sind mehr Felder im Output — kann explodieren auf ~20 KB bei Full-Doc-Store. Dokumentieren: `storeFields` ist Caller-Overhead-Trade-off. |
| Reusable setup (stateful potential) | **Zentral.** Index IS der State. NAPI-Class Pflicht. `addAll`-Build → serialize to Buffer → later `loadFromBuffer` → many queries. Standard-Pattern. |
| Batch-usage realism | **Build Pflicht-batch** (wie bei bm25). **Query** selten batch-relevant aber `searchMany(queries: string[])` für Autocomplete-Benchmarks ein sinnvoller Hebel. |
| FFI-share estimate vs. Rust work | Build: <0,1 %. Query-exact: ~1–2 %. Query-fuzzy: <0,1 % (wegen dominantem Rust-Work). Autosuggest: ~1 %. |

## Classification reasoning

minisearch ist der **größere Geschwistern-Port** zu `@amigo-labs/bm25`:

1. **Shared Rust-Core-Strategie ist der Hebel.** Wenn wir einen internen `search-core` crate haben, der BM25 + Fuzzy + Autosuggest in Rust implementiert, sind `@amigo-labs/bm25` und `@amigo-labs/minisearch` zwei dünne npm-Wrapper mit unterschiedlichen API-Shapes (wink-style vs. mini-style). Inkrementeller Aufwand für das zweite Paket: ~30 % des ersten, weil nur API-Shape und Serialization differieren. Markt-Abdeckung: 10k + 100k = 110k vs. 10k alleine = **11× mehr TAM für 1,3× Aufwand**.

2. **Fuzzy-Match ist der killer-Sub-Case.** In minisearch ist Fuzzy-Match ein optionales Query-Flag (`searchOpts.fuzzy = 0.2`). In pure JS ist es slow weil jeder Query-Term gegen alle Index-Terms verglichen wird per Levenshtein (was millisekunden kostet). `fst` Levenshtein-Automaton reduziert das auf Sub-Millisekunden. Speedup 20–40× realistisch. Das ist ein **unique selling point** — ohne FFI-Floor-Sorgen weil die Rust-Work die FFI trivial amortisiert.

3. **Autosuggest ist drittes Feature.** minisearch's `autoSuggest` (Prefix + BM25-Re-Score) ist im Web-Client-Frontend-Use-Case der hot-path. Rust macht das mit `fst` native. JS muss Prefix-Scan über Term-Liste ziehen. Speedup ~5–10×.

4. **Browser-Runtime-Frage.** minisearch wird oft im **Browser** gebraucht (static-site-search). Wir sind Node-only. Für Build-Time-Index-Build (Docusaurus/Astro) ist das OK (läuft in Node). Für Query-at-Runtime (User-Browser) läuft unser Paket nicht. Das ist eine **legitime-Scope-Einschränkung**, muss im README klar stehen. Alternative: WASM-Build als Fast-Follow — aber das ist separates Projekt.

5. **Adoption macht es Portfolio-rentabel.** 100k/Woche ist im oberen Drittel der Kategorie-Kandidaten im Portfolio. Mehr als `@amigo-labs/jose`, etwa gleich wie `@amigo-labs/slugify` oder `@amigo-labs/csv`.

**Shape-Matching:**
- 🔁 Wie `@amigo-labs/tiktoken` (Stateful NAPI-Class, einmal laden, viele Queries)
- 🔁 Wie `wink-bm25-text-search` (Build-+-Query-Shape, Rust-Core-sharebar)
- 🔁 Wie `@amigo-labs/inflate` (bytes-heavy work, Buffer-API)
- ❌ Nicht wie `cheerio` / `xml` (keine Chain-API, keine Tree-Mutation)
- ❌ Nicht wie `mime` / `deep-equal` (substantielle Rust-Work pro Query)

**Benchmark-Gap-Flag:** Wie bei `wink-bm25-text-search`: Build + Exact-Query + Fuzzy-Query + Autosuggest gegen `minisearch` laufen lassen. Fuzzy-Query ist der wahrscheinlichste "killer"-Bench.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/minisearch` (matcht npm-Konvention; nicht `@amigo-labs/mini-search`)
- **Shared Rust-Core:** interner crate `crates/_search-core/` (Leitstrich-Prefix wie `_ffi-bench`/`_template`, nicht publiziert)
- **Primary API sketch:**
  ```ts
  export interface MiniSearchConfig<ID = string> {
    fields: string[];
    storeFields?: string[];
    idField?: string;  // default 'id'
    tokenize?: 'whitespace' | 'unicode-word';  // replaces custom function
    lowercase?: boolean;
    stopwords?: string[] | null;
    stemmer?: 'porter' | 'snowball-en' | ... | null;
    searchOptions?: SearchOptions;
  }

  export interface SearchOptions {
    fuzzy?: number | boolean;   // 0.0-1.0 tolerance
    prefix?: boolean;
    combineWith?: 'AND' | 'OR';
    boost?: Record<string, number>;
    filter?: (doc: any) => boolean;  // ← Callback-caveat: runs in Rust only if serializable to Uint8Array bitmap
    weights?: { fuzzy: number; prefix: number };
  }

  export class MiniSearch<ID = string> {
    constructor(config: MiniSearchConfig<ID>);

    // Build
    addAll(docs: Array<Record<string, any>>): void;
    discard(id: ID): void;
    replace(doc: Record<string, any>): void;

    // Query
    search(query: string, opts?: SearchOptions): SearchResult<ID>[];
    autoSuggest(prefix: string, opts?: SearchOptions): Suggestion[];
    searchMany(queries: string[], opts?: SearchOptions): SearchResult<ID>[][];

    // Persistence (binary, plus JSON-importer für minisearch-Migration)
    toBuffer(): Buffer;
    static fromBuffer<ID>(buf: Buffer): MiniSearch<ID>;
    static fromMiniSearchJSON<ID>(json: any): MiniSearch<ID>;
    toJSON(): any;  // legacy format für Drop-in

    // Metadata
    readonly documentCount: number;
    has(id: ID): boolean;
    getStoredFields(id: ID): Record<string, any> | undefined;
  }
  ```
- **Must-have benchmark scenarios (Gate):**
  - **Build-small:** 1k Docs × 2 KB avg — Ziel ≥3× vs. `minisearch.addAll`
  - **Build-medium:** 10k Docs × 5 KB avg — Ziel ≥5×
  - **Build-large:** 50k Docs × 10 KB avg — Ziel ≥5× (Green-Gate-Hauptfall)
  - **Query-exact-short:** 2-Wort-Query auf 10k-Index — Ziel ≥2×
  - **Query-exact-long:** 10-Wort-Query auf 50k-Index — Ziel ≥3×
  - **Query-fuzzy (0.2 Toleranz):** 3-Wort-Query auf 10k-Index — Ziel ≥10× (**killer-Bench**)
  - **Autosuggest:** 3-Zeichen-Prefix auf 10k-Index — Ziel ≥5×
  - **Serialize/Load:** 50k-Index toBuffer + fromBuffer — Ziel ≥5× vs. toJSON/loadJSON
- **Acceptance thresholds (Green gate):** ≥3× auf Build-large UND ≥2× auf Query-exact-short UND ≥10× auf Query-fuzzy. Autosuggest + Serialize sind Nice-to-Have. Bei Query-exact unter 1,5× auf Short würde ich auf Yellow klassifizieren.
- **Risks:**
  - **Custom-Function-Migration** (tokenize/processTerm) — User mit Custom-JS muss preprocessen oder bleibt bei pure-minisearch
  - **Browser-Einschränkung** — nur Node; WASM-Build als Fast-Follow denkbar aber separater Aufwand
  - **Fuzzy-Score-Divergenz** — ranking statt identity
  - **Binary-Size** — `rust-stemmers` + `fst` + Custom-Core ~2–3 MB pro Target, vergleichbar mit `@amigo-labs/zip`
  - **Rust-Core-Stability** — `@amigo-labs/bm25` und `@amigo-labs/minisearch` müssen Version-synchronisiert released werden; interner Core-Crate-Breaking-Change hat Downstream-Implications

## If NO-GO — BACKLOG entry

Nicht zutreffend (GO-Empfehlung).
