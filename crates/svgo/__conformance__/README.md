# Conformance — `@amigo-labs/svgo`

This directory verifies that `@amigo-labs/svgo` produces SVG output
that parses to an equivalent-or-smaller DOM compared to upstream
`svgo`, for the documented plugin subset.

## Files

- `parity.spec.ts` — handcrafted inputs where both us and upstream
  should shrink the output; checks direction-of-effect matches.
- `upstream.spec.ts` — per-plugin fixtures drawn from svgo's
  `preset-default` surface. Verifies each plugin applies.
- `fuzz.spec.ts` — property-based tests with `fast-check`; ensures no
  panics, output ≤ input bytes, `<svg` survives.
- `divergences.md` — known output differences (byte-level) vs. svgo.

## Running

```bash
pnpm --filter @amigo-labs/svgo test:conformance
```

## Parity scope

`@amigo-labs/svgo` implements ~16 of svgo's ~32 preset-default plugins
— the ones with the highest compression impact on realistic inputs.
Out-of-scope plugins (`convertPathData`, `mergePaths`, `inlineStyles`,
`minifyStyles`, `reusePaths`) are deferred to v0.2.
