# @amigo-labs/jimp

> Scoped v0.1 of [`jimp`](https://www.npmjs.com/package/jimp) — PNG/JPEG decode + encode, resize, crop, flip, rotate (90° multiples), greyscale, brightness, contrast, composite. Backed by [`image-rs`](https://crates.io/crates/image).

## Install

```bash
npm install @amigo-labs/jimp
```

## Usage

```ts
import { Jimp } from '@amigo-labs/jimp'

const img = Jimp.fromBuffer(pngBuffer)
img.resize(256, 256)
img.greyscale()
const out = img.getBufferSync('image/png')
```

## Install for the browser

The same `import` works in Angular, React, Vite, esbuild, and webpack ≥ 5 — the bundler picks the WASM build via the `browser` conditional export:

```ts
import { Jimp } from '@amigo-labs/jimp'
```

Bundle is ~400–600 KB gzipped (over the soft 500 KB budget — warn-only per the expansion-2026 D2 decision). Consider lazy-importing in code-split routes:

```ts
const { Jimp } = await import('@amigo-labs/jimp')
```

## Parity

Scoped v0.1 covers the most-used jimp API surface; arbitrary-angle rotate, blur/gaussian, GIF/BMP/TIFF, and `print` are not implemented. See [`__conformance__/divergences.md`](./__conformance__/divergences.md) for details.

## License

MIT
