# Perf-Review: `@amigo-labs/bcrypt`

> **Status:** 🔴 Red — recommend Phase-D deprecation · **Reviewed:** 2026-05-10 · **Version:** 0.1.1

## Verdict

`@amigo-labs/bcrypt` runs Solar Designer's `crypt_blowfish` C source through
NAPI; the upstream `bcrypt` npm package runs the *same* C code through
`node-gyp`. Both end up calling effectively identical Blowfish key
schedules at effectively identical cycles per cost. Today's measurements
show **1.01–1.03× over `bcrypt` (npm)** at every cost setting — well below
the 1.5× Red gate — and **1.28–1.38× over `bcryptjs`**, also below the gate.
The 2× Green threshold is structurally unreachable: when three
implementations all wrap the same canonical C, no FFI cleverness can move
the needle.

## Classification rationale

The 2026-04-19 review classified bcrypt 🟡 Yellow at 1.10–1.42× over
`bcrypt`-npm; today's measurements compress that range to **1.01–1.03×**.
Whether that is a regression or just bench-noise convergence, both ranges
fall below the *across-the-board ~1.5×* Yellow band — the package only
qualified for Yellow under the previous numbers by stretching the band.

The skill's Red criteria apply directly:

1. **<1.5× even at large.** cost=10 (industry default for password
   hashing) shows 1.027×. There is no "large input" where the ratio
   improves — the Blowfish key schedule is the entire workload, and it
   runs in lockstep across all three packages.
2. **Parity not maintainable at acceptable cost.** All three competitors
   already compile to the same machine code path. The only legitimate
   non-perf advantage is *install reliability*: `@amigo-labs/bcrypt`
   ships precompiled binaries, while `bcrypt`-npm requires `node-gyp` and
   a C++ toolchain at install time. That is a deployment win, not a perf
   win, and it does not justify a Green-or-Yellow perf classification.

The portfolio thesis ("always faster than the JS alternative on
realistic inputs") is not violated against `bcryptjs` — we beat the
pure-JS implementation 1.28–1.38× — but the realistic competitor for
anyone who already uses native bindings is `bcrypt`-npm. Against that
competitor we are tied.

## Evidence

### Measured speedup (docs/data.json, this review)

| Scenario                          | @amigo-labs/bcrypt | bcrypt (C++)  | bcryptjs (JS) | vs bcrypt   | vs bcryptjs |
| :-------------------------------- | -----------------: | ------------: | ------------: | ----------: | ----------: |
| hash, cost 4 (low)                |        1 108.03 Hz |   1 096.41 Hz |     866.91 Hz | **1.011×**  |  **1.278×** |
| hash, cost 10 (industry default)  |          19.91 Hz  |      19.39 Hz |      14.44 Hz | **1.027×**  |  **1.378×** |
| verify, cost 10                   |          19.91 Hz  |      19.42 Hz |      14.45 Hz | **1.025×**  |  **1.377×** |

Range vs `bcrypt`-npm: **1.01× – 1.03×**. Range vs `bcryptjs`:
**1.28× – 1.38×**.

### Realistic use-case

Password hashing on registration / login at cost 10–12. A typical
service does <100 of these per second per process; the 0.5 Hz absolute
delta vs `bcrypt`-npm at cost 10 is unobservable in production. Users
who chose `bcrypt`-npm did so because of native speed; they will not
switch for a 2.5% improvement.

### Benchmark gaps

- No batch / parallel-hashing scenario. Argon2-style "verify many at
  once" is the only call shape where rayon could plausibly help, but
  bcrypt is rarely batched in practice.
- No cost=12 (the modern default). Cost scales geometrically — at
  cost=12 the ratio is bounded by the same Blowfish loop, so the
  conclusion does not move.

### API surface

Sync + async hash/verify. Reads buffer-or-string passwords, returns
60-byte ASCII bcrypt strings. Setting/output buffers are stack-sized
(`HASH_BUF_LEN = 64`, `SETTING_BUF_LEN = 32`). FFI surface is already
minimal — there is no marshalling fat to trim.

### Bundle / binary size

Vendored `crypt_blowfish` C source compiled per platform via the `cc`
crate. Six platform stubs in `npm/`. Smaller than `bcrypt`-npm because
no `node-gyp` build script is shipped to consumers, but this is not
the differentiator the perf review judges on.

### FFI-overhead baseline

`docs/BASELINE.md` NAPI noop ~109 ns. Per-call work at cost=10 is
~50 ms. FFI overhead is rounding error here — the package is not
FFI-floor-bound, it is genuinely algorithm-bound, which is the
hardest perf-review situation: nothing to optimize.

## Phase-C optimization checklist

| #   | Lever                                                                           | Applicable           | Notes                                                                                                                                |
| :-- | :------------------------------------------------------------------------------ | :------------------- | :----------------------------------------------------------------------------------------------------------------------------------- |
| C.1 | Input-type minimization (`String` → `&str`, `Vec<T>` → `&[T]`, Buffer-overload) | already done         | Buffer + string overloads already accepted. Per-call FFI floor is ~109 ns vs 50 ms work — no measurable gain available.              |
| C.2 | Output-type minimization (`String` → `&str`, `Vec<T>` → Buffer)                 | already done         | Output is a 60-byte ASCII string. Switching to `Buffer` would save ~30 ns on a 50 ms call.                                           |
| C.3 | Batch API                                                                       | not applicable       | Bcrypt is intentionally serial in real workloads; users do not want to commit a thread pool to "verify N login attempts at once".    |
| C.4 | Stateful API (reusable setup via NAPI class)                                    | n/a                  | No reusable state — each hash uses a fresh salt and a fresh key schedule.                                                            |
| C.5 | Parallelization (rayon over large inputs)                                       | not applicable       | Same as C.3. Bcrypt's whole purpose is to burn CPU; parallelizing inverts the threat model.                                          |
| C.6 | Algorithm swap (SIMD variant, streaming parser, etc.)                           | n/a                  | Solar Designer's `crypt_blowfish` is the canonical reference. There is no faster Blowfish implementation in any language.            |
| C.7 | Allocator tuning (arena, caller-provided output buffer)                         | already done         | All buffers are stack-sized constants. Nothing to tune.                                                                              |
| C.8 | Bundle-size (LTO, features, panic=abort, strip)                                 | applicable, low ROI  | Could shave a few KB off the platform stubs, but irrelevant — the install footprint of bcrypt-npm is dominated by its build script. |

The checklist confirms what the prior review already said: *"2× Green
gate structurally unreachable (identical algorithm in both competitors)."*
What the prior review did not call out is that **structurally
unreachable Green is the definition of Red**, not Yellow, when the
realistic competitor is the C++ binding rather than the pure-JS one.

## Action plan — Phase D (deprecation)

1. **Mark on the registry.**
   `npm deprecate '@amigo-labs/bcrypt@*' "Use 'bcrypt' (npm) for native speed or 'bcryptjs' for pure JS — @amigo-labs/bcrypt offers no measurable perf advantage. See MIGRATION.md. Consider @amigo-labs/argon2 for new projects."`
2. **Banner the crate `README.md`** with a "deprecated, use `bcrypt`
   (or `argon2` for new projects)" notice.
3. **`MIGRATION.md`** — point to `bcrypt` for binary-compatible drop-in
   and to `@amigo-labs/argon2` for new code that wants memory-hard
   hashing on the Yellow-but-acknowledged ceiling.
4. **3-month deprecation window**, then archive to `archived/bcrypt/`.
5. **`docs/post-mortems/bcrypt.md`** — short post-mortem with the
   transferable lesson: *"Algorithm-bound primitives where the canonical
   implementation is a C library cannot be ported usefully — the C
   port wraps the same C source, and any speed difference is noise."*
6. **`docs/packages.json`** — drop the entry once archived.

Note: `@amigo-labs/argon2` is also algorithm-bound (perf-review notes
"ceiling reached" at 1.36×), but argon2 has *intrinsic* memory-hardness
advantages over bcrypt and may justify keeping. That is its own
re-review, not this one.

## References

- Crate: `crates/bcrypt`
- Bench: `crates/bcrypt/__bench__/index.bench.ts`
- Lib: `crates/bcrypt/src/lib.rs`
- Cargo: `crates/bcrypt/Cargo.toml`
- C source: `crates/bcrypt/csrc/` (Solar Designer crypt_blowfish, public domain)
- `docs/packages.json` speedup field: `~equal`
- FFI baseline: `docs/BASELINE.md`
- Prior review: 2026-04-19 entry in `docs/perf-review.md` (Yellow, ceiling acknowledged)
