# @amigo-labs/deepmerge

> Recursive object merge for JSON-safe values, compiled via NAPI-RS. Semantic-compatible with [`deepmerge`](https://www.npmjs.com/package/deepmerge); the entry points are named `mergeJson` / `mergeAllJson` (not `deepmerge`/`deepmerge.all`) — see [`MIGRATION.md`](./MIGRATION.md).

## Install

```bash
npm install @amigo-labs/deepmerge
```

## Usage

```ts
import { mergeJson, mergeAllJson } from '@amigo-labs/deepmerge'

mergeJson({ a: 1, nested: { x: 1 } }, { b: 2, nested: { y: 2 } })
// { a: 1, b: 2, nested: { x: 1, y: 2 } }

mergeAllJson([{ a: 1 }, { b: 2 }, { c: 3 }])
// { a: 1, b: 2, c: 3 }
```

Array strategy defaults to `"concat"`; pass `{ arrayMerge: 'overwrite' }` to replace instead.

## Parity

Tests in [`__conformance__/`](./__conformance__) run the upstream `deepmerge` test suite against this implementation. See [`divergences.md`](./__conformance__/divergences.md) for documented differences.
