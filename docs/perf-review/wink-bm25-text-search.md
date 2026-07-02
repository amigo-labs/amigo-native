# Candidate review: `wink-bm25-text-search` / `bm25`

> **Status:** GO (as a new package `@amigo-labs/bm25`, not a 1:1 drop-in) · **Predicted:** 🟢 Green (index build) / 🟡 Yellow leaning 🟢 (query) · **Reviewed:** 2026-04-21
> **Shipped:** v0.1 on branch `claude/crate-performance-audit-6KLOJ` (2026-04-23). Benchmarks pending full bench suite.


## Verdict

BM25 retrieval is one of the **best Green shapes in the RAG category**: an index is built once (substantial compute — tokenize + IDF + posting lists), then lives long-term as a NAPI class and answers each query with 10–500 µs of real work (posting-list traversal + BM25 scoring). The JS competitors are pure JS across the board (`wink-bm25-text-search`, `bm25`, `minisearch` — the latter the market leader at ~100k/week). Rust's `tantivy` delivers Lucene-level capability but is overkill; a lean BM25 core via `rust-stemmers` + our own posting-list store is the best fit. Concern: **adoption is low** (`wink-bm25-text-search` ~10k/week, `bm25` npm ~5k/week — the BACKLOG figure of "30k combined" is generous). The portfolio argument therefore rests less on the individual package and more on the RAG category as a whole (together with `pdf-parse`, `@langchain/textsplitters`).

## JS package

- **npm:**
  - [`wink-bm25-text-search`](https://www.npmjs.com/package/wink-bm25-text-search) (primary review target)
  - [`bm25`](https://www.npmjs.com/package/bm25) (smaller, minimalist)
  - Relevant market leader as a comparison baseline: [`minisearch`](https://www.npmjs.com/package/minisearch) (~100k/week) — does more than BM25 (fuzzy, autosuggest), but the BM25 core is comparable
- **Downloads:** `wink-bm25-text-search` ~10k, `bm25` ~5k. `minisearch` ~100k (category baseline). Q1 2026.
- **Exports / API surface:** `bm25()` → index instance with `definePrepTasks(tasks)`, `defineConfig({fldWeights, bm25Params})`, `addDoc(doc, id)`, `consolidate()`, `search(query, limit, filter)`, `exportJSON()` / `importJSON()`
- **Typical input:**
  - **Index build:** 1k – 100k documents of 100 bytes – 50 KB text each. Prep tasks: lowercase, stopword removal, stemming
  - **Query:** 1–10 words, ~20–100 bytes
- **Typical output:**
  - Search: array of `{id, score}` of length `limit` (typically 10)
- **Realistic median use-case:** **in-process RAG retrieval** as a BM25+embedding hybrid. A corpus of 5k–50k chunks is loaded at app start; every query runs against BM25 (lexical) plus embedding ANN (semantic) in parallel. Second use case: **doc-site search** (an Algolia alternative for static sites): index once at build time, query per user keystroke on client/SSR.

## Rust replacement

- **Candidate crate(s):**
  - **Custom BM25 core on `rust-stemmers` + `fst`** — primary. ~500 lines of Rust: tokenize with `unicode-segmentation`, stem with `rust-stemmers`, posting lists as `FxHashMap<TermId, Vec<(DocId, Freq)>>` plus a doc-length array. Export/import via bincode. Deterministic, small, zero native deps.
  - [`tantivy`](https://crates.io/crates/tantivy) — **fast-follow / separate package.** A complete Lucene-style search engine. Overkill for a BM25 drop-in, but if we want to enter the `@amigo-labs/search` market (Meilisearch competition), then tantivy. Not v1 scope for `@amigo-labs/bm25`.
  - [`bm25`](https://crates.io/crates/bm25) (crates.io) — a minimal BM25 scorer without an index. Too small for our purposes.
- **Maintenance / license:** `rust-stemmers` MIT/Apache, active. `fst` Apache-2.0, BurntSushi quality. `tantivy` MIT. Supply chain clean.
- **Known gotchas / divergences:**
  - **Stemmer language matrix**: `wink-bm25-text-search` allows custom prep tasks (including a custom JS stemmer). We ship the standard Porter/Snowball catalog (15+ languages) and document that custom JS stemmers cannot cross the FFI — the workaround is for the user to preprocess their docs and index pre-tokenized arrays.
  - **Ranking divergence**: BM25 is a formula, but `k1`, `b`, and especially field weights can diverge. Parity on score values is illusory; parity on **ranking order** (the top 10 matches) is the realistic target.
  - **Serialization format**: not binary-compatible with `wink-bm25-text-search.exportJSON()`. We offer our own compact binary format (bincode) plus a JSON-importer loop for migration.
  - **Query parser**: `wink-bm25-text-search` has no query parser (just whitespace split). We match that. If someone wants "fuzzy OR", that is a tantivy use case.

## BACKLOG check

Existing entry: `BACKLOG.md:13`:
> **wink-bm25-text-search** / **bm25** (~30k combined). Index build + scoring over a corpus; amortized FFI. Index as NAPI class.

Categorized as "Predicted Green". The review confirms the prediction with the correction that `30k combined` is optimistic (`wink-bm25-text-search` ~10k, `bm25` ~5k). The real category baseline is `minisearch` (~100k) — the port has to hold up against it in places too, even though our API shape leans closer to `wink-bm25-text-search`.

Scope boundaries against existing reviews:
- No existing search/retrieval review. This review sets the template for `minisearch`, `flexsearch`, `lunr` as fast-follow candidates.
- Against `docs/perf-review/hnswlib-node.md` (NO-GO vector search): BM25 is the **lexical** path, ANN is the **semantic** path. Not a conflict but complementary (hybrid-RAG setup).

No entry in `docs/packages.json`.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Build: high** (tokenize + stem for a 50 KB doc ≈ 1–3 ms). **Query: medium-low** (top-10 on a 50k-doc index ≈ 50–500 µs depending on query selectivity). Query FFI share: 109 ns / 200 µs = **0.05 %** — negligible. |
| Input size distribution | **Build:** doc strings 100 B – 50 KB per `addDoc` call. If it is a per-doc call, that is 1 FFI crossing per doc × 50k docs = problematic. **Must** be built as `addDocsBatch(docs: Buffer[], ids: number[])` or as `addDocsNdjson(buf: Buffer)` — one crossing for the whole batch. Query: 20–100 B string. |
| Output size distribution | Query: `Vec<(u32, f32)>` × 10 = 80 B. Returned as a `Buffer`: flat. As `Vec<{id, score}>`: marshalling cost ~80 ns × 10 = 800 ns — still in the noise. |
| Reusable setup (stateful potential) | **Central.** The index IS the state. A NAPI class is mandatory. Lifetime pattern: `build → serialize → later load → many query`. Load-from-disk is itself a perf scenario. |
| Batch-usage realism | **Index build:** batch is mandatory. One call per doc is API suicide. **Query:** batch-relevant less often (one user asks one query), but `searchMany(queries: string[])` is a cheap add. |
| FFI-share estimate vs. Rust work | Build batch: <0.01 %. Single query: 0.05 %. Not the problem. |

## Classification reasoning

BM25 retrieval is the **clean stateful Green shape**:

1. **Build is real CPU work.** Tokenizing a 50 MB total corpus + stemming + building posting lists is pure-JS dominated. Rust `unicode-segmentation` is ~5–10× faster than JS regex-based tokenizers. The stemmer inner loop is hand-optimized in `rust-stemmers`. Hashmap inserts into `FxHashMap` are 2–3× faster than V8 Object/Map. Expected build speedup on 50k docs: **5–15×** vs. `wink-bm25-text-search`.

2. **A query is enough work to amortize the FFI.** Top-10 retrieval on a 50k-doc index: traverse 10–50 posting lists, compute scores, heap top-k. ~200 µs in Rust. The JS query likewise ~500 µs – 2 ms. Speedup 2–5× with negligible FFI share.

3. **No callback boundary.** The only callback surface in `wink-bm25-text-search` is the prep-task functions. We can model those as pre-baked enums (`{lowercase: true, stopwords: 'en', stem: 'porter'}`) — passing user functions across the FFI is exactly the `xml` mistake.

4. **Persistence as a second win.** `exportJSON()` in JS is `JSON.stringify(index)` — slow and inefficient (the index structure maps poorly to JSON). A Rust bincode binary format is 3–10× smaller and 10–50× faster to serialize/deserialize. Not a benched lever, but a practical user benefit.

**What would argue against Green (and why it is not enough):**

- **Adoption.** `wink-bm25-text-search` + `bm25` combined ≈ 15k/week. In isolation, low portfolio ROI. But: the port opens the RAG category and can be extended to a `minisearch` drop-in (~100k/week) — that is the real TAM.
- **A single query call is small.** 200 µs is not `inflate` level. FFI floor 109 ns = 0.05 %, tolerable. And if callers fire queries in hot loops (autosuggest per keystroke), we land at 100+ calls/s = still tolerable.

**Shape matching:**
- ✅ Like `tiktoken` (stateful NAPI class, load once + many queries)
- ✅ Like `inflate` (bytes-heavy work, Buffer API viable)
- ❌ Not like `hnswlib-node` (no native competition — all BM25 libs are pure JS)
- ❌ Not like `mime` (despite the "lookup-style" hunch — a query does substantial work with posting-list traversal)

**Benchmark gap flag:** the prediction is made without a spike. Must be measured against `wink-bm25-text-search` + `minisearch` in parallel — the primary category baseline is `minisearch`, not `wink-bm25-text-search`.

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

    // Build — batch is mandatory
    addDocsBatch(docs: Array<{ id: string | number; text: string } | { id, fields: Record<string,string> }>): void;
    consolidate(): void;   // finalize IDF, freeze structure

    // Query
    search(query: string, limit?: number, filter?: Uint32Array): Array<{ id: string | number; score: number }>;
    searchMany(queries: string[], limit?: number): Array<Array<{ id; score }>>;

    // Persistence — binary format
    toBuffer(): Buffer;
    static fromBuffer(buf: Buffer): BM25Index;
  }
  ```
- **Must-have benchmark scenarios (gate):**
  - **Build-small:** 1k docs × 2 KB avg — target ≥3× vs. the `wink-bm25-text-search.addDoc` loop (we allow batch ONLY)
  - **Build-medium:** 10k docs × 5 KB avg — target ≥5×
  - **Build-large:** 50k docs × 10 KB avg — target ≥5× (the main Green-gate case)
  - **Query-short:** 2-word queries on a 10k index, 10k runs — target ≥2× (Yellow boundary) to ≥3× (Green)
  - **Query-long:** 10-word queries on a 50k index, 1k runs — target ≥3×
  - **Serialize/deserialize:** 50k index `toBuffer` + `fromBuffer` — target ≥5× vs. `exportJSON` + `importJSON`
  - **Cross-baseline:** run the build and query scenarios against `minisearch` as well. If `minisearch` is faster than `wink-bm25-text-search` (likely), that is the hard baseline.
- **Acceptance thresholds (Green gate):** ≥3× on build-large AND ≥2× on query-short AND ≥3× on query-long. The serialize win is nice-to-have, not blocking.
- **Risks:**
  - **Adoption too small on its own** — the package is only viable as part of the RAG category (pdf-parse + textsplitters + tiktoken + bm25)
  - **Parity drift** — the stemmer versions between JS (snowball-js) and Rust (rust-stemmers) can diverge on edge-case words; mostly irrelevant to ranking order, but document it
  - **Binary size** — Porter/Snowball stemmers for 15+ languages are ~1–2 MB as embedded tables. Feature-gated per language selection: users should optionally link only the stemmers they need (fast-follow v0.2)
  - **Scope-creep risk** — fuzzy search, autosuggest, query-time field boosting. v1 says NO to everything except the BM25 core. If users want more: `@amigo-labs/tantivy` as its own package (fast-follow)
  - **Single-query-call limit** — if a caller queries per user keystroke (>1000 calls/s), FFI overhead becomes visible. Recommendation in the docs: use `searchMany` for autosuggest

## If NO-GO — BACKLOG entry

Not applicable (GO recommendation).

Section in `BACKLOG.md`: **Under investigation — AI / RAG preprocessing** → entry stays, status update to "Reviewed GO 2026-04-21. Downloads correction: ~15k combined instead of ~30k. Recommended only as part of the RAG category, not standalone."
