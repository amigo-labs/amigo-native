# @amigo-labs/encoding

> Character encoding conversion powered by Mozilla's `encoding_rs`. Alternative to [`iconv-lite`](https://www.npmjs.com/package/iconv-lite), compiled via NAPI-RS.

## Install

```bash
npm install @amigo-labs/encoding
```

## Usage

```ts
import { encode, decode, encodingExists } from '@amigo-labs/encoding'

const bytes = encode('héllo', 'latin1')
const text = decode(bytes, 'latin1')       // 'héllo'

encodingExists('shift_jis')                // true
encodingExists('utf-42')                   // false
```

Supports the full WHATWG encoding set (UTF-8, Latin-1, Shift_JIS, GB18030, Big5, etc.).

## Install for the browser

The same `import` works in Angular, React, Vite, esbuild, and webpack ≥ 5 — the bundler picks the WASM build via the `browser` conditional export:

```ts
import { encode, decode } from '@amigo-labs/encoding'
```

`encoding_rs` is ~100 KB gzipped — well under the 500 KB browser budget. All iconv-lite-compat aliases (`latin0`, `cp932`, `utf16le`, etc.) and the strict latin1/windows-1252 semantics are preserved.

## Parity

Tests in [`__conformance__/`](./__conformance__) run a representative subset of the upstream `iconv-lite` test suite against this implementation. See [`divergences.md`](./__conformance__/divergences.md) for documented differences — notably encodings `iconv-lite` supports that `encoding_rs` doesn't.
