# Divergences — svgo

`@amigo-labs/svgo` is a **subset-parity** implementation focused on
the highest-impact `preset-default` plugins. Byte-level output differs
from upstream in several known ways.

## Implemented plugins (v0.1)

- `removeComments`
- `removeDoctype`
- `removeXMLProcInst`
- `removeMetadata`
- `removeTitle`
- `removeDesc`
- `removeEditorsNSData`
- `removeEmptyAttrs`
- `removeEmptyText`
- `removeEmptyContainers`
- `removeHiddenElems` (display=none / visibility=hidden only)
- `removeUselessDefs`
- `cleanupNumericValues`
- `cleanupAttrs` (whitespace collapse)
- `collapseGroups` (single-child, no-attr case only)
- `convertColors` (named → hex, rgb() → hex, long hex → short hex)

## Not implemented (v0.2+)

- `convertPathData` — path arithmetic, arc → cubic, etc. ~800 LOC.
- `mergePaths` — combine adjacent same-style paths into one `d`.
- `inlineStyles` — move `<style>` rules into element attributes.
- `minifyStyles` — CSS minification inside `<style>` blocks.
- `reusePaths` — hoist duplicate paths to `<defs>` + `<use>`.
- `removeUnknownsAndDefaults` — requires the SVG spec's attribute
  default table; the table is the real work, not the transform.
- `removeNonInheritableGroupAttrs` — same.
- `sortAttrs` — cosmetic reordering; intentionally skipped.
- `removeViewBox` — contextual (depends on width/height); skipped.

## Byte-level differences

### Attribute ordering

`@amigo-labs/svgo` preserves source attribute order. svgo normalises
(its `sortAttrs` plugin is on by default in preset-default — but the
order is stable). **Impact:** byte-different output for the same
semantic SVG. Build-tool caches keyed on asset hash will see a
one-time invalidation.

### Self-closing vs. explicit close

Empty elements written as `<rect/>` stay self-closing; empty elements
written as `<rect></rect>` may get canonicalised to self-closing
(quick-xml decides, not us). svgo normalises to self-closing. Mostly
agrees.

### Whitespace between elements

With `collapseWhitespace: true` (default), both us and svgo strip
inter-element whitespace. Minor differences in handling of
preserve-whitespace inside `<text>` / `<tspan>` — we collapse
inside those too, svgo respects `xml:space="preserve"`. **Workaround:**
`collapseWhitespace: false` for text-heavy SVGs.

### Color conversion table

`convertColors` uses an 18-entry named-color table (CSS Level 2 core
+ a handful of web-safe names). svgo uses the full CSS Color Module 4
table (~140 entries). **Impact:** exotic named colors
(`rebeccapurple`, `papayawhip`) pass through unchanged in our output.

### Number formatting

Both round to `floatPrecision` (default 3). svgo has additional
context-aware rules (attribute-specific precision, scientific-notation
substitution for `<1e-3`). We don't; our output may be marginally
longer for very small numbers.

## Out-of-scope parity

Custom JS plugin API — intentionally not exposed. See
`docs/perf-review/svgo.md` for the rationale (FFI-crossing-per-visit
would destroy the performance thesis).
