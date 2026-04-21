# Divergences — diff

`@amigo-labs/diff` uses the `similar` Rust crate as its engine; upstream
`diff` is pure JS Myers. Both implement Myers/Patience correctly but
may choose slightly different minimum-edit scripts when multiple
equally-short scripts exist.

## Minimum-edit-script selection

- **Input:** strings with multiple equivalent minimum-edit paths
- **Upstream:** `diff` picks one canonical path (implementation-defined)
- **@amigo-labs/diff:** `similar` picks one canonical path
  (implementation-defined)
- **Why:** Myers doesn't define a unique output; both libraries are
  correct when their edit script reconstructs the target string.
- **Impact:** diff totals (`added.length`, `removed.length`) may differ
  by small amounts on pathological inputs; reconstruction is always
  byte-exact. We test the reconstruction invariant in `fuzz.spec.ts`.

## Scope cuts

### No `diffJson` in v0.1

`jsdiff.diffJson(a, b)` stringifies and line-diffs two JSON values.
v0.1 omits it — callers can `JSON.stringify` upstream and call
`diffLines` themselves. Adding `diffJson` requires a stable
deterministic stringifier; deferred to v0.2.

### No `diffCss` in v0.1

Same reasoning as `diffJson`: the jsdiff helper is a tokenize-then-
diff wrapper, not a separate algorithm. Out of scope for v0.1.

### `applyPatch` / `parsePatch` not yet implemented

`createPatch` produces unified-diff output, but the reverse direction
(`applyPatch`, `parsePatch`) is deferred to v0.2. Use GNU `patch` or
the upstream `diff` package for patch application in the meantime.

### `diffArrays` with a comparator callback

`jsdiff.diffArrays(a, b, { comparator })` takes a JS function that
runs once per pair — a classic callback-over-FFI antipattern. We
intentionally don't expose it. Pre-serialise arrays to strings in JS
and use `diffLines`.
