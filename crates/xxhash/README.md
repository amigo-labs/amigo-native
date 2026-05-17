# @amigo-labs/xxhash

[![npm version](https://img.shields.io/npm/v/@amigo-labs/xxhash)](https://www.npmjs.com/package/@amigo-labs/xxhash)
[![npm downloads](https://img.shields.io/npm/dm/@amigo-labs/xxhash)](https://www.npmjs.com/package/@amigo-labs/xxhash)
[![license](https://img.shields.io/npm/l/@amigo-labs/xxhash)](https://github.com/amigo-labs/amigo-native/blob/main/LICENSE)

Blazing fast non-cryptographic hashing (XXHash) powered by Rust via [NAPI-RS](https://napi.rs). A native Node.js binding to the [xxhash-rust](https://crates.io/crates/xxhash-rust) crate.

## Installation

```bash
npm install @amigo-labs/xxhash
```

## Usage

```ts
import { xxh3_64, xxh64, xxh32, Xxh3Hasher } from "@amigo-labs/xxhash";

const buf = Buffer.from("hello world");

// XXH3 (fastest, recommended)
xxh3_64(buf); // bigint

// Classic variants
xxh64(buf);   // bigint
xxh32(buf);   // number

// 128-bit hash (returned as hex string)
import { xxh3_128 } from "@amigo-labs/xxhash";
xxh3_128(buf); // "a5dfc8621c..." (hex)

// Streaming hasher
const hasher = new Xxh3Hasher();
hasher.update(Buffer.from("hello "));
hasher.update(Buffer.from("world"));
hasher.digest();    // bigint
hasher.digestHex(); // hex string

// Batch hashing: one FFI call, flat Buffer in, flat Buffer out
import { xxh3_64Many } from "@amigo-labs/xxhash";
// 1000 fixed-size 64-byte chunks concatenated in a single Buffer:
const input = Buffer.concat(chunks); // 1000 × 64 B = 64 000 B
const out = xxh3_64Many(input, 64);  // Buffer of 1000 × 8 B = 8 000 B
// out contains 1000 little-endian u64 hashes back-to-back
const firstHash = out.readBigUInt64LE(0);
```

## API

### One-shot functions

| Function | Returns | Description |
| --- | --- | --- |
| `xxh3_64(input, seed?: bigint)` | `bigint` | XXH3 64-bit hash |
| `xxh3_128(input, seed?: bigint)` | `string` | XXH3 128-bit hash (hex) |
| `xxh64(input, seed?: bigint)` | `bigint` | Classic XXH64 hash |
| `xxh32(input, seed?: number)` | `number` | Classic XXH32 hash |

### Batch functions (flat `Buffer` in, flat `Buffer` out)

Single FFI call over the whole input, avoiding per-item array marshalling. The input is a single `Buffer` containing `N × chunkSize` bytes; the output is a flat `Buffer` of `N` hashes back-to-back (`u64` as 8 bytes LE for xxh3/xxh64, `u32` as 4 bytes LE for xxh32).

| Function | Returns | Description |
| --- | --- | --- |
| `xxh3_64Many(input, chunkSize, seed?: bigint)` | `Buffer` | XXH3 64-bit hashes for `input.length / chunkSize` fixed-size chunks |
| `xxh64Many(input, chunkSize, seed?: bigint)` | `Buffer` | XXH64 hashes for fixed-size chunks |
| `xxh32Many(input, chunkSize, seed?: number)` | `Buffer` | XXH32 hashes for fixed-size chunks |

### `Xxh3Hasher` / `Xxh64Hasher` (64-bit streaming)

| Method | Description |
| --- | --- |
| `new Xxh3Hasher(seed?: bigint)` / `new Xxh64Hasher(seed?: bigint)` | Create a streaming hasher |
| `update(chunk: Buffer)` | Feed data into the hasher |
| `digest(): bigint` | Finalize and return hash as `bigint` |
| `digestHex(): string` | Finalize and return hash as hex `string` |
| `reset(seed?)` | Reset hasher for reuse (`Xxh3Hasher.reset()` takes no seed) |

### `Xxh32Hasher` (32-bit streaming)

| Method | Description |
| --- | --- |
| `new Xxh32Hasher(seed?: number)` | Create a streaming hasher |
| `update(chunk: Buffer)` | Feed data into the hasher |
| `digest(): number` | Finalize and return hash as `number` |
| `reset(seed?: number)` | Reset hasher for reuse |

## Install for the browser

The same `import` works in Angular, React, Vite, esbuild, and webpack ≥ 5 — the bundler picks the WASM build via the `browser` conditional export:

```ts
import { xxh3_64, Xxh3Hasher } from '@amigo-labs/xxhash'
```

Both one-shot functions and the stateful hashers ship to the browser. 64-bit hashes come back as JS `BigInt` directly. WASM is roughly 1.5–2× faster than `xxhash-wasm` / `xxhashjs` on typical inputs; SIMD (`+simd128`) is deferred per the expansion-2026 spec open question Q1.

## Supported Platforms

| Platform | Architecture |
| --- | --- |
| Linux | x64 (glibc), x64 (musl), arm64 |
| macOS | x64, arm64 |
| Windows | x64 |

## License

MIT
