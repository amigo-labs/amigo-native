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

## Parity

Tests in [`__conformance__/`](./__conformance__) run a representative subset of the upstream `iconv-lite` test suite against this implementation. See [`divergences.md`](./__conformance__/divergences.md) for documented differences — notably encodings `iconv-lite` supports that `encoding_rs` doesn't.
