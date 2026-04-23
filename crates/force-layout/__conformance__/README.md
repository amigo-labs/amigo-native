# Conformance — `@amigo-labs/force-layout`

## Files

- `parity.spec.ts` — both us and `d3-force` converge on link
  equilibrium and disperse isolated nodes.
- `upstream.spec.ts` — scenario-style tests (triangle → equilateral,
  star → centre central).
- `fuzz.spec.ts` — no panics, finite positions.
- `divergences.md` — documented gaps.

## Running

```bash
pnpm --filter @amigo-labs/force-layout test:conformance
```

## Parity scope

Force-simulation has **many valid equilibria** for the same graph
(different initial conditions, random noise). Parity target:
topological correctness (link-equilibrium distance, degree-aware
centring), not byte-identical positions.
