# Candidate review: `wink-bm25-text-search` / `bm25`

> **Status:** GO (als neues Paket `@amigo-labs/bm25`, kein 1:1-Drop-in) · **Predicted:** 🟢 Green (Index-Build) / 🟡 Yellow leaning 🟢 (Query) · **Reviewed:** 2026-04-21
> **Shipped:** v0.1 on branch `claude/crate-performance-audit-6KLOJ` (2026-04-23). Benchmarks pending full bench suite.


## Verdict

BM25-Retrieval ist einer der **besten Green-Shapes der RAG-Kategorie**: ein Index wird einmal gebaut (substantielle Compute — Tokenize + IDF + Posting-Listen), lebt dann langfristig als NAPI-Class, und beantwortet pro Query in 10–500 µs echte Arbeit (Posting-Listen-Traversal + BM25-Score). JS-Konkurrenten sind durchgehend pure-JS (`wink-bm25-text-search`, `bm25`, `minisearch` — letzteres der Marktführer mit ~100k/Woche). Rust-`tantivy` bringt Lucene-Niveau, ist aber Overkill; ein schlanker BM25-Core via `rust-stemmers` + eigenem Posting-List-Store hat den besten Fit. Bedenken: **Adoption ist niedrig** (`wink-bm25-text-search` ~10k/Woche, `bm25`-npm ~5k/Woche — die BACKLOG-Zahl "30k combined" ist generös). Das Portfolio-Argument hängt deshalb weniger am individuellen Package, mehr an der RAG-Kategorie als Ganzes (gemeinsam mit `pdf-parse`, `@langchain/textsplitters`).

## JS package

- **npm:**
  - [`wink-bm25-text-search`](https://www.npmjs.com/package/wink-bm25-text-search) (primärer Review-Target)
  - [`bm25`](https://www.npmjs.com/package/bm25) (kleiner, minimalistischer)
  - Relevanter Marktführer als Vergleichs-Baseline: [`minisearch`](https://www.npmjs.com/package/minisearch) (~100k/Woche) — tut mehr als BM25 (Fuzzy, Autosuggest), aber BM25-Core ist vergleichbar
- **Downloads:** `wink-bm25-text-search` ~10k, `bm25` ~5k. `minisearch` ~100k (Kategorie-Baseline). Q1 2026.
- **Exports / API surface:** `bm25()` → Index-Instanz mit `definePrepTasks(tasks)`, `defineConfig({fldWeights, bm25Params})`, `addDoc(doc, id)`, `consolidate()`, `search(query, limit, filter)`, `exportJSON()` / `importJSON()`
- **Typical input:**
  - **Index-Build:** 1k – 100k Dokumente, je 100 Bytes – 50 KB Text. Prep-Tasks: lowercase, stopwords-remove, stemmen
  - **Query:** 1–10 Wörter, ~20–100 Bytes
- **Typical output:**
  - Search: Array von `{id, score}` der Länge `limit` (typisch 10)
- **Realistic median use-case:** **In-process RAG-Retrieval** als BM25+Embedding-Hybrid. Ein Corpus von 5k–50k Chunks wird beim App-Start geladen, jede Query läuft gegen BM25 (lexikalisch) plus Embedding-ANN (semantisch) parallel. Zweiter Use-Case: **Doc-Site-Suche** (Algolia-Alternative für statische Sites): Index einmal beim Build, Query pro User-Keystroke auf Client/SSR.

## Rust replacement

- **Candidate crate(s):**
  - **Custom BM25-Core auf `rust-stemmers` + `fst`** — primär. ~500 Zeilen Rust: Tokenize mit `unicode-segmentation`, Stem mit `rust-stemmers`, Posting-Listen als `FxHashMap<TermId, Vec<(DocId, Freq)>>` plus doc-len-Array. Export/Import via bincode. Deterministisch, klein, null native Deps.
  - [`tantivy`](https://crates.io/crates/tantivy) — **Fast-Follow / separates Paket.** Vollständige Lucene-Style-Search-Engine. Overkill für BM25-Drop-in, aber wenn wir in den `@amigo-labs/search`-Markt wollen (Meilisearch-Konkurrenz), dann tantivy. Nicht v1-Scope für `@amigo-labs/bm25`.
  - [`bm25`](https://crates.io/crates/bm25) (crates.io) — minimaler BM25-Scorer ohne Index. Zu klein für unsere Zwecke.
- **Maintenance / license:** `rust-stemmers` MIT/Apache, aktiv. `fst` Apache-2.0, BurntSushi-Qualität. `tantivy` MIT. Supply-Chain sauber.
- **Known gotchas / divergences:**
  - **Stemmer-Sprach-Matrix**: `wink-bm25-text-search` erlaubt Custom-Prep-Tasks (inkl. Custom-JS-Stemmer). Wir liefern den Standard-Porter/Snowball-Katalog (15+ Sprachen) und dokumentieren, dass Custom-JS-Stemmers nicht über FFI reichen — als Workaround: der User preprocesst seine Docs selbst und indexiert pre-tokenized Arrays.
  - **Ranking-Divergenz**: BM25 ist eine Formel, aber `k1`, `b`, und insbesondere Field-Weights können divergieren. Parity auf Score-Werten ist illusorisch; Parity auf **Ranking-Reihenfolge** (Top-10 stimmt) ist das realistische Ziel.
  - **Serialization-Format**: nicht binärkompatibel mit `wink-bm25-text-search.exportJSON()`. Wir bieten eigenes kompaktes Binärformat (bincode) plus einen JSON-Importer-Loop für Migration.
  - **Query-Parser**: `wink-bm25-text-search` hat keinen Query-Parser (nur whitespace-split). Wir matchen das. Wenn jemand "fuzzy OR" will, ist das ein tantivy-Use-Case.

## BACKLOG check

Existierender Eintrag: `BACKLOG.md:13`:
> **wink-bm25-text-search** / **bm25** (~30k combined). Index build + scoring over a corpus; amortized FFI. Index as NAPI class.

Kategorisierung als "Predicted Green". Review bestätigt die Vorhersage mit der Korrektur, dass `30k combined` optimistisch ist (`wink-bm25-text-search` ~10k, `bm25` ~5k). Die eigentliche Kategorie-Baseline ist `minisearch` (~100k) — gegen die muss der Port stellenweise auch bestehen, auch wenn unser API-Shape enger an `wink-bm25-text-search` angelehnt ist.

Abgrenzung zu bestehenden Reviews:
- Keine bestehende Search/Retrieval-Review. Dieses Review legt die Vorlage für `minisearch`, `flexsearch`, `lunr` als Fast-Follow-Kandidaten.
- Gegen `docs/perf-review/hnswlib-node.md` (NO-GO Vector-Search): BM25 ist der **lexikalische** Pfad, ANN ist der **semantische** Pfad. Nicht-Konflikt, sondern komplementär (Hybrid-RAG-Setup).

Kein Eintrag in `docs/packages.json`.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Build: hoch** (Tokenize + Stem für 50 KB Doc ≈ 1–3 ms). **Query: mittel-niedrig** (Top-10 auf 50k-Doc-Index ≈ 50–500 µs je nach Query-Selektivität). Query-FFI-Share: 109 ns / 200 µs = **0,05 %** — vernachlässigbar. |
| Input size distribution | **Build:** Doc-Strings 100 B – 50 KB pro `addDoc`-Call. Wenn pro-Doc-Call, ist das 1 FFI-Crossing pro Doc × 50k Docs = problematisch. **Muss** als `addDocsBatch(docs: Buffer[], ids: number[])` gebaut werden oder als `addDocsNdjson(buf: Buffer)` — ein Crossing für den ganzen Batch. Query: 20–100 B String. |
| Output size distribution | Query: `Vec<(u32, f32)>` × 10 = 80 B. Wenn als `Buffer` zurück: flat. Wenn `Vec<{id, score}>`: Marshalling-Kosten ~80 ns × 10 = 800 ns — noch im Rauschen. |
| Reusable setup (stateful potential) | **Zentral.** Der Index IS der State. NAPI-Class Pflicht. Lifetime-Muster: `build → serialize → later load → many query`. Load-From-Disk ist selbst-mal ein Perf-Szenario. |
| Batch-usage realism | **Index-Build:** Pflicht-Batch. Ein Call pro Doc ist API-Suizid. **Query:** seltener batch-relevant (ein User fragt eine Query), aber `searchMany(queries: string[])` ist ein kostengünstiger Add. |
| FFI-share estimate vs. Rust work | Build-Batch: <0,01 %. Single-Query: 0,05 %. Nicht das Problem. |

## Classification reasoning

BM25-Retrieval ist der **saubere Stateful-Green-Shape**:

1. **Build ist echte CPU-Arbeit.** Tokenizing 50 MB Gesamt-Corpus + stemmen + Posting-Listen aufbauen ist pure-JS dominant. Rust-`unicode-segmentation` ist ~5–10× schneller als JS-Regex-basierte Tokenizer. Stemmer-Inner-Loop ist in `rust-stemmers` hand-optimiert. Hashmap-Inserts in `FxHashMap` sind 2–3× schneller als V8-Object/Map. Erwartbarer Build-Speedup auf 50k Docs: **5–15×** vs. `wink-bm25-text-search`.

2. **Query ist genug Arbeit, um FFI zu amortisieren.** Top-10-Retrieval auf 50k-Doc-Index: 10–50 Posting-Listen traversieren, Score berechnen, Heap-Top-K. ~200 µs in Rust. JS-Query dito ~500 µs – 2 ms. Speedup 2–5× bei vernachlässigbarem FFI-Share.

3. **Kein Callback-Boundary.** `wink-bm25-text-search` hat als einziges Callback-Surface die Prep-Tasks-Funktionen. Die können wir als vorgebackene Enums (`{lowercase: true, stopwords: 'en', stem: 'porter'}`) modellieren — User-Funktionen über FFI zu reichen ist genau der `xml`-Fehler.

4. **Persistenz als zweiter Win.** `exportJSON()` in JS ist `JSON.stringify(index)` — langsam und ineffizient (Index-Struktur passt schlecht zu JSON). Rust-Bincode-Binary-Format ist 3–10× kleiner und 10–50× schneller zu serialisieren/deserialisieren. Das ist kein gebenchter Hebel, aber ein praktischer User-Benefit.

**Was gegen Green sprechen würde (und warum es nicht reicht):**

- **Adoption.** `wink-bm25-text-search` + `bm25` kombiniert ≈ 15k/Woche. Isoliert niedrige Portfolio-Rentabilität. Aber: der Port öffnet die RAG-Kategorie und kann zu `minisearch`-Drop-in (~100k/Woche) erweitert werden — das ist der echte TAM.
- **Query-single-Call ist klein.** 200 µs ist kein `inflate`-Niveau. FFI-Floor 109 ns = 0,05 %, tolerabel. Aber wenn Caller queries in Hot-Loops feuern (Auto-Suggest pro Keystroke), dann landen wir bei 100+ Calls/s = noch tolerabel.

**Shape-Matching:**
- ✅ Wie `tiktoken` (Stateful NAPI-Class, einmal laden + viele Queries)
- ✅ Wie `inflate` (Bytes-heavy Work, Buffer-API viable)
- ❌ Nicht wie `hnswlib-node` (keine native Konkurrenz — alle BM25-Libs sind pure JS)
- ❌ Nicht wie `mime` (trotz "Lookup-Style"-Vermutung — Query macht substantielle Arbeit mit Posting-Listen-Traversal)

**Benchmark-Gap-Flag:** Prediction ist ohne Spike. Muss gegen `wink-bm25-text-search` + `minisearch` parallel gemessen werden — die primäre Kategorie-Baseline ist `minisearch`, nicht `wink-bm25-text-search`.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/bm25`
- **Primary API sketch:**
  ```ts
  export interface BM25Config {
    k1?: number;           // default 1.2
    b?: number;            // default 0.75
    tokenizer?: 'whitespace' | 'unicode-word';  // default 'unicode-word'
    lowercase?: boolean;   // default true
    stopwords?: 'en' | 'de' | 'fr' | string[] | null;  // default null
    stemmer?: 'porter' | 'snowball-en' | 'snowball-de' | ... | null;
    fieldWeights?: Record<string, number>;
  }

  export class BM25Index {
    constructor(config: BM25Config);

    // Build — Pflicht-Batch
    addDocsBatch(docs: Array<{ id: string | number; text: string } | { id, fields: Record<string,string> }>): void;
    consolidate(): void;   // finalize IDF, freeze structure

    // Query
    search(query: string, limit?: number, filter?: Uint32Array): Array<{ id: string | number; score: number }>;
    searchMany(queries: string[], limit?: number): Array<Array<{ id; score }>>;

    // Persistence — Binär-Format
    toBuffer(): Buffer;
    static fromBuffer(buf: Buffer): BM25Index;
  }
  ```
- **Must-have benchmark scenarios (Gate):**
  - **Build-small:** 1k Docs × 2 KB avg — Ziel ≥3× vs. `wink-bm25-text-search.addDoc`-Loop (wir erlauben NUR Batch)
  - **Build-medium:** 10k Docs × 5 KB avg — Ziel ≥5×
  - **Build-large:** 50k Docs × 10 KB avg — Ziel ≥5× (Green-Gate-Hauptfall)
  - **Query-short:** 2-Wort-Queries auf 10k-Index, 10k Runs — Ziel ≥2× (Yellow-Grenze) bis ≥3× (Green)
  - **Query-long:** 10-Wort-Queries auf 50k-Index, 1k Runs — Ziel ≥3×
  - **Serialize/Deserialize:** 50k-Index `toBuffer` + `fromBuffer` — Ziel ≥5× vs. `exportJSON` + `importJSON`
  - **Cross-Baseline:** Build- und Query-Szenarien zusätzlich gegen `minisearch` laufen lassen. Falls `minisearch` schneller ist als `wink-bm25-text-search` (wahrscheinlich), ist das die harte Baseline.
- **Acceptance thresholds (Green gate):** ≥3× auf Build-large UND ≥2× auf Query-short UND ≥3× auf Query-long. Serialize-Win ist Nice-to-have, nicht blocking.
- **Risks:**
  - **Adoption alleine zu klein** — Paket nur tragbar als Teil der RAG-Kategorie (pdf-parse + textsplitters + tiktoken + bm25)
  - **Parity-Drift** — Stemmer-Version zwischen JS (snowball-js) und Rust (rust-stemmers) kann auf edge-case-Worten divergieren; auf Ranking-Reihenfolge meist irrelevant, aber dokumentieren
  - **Binary-Size** — Porter-/Snowball-Stemmers für 15+ Sprachen sind ~1–2 MB als eingebettete Tables. Feature-gated per Sprach-Auswahl: User sollten optional nur die benötigten Stemmer linken (Fast-Follow v0.2)
  - **Scope-Creep-Risiko** — Fuzzy-Search, Autosuggest, Field-Boosting auf Query-Zeit. v1 sagt NEIN zu allem außer BM25-Core. Wenn User mehr wollen: `@amigo-labs/tantivy` als eigenes Paket (Fast-Follow)
  - **Query-single-Call-Grenze** — wenn Caller pro User-Keystroke queriet (>1000 calls/s), wird FFI-Overhead sichtbar. Empfehlung in Docs: `searchMany` für Autosuggest nutzen

## If NO-GO — BACKLOG entry

Nicht zutreffend (GO-Empfehlung).

Section in `BACKLOG.md`: **Under investigation — AI / RAG preprocessing** → Eintrag bleibt, Status-Update auf "Reviewed GO 2026-04-21. Downloads-Korrektur: ~15k combined statt ~30k. Empfohlen nur als Teil der RAG-Kategorie, nicht standalone."
