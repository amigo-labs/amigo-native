# Migration — `yauzl` / `adm-zip` / `jszip` → `@amigo-labs/zip`

**Not a drop-in replacement.** `@amigo-labs/zip` exposes its own minimal API —
two classes, `ZipReader` and `ZipWriter` — because yauzl, adm-zip and jszip
have mutually incompatible shapes. Archives are **byte-interoperable** with all
three (verified in `__parity__/`).

## API at a glance

```js
const { ZipReader, ZipWriter } = require('@amigo-labs/zip')

// --- read ---
const reader = ZipReader.fromBuffer(buf)       // or ZipReader.fromPath('./a.zip')
const entries = reader.entries()               // [{ name, size, compressedSize, isDir, compression }]
const data = reader.read('path/in/zip.txt')    // Buffer

// --- write ---
const writer = new ZipWriter()
writer.add('a.txt', Buffer.from('hello'))
writer.add('b.bin', payload, { compression: 'stored' })
const buf = writer.finalize()
```

## Migrating from yauzl

```js
// Before
yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zipfile) => {
  zipfile.on('entry', entry => {
    zipfile.openReadStream(entry, (err, stream) => { /* ... */ })
  })
  zipfile.readEntry()
})

// After
const r = ZipReader.fromBuffer(buf)
for (const e of r.entries()) {
  const data = r.read(e.name)
}
```

## Migrating from adm-zip

```js
// Before
const adm = new AdmZip(buf)
for (const e of adm.getEntries()) e.getData()

// After
const r = ZipReader.fromBuffer(buf)
for (const e of r.entries()) r.read(e.name)
```

```js
// Before — create
const adm = new AdmZip()
adm.addFile('a.txt', Buffer.from('hi'))
const out = adm.toBuffer()

// After — create
const w = new ZipWriter()
w.add('a.txt', Buffer.from('hi'))
const out = w.finalize()
```

## Migrating from jszip

`jszip` returns promises from every operation because it was designed for the
browser. `@amigo-labs/zip` is synchronous because we can be — the Rust side is
fast. If you need to keep the `.then(…)` API, wrap with `Promise.resolve(…)`.

## Unsupported in v1

- **Encrypted ZIP** (password-protected entries): v2 milestone.
- **Streaming I/O** (Node `Readable` / `Writable`): buffer-in / buffer-out only.
  Use `ZipReader.fromPath` for large archives to avoid loading the whole file.
- **Per-entry extra fields / comments**: minimal metadata set only.
