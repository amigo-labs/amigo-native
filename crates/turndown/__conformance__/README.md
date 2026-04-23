# Conformance — `@amigo-labs/turndown`

## Files

- `parity.spec.ts` — head-to-head with upstream `turndown` (+ GFM plugin).
  Checks direction-of-output matches on basic HTML shapes.
- `upstream.spec.ts` — fixture-style tests from turndown's README
  examples.
- `fuzz.spec.ts` — property-based: no panics, reasonable output bounds.
- `divergences.md` — documented behavioural gaps.

## Running

```bash
pnpm --filter @amigo-labs/turndown test:conformance
```

## Scope

We implement the CommonMark + GFM subset that covers 95% of
real-world usage. `.addRule()` and custom-JS-filter callbacks are
intentionally not exposed — each visit would cost a FFI crossing.
