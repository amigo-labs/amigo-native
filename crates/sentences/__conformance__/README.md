# Conformance — `@amigo-labs/sentences`

Parity target: **Pragmatic Segmenter** behaviour (the Ruby reference
behind `sbd`). Bit-exact parity with `sbd` itself is **not** claimed.

## Files

- `parity.spec.ts` — head-to-head with `sbd`. Verifies both agree on
  sentence count for basic patterns. Known divergences on ellipsis
  and URL-heavy inputs.
- `upstream.spec.ts` — fixture-style tests from sbd's README examples
  plus multi-language smoke tests.
- `fuzz.spec.ts` — property-based tests (no panics, offsets
  non-decreasing, rejoinable).
- `divergences.md` — documented behavioural gaps.

## Running

```bash
pnpm --filter @amigo-labs/sentences test:conformance
```
