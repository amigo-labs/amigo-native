# @amigo-labs/argon2

[![npm version](https://img.shields.io/npm/v/@amigo-labs/argon2)](https://www.npmjs.com/package/@amigo-labs/argon2)
[![npm downloads](https://img.shields.io/npm/dm/@amigo-labs/argon2)](https://www.npmjs.com/package/@amigo-labs/argon2)
[![license](https://img.shields.io/npm/l/@amigo-labs/argon2)](https://github.com/amigo-labs/amigo-native/blob/main/LICENSE)

Fast Argon2id password hashing powered by Rust via [NAPI-RS](https://napi.rs). A native Node.js binding to the [argon2](https://crates.io/crates/argon2) crate.

## Installation

```bash
npm install @amigo-labs/argon2
```

## Usage

```ts
import { hash, verify } from "@amigo-labs/argon2";

// Hash a password (async)
const hashed = await hash("my-password");

// Verify a password (async)
const valid = await verify(hashed, "my-password"); // true

// With custom options
const hashed2 = await hash("my-password", {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
});
```

Synchronous variants `hashSync` and `verifySync` are also available.

## API

### `hash(password, options?): Promise<string>`

Hashes a password using Argon2id and returns a PHC-formatted string.

### `hashSync(password, options?): string`

Synchronous version of `hash`.

### `verify(hash, password): Promise<boolean>`

Verifies a password against an Argon2id hash.

### `verifySync(hash, password): boolean`

Synchronous version of `verify`.

### Options

| Option | Type | Description |
| --- | --- | --- |
| `memoryCost` | `number` | Memory size in KiB (default: 19456) |
| `timeCost` | `number` | Number of iterations (default: 2) |
| `parallelism` | `number` | Degree of parallelism (default: 1) |
| `outputLen` | `number` | Length of the hash output in bytes |

## Supported Platforms

| Platform | Architecture |
| --- | --- |
| Linux | x64 (glibc), x64 (musl), arm64 |
| macOS | x64, arm64 |
| Windows | x64 |

## License

MIT
