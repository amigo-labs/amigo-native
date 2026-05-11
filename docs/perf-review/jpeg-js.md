# Candidate review: `jpeg-js`

> **Status:** 🟢 GO · **Predicted:** Green vs pure-JS, Yellow vs sharp · **Reviewed:** 2026-05-10

## Verdict

`jpeg-js` is the canonical pure-JS JPEG decoder/encoder on npm, and a
direct format companion to `pngjs`. The shape is identical to the
`pngjs` review: buffer-in / buffer-out, substantial compute (IDCT +
dequantization + Huffman decode + color conversion), Buffer-flat
marshalling. Pure-JS JPEG decode is notoriously slow because the
IDCT loops do not benefit from V8's optimizer in the way arithmetic-
heavy native code does; `jpeg-decoder` (Rust, image-rs) routinely
clears 10–30× over pure-JS `jpeg-js`. **Recommendation: GO.**
Pairs cleanly with `pngjs` to fill the "image decode" slot.

## JS package

- **npm:** `jpeg-js`
- **Downloads (week of 2026-05-02):** 7.8M (used heavily by `jimp`,
  `pdf-lib`, `react-native-pdf-jpeg`, and headless screenshot
  pipelines)
- **Exports / API surface:**
  - `decode(input: Buffer, opts?) → { width, height, data, ... }`
    where `data` is RGBA pixels
  - `encode(imageData, quality?) → { width, height, data }`
  - Options: `useTArray`, `formatAsRGBA`, `colorTransform`,
    `tolerantDecoding`, `maxResolutionInMP`, `maxMemoryUsageInMB`
- **Typical input:** JPEG byte buffer, 10 KB – 50 MB. Photos are
  the dominant case; smaller compressed-thumb buffers (10–50 KB)
  are also common.
- **Typical output:** RGBA pixel buffer (`width × height × 4`
  bytes). 4K photo = ~32 MB; thumbnail = ~50 KB.
- **Realistic median use-case:**
  - **OCR / vision preprocessing**: decode scanned photos /
    documents on the way into an LLM-vision pipeline.
  - **Image processing libraries**: `jimp` calls `jpeg-js` under
    the hood for JPEG support.
  - **PDF rendering**: `pdf-lib` and similar embed JPEG via
    `jpeg-js` for output assets.
  Most realistic median: a single 1 MB photo decoded once,
  returning a ~12–32 MB RGBA buffer.

## Rust replacement

- **Candidate crate(s):** `jpeg-decoder` (canonical Rust JPEG
  decoder from the image-rs project). For encoding: `jpeg-encoder`
  (image-rs) or `mozjpeg-rs` (libmozjpeg bindings, the gold-
  standard JPEG encoder).
- **Maintenance / license:** `jpeg-decoder` 0.3.x is part of
  image-rs, MIT/Apache-2.0, very actively maintained. `mozjpeg-rs`
  wraps the Mozilla mozjpeg fork — same C source as
  libjpeg-turbo with quality improvements.
- **Known gotchas / divergences:**
  - Progressive JPEGs: `jpeg-decoder` supports them but with a
    slower path. Bench separately.
  - Color spaces: pure-JS `jpeg-js` returns RGBA always.
    `jpeg-decoder` returns native (YCbCr / RGB / grayscale) by
    default. Force RGBA output in the parity API; expose
    `decode_native` as a fast path.
  - Encoder choice: `jpeg-encoder` (pure Rust) vs `mozjpeg-rs`
    (libmozjpeg C). The latter produces 5–15% smaller files at
    the same visual quality. Pick `mozjpeg-rs` for v0.1.
  - EXIF / metadata: `jpeg-js` strips by default; `jpeg-decoder`
    can expose APP markers. Parity decision: strip by default,
    expose `parseExif` as opt-in.

## BACKLOG check

No entry in `BACKLOG.md` for `jpeg-js`, `jpeg`, `mozjpeg`, or any
JPEG-spelling variant. Fresh territory.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | Very high. 1 MB JPEG decode in `jpeg-js` is ~50–150 ms; in `jpeg-decoder` (Rust) ~5–15 ms. The Rust work alone is 10⁴× the 109 ns NAPI floor (`docs/BASELINE.md:23`). |
| Input size distribution | 10 KB – 50 MB. Buffer-flat marshalling on the input side. |
| Output size distribution | Large RGBA buffer. 4K photo = 32 MB. Buffer-flat hand-off via V8 handle — same ~180 ns regardless of size (`docs/BASELINE.md:29`). |
| Reusable setup (stateful potential) | Low. JPEG decode has no per-call state worth amortizing. Encoder can optionally hold a reusable Huffman table for batched encodes, but the win is small. v0.1: one-shot only. |
| Batch-usage realism | Medium. `decodeMany(buffers)` real for thumbnail-galleries / catalog ingestion pipelines. Worth v0.2. |
| FFI-share estimate vs. Rust work | <0.05% at 1 MB (300 ns / 10 ms). Not FFI-bound at any realistic input. |

## Classification reasoning

This is the cleanest possible Green-shape for an image codec:

1. The per-call work in pure JS is enormous (`jpeg-js` is a
   reference for "slow pure-JS").
2. The Rust crate is highly optimized and SIMD-capable.
3. The I/O surface is bytes-in / bytes-out with no marshalling
   penalty (Buffer-flat on both sides — `docs/BASELINE.md:29`).
4. There is no Node built-in JPEG decode (unlike `zlib` for
   inflate / `crypto` for hashing) — the entire userland market
   is up for grabs.

Realistic competitor set:

1. **`jpeg-js` (pure JS)** — the headline, 10–30× win expected.
2. **`sharp` (native libvips / libjpeg-turbo)** — different
   problem (full pipeline). Same bcrypt-trap caveat as `pngjs`.
3. **`@napi-rs/canvas`** — same caveat.
4. **`mozjpeg-js`** (emscripten WASM) — slower than native.

Pattern-match: identical to `pngjs` for prediction purposes. Both
are buffer-in / buffer-out, both DEFLATE-equivalent in CPU
intensity. Pair them in v0.1.

**Predicted classification:** 🟢 Green vs `jpeg-js` (expected
10–30×). 🟡 Yellow vs `sharp` (same-shape competitor, libjpeg-turbo
is itself very fast). Position the crate against the pure-JS
baseline and document the `sharp` comparison honestly.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/jpeg-js`
- **Primary API sketch:**
  ```ts
  export type DecodedImage = {
    width: number
    height: number
    data: Buffer  // RGBA, width * height * 4 bytes
  }

  export type DecodeOptions = {
    useTArray?: boolean        // ignored in v0.1 (always typed)
    formatAsRGBA?: boolean     // default true
    colorTransform?: boolean
    tolerantDecoding?: boolean
    maxResolutionInMP?: number
    maxMemoryUsageInMB?: number
  }

  export type EncodeOptions = {
    quality?: number    // 0-100
    progressive?: boolean
    optimizeCoding?: boolean
  }

  export function decode(input: Buffer, opts?: DecodeOptions): DecodedImage
  export function encode(image: DecodedImage, quality?: number): { data: Buffer; width: number; height: number }

  // Fast paths
  export function decodeRgba(input: Buffer): {
    width: number; height: number; pixels: Buffer
  }
  export function encodeRgba(
    pixels: Buffer, width: number, height: number, opts?: EncodeOptions
  ): Buffer
  ```
- **Must-have benchmark scenarios:**
  - decode at 100 KB (thumbnail), 1 MB (web photo), 10 MB (raw
    photo)
  - encode at the same sizes at quality 75 and quality 95
  - progressive vs baseline JPEG decode
  - vs `jpeg-js` (the headline pure-JS competitor)
  - vs `sharp` (the native competitor)
  - vs `mozjpeg-js` (the WASM baseline)
- **Acceptance thresholds (Green gate):**
  - ≥10× vs `jpeg-js` at 100 KB
  - ≥20× vs `jpeg-js` at 10 MB
  - ≥1.0× vs `sharp` (parity floor; below this is the bcrypt-trap)
- **Risks:**
  - **`sharp` overlap**: same positioning as `pngjs`. Pure-JPEG-
    decode is the niche; full pipeline goes to `sharp`.
  - **Memory pressure**: large output buffers. Document.
  - **Encoder choice**: `mozjpeg-rs` requires the libmozjpeg C
    source. `jpeg-encoder` (pure Rust) is the fallback for the
    no-C-dep posture. Decide before v0.1; document in BACKLOG if
    deferred.
  - **CMYK / grayscale paths**: scope to RGB / RGBA in v0.1;
    document CMYK as out-of-scope.

## If NO-GO — BACKLOG entry

Not applicable (verdict is GO).

## References

- BASELINE: `docs/BASELINE.md` (Buffer-flat to 10 MB —
  `docs/BASELINE.md:29`)
- Companion crate review: `docs/perf-review/pngjs.md` (same shape,
  same Green prediction, same `sharp`-positioning advice)
- Closest portfolio neighbour: `crates/inflate/` (DEFLATE / bytes-
  in / bytes-out reference Green)
- Streaming antipattern: `docs/post-mortems/xml.md` if present
- Rust crates: <https://crates.io/crates/jpeg-decoder>,
  <https://crates.io/crates/mozjpeg>
- Upstream JS: <https://github.com/jpeg-js/jpeg-js>
