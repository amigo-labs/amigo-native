# Post-Mortem: `@amigo-labs/deep-equal`

**Status:** deprecated in 0.2.0, recommending `fast-deep-equal` upstream.

## Expected gain

A Rust structural comparison of two JS values, avoiding JS engine
overhead on repeated property walks for deeply nested or large objects.
Hypothesis: `serde_json::Value` equality comparisons would outperform
V8's object traversal at scale.

## Measured gain

| Scenario | `@amigo-labs/deep-equal` | `fast-deep-equal` | Ratio |
|---|---:|---:|---:|
| flat 7-key objects | 2,436,028 ops/s | 1,874,187 ops/s | **1.30× faster** |
| deeply nested (20 levels) | 419,139 ops/s | 436,295 ops/s | 0.96× (essentially parity) |
| 10k objects in array | 305 ops/s | 313 ops/s | 0.97× (essentially parity) |

One grenzwertig win on the smallest case; parity on every realistic
workload. Nothing approaching the 2× threshold that would justify a
native package.

## Root cause

`fast-deep-equal` is ~50 lines of pure JS that V8's JIT optimises
aggressively: one tight loop of property lookups and recursive
equality checks. V8 even inlines property accesses on monomorphic call
sites. Our Rust implementation has to:

1. Cross the NAPI boundary twice (input marshalling of two values)
2. Walk the JS objects via `napi::JsObject::get_named_property` —
   each property access is an FFI crossing back into V8
3. Convert primitives (numbers, strings, booleans) through NAPI's
   typed getters

The per-property FFI cost dominates the savings from Rust's
comparison. And the bigger the object, the more crossings we pay.
The package is structurally disadvantaged — the workload doesn't
amortise NAPI overhead.

## What was tried

None. Classification hit Red before any optimisation sprint because
the baseline numbers already showed no meaningful margin to optimise
*into*. Making the native side 2× faster still wouldn't cross into
Green territory when the bottleneck is the per-property FFI boundary.

## What we learned

- NAPI's `JsObject::get_named_property` is the wrong primitive for
  anything that touches many object properties per call. Every lookup
  is an FFI crossing.
- Packages whose JS alternative is a tiny monomorphic function that
  V8 JITs into a handful of machine instructions cannot be beaten by
  Rust + NAPI. `fast-deep-equal` is in that category.
- Structural-comparison packages only have a chance if the comparison
  surface can be reduced to one FFI call (e.g. "compare two
  `Uint8Array` blobs"), which defeats the point of deep-equal.

## Deprecation plan

- 0.2.0 (2026-Q1): `deprecated` field in package.json; README warning.
- Three-month window **waived** on 2026-04-19 along with the other
  0.2.0 deprecations (levenshtein, xml): no credible algorithmic path
  remains, keeping the crate around only delays the migration signal.
- Source moved to `archived/deep-equal/` the same day. npm registry
  keeps 0.2.0 with the existing deprecation notice — no further
  releases.

Users should switch to `fast-deep-equal` directly.
