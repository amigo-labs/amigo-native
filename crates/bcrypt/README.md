# @amigo-labs/bcrypt

[![npm version](https://img.shields.io/npm/v/@amigo-labs/bcrypt)](https://www.npmjs.com/package/@amigo-labs/bcrypt)
[![npm downloads](https://img.shields.io/npm/dm/@amigo-labs/bcrypt)](https://www.npmjs.com/package/@amigo-labs/bcrypt)
[![license](https://img.shields.io/npm/l/@amigo-labs/bcrypt)](https://github.com/amigo-labs/amigo-native/blob/main/LICENSE)

Fast bcrypt password hashing powered by Rust via [NAPI-RS](https://napi.rs). A native Node.js binding to the [bcrypt](https://crates.io/crates/bcrypt) crate.

## Installation

```bash
npm install @amigo-labs/bcrypt
```

## Usage

```ts
import { hash, verify } from "@amigo-labs/bcrypt";

// Hash a password (async)
const hashed = await hash("my-password");

// Verify a password (async)
const valid = await verify(hashed, "my-password"); // true

// With custom cost factor
const hashed2 = await hash("my-password", { cost: 14 });
```

Synchronous variants `hashSync` and `verifySync` are also available.

## API

### `hash(password, options?): Promise<string>`

Hashes a password using bcrypt and returns a Modular-Crypt-Format string (`$2b$...`).

### `hashSync(password, options?): string`

Synchronous version of `hash`.

### `verify(hash, password): Promise<boolean>`

Verifies a password against a bcrypt hash. Accepts `$2a$`, `$2b$`, and `$2y$` variants.

### `verifySync(hash, password): boolean`

Synchronous version of `verify`.

### Options

| Option | Type | Description |
| --- | --- | --- |
| `cost` | `number` | Work factor between 4 and 31 (default: 12) |

## Performance

Measured on linux-x64, Node v22.22.2:

| Scenario | @amigo-labs/bcrypt | bcrypt npm (C++) | bcryptjs (pure JS) |
| --- | ---: | ---: | ---: |
| hash cost 4 | **981 hz** | 689 hz | 629 hz |
| hash cost 10 | **17.6 hz** | 16.0 hz | 12.9 hz |
| verify cost 10 | **17.6 hz** | 16.2 hz | 13.0 hz |

Speedup vs `bcrypt` npm: **1.10–1.42×**. Speedup vs `bcryptjs`: **1.36–1.56×**.

This package wraps the same vendored [`crypt_blowfish`](https://github.com/openwall/crypt_blowfish) C source as `bcrypt` npm but compiles it with current toolchain flags (`-O3 -fomit-frame-pointer -funroll-loops`) and crosses the FFI boundary via [napi-rs](https://napi.rs) v3, which is meaningfully faster than the older NAN binding `bcrypt` npm uses. Same algorithm, same correctness — every output is bit-for-bit identical and verifiable across implementations (the conformance suite cross-verifies against both `bcrypt` and `bcryptjs`).

## Notes

- Per the bcrypt specification, only the first **72 bytes** of a password are used. Inputs longer than that are silently truncated. This matches the behavior of `bcrypt` and `bcryptjs` on npm.
- The default cost of 12 follows the modern recommendation (the legacy `bcrypt` npm package defaults to 10).

## Supported Platforms

| Platform | Architecture |
| --- | --- |
| Linux | x64 (glibc), x64 (musl), arm64 |
| macOS | x64, arm64 |
| Windows | x64 |

## License

MIT
