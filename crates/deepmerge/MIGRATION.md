# Migration — `deepmerge` → `@amigo-labs/deepmerge`

**Semantic drop-in** for the default export and `merge.all` helper of
[`deepmerge`](https://www.npmjs.com/package/deepmerge) v4.

## Important: performance caveat

`deepmerge` is ~100 lines of JS. For **small or shallow** objects, FFI
overhead dominates cost; the JS implementation in `wrapper.js` is the faster
path for everyday merges. The Rust path (`merge.mergeJson`) is exposed for
large plain-JSON inputs where the native copy beats allocation+traversal
overhead in V8.

Run `pnpm bench` in `crates/deepmerge` before migrating perf-critical code.

## API mapping

| deepmerge                           | amigo                                 |
|:------------------------------------|:--------------------------------------|
| `merge(target, source, opts)`       | `merge(target, source, opts)`         |
| `merge.all([a, b, c], opts)`        | `merge.all([a, b, c], opts)`          |
| `opts.arrayMerge` (custom fn)       | `opts.arrayMerge: 'concat' \| 'overwrite'` (string only in v1) |
| `opts.customMerge`                  | **not supported** — stay on upstream if you use this |
| `opts.isMergeableObject`            | **not supported** — we treat plain objects only |
| *(not upstream)*                    | `merge.mergeJson(t, s, opts)` — Rust fast-path for plain JSON |

## Semantics (matched)

- Source wins for scalar collisions.
- Nested plain objects merge recursively.
- Arrays **concatenate** by default (deepmerge v4 default).
- Prototype-pollution keys (`__proto__`, `constructor`, `prototype`) are filtered.
- Inputs are not mutated.

## Unsupported in v1

- **`customMerge`** (callback per key): ThreadsafeFunction per callback is more
  expensive than the merge itself. Use upstream if you need this.
- **`isMergeableObject`**: plain-object heuristic is fixed.
- **`clone: false`**: all merges produce a fresh tree; the flag is a no-op.
