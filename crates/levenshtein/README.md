# @amigo-labs/levenshtein

> Edit distance via `triple_accel` (SIMD) with a `strsim` fallback for short strings. Drop-in for [`fast-levenshtein`](https://www.npmjs.com/package/fast-levenshtein) and [`leven`](https://www.npmjs.com/package/leven), compiled via NAPI-RS.

## Install

```bash
npm install @amigo-labs/levenshtein
```

## Usage

```ts
import { distance, get } from '@amigo-labs/levenshtein'

distance('kitten', 'sitting')               // 3
distance('Müller', 'mueller', { useCollator: true })  // 2

// fast-levenshtein-compatible name:
get('kitten', 'sitting')                    // 3
```

`useCollator: true` lowercases both inputs (UTF-8 aware) before measuring — matches `fast-levenshtein`'s collator flag.

## Parity

Tests in [`__conformance__/`](./__conformance__) run the upstream `fast-levenshtein` and `leven` test suites against this implementation. See [`divergences.md`](./__conformance__/divergences.md) for documented differences.
