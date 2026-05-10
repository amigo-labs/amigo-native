# Perf-Review: `@amigo-labs/nanoid`

> **Status:** 🔴 Red — recommend Phase-D deprecation · **Reviewed:** 2026-05-10 · **Version:** 0.2.1

## Verdict

`@amigo-labs/nanoid` has carried **no Rust** since 0.2.0 (`794396b`); the
`crates/nanoid/` directory ships only `wrapper.js` over Node's built-in
`crypto.randomFillSync`, with the same 128-ID pool strategy as `nanoid@5`
itself. Against the upstream `nanoid` package the realistic median scenario
(single default-size call) measures **0.91×** — slower — and the best
remaining win is **1.17×** on the batch path. The portfolio thesis ("always
faster than the JS alternative on realistic inputs") does not hold here, and
because there is no native code to optimize, no Phase-C lever can rescue it.

## Classification rationale

The skill thresholds put nanoid in Red on two independent counts:

1. **Realistic median is slower than upstream.** A single default-size
   `nanoid()` is the dominant call shape (request-id assignment, row-id on
   insert, cookie-token mint). At that size we run at 4.86 M Hz vs upstream's
   5.34 M Hz — a 0.91× ratio. The Red criterion *"slower than JS at the
   median real use-case"* applies directly.
2. **Best speedup is 1.17×, well below the 1.5× Red gate.** Even in the
   best-case batch scenario the win is too small to justify the additional
   `@amigo-labs` dependency hop, the slightly larger install surface, and
   the maintenance overhead of a separate package.

This is not a perf regression to be sprinted on — it is a structural
mismatch. The original Rust port was correctly retired in 0.2.0 because
the FFI floor (~109 ns NAPI noop, ~180 ns Buffer echo from
`docs/BASELINE.md`) is on the same order as the entire JS path's per-call
budget for a 21-byte ID. After dropping back to pure JS, the package is
now a same-language reimplementation of `nanoid@5`'s strategy, which by
construction cannot be meaningfully faster than the original on the
common path.

## Evidence

### Measured speedup (docs/data.json, this review)

| Scenario                            | @amigo-labs/nanoid | nanoid@5     | randomUUID   | vs nanoid | vs randomUUID |
| :---------------------------------- | -----------------: | -----------: | -----------: | --------: | ------------: |
| single call (default size=21)       |       4 857 128 Hz | 5 343 615 Hz | 5 142 779 Hz | **0.91×** |     **0.94×** |
| batch 1 000 × default               |           7 060 Hz |     6 008 Hz |     7 730 Hz | **1.17×** |     **0.91×** |
| customAlphabet (hex, 32 chars)      |       3 679 495 Hz | 3 680 656 Hz |            — | **1.00×** |             — |
| single call size=128                |       1 273 179 Hz | 1 125 564 Hz |            — | **1.13×** |             — |

Range vs `nanoid@5`: **0.91× – 1.17×**. Median: parity. Worst case: a
realistic call shape where we lose.

### Realistic use-case

**Primary:** Single-ID generation inside HTTP handlers and ORM hooks —
1 to 10 calls per request. This is the path where 0.91× hurts.
**Secondary:** Bulk seed-data / fixture generation — 100 to 10 000 IDs in
a tight loop. This is the only scenario where the package is faster than
upstream (1.17×), but the absolute throughput (7 060 Hz for 1 000 IDs =
~7 M IDs/sec) is well past where any real workload is bottlenecked.

### Benchmark gaps

None that would change the verdict. Even if a missing bucket showed a
1.3–1.5× win, the median single-call regression is the disqualifier.

### API surface

Pure JS — `nanoid()`, `customAlphabet()`, `customRandom()`, all in
`crates/nanoid/wrapper.js`. No `#[napi]`, no `Cargo.toml`, no `src/lib.rs`.

### Bundle / binary size

No native binaries (no `npm/<target>/` stubs needed). Wrapper plus types
is on the order of a few KB — competitive, but `nanoid@5` itself is also
tiny. Bundle is not a differentiator either way.

### FFI-overhead baseline

Captured in `docs/BASELINE.md` (NAPI noop ~109 ns, Buffer echo ~180 ns).
The whole reason the package went pure-JS in 0.2.0 is that those numbers
exceed the per-call budget of `nanoid()` itself. The baseline is the
*explanation* for why this Red classification is structural, not a
sprint-fixable regression.

## Phase-C optimization checklist

| #   | Lever                                                                           | Applicable   | Notes                                                                                                                                |
| :-- | :------------------------------------------------------------------------------ | :----------- | :----------------------------------------------------------------------------------------------------------------------------------- |
| C.1 | Input-type minimization (`String` → `&str`, `Vec<T>` → `&[T]`, Buffer-overload) | n/a          | No Rust to minimize. The package has no NAPI surface.                                                                                |
| C.2 | Output-type minimization (`String` → `&str`, `Vec<T>` → Buffer)                 | n/a          | No Rust outputs to shape.                                                                                                            |
| C.3 | Batch API                                                                       | already done | `batch(count, size)` exists in `wrapper.js` and is the only scenario where we beat upstream (1.17×). Cannot grow further in pure JS. |
| C.4 | Stateful API (reusable setup via NAPI class)                                    | n/a          | No setup cost worth amortizing — entropy pool already amortized per-call.                                                            |
| C.5 | Parallelization (rayon over large inputs)                                       | n/a          | Pure JS; rayon is not in scope.                                                                                                      |
| C.6 | Algorithm swap (SIMD variant, streaming parser, etc.)                           | n/a          | The algorithm *is* what `nanoid@5` does. A different algorithm would no longer be `nanoid`.                                          |
| C.7 | Allocator tuning (arena, caller-provided output buffer)                         | n/a          | V8 owns allocations; no Rust allocator to tune.                                                                                      |
| C.8 | Bundle-size (LTO, features, panic=abort, strip)                                 | n/a          | No native artifact.                                                                                                                  |

Every Phase-C lever is structurally unavailable. This is the diagnostic
that confirms Red: when the optimization checklist is empty, there is no
way back to Green.

## Action plan — Phase D (deprecation)

1. **Mark on the registry.** Run
   `npm deprecate '@amigo-labs/nanoid@*' "Use the upstream 'nanoid' package — @amigo-labs/nanoid offers no measurable advantage and is slower on the median single-call path. See MIGRATION.md."`
   so installs surface the warning.
2. **Add a deprecation banner to the crate `README.md`** at the top,
   pointing at the upstream `nanoid` package.
3. **Refresh `MIGRATION.md`** with the swap recipe (drop-in: change the
   import, identical API surface).
4. **3-month deprecation window.** Track the install graph; once weekly
   downloads fall below the noise floor, archive.
5. **Move to `archived/nanoid/`** alongside `archived/deep-equal/` and
   friends, draft `docs/post-mortems/nanoid.md` summarizing the lesson:
   *"NAPI cannot win when per-call work is smaller than the FFI floor;
   a same-language reimplementation cannot win against the upstream it
   imitates."*
6. **Update `docs/packages.json`** to drop the entry once archived (the
   `description` field already half-admits the situation:
   *"Pure JS — the NAPI FFI boundary was bigger than the entire
   ID-generation path."*).

The deprecation execution is not part of this review — that's a
follow-up PR after the user agrees with the verdict.

## References

- Crate: `crates/nanoid`
- Bench: `crates/nanoid/__bench__/index.bench.ts`
- Wrapper (no Rust): `crates/nanoid/wrapper.js`
- `docs/packages.json` speedup field: `up to 1.13× faster / 1.1× slower`
- FFI baseline: `docs/BASELINE.md`
- Prior review (German, superseded by this doc): git history of `docs/perf-review/nanoid.md`
