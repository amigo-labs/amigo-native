# @amigo-labs/zip

> ZIP archive read/write via the `zip` Rust crate. Alternative to [`yauzl`](https://www.npmjs.com/package/yauzl), [`adm-zip`](https://www.npmjs.com/package/adm-zip), and [`jszip`](https://www.npmjs.com/package/jszip), compiled via NAPI-RS.

## Install

```bash
npm install @amigo-labs/zip
```

## Usage

```ts
import { ZipReader, ZipWriter } from '@amigo-labs/zip'

// Read
const reader = ZipReader.fromPath('./archive.zip')
for (const entry of reader.entries()) {
  if (!entry.isDir) {
    const bytes = reader.read(entry.name)
    console.log(entry.name, entry.size, bytes.length)
  }
}

// Write
const writer = new ZipWriter()
writer.add('hello.txt', Buffer.from('hello world'), { compression: 'deflate', level: 9 })
writer.add('data.bin', someBuffer, { compression: 'stored' })
const archive = writer.finalize()   // Buffer
```

Compression methods: `deflate` (default) and `stored`. Deflate level is `0`–`9` (default `6`).

## Install for the browser

The same `import` works in Angular, React, Vite, esbuild, and webpack ≥ 5 — the bundler picks the WASM build via the `browser` conditional export:

```ts
import { ZipReader, ZipWriter } from '@amigo-labs/zip'
```

The filesystem-source variant (`ZipReader.fromPath`) is napi-only — the browser build ships only `new ZipReader(uint8Array)` (i.e. the buffer-source variant). DEFLATE via flate2 (pure-Rust zlib-rs backend) is wasm32-portable.

## Parity

Tests in [`__conformance__/`](./__conformance__) run a representative subset of the upstream `yauzl`/`adm-zip` test suites against this implementation. See [`divergences.md`](./__conformance__/divergences.md) for documented differences.
