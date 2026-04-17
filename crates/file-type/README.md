# @amigo-labs/file-type

> Magic-byte file-type detection powered by the Rust `infer` crate. Alternative to [`file-type`](https://www.npmjs.com/package/file-type), compiled via NAPI-RS.

## Install

```bash
npm install @amigo-labs/file-type
```

## Usage

```ts
import { fileTypeFromBuffer, fileTypeFromBufferSync } from '@amigo-labs/file-type'

const result = await fileTypeFromBuffer(buffer)
if (result) {
  console.log(result.ext, result.mime)    // 'png', 'image/png'
}

const sync = fileTypeFromBufferSync(buffer)
```

Returns `null` when the magic signature isn't recognised. `infer` covers ~70 formats (images, audio/video, archives, fonts, documents) — see [`divergences.md`](./__conformance__/divergences.md) for the coverage gap vs `file-type`.

## Parity

Tests in [`__conformance__/`](./__conformance__) run a representative subset of the upstream `file-type` test suite against this implementation.
