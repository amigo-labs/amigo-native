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

## Install for the browser

The same `import` works in Angular, React, Vite, esbuild, and webpack ≥ 5 — the bundler picks the WASM build via the `browser` conditional export:

```ts
import { fileTypeFromBufferSync } from '@amigo-labs/file-type'
```

The async `fileTypeFromBuffer` variant is napi-only (no thread pool in WASM); the sync entry is what ships to the browser.

## Parity

Tests in [`__conformance__/`](./__conformance__) run a representative subset of the upstream `file-type` test suite against this implementation.
