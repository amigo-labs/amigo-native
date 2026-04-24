# Conformance — `@amigo-labs/minisearch`

## Files

- `parity.spec.ts` — head-to-head with upstream `minisearch` on
  top-hit selection, prefix matching, and AND operator.
- `upstream.spec.ts` — minisearch-README-style examples.
- `fuzz.spec.ts` — property-based: no panics, sorted autosuggest,
  empty-query → [].
- `divergences.md` — documented scope cuts.

## Running

```bash
pnpm --filter @amigo-labs/minisearch test:conformance
```
