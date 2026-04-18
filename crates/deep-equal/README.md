> ⚠️ **DEPRECATED in 0.2.0.** `fast-deep-equal` is parity-or-better on every scenario — native packages structurally cannot beat a monomorphic 50-line JS function that V8 inlines. See [docs/post-mortems/deep-equal.md](../../docs/post-mortems/deep-equal.md). Please migrate to `fast-deep-equal`.

# @amigo-labs/deep-equal

> Deep structural equality for JSON-safe values. Drop-in for [`fast-deep-equal`](https://www.npmjs.com/package/fast-deep-equal), compiled via NAPI-RS.

## Install

```bash
npm install @amigo-labs/deep-equal
```

## Usage

```ts
import { deepEqualJson } from '@amigo-labs/deep-equal'

deepEqualJson({ a: 1, b: [2, 3] }, { a: 1, b: [2, 3] })  // true
deepEqualJson([1, 2, 3], [1, 2, 4])                       // false
```

Values cross the NAPI bridge via `serde_json`, so inputs must be JSON-safe. Cyclic inputs return `false` rather than throwing — detect cycles JS-side if your API contract requires it.

## Parity

Tests in [`__conformance__/`](./__conformance__) run the upstream `fast-deep-equal` test suite against this implementation. See [`divergences.md`](./__conformance__/divergences.md) for documented differences.
