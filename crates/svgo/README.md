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

All plugins are on by default. Disable any of them individually:

```js
optimize(svg, {
  removeComments: true,
  removeMetadata: true,
  removeTitle: true,
  removeDesc: true,
  removeDoctype: true,
  removeXmlProcInst: true,
  removeEditorsNsData: true,
  removeEmptyAttrs: true,
  removeEmptyText: true,
  removeEmptyContainers: true,
  removeHiddenElems: true,
  removeUselessDefs: true,
  cleanupNumericValues: true,
  cleanupAttrs: true,
  collapseGroups: true,
  convertColors: true,
  collapseWhitespace: true,
  floatPrecision: 3,
  multipass: false,
})
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

## License

MIT
