# FFI Overhead Baseline

> What does an `@amigo-labs/*` call cost before any actual work
> happens? These numbers are the reference point for every other
> perf discussion in this repo. A package that does less real work
> per call than this table shows cannot structurally beat the JS
> alternative — no matter how fast the Rust code itself is.

## Measurement Setup

- Crate: `crates/_ffi-bench/` (not published, `publish = false`)
- Harness: `vitest bench` (`npm run bench` inside the crate)
- Release profile: `lto = true, codegen-units = 1, strip = "symbols", panic = "abort"`
- Node: v22.22.2 on linux/x64 (glibc)

All five primitives perform **no** actual work per call — they only
measure the fixed costs produced by the N-API boundary.

## Measurements

| Primitive | Ops/s | Per-Call | Interpretation |
|---|---:|---:|---|
| `noop()` | 9.15 M | **109 ns** | The **hard floor**. Every NAPI call pays this, period. |
| `echoString(s) → String`, 10 B | 4.28 M | ~234 ns | +125 ns: two tiny UTF-16/UTF-8 conversions. |
| `echoString` 1 KB | 1.28 M | ~780 ns | +670 ns ≈ 0.6 ns/byte of extra cost. |
| `echoString` 100 KB | 28.8 k | ~34.7 µs | ~0.35 ns/byte, scales essentially linearly. |
| `echoBuffer(b) → Buffer`, 1 KB | 5.56 M | ~180 ns | Only +70 ns on top of noop. |
| `echoBuffer` 100 KB | 5.75 M | ~174 ns | **Flat**. |
| `echoBuffer` 10 MB | 5.58 M | ~179 ns | **Flat even at 10 MB** — a Buffer is a V8 handle, not a memcpy. |
| `sumArray(xs: Vec<u32>)`, 10 elements | 1.44 M | ~694 ns | ~58 ns per u32 on top of the fixed costs. |
| `sumArray` 1000 elements | 23.0 k | ~43.4 µs | **~43 ns per u32** for array marshalling. |
| `sumArray` 100,000 elements | 233 | ~4.29 ms | ~43 ns per u32 — scales linearly. |

## What This Means

### 1. The Floor is 109 ns

For every package in the repo: **a Rust function that gets called
and returns a result costs at least 109 ns**. If the JS alternative
needs < 109 ns for the same input — for example because it only
operates on a precomputed buffer — Rust has no chance. With
`nanoid` that was exactly the finding: nanoid@5 takes ~260 ns per
call; a Rust binding cost ~1500 ns (see Phase B below for the
measurement). That's why `nanoid` was switched to pure JS.

### 2. Strings Cost About 35 µs per 100 KB

Every `fn foo(s: String) -> String` pays the UTF-16 ↔ UTF-8
conversion at both ends of the FFI. For large texts that eats up
enough time that any algorithm doing less than ~0.5 ns/byte of real
compute is overtaken by the conversion itself. Observation:
`encoding`'s UTF-8-encode-10MB was 2.1× slower than `iconv-lite`
before the fix, because we were sending 10 MB through the FFI
converter twice (input + output) with an extra `.into_owned()` on
top.

**Rule of thumb:** If the Rust code does less than ~1 ns per byte of
real compute, either
- replace the string input with a `Buffer` input (zero-copy, the
  caller owns the bytes), or
- rewrite the package in pure JS (like `nanoid`), or
- don't port it in the first place.

### 3. Buffers Are Essentially Flat — That's the Fast Lane

`echoBuffer` is **flat at ~180 ns from 1 KB to 10 MB**. That's the
decisive difference: N-API buffers are V8 handles that only pass a
reference back and forth when crossing — no copy. **10 MB costs
exactly as much as 1 KB**: 180 ns.

Consequence for every new package: **bytes-in-bytes-out is always
the cheapest path.** If the output of an algorithm is a binary blob
(hash, compressed data, image pixels, UTF-8 bytes), return it as a
`Buffer`, never as a `String` or `Vec<u8>`.

### 4. `Vec<T>` Arrays Are Expensive — 43 ns per Element

`sumArray(Vec<u32>)` costs ~43 ns per element. An array of 1000
u32s eats 43 µs of pure marshalling — **the same data volume passed
in as a Buffer costs 180 ns**. Factor **240× more expensive**.

Consequence: if a package function processes a list of numbers or
bytes, it should accept a `Buffer` or `Uint8Array`, never `Vec<T>`
of primitives. For u16/u32/f64 use the corresponding `TypedArray`.

Example from the repo: `xxhash batch 1000 × 64 bytes` was 4.8 to
5.7× slower than xxhash-wasm. Hypothesis (to be verified): the
batch API returns hashes as `Vec<BigInt>`. That's 1000 BigInt
constructions + array marshalling = a large chunk of the runtime.
A returned `Buffer` (1000 × 8 bytes = 8 KB) would be ~180 ns flat.

### 5. What Do You Get "Back" for These Fixed Costs?

For a Rust port to pay off, the difference between **(Rust work +
FFI overhead)** and **(JS work)** has to become significant. Rule
of thumb:

- JS work < 1 µs per call → a Rust port only pays off with a batch
  API or if the Rust algorithm is dramatically (10×+) faster.
- JS work 1–10 µs → a 2× speedup is realistic if the Rust algorithm
  is measurably faster and the FFI has no Vec-marshalling trap.
- JS work > 10 µs → FFI overhead is under 10%, the full Rust win
  comes through.

These numbers depend on your hardware + Node version, but the
orders of magnitude stay stable. Update them when the toolchain
changes (Node major bump, V8 major bump, napi-rs major bump).

## Reproducing

```bash
cd /home/user/amigo-native
# Build the bench binary (only needed once per toolchain change)
cd crates/_ffi-bench && npx napi build --platform --release
# Run the benchmarks
npm run bench
```
