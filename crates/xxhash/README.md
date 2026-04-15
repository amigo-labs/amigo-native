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
xxh3_64(buf); // number

// Classic variants
xxh64(buf);  // number
xxh32(buf);  // number

// 128-bit hash (returned as hex string)
import { xxh3_128 } from "@amigo-labs/xxhash";
xxh3_128(buf); // "a]\\xc8b\\x1c..."

// Streaming hasher
const hasher = new Xxh3Hasher();
hasher.update(Buffer.from("hello "));
hasher.update(Buffer.from("world"));
hasher.digest();    // number
hasher.digestHex(); // hex string

// Batch hashing (single FFI call for many inputs)
import { xxh3_64Batch } from "@amigo-labs/xxhash";
const hashes = xxh3_64Batch([buf1, buf2, buf3]);
```

## API

### One-shot functions

| Function | Returns | Description |
| --- | --- | --- |
| `xxh3_64(input, seed?)` | `number` | XXH3 64-bit hash |
| `xxh3_128(input, seed?)` | `string` | XXH3 128-bit hash (hex) |
| `xxh64(input, seed?)` | `number` | Classic XXH64 hash |
| `xxh32(input, seed?)` | `number` | Classic XXH32 hash |

### Batch functions

| Function | Returns | Description |
| --- | --- | --- |
| `xxh3_64Batch(inputs, seed?)` | `number[]` | XXH3 64-bit hashes for many inputs |
| `xxh64Batch(inputs, seed?)` | `number[]` | XXH64 hashes for many inputs |
| `xxh32Batch(inputs, seed?)` | `number[]` | XXH32 hashes for many inputs |

### `Xxh3Hasher` (streaming)

| Method | Description |
| --- | --- |
| `new Xxh3Hasher(seed?)` | Create a streaming hasher |
| `update(chunk)` | Feed data into the hasher |
| `digest()` | Finalize and return hash as `number` |
| `digestHex()` | Finalize and return hash as hex `string` |
| `reset()` | Reset hasher for reuse |

## Supported Platforms

| Platform | Architecture |
| --- | --- |
| Linux | x64 (glibc), x64 (musl), arm64 |
| macOS | x64, arm64 |
| Windows | x64 |

## License

MIT
