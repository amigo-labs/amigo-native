# Candidate review: `jimp`

> **Status:** 🟡 GO (conditional on scoped v0.1) · **Predicted:** Yellow on the broad surface, Green on the scoped core · **Reviewed:** 2026-05-10

## Verdict

`jimp` is the npm answer to "I just want a JS image library with no
native dependencies". Pure-JS decode (PNG/JPEG/BMP/GIF/TIFF) +
encode + ~30 image-processing operations (resize, blit, blur,
quantize, normalize, posterize, contrast, brightness, etc.). The
core shape is fundamentally Green (buffer-in / buffer-out / per-
pixel loop is exactly what Rust SIMD wins at), and `image-rs` is
the canonical Rust umbrella crate that covers all the same formats
and operations. The catch is parity surface: ~30 operations × ~10
chainable mutators × the format matrix is too much for v0.1, and an
incomplete port helps nobody. **Recommendation: GO**, but only if
v0.1 explicitly scopes to: decode + encode (PNG, JPEG) + resize +
crop + the 5 most-used filters. The long tail goes into v0.2 or
becomes a permanent BACKLOG item.

## JS package

- **npm:** `jimp`
- **Downloads:** ~2–3M / week (one of the top-3 "no native deps"
  image libraries on npm; pulled in by many test runners,
  template engines, screenshot pipelines)
- **Exports / API surface:**
  - `Jimp.read(input: Buffer | string) → Promise<Jimp>`
  - `image.resize(w, h)`, `.crop(x, y, w, h)`, `.flip()`,
    `.rotate(deg)`, `.blit(src, x, y)`, `.composite(...)`,
    `.blur(radius)`, `.gaussian(radius)`, `.brightness(v)`,
    `.contrast(v)`, `.posterize(n)`, `.quantize(opts)`,
    `.dither565()`, `.greyscale()`, `.invert()`, `.normalize()`,
    `.sepia()`, `.opacity(v)`, `.fade(v)`, `.opaque()`,
    `.background(color)`, `.color(actions)`, `.cover(w, h)`,
    `.contain(w, h)`, `.scale(factor)`, `.print(font, x, y, text)`,
    `.getBuffer(mime, cb)`, `.write(path, cb)`, etc.
  - Class-based chainable API.
- **Typical input:** image file or buffer, 10 KB – 50 MB.
- **Typical output:** processed image as Buffer (encoded) or raw
  RGBA pixels.
- **Realistic median use-case:**
  - **Thumbnail generation in build pipelines**: read a few
    hundred photos, resize them to thumbnails, encode out.
  - **Test fixtures**: programmatic image generation for visual
    regression tests.
  - **Server-side avatar / image manipulation** where pulling in
    `sharp` (libvips, native build) is a deployment headache.
    `jimp`'s entire reason for existing is "no native deps, just
    npm install and go".

## Rust replacement

- **Candidate crate(s):** `image` (the image-rs umbrella crate;
  covers decode / encode / resize / colorops / pixel manipulation).
  Optionally `fast_image_resize` for SIMD-accelerated resize,
  `imageproc` for filter / morphology operations.
- **Maintenance / license:** `image` 0.25.x is the canonical
  image crate, MIT/Apache-2.0, extremely actively maintained.
  `imageproc` is mature, `fast_image_resize` is high-performance.
- **Known gotchas / divergences:**
  - **Format coverage trade-off**: `image` covers PNG/JPEG/BMP/
    GIF/TIFF/WebP/AVIF/etc. v0.1 should scope to PNG + JPEG to
    keep binary size and parity-test scope reasonable.
  - **Chainable API translation**: `jimp` uses a stateful mutator
    chain. Rust ports of this typically expose either (a) a NAPI
    class with the image buffer on the Rust side and chained
    methods returning `&mut self`, or (b) a "spec the pipeline as
    a config, run it once" API. Option (a) is more drop-in but
    pays NAPI overhead per chained call; option (b) is faster but
    breaks the `jimp` ergonomics. Pick (a) with the chained
    methods coalescing into a single Rust pass via a fluent
    builder.
  - **Font / `print` API**: `jimp` ships its own bitmap font
    format. `rusttype` / `ab_glyph` (Rust) work with TTF/OTF
    instead. Scope `print` out of v0.1.
  - **Color model parity**: `jimp` uses 32-bit ARGB internally
    (not RGBA). The Rust port should normalize to RGBA on the
    boundary and document.

## BACKLOG check

No entry in `BACKLOG.md` for `jimp`, `image`, or related. Fresh
territory.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | Very high. Decode 1 MB JPEG = ~50 ms in pure JS; resize 4K image = ~200 ms in pure JS. Most jimp operations are CPU-bound pixel loops. Rust SIMD pulls ahead by 10–50× per operation. |
| Input size distribution | 10 KB – 50 MB images. Buffer-flat marshalling. |
| Output size distribution | Up to 32 MB RGBA. Buffer-flat. |
| Reusable setup (stateful potential) | **Very high.** The image data lives on the Rust side across an entire mutator chain (resize → blur → crop → encode). Each chained call avoids re-marshalling the pixel buffer. This is the killer lever — a 5-operation chain on a 4K image saves 5 × 32 MB of pixel copies. |
| Batch-usage realism | High for thumbnail-pipeline workloads (process 100 photos in one job). `Jimp.readMany` worth v0.2. |
| FFI-share estimate vs. Rust work | <1% per chained operation when the image stays on the Rust side. >20% if each operation re-marshals the pixel buffer back to V8 (do not do this). |

## Classification reasoning

The shape is mostly Green: buffer-in / buffer-out, heavy per-pixel
work, stateful mutator chain. The Rust crate ecosystem
(`image` + `fast_image_resize` + `imageproc`) covers every operation
in `jimp`'s surface area, and at higher quality.

The classification risk is parity scope. Three failure modes:

1. **Too much surface for v0.1**: shipping `@amigo-labs/jimp` with
   only 5 of 30 operations confuses users. They install it, find
   half their code broken, file issues, leave. The `core-js`
   review (if present) documents this exact failure mode for
   wide-surface ports.
2. **Format-matrix bloat**: shipping every format pulls in dozens
   of MB of Rust dependencies. Each platform stub balloons. The
   `inflate` crate (`zlib-rs` only, no `miniz_oxide` /
   `cloudflare-zlib`) is the right precedent.
3. **`sharp` overlap**: anyone willing to install a native binary
   already uses `sharp`. `@amigo-labs/jimp`'s niche is exactly
   the `jimp` audience: people who do not want a `node-gyp` /
   libvips dependency. If `@amigo-labs/jimp` ships precompiled
   binaries (NAPI-rs default), they ALREADY have a native
   binary — the differentiation moves to "install reliability"
   and "API ergonomics", not "no native".

The mitigation for all three: scope v0.1 narrowly. PNG + JPEG +
resize + crop + flip / rotate / greyscale / brightness / contrast
covers ~80% of real-world `jimp` use. Defer everything else.

Pattern-match: this is the `core-js` shape — a sprawling JS library
with many entry points, most rarely used. The correct answer is
**not** a 1:1 port; the correct answer is the 80/20 core, sharply
positioned in the README.

**Predicted classification:** 🟢 Green on the scoped core (resize at
4K = expected 20–50× vs `jimp`); 🟡 Yellow if v0.1 ships the full
surface (parity tests will exhaust the team before the perf wins
land).

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/jimp`
- **v0.1 scope (commit to this in the README):**
  - Decode: PNG, JPEG (delegate to `crates/pngjs` and
    `crates/jpeg-js` once those ship, share the `png` /
    `jpeg-decoder` crates).
  - Encode: PNG, JPEG.
  - Operations: `resize`, `crop`, `flip`, `rotate` (multiples of
    90°), `greyscale`, `invert`, `brightness`, `contrast`,
    `composite`, `getBuffer`.
  - Color: 32-bit RGBA internally, parity with jimp's input
    convention.
- **Out of scope for v0.1 (documented):**
  - GIF / BMP / TIFF / WebP decode.
  - `blur`, `gaussian`, `posterize`, `quantize`, `dither565`,
    `print` (font rendering), `normalize`, `sepia`, `opacity`,
    `fade`, `color(actions)`, arbitrary-angle rotation.
  - All BACKLOG-able as "if user demand justifies the parity
    cost".
- **Primary API sketch:**
  ```ts
  export class Jimp {
    static read(input: Buffer | string): Promise<Jimp>
    static create(width: number, height: number, color?: number): Jimp

    readonly width: number
    readonly height: number

    resize(w: number, h: number): this
    crop(x: number, y: number, w: number, h: number): this
    flip(horizontal: boolean, vertical: boolean): this
    rotate(deg: 90 | 180 | 270): this
    greyscale(): this
    invert(): this
    brightness(v: number): this
    contrast(v: number): this
    composite(src: Jimp, x: number, y: number): this

    getBuffer(mime: 'image/png' | 'image/jpeg', opts?: object): Promise<Buffer>
    getBufferSync(mime: 'image/png' | 'image/jpeg'): Buffer
    bitmap(): { width: number; height: number; data: Buffer }
  }
  ```
- **Must-have benchmark scenarios:**
  - end-to-end "read + resize 4K to thumbnail + encode JPEG"
    pipeline
  - resize at 100 KB / 1 MB / 10 MB (the headline operation)
  - crop, flip, rotate at 1 MB
  - 5-operation chain (resize → crop → brightness → contrast →
    encode) to validate the stateful-chain win
  - vs `jimp` (the headline competitor)
  - vs `sharp` (the native competitor — honest comparison)
- **Acceptance thresholds (Green gate):**
  - ≥20× vs `jimp` on the resize-4K-to-thumbnail pipeline
  - ≥10× vs `jimp` on the 5-operation chain
  - ≥1.0× vs `sharp` on the resize path (Yellow expected; if Red,
    document the positioning explicitly in the README)
- **Risks:**
  - **Scope creep on operations**: every issue filed asking for
    `blur` / `gaussian` / `print` is a temptation to expand v0.1.
    Resist; document the v0.1 charter and the "we'll add this if
    enough people ask" promise.
  - **`sharp` overlap**: position the crate as "the drop-in
    `jimp` replacement, with a fast path". Not as a `sharp`
    competitor.
  - **API churn between jimp v0 and v1**: jimp 1.x changes the
    API (made `read` truly async, removed some operations).
    Decide which to target — v1 is the smarter long-term choice.
  - **Stateful-chain coalescing**: the Rust port should
    internally coalesce chained operations where possible
    (e.g. resize → crop → encode can fuse the resize and crop
    into a single pass). This is a Phase-C lever, not v0.1
    blocker.

## If NO-GO — BACKLOG entry

```markdown
- [`jimp`] — **[PARITY] expensive**: jimp has ~30 image operations
  across 5+ formats; full parity is a multi-quarter port. v0.1
  scope (PNG/JPEG + 10 ops) would be a confusing partial port.
  Considered 2026-05-10. Recommend per-format crates
  (`@amigo-labs/pngjs`, `@amigo-labs/jpeg-js`, ...) and a
  `pixelmatch` for the diff niche instead.
```

Section in `BACKLOG.md`: **[PARITY] too expensive — surface area
exceeds reasonable v0.1 port effort**

## References

- BASELINE: `docs/BASELINE.md` (Buffer-flat to 10 MB —
  `docs/BASELINE.md:29`; stateful classes amortize chained calls)
- Companion crate reviews: `docs/perf-review/pngjs.md`,
  `docs/perf-review/jpeg-js.md` (format-specific Green
  predictions; v0.1 jimp shares their decode/encode paths)
- Wide-surface antipattern reference: `docs/perf-review/core-js.md`
  if present
- Stateful-class Green pattern: `crates/bm25/`,
  `crates/minisearch/`
- Rust crates: <https://crates.io/crates/image>,
  <https://crates.io/crates/fast_image_resize>,
  <https://crates.io/crates/imageproc>
- Upstream JS: <https://github.com/jimp-dev/jimp>
