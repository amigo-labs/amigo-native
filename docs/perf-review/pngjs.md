# Candidate review: `pngjs`

> **Status:** 🟢 GO · **Predicted:** Green vs pure-JS, Yellow vs sharp · **Reviewed:** 2026-05-10

## Verdict

`pngjs` is the canonical pure-JS PNG decoder/encoder on npm. It is a
classic Green-shape workload: bytes-in / bytes-out, substantial
compute (DEFLATE + per-row filter reversal + checksum), no
per-element marshalling. The Rust `png` crate (image-rs) routinely
clears 5–15× over pure-JS `pngjs` in published benchmarks. The only
risk is the bcrypt-style "native competitor already exists" trap —
but `sharp` solves a different problem (full image processing
pipeline via libvips) and is rarely used purely as a PNG-decode
drop-in. **Recommendation: GO.**

## JS package

- **npm:** `pngjs`
- **Downloads:** ~3M / week (often pulled in transitively by
  testing tools — pixelmatch, jest-image-snapshot — and headless-
  browser screenshot pipelines)
- **Exports / API surface:**
  - `PNG.sync.read(buffer) → { width, height, data, ... }` — the
    one-shot decode path
  - `PNG.sync.write(png) → Buffer` — the one-shot encode path
  - `new PNG(options)` with `.parse()`, `.pack()`, `.on('parsed')`
    — the streaming path (Node `Transform` style)
- **Typical input:** PNG byte buffer, 10 KB – 50 MB.
- **Typical output:** RGBA pixel buffer (`width × height × 4` bytes),
  uncompressed. 4K image = 32 MB. Encode goes the other direction.
- **Realistic median use-case:**
  - **Test pipelines**: `pixelmatch` decodes two PNGs and diffs
    them; `jest-image-snapshot` and Playwright snapshot diffs read
    a few PNGs per test.
  - **OCR / vision preprocessing**: decode scanned-document PNGs
    on the way into an LLM-vision pipeline.
  - **Asset pipelines**: encode generated charts / svgs-rendered-
    to-png in build steps.
  Most realistic median: a single 1 MB PNG decoded once, returning a
  ~4–16 MB RGBA buffer.

## Rust replacement

- **Candidate crate(s):** `png` (image-rs project, the canonical
  Rust PNG codec). For SIMD-accelerated DEFLATE inside the
  decoder, link via `flate2` with the `zlib-rs` backend — the same
  setup `crates/inflate` already uses successfully.
- **Maintenance / license:** `png` 0.17.x is part of the image-rs
  organisation, MIT/Apache-2.0, very actively maintained
  (used by `image-rs`, `resvg`, `tiny-skia`, and many production
  tools).
- **Known gotchas / divergences:**
  - APNG (animated PNG): `png` supports the APNG chunks but not as
    a turnkey "decode all frames" API. Scope to single-frame for
    v0.1; document APNG as out-of-scope.
  - Interlaced PNGs (Adam7): supported by `png` but a slower path.
    Bench separately.
  - Output color types: pure-JS `pngjs` returns RGBA always; `png`
    can return native bit depth (grayscale, RGB, RGBA, palette).
    `parity:strict` requires forcing RGBA output for the one-shot
    path; expose `decode_native` as a fast path for callers who
    want the native color type.

## BACKLOG check

No entry in `BACKLOG.md` for `pngjs`, `png`, `upng-js`, or any
PNG-spelling variant. Fresh territory.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | High. 1 MB PNG decode in `pngjs` is ~30–80 ms; in `png` (Rust) ~3–8 ms. The Rust work alone is 1000× the 109 ns NAPI floor and the ~180 ns flat Buffer transfer cost (`docs/BASELINE.md:23, 29`). |
| Input size distribution | 10 KB – 50 MB. All buffer-flat — same code path. |
| Output size distribution | Large. A 4K image = 32 MB RGBA. Buffer-flat marshalling (V8 handle, not memcpy — `docs/BASELINE.md:29`) handles this in ~180 ns regardless of size. Zero-copy hand-off via `Buffer::from_owned` is the obvious path. |
| Reusable setup (stateful potential) | Low. PNG decode has no per-call state worth amortizing. Could expose a `Decoder` class for streaming-IDAT-chunks workloads, but those are rare in the realistic use-case. v0.1 should ship one-shot only. |
| Batch-usage realism | Medium. `decodeMany(buffers)` is real for test pipelines that diff dozens of snapshots at once. Worth a v0.2 lever but not the headline. |
| FFI-share estimate vs. Rust work | <0.1% at 1 MB (300 ns / 5 ms). <0.01% at 50 MB. Not FFI-bound at any realistic input. |

## Classification reasoning

The shape is the closest possible analogue to `crates/inflate` —
DEFLATE-heavy, buffer-in / buffer-out, no per-call state. The inflate
crate clears 1.12–1.67× vs the native `node:zlib` C binding after
Phase-C, and 5.6–26× vs pure-JS `pako`. PNG decode is *strictly more
work* per byte (DEFLATE + filter reversal + CRC), so the JS:Rust
ratio should be at least as favourable vs pure-JS `pngjs`.

The realistic competitor set is:

1. **`pngjs` (pure JS)** — the headline competitor. Easy Green —
   expected 5–15×.
2. **`sharp` (native libvips)** — different problem (full image
   pipeline). Few users pull `sharp` only for PNG decode; those who
   do already have a fast path. **The bcrypt-trap risk lives here.**
   Mitigation: position `@amigo-labs/pngjs` as the drop-in
   replacement for `pngjs`, not as a `sharp` replacement.
3. **`upng-js` (pure JS)** — small bundle, slow.
4. **`@napi-rs/canvas`** — full canvas, includes PNG decode/encode.
   Same positioning as `sharp` — different problem.

Pattern-match from the post-mortem: bytes-in / bytes-out + substantial
compute + DEFLATE-heavy is the `inflate` / `encoding` shape. Green
predicted; no realistic Yellow / Red downgrade path against the
headline competitor `pngjs`.

**Predicted classification:** 🟢 Green vs pure-JS `pngjs` (expected
5–15× depending on size). 🟡 Yellow vs `sharp` (libvips is itself
SIMD-heavy C; same-shape competitor). Position the crate against the
pure-JS baseline and document the `sharp` comparison honestly.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/pngjs`
- **Primary API sketch:**
  ```ts
  // Parity drop-in for PNG.sync.read / PNG.sync.write
  export type PNG = {
    width: number
    height: number
    data: Buffer    // RGBA, width * height * 4 bytes
    depth: 8 | 16
    interlace: boolean
    palette: boolean
  }

  export type EncodeOptions = {
    colorType?: 0 | 2 | 3 | 4 | 6
    bitDepth?: 1 | 2 | 4 | 8 | 16
    deflateLevel?: number    // 0-9
    deflateStrategy?: number
    filterType?: number
  }

  export const sync: {
    read(input: Buffer): PNG
    write(png: PNG, opts?: EncodeOptions): Buffer
  }

  // Fast paths bypassing pngjs's pure-JS object structure
  export function decodeRgba(input: Buffer): {
    width: number; height: number; pixels: Buffer
  }
  export function encodeRgba(
    pixels: Buffer, width: number, height: number, opts?: EncodeOptions
  ): Buffer
  ```
- **Must-have benchmark scenarios:**
  - decode at 100 KB, 1 MB, 10 MB on photographic and synthetic
    images
  - encode at the same sizes
  - vs `pngjs` (the headline pure-JS competitor)
  - vs `sharp` (the native competitor — for honest comparison)
  - vs `upng-js` (the WASM baseline)
  - palette / grayscale / 16-bit native paths separately from RGBA
  - interlaced (Adam7) inputs as a slow-path bench
- **Acceptance thresholds (Green gate):**
  - ≥5× vs `pngjs` at 100 KB
  - ≥10× vs `pngjs` at 10 MB
  - ≥1.0× vs `sharp` on the decode path (anything below is
    documented as expected and the user is pointed at `sharp` for
    full-pipeline workloads)
  - ≥2× vs `upng-js`
- **Risks:**
  - **`sharp` positioning**: `sharp` decodes PNG via libvips. For
    "decode → resize → encode" workloads, `sharp` is the right
    answer. `@amigo-labs/pngjs` is for "decode this PNG to RGBA so
    I can pass it to `pixelmatch` / my own pixel logic". The README
    must say this in the first paragraph.
  - **APNG / animated PNGs**: out of scope for v0.1.
  - **Output buffer size**: a 4K image at 32 MB RGBA is large. The
    Buffer is V8-handle-flat in transit but the underlying memory
    is still 32 MB. Documents the memory cost so callers can free
    promptly.
  - **`pngjs` streaming API parity**: pure-JS `pngjs` exposes a
    `Transform` stream interface. The Rust port should *not*
    reimplement event-per-chunk over the FFI boundary — see
    `docs/post-mortems/xml.md` if present. Document streaming as
    out-of-scope; provide the one-shot path only.

## If NO-GO — BACKLOG entry

Not applicable (verdict is GO).

## References

- BASELINE: `docs/BASELINE.md` (Buffer-flat ~180 ns to 10 MB —
  `docs/BASELINE.md:29`)
- Closest portfolio neighbour: `crates/inflate/` +
  `docs/perf-review/inflate.md` (DEFLATE shape, Green-likely tier)
- Streaming antipattern reference: `docs/post-mortems/xml.md`
  (event-per-chunk over NAPI = Red)
- Rust crate: <https://crates.io/crates/png>
- Image-rs project: <https://github.com/image-rs/image>
- Upstream JS: <https://github.com/lukeapage/pngjs>
