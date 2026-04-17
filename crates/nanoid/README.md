# @amigo-labs/nanoid

> Crypto-safe URL-friendly ID generator via the `nanoid` Rust crate. Drop-in for [`nanoid`](https://www.npmjs.com/package/nanoid), compiled via NAPI-RS.

## Install

```bash
npm install @amigo-labs/nanoid
```

## Usage

```ts
import { nanoid, customAlphabet } from '@amigo-labs/nanoid'

nanoid()              // 'V1StGXR8_Z5jdHi6B-myT' (21 chars, URL-safe)
nanoid(10)            // 10-char ID

const hexId = customAlphabet('0123456789abcdef', 16)
hexId()               // '1a3f...' (16 hex chars)
```

Default size is 21 characters from the URL-safe alphabet `A-Za-z0-9_-`, matching `nanoid@5`. `customAlphabet` returns a factory for fixed-alphabet IDs.

## Parity

Tests in [`__conformance__/`](./__conformance__) run the upstream `nanoid` test suite against this implementation. See [`divergences.md`](./__conformance__/divergences.md) for documented differences.
