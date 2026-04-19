# Migration — `fast-deep-equal` → `@amigo-labs/deep-equal`

**Semantic drop-in** for `fast-deep-equal` and `fast-deep-equal/es6`. Exposes
the same default export signature: `equal(a, b) => boolean`.

## Important: performance caveat

`fast-deep-equal` is already 32 lines of hand-tuned JavaScript. For **small or
shallow** structures, the Rust native call adds FFI overhead that dominates the
comparison cost, making our default JS implementation the faster path. We ship
the full JS implementation in `wrapper.js` and call Rust only for the
`deepEqualJson` bonus API (opt-in for large plain-JSON inputs).

Run `pnpm bench` in `crates/deep-equal` before migrating performance-critical code.

## API mapping

| fast-deep-equal               | amigo                               |
|:------------------------------|:------------------------------------|
| `equal(a, b)`                 | `equal(a, b)`                       |
| `require('fast-deep-equal')`  | `require('@amigo-labs/deep-equal')` |
| `require('fast-deep-equal/es6')` | same — Map/Set/TypedArray handled by default |
| *(not upstream)*              | `equal.deepEqualJson(a, b)` (Rust fast-path for plain JSON) |

## Semantics (matched)

- Key iteration order is irrelevant; arity matters (`{a:1}` ≠ `{a:1, b: undefined}`).
- `NaN === NaN` (fast-deep-equal treats NaN as equal to itself via `a !== a && b !== b`).
- `Date`: compared via `valueOf()`.
- `RegExp`: `source` + `flags` compared.
- `Map`/`Set`: size + members/entries.
- `TypedArray`: same constructor + same byte sequence.
