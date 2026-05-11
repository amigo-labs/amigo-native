# Candidate review: `zstd`

> **Status:** 🟡 GO (conditional) · **Predicted:** Yellow with Green-on-WASM, Yellow-on-native · **Reviewed:** 2026-05-10

## Verdict

Zstandard compression is structurally a Green-shape workload — buffer-in /
buffer-out, substantial CPU work, no per-byte FFI cost on the V8 side.
The portfolio's existing native competitor benchmark for compression
(`inflate` vs `node:zlib`) clears 1.12–1.67× across all sizes after
Phase-C, which is the realistic upper bound to expect against
`@mongodb-js/zstd` (the canonical native N-API competitor). Against
WASM (`@bokuweb/zstd-wasm`, `zstd-codec`) and pure-JS-decode-only
(`fzstd`) the win is unambiguous — well beyond 2×. **Recommendation:
GO**, but the v0.1 charter must include a trained-dictionary API and
a streaming class API up-front; without those, zstd ends up shaped
exactly like bcrypt (same C source, no measurable win against
`@mongodb-js/zstd`) and risks a Red re-classification.

## JS package

- **npm:** `zstd` is the algorithm; the realistic comparison set on
  npm is `@mongodb-js/zstd` (native N-API, prebuilds), `zstd-codec`
  (emscripten WASM), `@bokuweb/zstd-wasm` (WASM), and `fzstd`
  (pure-JS, decompress-only)
- **Downloads (week of 2026-05-02):** `@mongodb-js/zstd` 816k,
  `zstd-codec` 697k, `fzstd` 269k (decompression in browser
  bundles), aggregate zstd-in-npm ≈ 1.8M/wk
- **Exports / API surface:** `compress(buf, level?) → Uint8Array`,
  `decompress(buf) → Uint8Array`, plus streaming readable/writable
  on `@mongodb-js/zstd` and `zstd-codec`. Trained-dictionary API
  is exposed only by `zstd-codec`.
- **Typical input:** 10 KB – 10 MB binary payloads (HTTP body,
  Kafka message batch, MongoDB BSON document, log-line batches).
- **Typical output:** 1 KB – 10 MB compressed / decompressed
  `Uint8Array`. Output size is the same order of magnitude as input.
- **Realistic median use-case:** one-shot compress / decompress of a
  100 KB – 1 MB payload on an RPC / message / storage boundary.
  Trained dictionaries on small repeating payloads (~1 KB JSON docs,
  Protobuf messages) are the killer secondary use-case.

## Rust replacement

- **Candidate crate(s):** `zstd` (canonical Rust binding to the
  reference `libzstd` C library). For dictionary support: `zstd-safe`
  (lower-level safe wrapper exposing the dictionary API). For
  pure-Rust experimental: `ruzstd` (decompression-only, no SIMD).
- **Maintenance / license:** `zstd` 0.13.x is actively maintained
  (gyscos/zstd-rs), BSD/MIT, widely used (Cargo itself depends on
  it). `libzstd` upstream (Facebook) is mature, BSD-licensed,
  actively maintained.
- **Known gotchas / divergences:**
  - The `zstd` crate links `libzstd` C by default. Same C source as
    `@mongodb-js/zstd`'s C++ binding. Per-cycle parity is real — the
    win must come from elsewhere (FFI overhead, batch API, better
    defaults, dictionary support, prebuild reliability).
  - `pure` feature uses `ruzstd` (decompression only). Not a real
    alternative for v0.1.
  - SIMD support is opt-in via `experimental` feature; reference
    `libzstd` already uses SSE2/AVX2 internally where available.

## BACKLOG check

No entry in `BACKLOG.md` for `zstd`, `@mongodb-js/zstd`, `zstd-codec`,
`fzstd`, or any zstd-spelling variant. Fresh territory.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | High. Compress 100 KB ≈ 1–5 ms, 10 MB ≈ 30–80 ms (level 3 default). Decompress ~2× faster than compress. Per-call work dwarfs the 109 ns NAPI floor and the ~180 ns flat Buffer transfer cost (`docs/BASELINE.md:23, 29`). FFI share is rounding error. |
| Input size distribution | Wide. 1 KB – 10 MB realistic. Buffer-flat marshalling (zero-copy) means the same code path handles the full range. |
| Output size distribution | Same order of magnitude as input; same Buffer-flat path. |
| Reusable setup (stateful potential) | **High.** Compression contexts (`ZSTD_CCtx`) and trained dictionaries (`ZSTD_CDict`) amortize across many calls. A NAPI class holding a reusable context + loaded dictionary is the bm25 / minisearch Green-recipe applied to compression. |
| Batch-usage realism | Medium. Kafka-style batched compression and log-line bulk-compress workloads exist. A `compressMany(buffers, dict?)` overload that reuses the context across N inputs is the highest-leverage batch API. |
| FFI-share estimate vs. Rust work | <1% even at the small end (1 KB compress ≈ 100 µs, FFI ≈ 360 ns). Not FFI-bound at any realistic input. |

## Classification reasoning

The shape is unambiguously Green-friendly: bytes-in / bytes-out,
substantial compute per call, mature Rust binding, stateful contexts
available, dictionary API available. This is the `inflate` /
`encoding` / `jose` shape, not the `mime` / `nanoid` / `deep-equal`
shape.

The risk is not whether Rust can win against pure-JS or WASM — it
trivially can. The risk is the bcrypt scenario: `@mongodb-js/zstd`
already wraps the same reference C library, and a naive
`@amigo-labs/zstd` would be wrapping the same C library too, leaving
no algorithmic headroom. The bcrypt review (`docs/perf-review/bcrypt.md`)
documents this trap clearly: 1.01–1.03× is Red, not Yellow.

The differentiators that keep `@amigo-labs/zstd` in Yellow / Green
territory rather than collapsing to bcrypt-Red are:

1. **Reusable compression contexts via NAPI class.** `@mongodb-js/zstd`
   allocates a fresh `ZSTD_CCtx` per call in its synchronous path. A
   reusable `Compressor` class amortizes that allocation across N
   calls. On 1 KB inputs (the typical "log-line / RPC payload" size),
   context-allocation cost is a meaningful share of the 100 µs work
   — likely 5–15%. That alone is the difference between 1.05× and
   1.20×.
2. **Trained dictionaries as a first-class API.** For repeating small
   payloads (the Kafka / log / RPC sweet spot), dictionaries cut
   output size by 3–10× and compression cost by 2–3×. Many Node
   teams skip dictionaries because the existing API is awkward.
   Making it ergonomic is a real win — and structurally a Green
   workload (dict load amortizes, per-call work stays substantial).
3. **NAPI-rs over `node-addon-api`.** `@mongodb-js/zstd` uses
   `node-addon-api` (C++); NAPI-rs has measurably lower per-call
   overhead in published benchmarks. Worth 50–100 ns / call on small
   inputs.

Against WASM (`@bokuweb/zstd-wasm`, `zstd-codec`) the win is large
(WASM zstd is 2–4× slower than native libzstd at large sizes, much
worse on small inputs due to startup / boundary cost).

Against `fzstd` (pure-JS decompression) the win is unambiguous and
expected to clear 5–10× — `fzstd` exists for browser bundles where
binary size matters more than speed.

**Predicted classification:** 🟡 Yellow against `@mongodb-js/zstd` on
the naive one-shot path; 🟢 Green once the stateful `Compressor` class
+ dictionary API ship; 🟢 Green-by-a-wide-margin against any WASM /
pure-JS alternative on every size.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/zstd`
- **Primary API sketch:**
  ```ts
  // One-shot drop-ins (parity:strict with @mongodb-js/zstd)
  export function compress(input: Buffer, level?: number): Buffer
  export function decompress(input: Buffer): Buffer

  // Stateful class — the differentiator
  export class Compressor {
    constructor(options?: { level?: number; dictionary?: Buffer })
    compress(input: Buffer): Buffer
    compressMany(inputs: Buffer[]): Buffer[]
  }
  export class Decompressor {
    constructor(options?: { dictionary?: Buffer })
    decompress(input: Buffer): Buffer
    decompressMany(inputs: Buffer[]): Buffer[]
  }

  // Dictionary training
  export function trainDictionary(
    samples: Buffer[],
    dictSize?: number
  ): Buffer
  ```
- **Must-have benchmark scenarios:**
  - compress / decompress at 1 KB, 100 KB, 10 MB on text and on
    incompressible random data
  - compress with levels 1, 3 (default), 9, 19
  - `Compressor` class reuse over 1000 × 1 KB payloads
    (where the context-allocation amortization shows)
  - trained-dictionary compress on 1 KB JSON docs (the killer
    secondary use-case)
  - decompress under malformed input (panic-safety)
  - vs `@mongodb-js/zstd` (native N-API, the realistic competitor)
  - vs `@bokuweb/zstd-wasm` and `zstd-codec` (WASM baselines)
  - vs `fzstd` (decompression-only pure-JS baseline)
- **Acceptance thresholds (Green gate):**
  - ≥1.5× vs `@mongodb-js/zstd` on the `Compressor` class reuse
    path (1000 × 1 KB) — otherwise re-classify as Yellow.
  - ≥2× vs `@bokuweb/zstd-wasm` on every size.
  - ≥1.0× vs `@mongodb-js/zstd` on the one-shot path
    (parity floor — anything below is bcrypt-Red).
- **Risks:**
  - **bcrypt-trap**: same upstream C library on both sides. If
    `Compressor` class / dictionary path does not measurably beat
    `@mongodb-js/zstd`, the package is Red and must be deprecated.
    Do not ship without this measurement.
  - **Streaming API**: zstd's streaming compress is widely used in
    Node (`createCompressor()` returns a `Transform`). A drop-in
    streaming shim over the NAPI boundary risks the xml-style
    event-per-chunk antipattern (`docs/post-mortems/xml.md` if
    present). v0.1 should ship one-shot + batch first and defer
    streaming to v0.2 with a "compress this whole stream in one
    Rust call, return a single Buffer" shape, not per-chunk
    callbacks.
  - **Level=22 / ultra modes**: Ultra-high compression levels are
    extremely slow and rarely used. Scope parity to levels 1–19
    (the `libzstd` default range); document `--long` and ultra
    modes as out-of-scope for v0.1.

## If NO-GO — BACKLOG entry

Not applicable (verdict is GO). For posterity, if the
`Compressor`-class benchmark fails to beat `@mongodb-js/zstd`, the
NO-GO entry would read:

```markdown
- [`zstd`] (npm: many) — **[MEASURED]** identical to
  `@mongodb-js/zstd` on the one-shot path; stateful `Compressor`
  class did not amortize sufficiently to clear 1.5× even on
  1000 × 1 KB workload. See `docs/perf-review/zstd.md` for the
  bcrypt-trap pattern: same upstream `libzstd` C library on both
  sides, no algorithmic headroom.
```

Section in `BACKLOG.md`: **[MEASURED] — shipped+deprecated or
candidate-and-archived after benchmarking**

## References

- BASELINE: `docs/BASELINE.md` (NAPI floor 109 ns, Buffer flat ~180 ns
  to 10 MB — `docs/BASELINE.md:23, 29`)
- Portfolio neighbour: `crates/inflate/` + `docs/perf-review/inflate.md`
  (compression, same Buffer-flat shape, 1.12–1.67× over `node:zlib`
  post-Phase-C)
- Bcrypt trap reference: `docs/perf-review/bcrypt.md` (same-C-source
  pattern, structurally unreachable Green)
- Stateful-class Green pattern: `crates/bm25/`, `crates/minisearch/`
- Rust crate: <https://crates.io/crates/zstd>
- Upstream C library: <https://github.com/facebook/zstd>
- Primary native competitor: <https://www.npmjs.com/package/@mongodb-js/zstd>
