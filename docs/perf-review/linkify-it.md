# Candidate review: `linkify-it`

> **Status:** 🟢 GO · **Predicted:** Green for batch / large text, Yellow for tiny inputs · **Reviewed:** 2026-05-10

## Verdict

`linkify-it` is the URL / email detection engine behind `markdown-it`,
Slack-style chat renderers, and many in-text-linkification pipelines.
It scans a text buffer character-by-character against a TLD table and
schema list, returning a list of `{ start, end, kind }` spans. The
shape is buffer-in / offsets-out — exactly the `sentences` /
`turndown` text-processing Green pattern, with offset-packed
`Uint32Array` output to avoid V8 object marshalling. **Recommendation:
GO.**

## JS package

- **npm:** `linkify-it`
- **Downloads (week of 2026-05-02):** 25.5M (much higher than the
  intuitive estimate — `linkify-it` is the de-facto auto-link
  engine in the markdown / chat-renderer ecosystem and is pulled
  in transitively by hundreds of packages, headed by `markdown-it`
  itself)
- **Exports / API surface:**
  - `new LinkifyIt(schemas?, options?)`
  - `linkify.match(text) → Match[] | null` where
    `Match = { schema, index, lastIndex, raw, text, url }`
  - `linkify.test(text)` / `linkify.testSchemaAt(text, name, pos)`
    — pre-checks before a full match
  - `linkify.add(schema, definition)` / `linkify.set(options)` —
    schema customization
  - Tunables: `fuzzyLink`, `fuzzyEmail`, `fuzzyIP`
- **Typical input:** prose text, 100 B – 100 KB. Markdown source,
  chat messages, email bodies.
- **Typical output:** an array of 0–100 match spans per call. Each
  span is a small object; total output is small relative to input.
- **Realistic median use-case:**
  - **Markdown rendering**: every paragraph in a markdown doc gets
    scanned for inline links. Many calls per document, each on
    short text.
  - **Chat renderers**: every chat message scanned once for
    auto-link.
  - **Email body processing**: one call per email body, ranging
    from a tweet-length few hundred bytes to ~100 KB.

## Rust replacement

- **Candidate crate(s):** `linkify` (canonical Rust binding,
  battle-tested in `mdcat`, `comrak`, and `linkify-cli`). Smaller
  feature surface than `linkify-it` (no fuzzy IP, simpler schema
  model), so v0.1 parity scope must be set carefully.
- **Maintenance / license:** `linkify` 0.11.0 (released
  2026-04-12), actively maintained (robinst/linkify),
  MIT/Apache-2.0, used in production by many Rust markdown /
  terminal tools.
- **Known gotchas / divergences:**
  - `linkify-it` supports `fuzzyLink`, `fuzzyEmail`, `fuzzyIP`. The
    Rust `linkify` crate has equivalents for URL and email but not
    for fuzzy IP detection (`192.168.1.1` in text without a
    scheme). For full parity, either reimplement fuzzy IP in the
    NAPI layer or scope it out for v0.1.
  - TLD list synchronization: `linkify-it` ships a bundled TLD
    list and refreshes it per release; `linkify` uses a built-in
    TLD list compiled at crate build time. Pin a version and
    document the update story.
  - `linkify-it` supports per-instance schema mutation
    (`linkify.add('twitter:', { validate, normalize })`). The Rust
    crate is more static. v0.1 should ship the default schema set
    (`http`, `https`, `ftp`, `mailto`) and defer custom schemas.

## BACKLOG check

No entry in `BACKLOG.md` for `linkify-it`, `linkify`, `autolinker`,
or related. Fresh territory.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | Substantial for any non-trivial text. A 10 KB blog post = ~10k chars to scan, with TLD lookup per `.`. Pure-JS `linkify-it` runs at ~10–50 µs / KB of text; Rust `linkify` runs at <5 µs / KB. Per-call work dwarfs the NAPI floor (`docs/BASELINE.md:23`) for any text > 1 KB. |
| Input size distribution | 100 B – 100 KB. The small end (100 B chat messages) is where FFI floor + string round-trip matter. String round-trip cost at 100 B is ~250 ns; per-call work is ~5 µs in pure JS, ~1 µs in Rust. Yellow at the tiny end. |
| Output size distribution | Small. Span list of 0–100 entries. Pack to `Uint32Array` of `[index, lastIndex, schemaId, ...]` quadruples to keep marshalling flat. |
| Reusable setup (stateful potential) | Yes for custom-schema instances (load schema list once, query many times), but the default-schema path already amortizes statically. The class API maps cleanly to a NAPI class for customization scenarios. |
| Batch-usage realism | Medium. `matchMany(texts: string[])` is real for markdown rendering (one call per paragraph), but each individual call is non-trivial. The win comes from cheaper per-call FFI overhead, not from batch-only paths. |
| FFI-share estimate vs. Rust work | <5% at 1 KB+; ~30% at 100 B (the chat-message worst case — but pure-JS is fast there too). |

## Classification reasoning

The shape closely mirrors `crates/sentences/` (text-in, packed-
offsets-out) and `crates/turndown/` (text-processing, buffer
interface). Both shipped Green. The realistic input regime is mostly
non-trivial text — markdown bodies, email content, blog posts —
where the Rust scan-per-char advantage compounds over kilobytes.

Pure-JS `linkify-it` is notably slow on long text because its
character loop runs in V8 with per-char regex / TLD lookups.
Rust `linkify` uses a finite-state automaton over byte slices —
2-5× faster in published benchmarks, even before SIMD.

The risk is the 100 B – 1 KB regime (chat messages, single tweet),
where the JS work is already <10 µs and FFI overhead is a meaningful
share. This is *not* the dominant call shape but it is common enough
that the per-call path must clear 1.0× even at small inputs.

The offset-packed output (`Uint32Array` of quadruples rather than an
array of `Match` objects) is essential. The `xml` post-mortem
(`docs/perf-review/xml.md`) showed that returning AST-style objects
across NAPI is the Red-path; offset packing is the documented
Green-path mitigation.

**Predicted classification:** 🟢 Green at ≥1 KB text. 🟡 Yellow at
<500 B chat-message inputs. The combined classification is Green
because the median realistic call (a paragraph or chat message
within a render loop) sits firmly above the FFI-floor threshold.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/linkify-it`
- **Primary API sketch:**
  ```ts
  type SchemaId = 'http' | 'https' | 'ftp' | 'mailto' | string
  type Match = {
    schema: SchemaId
    index: number
    lastIndex: number
    raw: string
    text: string
    url: string
  }

  type Options = {
    fuzzyLink?: boolean
    fuzzyEmail?: boolean
    fuzzyIP?: boolean  // v0.1: silently ignored, parity stub
  }

  // Parity drop-in (Match objects)
  export class LinkifyIt {
    constructor(options?: Options)
    match(text: string): Match[] | null
    test(text: string): boolean
    add(schema: string, definition: any): this   // v0.1: throws
    set(options: Options): this
  }

  // Offset-packed fast path
  export function matchOffsets(
    text: string | Buffer,
    options?: Options
  ): Uint32Array  // [start, end, schemaId, ...] packed quadruples

  export const SCHEMA_IDS: Record<SchemaId, number>
  ```
- **Must-have benchmark scenarios:**
  - 100 B chat message (tiny-input regime — Yellow gate)
  - 1 KB / 10 KB blog post / email body (median use-case)
  - 100 KB markdown doc (large-input regime — Green ceiling)
  - 1000 × 1 KB messages via `matchOffsets` (batch / render-loop
    scenario)
  - `fuzzyLink`, `fuzzyEmail` on / off — quantify the cost
  - vs `linkify-it` (the headline pure-JS competitor)
  - vs `linkifyjs` (the SoapBox `linkifyjs` package)
  - vs `autolinker.js`
- **Acceptance thresholds (Green gate):**
  - ≥3× vs `linkify-it` at 1 KB
  - ≥5× vs `linkify-it` at 10 KB
  - ≥1.0× vs `linkify-it` at 100 B (small-input floor; if below
    1.0×, document the crossover honestly and recommend `linkify-
    it` for those use-cases)
  - Output parity verified against `linkify-it`'s test suite
- **Risks:**
  - **`fuzzyIP` parity gap**: scope out for v0.1 explicitly.
    Document in the README.
  - **Custom schema API**: scope out for v0.1. Document.
  - **Tiny-input crossover**: if 100 B benchmarks come in at
    <0.8× even after `&str` overload, document the small-input
    floor and recommend pure-JS `linkify-it` for tweet-length
    inputs.
  - **TLD list freshness**: pin the upstream `linkify` crate
    version and document the cadence.

## If NO-GO — BACKLOG entry

Not applicable (verdict is GO).

## References

- BASELINE: `docs/BASELINE.md` (NAPI floor 109 ns; string round-trip
  0.35 ns / byte means small-input regime needs care)
- Portfolio neighbours: `crates/sentences/` (offset-packed text
  output, Green), `crates/turndown/` (text-processing, Green),
  `crates/commonmark/` (markdown rendering — directly upstream of
  this use-case)
- AST-marshalling antipattern: `docs/perf-review/xml.md` (Red —
  returning AST objects across NAPI), explicit motivation for the
  `matchOffsets` fast path
- Rust crate: <https://crates.io/crates/linkify>
- Upstream JS: <https://github.com/markdown-it/linkify-it>
