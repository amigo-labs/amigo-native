# Candidate review: `pixelmatch`

> **Status:** 🟢 GO · **Predicted:** Green · **Reviewed:** 2026-05-10

## Verdict

`pixelmatch` is the de-facto standard for pixel-level image
comparison on npm — it powers Cypress and Playwright visual-
regression snapshot diffs, BackstopJS, and most "did this commit
break the UI" pipelines in front-end CI. The shape is buffer-in /
scalar-out: two raw RGBA pixel buffers in, count of differing
pixels out, optional diff buffer out. Per-pixel YIQ color-space
comparison loops are exactly where Rust SIMD pulls ahead of V8 JIT.
Tight parity surface (one entry point + small options object) keeps
the v0.1 cost low. **Recommendation: GO.**

## JS package

- **npm:** `pixelmatch`
- **Downloads:** ~4M / week (Mapbox-authored, used in Cypress,
  Playwright, BackstopJS, jest-image-snapshot, visual-regression
  CI tools)
- **Exports / API surface:**
  - `pixelmatch(img1, img2, output, width, height, options?)`
    → number of differing pixels
  - Options: `threshold` (default 0.1), `includeAA`,
    `alpha` (anti-aliasing background opacity), `aaColor`,
    `diffColor`, `diffColorAlt`, `diffMask`
- **Typical input:** two `Uint8Array` RGBA buffers of identical
  size, plus an output buffer of the same size for diff
  visualization. Sizes typically 100k–10M pixels (= 400 KB – 40 MB
  each).
- **Typical output:** scalar count of differing pixels; the
  `output` buffer is written in-place.
- **Realistic median use-case:**
  - **Visual-regression test runner**: per test, decode two PNGs
    (baseline + current), call `pixelmatch`, encode the diff PNG.
    Tens to thousands of diffs per CI run.
  - **Snapshot testing**: same as above, integrated into Jest /
    Vitest / Playwright.
  - **Real-time UI diff tools**: design-tools comparing two layers.

## Rust replacement

- **Candidate crate(s):** `image-compare` (canonical Rust image
  comparison, supports pixel-diff and structural metrics).
  Alternatively a direct port of the Mapbox pixelmatch algorithm
  in safe Rust — the algorithm is ~150 lines, well-documented.
  `dssim` for higher-quality SSIM-based diffs (optional v0.2).
- **Maintenance / license:** `image-compare` 0.4.x is actively
  maintained, MIT. Mozilla `dssim` is mature.
- **Known gotchas / divergences:**
  - The pixelmatch YIQ delta formula is specific; a direct Rust
    port of the JS algorithm guarantees bit-identical output for
    parity tests. `image-compare`'s default scoring is slightly
    different — wrap or reimplement.
  - Anti-aliasing detection: pixelmatch's `includeAA: false`
    heuristic is the package's killer feature (filters out
    sub-pixel-rendering noise). The Rust port must replicate it
    exactly.
  - Output diff colors: `diffColor` defaults to red `[255, 0, 0]`;
    parity is straightforward but verify.

## BACKLOG check

No entry in `BACKLOG.md` for `pixelmatch`, `image-compare`, or
related. Fresh territory.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | Substantial. 1M-pixel diff = 1M pixel comparisons + YIQ math + anti-aliasing heuristic. Pure JS runs at ~50–200 ms / Mpx; Rust SIMD at ~5–20 ms / Mpx. The Rust work alone is 10⁴–10⁵× the 109 ns NAPI floor. |
| Input size distribution | 400 KB – 40 MB RGBA buffers each. Two inputs + one output = up to 120 MB across the FFI boundary. **All Buffer-flat** (`docs/BASELINE.md:29`) — ~540 ns total transfer overhead regardless of size. |
| Output size distribution | The diff buffer is the same size as the inputs (written in-place via the caller-provided `output` buffer — already the optimal shape). Scalar `numDiff` return is trivial. |
| Reusable setup (stateful potential) | Low. No per-call state beyond options. No NAPI-class lever. |
| Batch-usage realism | High in CI workloads (1000s of diffs per CI run), but each individual diff is non-trivial. Per-call FFI overhead is already amortized; batching adds marginal value. |
| FFI-share estimate vs. Rust work | <0.01% at 1 Mpx (~540 ns / ~10 ms). Not FFI-bound at any realistic input. |

## Classification reasoning

The shape is the cleanest possible Green:

1. Pure-JS `pixelmatch` is a tight per-pixel loop in V8 — exactly
   the workload Rust SIMD eats for breakfast.
2. The API is already designed for the optimal NAPI shape
   (caller-provided output buffer, scalar return). No
   marshalling penalty.
3. The parity surface is narrow: one function + options object.
   `parity:strict` is tractable.
4. There is no native competitor on npm in this niche —
   `pixelmatch` is the unchallenged standard for pixel diff.

Pattern-match: identical shape to `crates/xxhash` (buffer-in,
scalar-out) and `crates/inflate` (substantial CPU per byte). Both
are Green. The xxhash review documented a Green classification
with 7–15× wins; pixelmatch is even more CPU-heavy per pixel
(YIQ math + AA heuristic).

The realistic call shape is "decode two PNGs → run pixelmatch →
encode diff PNG". The pixelmatch step is typically the second-
slowest of those three (after PNG encode). A Rust port pulls the
pixelmatch step from "second-slowest" to "negligible".

**Predicted classification:** 🟢 Green at all sizes. Expected
8–20× over `pixelmatch` on the standard CI snapshot workload
(1280×800 = 1 Mpx).

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/pixelmatch`
- **Primary API sketch:**
  ```ts
  export type PixelmatchOptions = {
    threshold?: number       // 0..1, default 0.1
    includeAA?: boolean      // default false
    alpha?: number           // background opacity, default 0.1
    aaColor?: [number, number, number]  // default [255, 255, 0]
    diffColor?: [number, number, number]  // default [255, 0, 0]
    diffColorAlt?: [number, number, number] | null  // default null
    diffMask?: boolean       // default false
  }

  // Parity drop-in — caller provides the output buffer
  export function pixelmatch(
    img1: Buffer,
    img2: Buffer,
    output: Buffer | null,
    width: number,
    height: number,
    options?: PixelmatchOptions
  ): number

  // Fast paths — return-only count, no output buffer
  export function countDiff(
    img1: Buffer,
    img2: Buffer,
    width: number,
    height: number,
    options?: Omit<PixelmatchOptions, 'aaColor' | 'diffColor' | 'diffColorAlt' | 'diffMask'>
  ): number
  ```
- **Must-have benchmark scenarios:**
  - 640×480 (300k px), 1280×800 (1 Mpx), 1920×1080 (2 Mpx),
    3840×2160 (8 Mpx) — the CI-realistic sizes
  - Pixel-identical inputs (best case, AA-detection still runs)
  - Single-pixel diff (early-exit potential)
  - 50% pixel diff (worst case)
  - `includeAA: true` vs `false` — the AA heuristic is the
    expensive path
  - vs `pixelmatch` (the headline competitor; the only realistic
    one)
- **Acceptance thresholds (Green gate):**
  - ≥8× vs `pixelmatch` at 1 Mpx
  - ≥10× vs `pixelmatch` at 8 Mpx
  - Output bit-identical for the standard threshold settings
    (port the upstream test fixtures)
- **Risks:**
  - **AA heuristic parity**: the anti-aliasing detector is a
    bespoke heuristic. Any divergence will surface as flapping
    snapshot tests in user pipelines. Port the algorithm
    line-by-line and pin the test fixtures.
  - **Dependency on pixel buffers**: realistic users need
    `pngjs` / `jpeg-js` decode first. Document the end-to-end
    pipeline ("decode → diff → encode") with concrete
    `@amigo-labs/pngjs + @amigo-labs/pixelmatch` examples.
  - **Bit-identical output**: floating-point YIQ math may
    diverge by 1 ulp from the JS version. If parity tests fail
    on `output` buffer byte-identity, weaken the contract to
    "differing pixels are a strict superset of the JS version's
    differing pixels" and document.
  - **`includeAA: true`**: the AA heuristic is slow; the
    benchmark must clear the Green gate **with AA on**, since
    that is the default in most CI pipelines.

## If NO-GO — BACKLOG entry

Not applicable (verdict is GO).

## References

- BASELINE: `docs/BASELINE.md` (Buffer-flat ~180 ns to 10 MB,
  caller-provided output buffer = no extra marshalling cost —
  `docs/BASELINE.md:29`)
- Closest portfolio neighbours: `crates/xxhash/` (buffer-in /
  scalar-out, Green), `crates/inflate/` (substantial CPU per byte,
  Green)
- Companion crate reviews: `docs/perf-review/pngjs.md`,
  `docs/perf-review/jpeg-js.md` (the typical upstream/downstream
  of a pixelmatch call)
- Rust crates: <https://crates.io/crates/image-compare>,
  <https://crates.io/crates/dssim>
- Upstream JS: <https://github.com/mapbox/pixelmatch>
