# Post-Mortem: `@amigo-labs/nanoid`

**Status:** archived 2026-05-10. Recommending the upstream `nanoid` package.

## Expected gain

A native Rust implementation of NanoID (URL-safe ID generation with a
64-character alphabet, default 21-byte length). Hypothesis: avoiding
V8's per-call function dispatch and tightening the entropy-pool memory
layout in Rust would beat the pure-JS upstream on common single-call
hot paths.

## Measured gain

### v0.1.x (Rust + NAPI)

The Rust version measured ~1500 ns per `nanoid()` call vs. ~260 ns for
upstream `nanoid@5` — about **0.17×**, i.e. roughly 6× *slower*. The
NAPI floor (~109 ns noop, ~180 ns Buffer echo from `docs/BASELINE.md`)
plus argument marshalling already exceeded the entire end-to-end cost
of the JS implementation. That regression triggered the rewrite.

### v0.2.x (pure JS, same strategy as nanoid@5)

After dropping NAPI entirely and shipping `wrapper.js` over Node's
`crypto.randomFillSync` with the same 128-ID entropy pool that
`nanoid@5` uses internally:

| Scenario                            | @amigo-labs/nanoid | nanoid@5     | Ratio        |
| :---------------------------------- | -----------------: | -----------: | -----------: |
| single call (default size=21)       |       4 857 128 Hz | 5 343 615 Hz | **0.91×**    |
| batch 1 000 × default               |           7 060 Hz |     6 008 Hz | **1.17×**    |
| customAlphabet (hex, 32 chars)      |       3 679 495 Hz | 3 680 656 Hz | **1.00×**    |
| single call size=128                |       1 273 179 Hz | 1 125 564 Hz | **1.13×**    |

Range vs `nanoid@5`: **0.91× – 1.17×**. Median: parity. The
single-default-call path — the path everyone actually exercises — is
*slower* than the upstream we are wrapping.

## Root cause

Two stacked failures, one structural and one definitional:

1. **The Rust port (v0.1) failed because the per-call work was smaller
   than the FFI floor.** Generating a 21-byte ID is on the order of
   200 ns of compute. NAPI's argument marshalling alone is ~180 ns for
   a buffer echo. The package was structurally trapped — there was no
   input shape that amortized FFI cost, because the work was bounded by
   ID length, not by call count, and batching just shifted overhead
   from the FFI to the iteration without changing the ratio.

2. **The pure-JS rewrite (v0.2) failed because the work being done is
   already the work `nanoid@5` does.** Both implementations call
   `crypto.randomFillSync` against a 128×size pool, both index the
   URL-safe alphabet with `byte & 63`, both ship the same dependency-free
   surface. There is no remaining lever — when two same-language
   implementations follow the same algorithm, the original wins by
   default because V8 has tuned its inline caches for the popular
   import.

A 1.17× batch win exists, but the absolute throughput at that scenario
(~7 M IDs/sec on 1 000 IDs/batch) is well past the point where any real
workload is bottlenecked on ID generation, and the median single-call
path is the real measurement that decides perceived perf.

## Lesson

Two transferable rules from this one:

- **NAPI cannot win when per-call work is smaller than the FFI floor.**
  Codified in `docs/BASELINE.md`. Use that file as the gate before
  porting any short-work-per-call package.
- **A same-language reimplementation cannot win against the upstream
  it imitates.** If the only differentiator is "we maintain it", that
  is a maintenance decision, not a perf decision, and does not justify
  a separately-published package under the `@amigo-labs` brand.

The brand promise — "always faster than the JS alternative on
realistic inputs" — does not have a "tied or marginally faster on a
fraction of scenarios" carve-out. nanoid had to go.
