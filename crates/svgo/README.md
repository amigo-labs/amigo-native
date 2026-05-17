# @amigo-labs/svgo

> Fast SVG optimizer. Ships 16 of [svgo](https://svgo.dev)'s
> `preset-default` plugins as a native NAPI binding, written in Rust
> over [`quick-xml`](https://crates.io/crates/quick-xml).

## Install

```bash
pnpm add @amigo-labs/svgo
```

## Usage

```js
import { optimize, optimizeMany } from '@amigo-labs/svgo'

const { data, inputBytes, outputBytes, savedPercent } = optimize(svgString)
// { data: '<svg...', inputBytes: 1200, outputBytes: 480, savedPercent: 60 }

// Batch-optimise an icon set in one FFI call:
const results = optimizeMany(svgs)
```

## Config

All plugins are on by default. Pass `false` for any you want to
skip; `floatPrecision` and `multipass` control numeric rounding and
fixpoint iteration.

```js
optimize(svg, {
  // disable a specific plugin while keeping the rest of the
  // preset-default on:
  convertColors: false,

  // tune numeric rounding (default 3):
  floatPrecision: 4,

  // run the pipeline until the output stabilises (default false):
  multipass: true,
})
```

Full option surface (all booleans default to `true`):

```ts
interface SvgoConfig {
  removeComments?: boolean
  removeMetadata?: boolean
  removeTitle?: boolean
  removeDesc?: boolean
  removeDoctype?: boolean
  removeXmlProcInst?: boolean
  removeEditorsNsData?: boolean
  removeEmptyAttrs?: boolean
  removeEmptyText?: boolean
  removeEmptyContainers?: boolean
  removeHiddenElems?: boolean
  removeUselessDefs?: boolean
  cleanupNumericValues?: boolean
  cleanupAttrs?: boolean
  collapseGroups?: boolean
  convertColors?: boolean
  collapseWhitespace?: boolean
  floatPrecision?: number    // default 3
  multipass?: boolean        // default false
}
```

## Scope

v0.1 ships the 16 highest-impact `preset-default` plugins — covering
the majority of real-world SVG-optimization savings on icon sets and
static assets. Path-arithmetic plugins (`convertPathData`,
`mergePaths`, `reusePaths`) and stylesheet plugins (`inlineStyles`,
`minifyStyles`) are deferred to v0.2.

Custom JS plugins are **not** exposed — each visit would cost a
FFI-crossing and destroy the performance thesis.

See [`__conformance__/divergences.md`](./__conformance__/divergences.md)
for known byte-level differences vs. upstream.

## Install for the browser

The same `import` works in Angular, React, Vite, esbuild, and webpack ≥ 5 — the bundler picks the WASM build via the `browser` conditional export:

```ts
import { optimize } from '@amigo-labs/svgo'
```

`quick-xml` is small (~80 KB gzipped) — comfortably under the 500 KB browser budget. Useful for build-time SVG optimization in client-side workflows (e.g., dynamic icon-sprite generation).

## License

MIT
