# @amigo-labs/fuse

> Rust-powered fuzzy search index built on [`nucleo-matcher`](https://crates.io/crates/nucleo-matcher). Subset-shape alternative to [`fuse.js`](https://www.npmjs.com/package/fuse.js); ranking direction matches (closer = higher), exact scores diverge — see [`docs/perf-review/fuse.md`](../../docs/perf-review/fuse.md).

## Install

```bash
npm install @amigo-labs/fuse
```

## Usage

```ts
import { Fuse } from '@amigo-labs/fuse'

const records = [
  JSON.stringify({ title: 'The Hitchhiker’s Guide', author: 'Adams' }),
  JSON.stringify({ title: 'Brave New World',          author: 'Huxley' }),
]
const fuse = new Fuse(records, {
  keys: [{ name: 'title', weight: 2.0 }, { name: 'author' }],
  threshold: 0.4,
})

fuse.search('hitchhiker')
// [{ refIndex: 0, score: 0.0… }]
```

Records are passed as JSON strings to skip the cost of `Vec<serde_json::Value>` marshalling across the FFI; the index keeps record fields in pre-extracted form.

## Install for the browser

The same `import` works in Angular, React, Vite, esbuild, and webpack ≥ 5 — the bundler picks the WASM build via the `browser` conditional export:

```ts
import { Fuse } from '@amigo-labs/fuse'
```

`nucleo-matcher` is small (~70 KB gzipped) — comfortably under the 500 KB browser budget.

## Parity

Ranking-direction parity with `fuse.js`. Bit-identical scores are not a goal — nucleo's score model differs from fuse.js's Bitap-based one. See [`__conformance__/divergences.md`](./__conformance__/divergences.md) for the full delta.

## License

MIT
