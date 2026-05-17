# @amigo-labs/zstd

> Zstandard compression via the reference libzstd C library (Node) and `ruzstd` pure-Rust decoder (browser). Drop-in shape for [`@mongodb-js/zstd`](https://www.npmjs.com/package/@mongodb-js/zstd).

## Install

```bash
npm install @amigo-labs/zstd
```

## Usage

```ts
import { compress, decompress, Compressor, Decompressor } from '@amigo-labs/zstd'

const small = compress(Buffer.from('hello world'.repeat(1000)), 3)
const back = decompress(small)            // Buffer 'hello world…'

// Reusable contexts:
const c = new Compressor(3 /* level */)
const blobs = c.compressMany([Buffer.from('a'), Buffer.from('b')])
```

## Install for the browser

The same `import` works in Angular, React, Vite, esbuild, and webpack ≥ 5 — the bundler picks the WASM build via the `browser` conditional export:

```ts
import { decompress } from '@amigo-labs/zstd'
```

**Browser is decompress-only.** `compress`, `trainDictionary`, and the `Compressor` class throw "not available in the WASM build" — the libzstd C backend doesn't compile for `wasm32-unknown-unknown`. The WASM build uses [`ruzstd`](https://crates.io/crates/ruzstd) (pure-Rust decoder).

## Parity

100% drop-in for `@mongodb-js/zstd`'s sync API on Node. See [`__conformance__/`](./__conformance__) and [`MIGRATION.md`](./MIGRATION.md). Browser-side divergence (decompress-only) documented in [`__conformance__/divergences.md`](./__conformance__/divergences.md).

## License

MIT
