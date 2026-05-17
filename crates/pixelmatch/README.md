# @amigo-labs/pixelmatch

> Rust port of [mapbox/pixelmatch](https://github.com/mapbox/pixelmatch) — bit-identical output, pure compute on RGBA pixel buffers.

## Install

```bash
npm install @amigo-labs/pixelmatch
```

## Usage

```ts
import { pixelmatch, countDiff } from '@amigo-labs/pixelmatch'

const { numDiff, diff } = pixelmatch(img1Rgba, img2Rgba, width, height, {
  threshold: 0.1,
})

// numDiff: number of mismatching pixels
// diff: RGBA Uint8Array highlighting the differences

// Lightweight variant — no diff buffer allocation.
const onlyCount = countDiff(img1Rgba, img2Rgba, width, height)
```

## Install for the browser

The same `import` works in Angular, React, Vite, esbuild, and webpack ≥ 5 — the bundler picks the WASM build via the `browser` conditional export:

```ts
import { pixelmatch } from '@amigo-labs/pixelmatch'
```

Pure compute — no native deps. The WASM build is small (<30 KB gzipped).

## Parity

Bit-identical to upstream mapbox/pixelmatch for the same `(img1, img2, options)` inputs. Upstream fixtures from `test/fixtures/` are exercised in [`__conformance__/upstream.spec.ts`](./__conformance__/upstream.spec.ts).

## License

MIT
