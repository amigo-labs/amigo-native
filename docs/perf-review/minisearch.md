# Candidate review: `minisearch`

> **Status:** GO (as a new package, together with `@amigo-labs/bm25` built from a shared Rust core) · **Predicted:** 🟢 Green (build + fuzzy search) / 🟡→🟢 (exact query) · **Reviewed:** 2026-04-21
> **Shipped:** v0.1 on branch `claude/crate-performance-audit-6KLOJ` (2026-04-23). Benchmarks pending full bench suite.


## Verdict

`minisearch` is the portfolio's **category leader** in the lexical-search market (~100k/week vs. `wink-bm25-text-search`'s ~10k) — it has BM25 plus fuzzy matching plus autosuggest in a single package. The Green shape is identical to `wink-bm25-text-search` (stateful index as a NAPI class, build→serialize→many-queries), but the fuzzy-match path (Levenshtein-distance-tolerant term matching) has **additional Rust compute leverage** because fuzzy search in JS is a brute-force scan over strings. The strategy: **one Rust core** (`@amigo-labs/search-core` crate, unpublished), two npm packages on top (`@amigo-labs/bm25` for the wink-compatible shape, `@amigo-labs/minisearch` for the mini-compatible shape). That doubles market coverage at marginal extra effort. BM25 core + fuzzy matching via the `rust-fst` Levenshtein automaton + prefix autosuggest via `fst` would be elegant.

## JS package

- **npm:** [`minisearch`](https://www.npmjs.com/package/minisearch)
- **Downloads:** ~100k/week (Q1 2026), the clear category market leader for in-process JS search
- **Exports / API surface:**
  - `new MiniSearch({fields, storeFields?, searchOptions?, tokenize?, processTerm?})` — constructor
  - `.add(doc)`, `.addAll(docs)`, `.addAllAsync(docs)` — index build
  - `.discard(id)`, `.replace(doc)` — mutation
  - `.search(query, opts?) → SearchResult[]` — with `opts.fuzzy`, `opts.prefix`, `opts.combineWith`, `opts.filter`, `opts.boost`
  - `.autoSuggest(queryPrefix, opts?) → Suggestion[]`
  - `.toJSON()` / `MiniSearch.loadJSON(json, opts)` — persistence
  - `.has(id)`, `.getStoredFields(id)`, `.documentCount`
- **Typical input:**
  - **Build:** 1k – 100k docs. Each doc is an object with fields (title, body, tags, etc.). Field content 20 B – 50 KB.
  - **Query:** string of 1–10 words. Fuzzy option = Levenshtein-distance tolerance (e.g. 0.2 → 20 % tolerance).
  - **Autosuggest:** prefix string of 1–10 characters.
- **Typical output:**
  - Search: array of `{id, score, terms, match, ...storedFields}`
  - Autosuggest: array of `{suggestion, score, terms}`
- **Realistic median use-case:** **Doc-site search** (Algolia alternative for static sites — Docusaurus/Astro/VitePress build an index at build time, deploy it as JSON, load it in the browser; we would primarily win the build-time path). **Client-side search in SPAs** (small-to-medium corpus, ~1–10k docs, held in the browser). **RAG hybrid retrieval** (together with vector search). Second case: **server-side in-memory search** for small datasets where the overhead of ElasticSearch is not worth it.

## Rust replacement

- **Candidate crate(s):**
  - **Custom BM25 core** (shared with the `@amigo-labs/bm25` port from `docs/perf-review/wink-bm25-text-search.md`): ~500 lines of Rust. Tokenize via `unicode-segmentation`, stem via `rust-stemmers`, posting lists as `FxHashMap<TermId, Vec<(DocId, Freq, FieldId)>>`.
  - [`fst`](https://crates.io/crates/fst) — BurntSushi. Levenshtein automaton for fuzzy matching (more efficient than brute-force distance-per-term) and prefix autosuggest over sorted keys.
  - [`tantivy`](https://crates.io/crates/tantivy) — would be the natural alternative for fuzzy + BM25 + autosuggest in one. But overkill for our scope (we do not want an inverted-index persistence framework, we want in-memory). Still: if the custom core turns out expensive, tantivy is the fast-follow option for `@amigo-labs/tantivy` as a separate package.
- **Maintenance / license:** `fst` Apache-2.0, BurntSushi quality. `rust-stemmers` MIT. Supply chain clean.
- **Known gotchas / divergences:**
  - **`processTerm` / `tokenize` custom functions** — minisearch allows user functions for tokenization and term processing. These cannot cross the FFI boundary. We offer pre-baked enums (`tokenizer: 'whitespace' | 'unicode-word'`, `stemmer: 'none' | 'porter' | 'snowball-xx'`, `lowercase: true`). Custom functions = API break, migration guide mandatory.
  - **Fuzzy-match semantics** — minisearch's fuzzy is "terms within Levenshtein distance of k/ratio". The `fst` Levenshtein automaton matches the tolerance bit-exactly, but scoring details (how a fuzzy match is weighted relative to an exact match) are implementation-specific. Parity in ranking order = the realistic goal, not score equality.
  - **Autosuggest algorithm** — minisearch does prefix matching + BM25-score reranking. `fst` provides prefix completion natively; we have to implement the re-scoring ourselves.
  - **JSON-format parity** — `toJSON()`/`loadJSON()` is a minisearch-specific schema. Parity = effort, but doable (500 lines of serde config). Alternative: our own binary format as with `bm25`, plus a JSON importer for migration.

## BACKLOG check

Existing entry in `BACKLOG.md` (section "Under investigation — General utilities → Predicted Green"): added 2026-04-21. Review confirms the GO recommendation.

Scope boundaries:
- Versus `docs/perf-review/wink-bm25-text-search.md`: **complementary package**, shared Rust core. minisearch has larger adoption and additional features (fuzzy, autosuggest) — likely the primary portfolio package in this category.
- Versus `BACKLOG.md:35` `hnswlib-node` (ruled out — C++ wrapper): complementary — minisearch is the **lexical** path (keyword, token-based), ANN is **semantic** (vector, embedding-based). Hybrid RAG uses both.
- Versus **tantivy** (potential fast-follow package `@amigo-labs/tantivy`): tantivy is the heavyweight Lucene-style full-text engine for large corpora with disk persistence. minisearch is the lightweight in-memory index. Both could coexist; tantivy needs its own review.

No entry in `docs/packages.json`.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Build: high** (tokenize + stem + posting-list inserts for 10k docs × 5 KB ≈ 200 ms JS, ~30 ms Rust → **6–8×**). **Exact query: medium** (posting-list merge + BM25 scoring, top-10 on a 10k index ~100–500 µs). **Fuzzy query: high** (brute-force distance in JS over thousands of terms = 2–10 ms, Levenshtein automaton in Rust ~50–300 µs → **20–40× speedup**). **Autosuggest: medium** (prefix match + re-score ~50–200 µs Rust). |
| Input size distribution | Build batch: ~50 MB total corpus as a docs array. Query: 20–100 B string. OK via Buffer for batch input (NDJSON or Arrow-like). |
| Output size distribution | Search results: top-10 as `Vec<{id, score, terms, match}>`. Marshalling ~10 × 300 ns = 3 µs on a 200 µs Rust query = 1.5 %. OK. When `storeFields` is set, more fields end up in the output — this can balloon to ~20 KB with a full-doc store. Document it: `storeFields` is a caller overhead trade-off. |
| Reusable setup (stateful potential) | **Central.** The index IS the state. NAPI class mandatory. `addAll` build → serialize to Buffer → later `loadFromBuffer` → many queries. Standard pattern. |
| Batch-usage realism | **Build must be batch** (as with bm25). **Query** is rarely batch-relevant, but `searchMany(queries: string[])` is a sensible lever for autocomplete benchmarks. |
| FFI-share estimate vs. Rust work | Build: <0.1 %. Query-exact: ~1–2 %. Query-fuzzy: <0.1 % (because the Rust work dominates). Autosuggest: ~1 %. |

## Classification reasoning

minisearch is the **bigger sibling port** of `@amigo-labs/bm25`:

1. **The shared-Rust-core strategy is the lever.** If we have an internal `search-core` crate implementing BM25 + fuzzy + autosuggest in Rust, then `@amigo-labs/bm25` and `@amigo-labs/minisearch` are two thin npm wrappers with different API shapes (wink-style vs. mini-style). Incremental effort for the second package: ~30 % of the first, because only the API shape and serialization differ. Market coverage: 10k + 100k = 110k vs. 10k alone = **11× more TAM for 1.3× the effort**.

2. **Fuzzy matching is the killer sub-case.** In minisearch, fuzzy matching is an optional query flag (`searchOpts.fuzzy = 0.2`). In pure JS it is slow because every query term is compared against all index terms via Levenshtein (which costs milliseconds). The `fst` Levenshtein automaton reduces that to sub-millisecond. A 20–40× speedup is realistic. This is a **unique selling point** — with no FFI-floor worries because the Rust work trivially amortizes the FFI.

3. **Autosuggest is the third feature.** minisearch's `autoSuggest` (prefix + BM25 re-score) is the hot path in the web-client frontend use-case. Rust does this natively with `fst`. JS has to run a prefix scan over the term list. Speedup ~5–10×.

4. **The browser-runtime question.** minisearch is often needed in the **browser** (static-site search). We are Node-only. For build-time index construction (Docusaurus/Astro) that is fine (runs in Node). For query-at-runtime (in the user's browser) our package does not run. This is a **legitimate scope restriction** and must be stated clearly in the README. Alternative: a WASM build as a fast-follow — but that is a separate project.

5. **Adoption makes it portfolio-viable.** 100k/week is in the top third of category candidates in the portfolio. More than `@amigo-labs/jose`, roughly on par with `@amigo-labs/slugify` or `@amigo-labs/csv`.

**Shape matching:**
- 🔁 Like `@amigo-labs/tiktoken` (stateful NAPI class, load once, many queries)
- 🔁 Like `wink-bm25-text-search` (build-plus-query shape, Rust core shareable)
- 🔁 Like `@amigo-labs/inflate` (bytes-heavy work, Buffer API)
- ❌ Not like `cheerio` / `xml` (no chained API, no tree mutation)
- ❌ Not like `mime` / `deep-equal` (substantial Rust work per query)

**Benchmark-gap flag:** As with `wink-bm25-text-search`: run build + exact query + fuzzy query + autosuggest against `minisearch`. The fuzzy query is the most likely "killer" bench.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/minisearch` (matches the npm convention; not `@amigo-labs/mini-search`)
- **Shared Rust core:** internal crate `crates/_search-core/` (underscore prefix like `_ffi-bench`/`_template`, unpublished)
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

    // Persistence (binary, plus a JSON importer for minisearch migration)
    toBuffer(): Buffer;
    static fromBuffer<ID>(buf: Buffer): MiniSearch<ID>;
    static fromMiniSearchJSON<ID>(json: any): MiniSearch<ID>;
    toJSON(): any;  // legacy format for drop-in use

    // Metadata
    readonly documentCount: number;
    has(id: ID): boolean;
    getStoredFields(id: ID): Record<string, any> | undefined;
  }
  ```
- **Must-have benchmark scenarios (Gate):**
  - **Build-small:** 1k docs × 2 KB avg — target ≥3× vs. `minisearch.addAll`
  - **Build-medium:** 10k docs × 5 KB avg — target ≥5×
  - **Build-large:** 50k docs × 10 KB avg — target ≥5× (main Green-gate case)
  - **Query-exact-short:** 2-word query on a 10k index — target ≥2×
  - **Query-exact-long:** 10-word query on a 50k index — target ≥3×
  - **Query-fuzzy (0.2 tolerance):** 3-word query on a 10k index — target ≥10× (**killer bench**)
  - **Autosuggest:** 3-character prefix on a 10k index — target ≥5×
  - **Serialize/Load:** 50k index toBuffer + fromBuffer — target ≥5× vs. toJSON/loadJSON
- **Acceptance thresholds (Green gate):** ≥3× on build-large AND ≥2× on query-exact-short AND ≥10× on query-fuzzy. Autosuggest + serialize are nice-to-have. If query-exact lands below 1.5× on the short case, I would classify it as Yellow.
- **Risks:**
  - **Custom-function migration** (tokenize/processTerm) — users with custom JS have to preprocess, or stay on pure minisearch
  - **Browser restriction** — Node only; a WASM build is conceivable as a fast-follow but is a separate effort
  - **Fuzzy-score divergence** — ranking parity rather than identity
  - **Binary size** — `rust-stemmers` + `fst` + custom core ~2–3 MB per target, comparable to `@amigo-labs/zip`
  - **Rust-core stability** — `@amigo-labs/bm25` and `@amigo-labs/minisearch` must be released with synchronized versions; a breaking change in the internal core crate has downstream implications

## If NO-GO — BACKLOG entry

Not applicable (GO recommendation).
