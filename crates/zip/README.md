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

## Parity

Tests in [`__conformance__/`](./__conformance__) run a representative subset of the upstream `yauzl`/`adm-zip` test suites against this implementation. See [`divergences.md`](./__conformance__/divergences.md) for documented differences.
