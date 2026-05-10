# Candidate review: `fuse.js`

> **Status:** 🟢 GO · **Predicted:** Green · **Reviewed:** 2026-05-10

## Verdict

`fuse.js` is a near-textbook fit for the portfolio's strongest
ship-shape: a stateful index built once and queried many times, with
the per-query loop dominated by CPU-bound string scanning (Bitap
algorithm). The `bm25` and `minisearch` precedents have already
proven that this exact shape clears Green when implemented as a
NAPI class with offset-packed output. Pure-JS `fuse.js` is widely
documented as the slow baseline above ~10k records, and Rust matchers
(`nucleo-matcher`, `fuzzy-matcher`) deliver SIMD-accelerated scanning
that pure-JS cannot match. **Recommendation: GO.**

## JS package

- **npm:** `fuse.js`
- **Downloads (week of 2026-05-02):** 9.4M (one of the top-50
  most-downloaded search-related packages on npm)
- **Exports / API surface:** `new Fuse(list, options)`,
  `fuse.search(query, options?) → result[]`,
  `fuse.add(doc)`, `fuse.remove(predicate)`, `fuse.setCollection(list)`,
  `Fuse.createIndex(...)` / `Fuse.parseIndex(...)` for index
  serialization. Options: `keys` (weighted), `threshold`,
  `distance`, `includeScore`, `includeMatches`,
  `useExtendedSearch`, `ignoreLocation`, `findAllMatches`,
  `minMatchCharLength`.
- **Typical input:** a list of 1k–500k records (objects with one or
  more searchable text fields) at index time; a short query string
  (1–60 chars) at query time.
- **Typical output:** `{ item, refIndex, score, matches? }[]`, length
  bounded by `limit` (often 10–100).
- **Realistic median use-case:** in-process fuzzy autocomplete or
  filter over a moderate corpus (commands, contacts, files, product
  catalogue). The fuse index is built once at app start (or on
  collection update) and queried per keystroke.

## Rust replacement

- **Candidate crate(s):** `nucleo-matcher` (the matcher behind the
  `nucleo` fuzzy picker, used in `helix-editor` and `zellij`; SIMD,
  scoring, multi-pattern), `fuzzy-matcher` (the original
  `skim`/`fzf`-style matcher), `sublime_fuzzy` (sublime-style). For
  Bitap-style ranking with field weights similar to fuse.js,
  `nucleo-matcher` + a small per-record weight layer is the closest
  fit.
- **Maintenance / license:** `nucleo-matcher` 0.3.x is actively
  maintained, MIT/Apache-2.0, production-used. `fuzzy-matcher` is
  mature, MIT, slightly less actively maintained.
- **Known gotchas / divergences:**
  - Fuse.js scoring is a custom Bitap variant with location bias,
    distance weighting, and field weights. Rust matchers use
    different scoring (fzf-style). `parity:strict` on the *ranking*
    is impossible without reimplementing fuse's exact scoring. Scope
    must say "parity on the API surface and ranking *direction*
    (closer matches rank higher), not on the score numbers".
  - `useExtendedSearch` (`!` negation, `^` prefix, `$` suffix,
    `=` exact) is fuse-specific syntax. Either reimplement or scope
    out for v0.1.

## BACKLOG check

No entry in `BACKLOG.md` for `fuse.js`, `fuse`, `fuzzysort`, or any
fuzzy-match variant. Fresh territory.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | High at index build (10k–100k records × multiple fields × tokenization), substantial at query time (Bitap scan over every record's tokens). Build is one-shot, query is hot-loop. Both dwarf the 109 ns NAPI floor. |
| Input size distribution | Build: 1k–500k records, each with 1–10 short text fields. Query: 1–60 char string. Wide on build side, narrow on query side. |
| Output size distribution | Result list is typically bounded to 10–100 items via `limit`. With `includeMatches`, per-result match offsets can be 10s of ranges — pack into `Uint32Array` to dodge V8 marshalling. |
| Reusable setup (stateful potential) | **Extremely high.** The fuse index is the entire point of the library. NAPI class with the index living on the Rust side is the obvious shape. This is exactly the bm25 / minisearch Green-recipe. |
| Batch-usage realism | Medium. Per-keystroke query is the dominant call shape (sequential). Batched `searchMany(queries)` is a real use-case for log analysis / data dedup but not the headline. |
| FFI-share estimate vs. Rust work | <2% on the build path (one big call, 100k records). <5% on the query path (one call per keystroke, ~10–100 result objects marshalled back). Buffer-of-offsets for matches keeps marshalling flat. |

## Classification reasoning

The shape is a direct copy of `bm25` and `minisearch`: build a
state-heavy index once, query against it cheaply, return small
result sets. Both `bm25` and `minisearch` were classified Green
once their indices moved into a NAPI class instead of being rebuilt
per call. The same recipe applies here.

Pure-JS `fuse.js` is well-known as the slow baseline for fuzzy
search at scale — multiple community benchmarks show it 5–20× slower
than `fzf` / `nucleo` / `fzy` on 100k-record corpora. The Rust
matchers operate on byte slices with SIMD where available, while
fuse.js operates on JS strings with per-character JS loops.

The realistic competitor set:

- `fuse.js` itself (pure-JS, the headline baseline)
- `fuzzysort` (pure-JS, faster than fuse but no field-weighting or
  fuse-style options)
- `match-sorter` (pure-JS, simpler scoring)
- WASM matchers exist but none are mainstream on npm

No native N-API fuzzy matcher dominates npm — there is no
`@mongodb-js/zstd`-style native competitor that would trigger the
bcrypt trap. The market for `@amigo-labs/fuse` is wide open.

**Predicted classification:** 🟢 Green at all sizes ≥10k records,
likely 🟡 Yellow at 100–1k records (FFI overhead + index build
dominates the work). The bench scope must report the crossover.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/fuse`
- **Primary API sketch:**
  ```ts
  type FuseOptions = {
    keys?: (string | { name: string; weight?: number })[]
    threshold?: number     // 0.0 = exact, 1.0 = any
    distance?: number
    includeScore?: boolean
    includeMatches?: boolean
    ignoreLocation?: boolean
    findAllMatches?: boolean
    minMatchCharLength?: number
    limit?: number
  }

  type FuseResult<T> = {
    item: T
    refIndex: number
    score?: number
    matches?: { key: string; indices: Uint32Array }[]
  }

  export class Fuse<T> {
    constructor(list: T[], options?: FuseOptions)
    search(query: string, opts?: { limit?: number }): FuseResult<T>[]
    add(doc: T): void
    remove(predicate: (doc: T) => boolean): T[]
    setCollection(list: T[]): void

    // Offset-packed fast path — bypass FuseResult marshalling
    searchOffsets(query: string, limit?: number): {
      indices: Uint32Array
      scores: Float32Array
      matchRanges?: Uint32Array  // packed [recordIdx, keyIdx, start, end, ...]
    }
  }
  ```
- **Must-have benchmark scenarios:**
  - Build index for 1k / 10k / 100k records, 3 string fields each.
  - Single query against each size, with and without
    `includeMatches`.
  - 1000 queries against a 100k-record index (the realistic
    per-keystroke pattern).
  - vs `fuse.js` (the headline competitor), `fuzzysort`,
    `match-sorter`.
  - With/without `includeScore` and `includeMatches` — quantify the
    marshalling cost separately.
- **Acceptance thresholds (Green gate):**
  - ≥3× vs `fuse.js` at 10k records (any single query).
  - ≥5× vs `fuse.js` at 100k records.
  - ≥1.0× vs `fuse.js` at 100 records (the smallest realistic
    corpus; if Rust loses here, document as the small-corpus
    crossover and link to it in the README).
- **Risks:**
  - **Scoring parity**: fuse.js scoring is a custom Bitap variant.
    Reimplementing the exact numbers is out of scope; the parity
    contract is *ranking direction*, not *score values*. Document
    this explicitly in the crate README.
  - **`useExtendedSearch` syntax**: scope to v0.2.
  - **Index-build amortization**: small-corpus benchmark may show
    Yellow / parity. The Green-classification is conditional on
    medium-to-large corpora. Document the crossover honestly.
  - **`includeMatches` marshalling**: a 100-result query with full
    match-index objects can return 1000+ small objects. The
    `searchOffsets` fast path is the v0.1 hedge against this.

## If NO-GO — BACKLOG entry

Not applicable (verdict is GO).

## References

- BASELINE: `docs/BASELINE.md` (NAPI floor 109 ns, stateful classes
  amortize build cost)
- Portfolio neighbours: `crates/bm25/`, `crates/minisearch/` — the
  proven stateful-search-index Green pattern
- Rust crates: <https://crates.io/crates/nucleo-matcher>,
  <https://crates.io/crates/fuzzy-matcher>
- Upstream JS: <https://www.fusejs.io/>
- Comparison patterns: `docs/perf-review/bm25.md`,
  `docs/perf-review/minisearch.md` if present
