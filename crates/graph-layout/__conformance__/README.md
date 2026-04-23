# Conformance — `@amigo-labs/graph-layout`

## Files

- `parity.spec.ts` — rank-ordering parity with `@dagrejs/dagre`.
- `upstream.spec.ts` — dagre-README-example shapes (diamond,
  minlen-stretched chain).
- `fuzz.spec.ts` — random DAG specs, no panics, finite coords.
- `divergences.md` — byte-level + algorithmic differences vs. dagre.

## Running

```bash
pnpm --filter @amigo-labs/graph-layout test:conformance
```

## Parity scope

**Not pixel-identical to dagre.** Sugiyama layout has many
equally-valid solutions; we target topological correctness
(rank ordering, siblings on same rank) and parameter honouring.
