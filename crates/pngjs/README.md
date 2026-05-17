# @amigo-labs/pngjs

> Rust-powered PNG decode/encode to RGBA pixel buffers. Compatible-shape alternative to [`pngjs`](https://www.npmjs.com/package/pngjs), backed by the image-rs [`png`](https://crates.io/crates/png) crate (pure-Rust DEFLATE via flate2 + zlib-rs).

## Install

```bash
npm install @amigo-labs/pngjs
```

## Usage

```ts
import { decodeRgba, encodeRgba } from '@amigo-labs/pngjs'

const { width, height, data } = decodeRgba(pngBuffer)
// data is an RGBA Uint8Array of length width * height * 4

const png = encodeRgba(rgba, width, height)
```

## Install for the browser

The same `import` works in Angular, React, Vite, esbuild, and webpack ≥ 5 — the bundler picks the WASM build via the `browser` conditional export:

```ts
import { decodeRgba, encodeRgba } from '@amigo-labs/pngjs'
```

`png` is pure-Rust, no C dependency — the WASM build is straightforward.

## Parity

RGBA 8-bit on input and output. Source PNGs in palette / 16-bit / interlaced modes go through image-rs's converter to 8-bit RGBA. See [`__conformance__/`](./__conformance__) and [`divergences.md`](./__conformance__/divergences.md).

## License

MIT
