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

None. The string-conversion cost was clear from the BASELINE numbers:
no algorithmic improvement on the Rust side can pay off the 2×
conversion penalty unless we can change the input shape.

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

- 0.2.0: `deprecated` field in package.json; README warning.
- Three month window.
- After: archived/.

Users should switch to `fast-levenshtein` (or `leven` for smaller
bundles, acknowledging it's noticeably slower).
