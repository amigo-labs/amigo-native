# Migrating from `svgo`

`@amigo-labs/svgo` is not a 100% drop-in for
[`svgo`](https://www.npmjs.com/package/svgo). It targets the common
case: build-tool-driven optimisation of icon sets and static SVG
assets with `preset-default` plugins.

## What works

- `optimize(svg, { ... })` — same return shape (`{ data }` plus
  extra telemetry fields `inputBytes`, `outputBytes`, `savedPercent`).
- The 16 highest-impact preset-default plugins (see
  [`README.md`](./README.md)).
- `multipass: true` loops optimisations until the output stabilises.
- `floatPrecision` controls numeric rounding.

## What doesn't

- **Custom JS plugins**: `plugins: [{ name: 'myPlugin', fn(root) {...} }]`
  is unsupported. Per-visit callbacks across the FFI boundary kill
  performance. **Workaround:** stay on `svgo` for builds that use
  custom plugins.
- **`convertPathData`, `mergePaths`, `reusePaths`**: not yet ported.
  On path-heavy SVGs, our output is slightly larger than svgo's
  (typically 5–15% on illustrations with many paths).
- **`inlineStyles`, `minifyStyles`**: `<style>` blocks pass through
  unchanged.
- **Attribute ordering**: we preserve source order; svgo normalises.
  Build-tool caches that key on asset hash will invalidate once at
  migration.
- **Full CSS named-color table**: we know 18 common names. Exotic
  names (`rebeccapurple`, `papayawhip`) pass through unchanged.

## Migration checklist

1. Replace `import { optimize } from 'svgo'` with
   `import { optimize } from '@amigo-labs/svgo'`.
2. If you have custom plugins, keep upstream `svgo` for those paths.
3. Run your test fixtures once — re-baseline snapshot output if any
   tests key on byte-exact SVG strings.
4. If you use build-tool asset hashing, expect a one-time cache
   invalidation.

## If you want full parity

Stay on upstream `svgo`. We target the 80/20 case, not full parity.
