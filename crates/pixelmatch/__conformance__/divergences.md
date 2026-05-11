# Divergences — pixelmatch

> Tracked deltas vs the upstream `pixelmatch` (mapbox/pixelmatch) npm
> package. Empty if parity is 100%.

## API shape

- **Upstream:** `pixelmatch(img1, img2, output, width, height, options) → number`
  — caller passes a pre-allocated `output` buffer (or `null`) and the
  function writes the diff in place, returning the count of differing
  pixels.
- **`@amigo-labs/pixelmatch`:** `pixelmatch(img1, img2, width, height, options) → { numDiff, diff }`
  — the function allocates and returns its own diff buffer alongside the
  count. `countDiff(...)` is the equivalent of upstream's
  "`output = null`" no-allocation path.
- **Why:** N-API does not safely accept `&mut Buffer` as a parameter
  shape. The output-by-return shape is idiomatic for NAPI-rs and keeps
  zero-copy hand-off intact for the common case (one diff per snapshot
  test). A `pixelmatch(img1, img2, output, ...)` JS shim that mutates
  `output` from the returned `diff` is on the v0.2 wishlist for strict
  drop-in callers.

## Threshold-boundary float-determinism

- **Inputs at the threshold boundary** — pixels whose YIQ delta differs
  from `35215 * threshold²` by less than ~1 ulp may diverge by 1 pixel
  in `numDiff` between this implementation and upstream.
- **Why:** JS double-precision and Rust f64 are both IEEE-754
  double, but operation ordering inside the YIQ delta computation
  differs slightly between the JS source and the Rust port. Both
  implementations are individually deterministic.
- **Effect:** zero on the curated upstream conformance corpus
  (`upstream.spec.ts`), occasional 1-pixel disagreements on
  fully-random inputs near the threshold (observed at 1×1
  alpha-blended fixtures during fuzzing).
- **Workaround:** if you need bit-exact `numDiff` parity, set
  `threshold` to a value far from the boundary of any expected delta
  (e.g. `threshold: 0` or `threshold: 0.5`) so threshold-boundary
  ambiguity does not arise. The output-buffer byte parity is preserved
  for non-AA branches under default options.

## Option naming

- **Upstream:** `includeAA`, `aaColor`, `diffColor`, `diffColorAlt`,
  `diffMask` (camelCase).
- **`@amigo-labs/pixelmatch`:** same camelCase names exposed at the JS
  boundary via NAPI's snake-case → camelCase conversion (`includeAa`
  ⇄ `includeAA`). The lowercase `aa` casing is what NAPI-rs derives
  from `include_aa`. Strict upstream parity for the JS option name
  requires renaming the Rust field to `includeAA` via `#[napi(js_name)]`
  on the option struct field — pending v0.2.
