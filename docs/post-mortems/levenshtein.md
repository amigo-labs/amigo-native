# Post-Mortem: `@amigo-labs/levenshtein`

**Status:** deprecated in 0.2.0, recommending `fast-levenshtein`
upstream.

## Expected gain

Edit-distance computation is O(n × m) with heavy arithmetic — an
obvious candidate for a Rust port, especially with `triple_accel`'s
SIMD-accelerated banded DP. Hypothesis: on longer strings the Rust
algorithm would pull ahead by large margins.

## Measured gain

| Scenario | `@amigo-labs/levenshtein` | `fast-levenshtein` | Ratio |
|---|---:|---:|---:|
| 10 chars | 1,824,166 ops/s | 3,058,801 ops/s | **0.60× slower** |
| 100 chars | 267,353 ops/s | 242,086 ops/s | 1.10× (parity) |
| 1000 chars | 1,191 ops/s | 4,945 ops/s | **0.24× slower** |
| 10000 chars | 7 ops/s | 54 ops/s | **0.13× slower** |

Never faster. Gets **worse** on longer strings — the exact opposite
of the hypothesis.

## Root cause

Each call passes two strings across NAPI, which costs ~0.35 ns per
byte for UTF-16 → UTF-8 conversion in each direction
(`docs/BASELINE.md`). For a 10,000-char pair of inputs:

- two input conversions: ~7 µs
- the actual DP: ~150 µs for classical Wagner-Fischer, ~20 µs with
  SIMD banding
- NAPI call overhead: ~200 ns

`fast-levenshtein` operates directly on V8 strings via
`charCodeAt(i)` — no conversion, no FFI. Its inner loop is
hot-path-JIT'd into machine code that's competitive with SIMD Rust
on most CPUs.

So our ~20 µs Rust core + 7 µs FFI conversion = 27 µs, vs
fast-levenshtein's ~14 µs pure-JIT — we're paying twice the runtime
for cleaner code paths. The longer the strings, the worse the ratio
because conversion scales linearly with length.

## What was tried

Original 0.2.0 deprecation: nothing — the analytical BASELINE
numbers were taken as sufficient evidence.

**2026-04-19 re-review (`docs/perf-review/levenshtein.md`)**: spiked
a `distanceU16(Uint16Array, Uint16Array)` overload. The hypothesis
was that replacing the `String` input (UTF-16 → UTF-8 conversion at
~0.35 ns/byte × 2 directions) with a `Uint16Array` (V8-handle
crossing, ~180 ns flat per `docs/BASELINE.md`) would flip the 10k-
char case.

Implementation: Wagner-Fischer over `&[u16]` with row-swap, scalar
(no SIMD), ~30 LOC. Benched against the existing `String`-input path
and `fast-levenshtein` across the same 4 size tiers plus two
asymmetric pairs.

Measured (node v22, Linux/x64):

| Scenario | `get(String)` (Hz) | `distanceU16(Uint16Array)` (Hz) | `fast-levenshtein` (Hz) |
|---|---:|---:|---:|
| 10 chars | 1.505.530 | 1.282.693 | 2.451.414 |
| 100 chars | 271.992 | 53.427 | 195.135 |
| 1.000 chars | 966 | 570 | 3.554 |
| 10.000 chars | 6,98 | 5,74 | 38,4 |
| 10 × 500 | 116.290 | 97.912 | 187.960 |
| 100 × 5.000 | 56,7 | **1.097** | 6.158 |

Gate: "≥1,5× faster than `fast-levenshtein` at 10k chars". Actual:
6,7× slower. **Gate failed** — spike reverted.

Additional findings from the spike:

- **FFI conversion was not the bottleneck.** The original post-mortem
  estimated Rust-core ~20 µs for 10k chars; actual measurement is
  ~143 ms. `triple_accel`'s SIMD banded DP collapses when the edit
  distance approaches `n` (random string pair with distance ≈ n), the
  band expands to full width and SIMD overhead exceeds the gain over
  plain scalar DP.
- **scalar u16 DP is slower than `triple_accel` on symmetric inputs.**
  At 100 chars the u16 scalar path loses 5× vs. the byte SIMD path.
  Skipping FFI conversion doesn't recover the compute gap.
- **`triple_accel` has a 19× pathology on asymmetric input** (100 ×
  5.000): `get` does 17,6 ms, scalar u16 DP does 0,9 ms. Even so,
  `fast-levenshtein` beats both at 0,16 ms — V8-JIT on direct
  UTF-16 code units is very hard to beat.

The only shape the spike revealed as potentially competitive is
**bounded-distance early-termination** (O(k·n) for small k). That
would be a new API, not a faster implementation, and addresses a use
case `fast-levenshtein` also doesn't cover. Not worth a port on its
own — implementable in ~15 lines of JS.

Conclusion: the deprecation stands. String-vs-V8-`charCodeAt` is the
right comparison, and V8 wins structurally. Asymmetric benchmark
additions stay in `__bench__/index.bench.ts` as evidence.

## Alternative that was considered and rejected

`levenshteinBytes(a: Buffer, b: Buffer)` — take raw UTF-8 bytes, skip
conversion entirely. Would flip the comparison and likely put us at
~3-5× faster on long inputs.

Rejected because:
- It's not a drop-in replacement for `fast-levenshtein`'s
  `(str, str)` API. Users would have to manually encode strings,
  which is awkward in most call sites.
- It computes byte-level distance, not Unicode character distance —
  `'ä'` is 2 bytes in UTF-8, so `lev('cafe', 'café') === 2` byte-wise
  but `=== 1` character-wise. That's a correctness difference most
  users wouldn't want.
- A byte-level lev is a different package for a different use case
  (binary diffing, DNA sequences) — not an edit-distance-over-text
  replacement.

If that use case ever materialises, ship it as a separate package.

## What we learned

- Packages whose input and output are both strings pay the
  conversion cost twice per call. The longer the strings, the more
  of the budget goes into marshalling. That reverses Rust's
  algorithmic advantage for anything except very CPU-heavy work.
- `fast-levenshtein` beats us because V8 can operate on UTF-16 code
  units *in place* via `charCodeAt`. There is no Rust-side
  equivalent that stays zero-copy for UTF-8 strings.
- If the Rust-side work per byte is below ~5 ns, the conversion
  overhead wins. Edit distance sits around 1-2 ns/byte with SIMD.

## Deprecation plan

- 0.2.0 (2026-Q1): `deprecated` field in package.json; README warning.
- Three-month window **waived** after the 2026-04-19 re-review: spike
  measured, gate failed, no credible flip remains. Source moved to
  `archived/levenshtein/` the same day.
- npm registry keeps 0.2.0 with the deprecation notice — no further
  releases. Historical bench data stays in `docs/benchmarks/levenshtein.json`
  and `docs/history/levenshtein.jsonl`.

Users should switch to `fast-levenshtein` (or `leven` for smaller
bundles, acknowledging it's noticeably slower).
