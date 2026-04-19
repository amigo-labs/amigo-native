# Inflate Backend Spike — zlib-rs vs zlib-ng vs libdeflate

> Measurement-first decision doc. No code changes in this PR; this
> captures the protocol for a follow-up sprint that would swap the
> inflate backend if — and only if — a C-based backend closes the
> documented gap to `node:zlib`.

## Motivation

`docs/data.json` (2026-04-19) shows `@amigo-labs/inflate` sitting at
**0,48× node:zlib at 100 KB** and **0,60× at 10 MB** on inflate
(decompress). Compression (deflate) is already 4–6× ahead, so the
FFI surface and output-marshalling aren't the bottleneck — the
decompression code path itself is.

Current backend: `flate2 = { features = ["zlib-rs"] }` (pure-Rust port
of zlib). Hypothesis: `zlib-rs` lacks the CRC32 SIMD fast paths
(pclmulqdq on x86, PMULL on aarch64) that system zlib and zlib-ng
have baked in.

## Candidates

| Backend | Flag | Language | SIMD | License | Build cost |
|---|---|---|---|---|---|
| **zlib-rs** (current) | `features = ["zlib-rs"]` | Rust | limited | Zlib | — |
| **zlib-ng** | `features = ["zlib-ng"]` | C | yes (AVX2, PMULL) | Zlib | vendored C compile |
| **system zlib** | `features = ["zlib"]` | C | yes (system-dependent) | Zlib | needs system libz |
| **libdeflate-sys** | direct FFI | C | yes | MIT | vendored C compile |

`system zlib` is ruled out immediately — it shifts our dependency
surface to something we can't control per-platform, and macOS/Windows
ship ancient zlib versions. Spike compares the remaining three.

## Protocol

### Setup (per candidate)

1. On a git branch, swap `crates/inflate/Cargo.toml` features or
   replace `flate2` with direct `libdeflate-sys` in
   `crates/inflate/src/lib.rs:45-91` (`decompress_bulk`).
2. `cd crates/inflate && npx napi build --platform --release`
3. Record binary size: `ls -la crates/inflate/inflate.*.node`.

### Measurement (per candidate)

1. `npx vitest bench crates/inflate/__bench__` with ≥ 3 consecutive
   runs on the same host to control variance. Record median `hz`.
2. The five data points that matter: deflate 100 KB text / random,
   deflate 10 MB text, inflate 100 KB text, inflate 10 MB text.
3. `__conformance__/parity.spec.ts` and `upstream.spec.ts` must pass
   — this is a non-negotiable gate, not a tunable.

### Cross-compile probe (per candidate)

For each of the six NAPI targets:

```
cargo build --release -p amigo-inflate --target aarch64-unknown-linux-gnu
cargo build --release -p amigo-inflate --target x86_64-unknown-linux-musl
cargo build --release -p amigo-inflate --target aarch64-apple-darwin
cargo build --release -p amigo-inflate --target x86_64-apple-darwin
cargo build --release -p amigo-inflate --target x86_64-pc-windows-msvc
cargo build --release -p amigo-inflate --target aarch64-pc-windows-msvc
```

A backend that fails on any target is disqualified unless we're willing
to carve out that target (we aren't, because the marquee claims "6
platforms").

## Results Matrix (fill after measurement)

| Backend | deflate 100KB hz | inflate 100KB hz | inflate 10MB hz | binary size | all 6 x-compile ok |
|---|---|---|---|---|---|
| zlib-rs (baseline) | 15 907 | 6 271 | 75,36 | 519 425 B | ✓ (currently shipping) |
| zlib-ng | tbd | tbd | tbd | tbd | tbd |
| libdeflate-sys | tbd | tbd | tbd | tbd | tbd |

Reference (out of our control):
- `node:zlib` inflate 100KB: 12 948 hz (target: get ≥ 0,9×)
- `node:zlib` inflate 10MB: 124,58 hz (target: get ≥ 0,9×)

## Decision Rule

**Ship the backend swap iff all four are true:**

1. inflate 100KB hz ≥ 0,9× node:zlib hz (≈ 11 650 hz).
2. inflate 10MB hz ≥ 0,9× node:zlib hz (≈ 112 hz).
3. All six NAPI cross-compile targets succeed.
4. Binary size grows ≤ 1,5× current (519 KB → ≤ 779 KB).

Otherwise: stay on `zlib-rs`, accept inflate stays Yellow, and revisit
when `zlib-rs` ships CRC32 SIMD upstream (tracked:
<https://github.com/trifectatechfoundation/zlib-rs/issues>).

## Post-Spike Actions

- **If spike passes**: new PR that swaps the backend + updates
  `docs/data.json` benchmarks + upgrades inflate from Yellow to
  Green in `docs/perf-review.md`.
- **If spike fails**: add a note here documenting which candidate(s)
  failed which rule, and re-check in Q3 2026 against newer upstream
  releases.

## What this spike is NOT

- Not a decision to ship C dependencies portfolio-wide. Only inflate
  has a measurable backend gap. Other crates (xxhash, encoding,
  slugify, argon2) either already win or are CPU-bound.
- Not a target-CPU tiering experiment. See plan Tier 2.4 for that
  separate investigation (`x86-64-v3` binary tier).
