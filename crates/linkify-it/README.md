# @amigo-labs/linkify-it

> Rust-powered URL + email detection. Drop-in shape for [`linkify-it`](https://www.npmjs.com/package/linkify-it) (default schemas), backed by the [`linkify`](https://crates.io/crates/linkify) crate (robinst/linkify). Compiled via NAPI-RS.

## Install

```bash
npm install @amigo-labs/linkify-it
```

## Usage

```ts
import { matches, test, matchOffsets } from '@amigo-labs/linkify-it'

matches('Visit https://example.com or email foo@example.com')
// [
//   { schema: 'url',   index: 6,  lastIndex: 25, text: 'https://example.com', url: 'https://example.com' },
//   { schema: 'email', index: 35, lastIndex: 50, text: 'foo@example.com',     url: 'foo@example.com' },
// ]

test('https://example.com')        // true
matchOffsets(Buffer.from('…'))     // Uint8Array of u32 LE triplets (start, end, kindId)
```

`matchOffsets` returns a packed offset buffer — three `u32 LE` per match
(`start`, `end`, `kindId`; `0` = url, `1` = email). Use this in render
loops to skip per-match string marshalling.

## Install for the browser

The same `import` works in Angular, React, Vite, esbuild, and webpack ≥ 5 — the bundler picks the WASM build via the `browser` conditional export:

```ts
import { matches } from '@amigo-labs/linkify-it'
```

Node consumers get the napi binary; browser consumers get the in-tarball `wasm/pkg/` artifact. `linkify` itself is small (~30 KB gzipped), well under the 500 KB browser budget.

## Parity

`linkify` covers the default-schema URL + email path of upstream
`linkify-it@5`. The wider option surface (`fuzzyIP`, custom-schema
`add()`) is not implemented in v0.1 — see [`MIGRATION.md`](./MIGRATION.md)
for the diff and [`__conformance__/`](./__conformance__) for the parity
test suite.

## License

MIT
