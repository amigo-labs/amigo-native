# Conformance — `@amigo-labs/bm25`

## Files

- `parity.spec.ts` — head-to-head with `okapibm25`. Checks the
  ranking direction matches on shared queries.
- `upstream.spec.ts` — small-corpus smoke tests, including
  length-normalisation and unicode.
- `fuzz.spec.ts` — property-based: no panics, scores non-increasing
  in rank order.
- `divergences.md` — known behavioural gaps.

## Running

```bash
pnpm --filter @amigo-labs/bm25 test:conformance
```
