# @amigo-labs/jpeg-js

> Rust-powered JPEG decode/encode to RGBA pixel buffers. Subset-shape alternative to [`jpeg-js`](https://www.npmjs.com/package/jpeg-js), backed by [`jpeg-decoder`](https://crates.io/crates/jpeg-decoder) + [`jpeg-encoder`](https://crates.io/crates/jpeg-encoder) (pure-Rust, no libjpeg-turbo C dependency).

## Install

```bash
npm install @amigo-labs/jpeg-js
```

## Usage

```ts
import { decode, encode, decodeRgba, encodeRgba } from '@amigo-labs/jpeg-js'

const { width, height, data } = decode(jpegBuffer)
const jpeg = encodeRgba(rgba, width, height, { quality: 85 })
```

## Install for the browser

The same `import` works in Angular, React, Vite, esbuild, and webpack ≥ 5 — the bundler picks the WASM build via the `browser` conditional export:

```ts
import { decode, encodeRgba } from '@amigo-labs/jpeg-js'
```

`jpeg-decoder` and `jpeg-encoder` are pure-Rust — the WASM build has no C dependency.

## Parity

RGBA 8-bit on input and output. CMYK JPEGs are explicitly rejected in v0.1
(see `divergences.md`). See [`__conformance__/`](./__conformance__) for the
parity test suite.

## License

MIT
