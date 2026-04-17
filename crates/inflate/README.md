# @amigo-labs/inflate

> zlib deflate/inflate/gzip via `flate2` (backed by zlib-rs). Drop-in for [`pako`](https://www.npmjs.com/package/pako), compiled via NAPI-RS.

## Install

```bash
npm install @amigo-labs/inflate
```

## Usage

```ts
import { deflate, inflate, gzip, ungzip, deflateRaw, inflateRaw } from '@amigo-labs/inflate'

const compressed = deflate(Buffer.from('hello world'))
const original = inflate(compressed)        // Buffer 'hello world'

// Gzip with custom level
const gz = gzip(Buffer.from(largeText), { level: 9 })
const text = ungzip(gz).toString('utf-8')

// Raw deflate (no zlib header)
const raw = deflateRaw(data)
const out = inflateRaw(raw)
```

Compression level is `0`–`9` (default `6`), matching pako.

## Parity

Tests in [`__conformance__/`](./__conformance__) run the upstream `pako` test suite against this implementation. See [`divergences.md`](./__conformance__/divergences.md) for documented differences.
