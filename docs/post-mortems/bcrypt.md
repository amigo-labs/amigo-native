# Post-Mortem: `@amigo-labs/bcrypt`

**Status:** archived 2026-05-10. Recommending the upstream `bcrypt`
package for binary-compatible drop-in, or `@amigo-labs/argon2` for new
projects.

## Expected gain

A native NAPI-RS bcrypt that ships precompiled binaries (no `node-gyp`
toolchain required at install) and is meaningfully faster than the
upstream `bcrypt` npm package's C++ binding. Hypothesis: the NAPI
boundary is leaner than `bcrypt`-npm's older NAN/`node-addon-api`
binding and the prebuilt binaries would deliver both perf and install
reliability.

## Measured gain

### v0.1.0 (pure-Rust Blowfish backend)

The pure-Rust Blowfish implementation lost against `bcrypt`-npm
because the canonical Solar Designer C code is genuinely well-tuned
and hand-written assembly variants are not available in any Rust
crate. Phase-C swapped the backend.

### v0.1.1 (vendored Solar Designer `crypt_blowfish` C source)

After vendoring the same C code that `bcrypt`-npm ships:

| Scenario | @amigo-labs/bcrypt | bcrypt (C++) | bcryptjs (JS) | vs bcrypt | vs bcryptjs |
| :--- | ---: | ---: | ---: | ---: | ---: |
| hash, cost 4 (low) | 1 108.03 Hz | 1 096.41 Hz | 866.91 Hz | **1.011×** | **1.278×** |
| hash, cost 10 (industry default) | 19.91 Hz | 19.39 Hz | 14.44 Hz | **1.027×** | **1.378×** |
| verify, cost 10 | 19.91 Hz | 19.42 Hz | 14.45 Hz | **1.025×** | **1.377×** |

Range vs `bcrypt`-npm: **1.01× – 1.03×**. Range vs `bcryptjs`:
**1.28× – 1.38×**. The 2026-04-19 review measured 1.10–1.42× vs
`bcrypt`-npm; today's numbers compress that range further. The
direction of travel is *toward* parity, not away from it — bench
methodology improvements seem to have squeezed out earlier noise.

## Root cause

The package was structurally pinned from the start. All three
implementations call the same Solar Designer C code:

- `bcrypt` (npm): vendored `crypt_blowfish` C, compiled by `node-gyp`
- `bcryptjs`: hand-translated JS port of the same algorithm
- `@amigo-labs/bcrypt`: vendored `crypt_blowfish` C, compiled by the
  Rust `cc` crate

The cost=10 scenario takes ~50 ms per call. NAPI overhead is ~109 ns
(noop) — six orders of magnitude smaller than the work. There is no
FFI lever, no batching opportunity (bcrypt is intentionally serial as
a security property), no algorithm to swap (Solar Designer's reference
is canonical), no allocator to tune (all buffers are stack-sized
constants).

The only legitimate non-perf advantage is install reliability: the
prebuilt NAPI binaries skip `node-gyp` entirely. That is real —
`bcrypt`-npm's install graph regularly breaks on Alpine, on ARM, on
Windows without VS Build Tools — but it is a deployment win, not a
perf win, and the perf-review framework grades on perf.

## Lesson

Two transferable rules:

- **Algorithm-bound primitives where the canonical implementation is a
  C library cannot be ported usefully through NAPI.** The C port
  wraps the same C source as the C++ port, and any speed difference
  is noise. The 2× Green gate is structurally unreachable.
- **"Faster install" is not "faster runtime".** A perf-graded
  portfolio can't keep a package on the basis of `node-gyp`-avoidance.
  If install reliability is the value proposition, that needs its own
  packaging (e.g. `bcrypt-prebuilt`-style) and its own review
  framework — not the perf-review one.

The right move for users who want native bcrypt and reliable installs
is to use `bcrypt`-npm and accept its install footprint, or to
migrate to `@amigo-labs/argon2` (still Yellow at 1.36× per
`docs/perf-review.md`, but argon2 has *intrinsic* memory-hardness
advantages over bcrypt and is the modern recommendation for new
password-hashing code).
