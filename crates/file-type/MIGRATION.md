# Migration — `file-type` → `@amigo-labs/file-type`

`@amigo-labs/file-type` is backed by the Rust [`infer`](https://crates.io/crates/infer)
crate. `file-type` (npm) and `infer` recognise overlapping but not identical
sets of formats, so this is an **alternative** rather than a drop-in.

## Summary

Core formats (PNG, JPEG, GIF, WebP, PDF, ZIP, MP4, MP3, FLAC, Ogg, …) are detected
by both libraries and produce equivalent `mime` values. Long-tail formats supported
by `file-type` but not `infer` (and vice versa) are documented in
`__parity__/divergences.md` after running the parity suite.

## API mapping

| upstream                              | amigo                                      |
|:--------------------------------------|:-------------------------------------------|
| `fileTypeFromBuffer(buf)` → `Promise` | `fileTypeFromBuffer(buf)` → `Promise`      |
| *(not available)*                     | `fileTypeFromBufferSync(buf)` (faster)     |
| `fileTypeFromBlob(blob)`              | `fileTypeFromBuffer(new Uint8Array(await blob.arrayBuffer()))` |
| `fileTypeFromStream(stream)`          | Collect stream to buffer, then `fileTypeFromBuffer`. |

## Unsupported

- **`fileTypeFromBlob`**: replace with the idiom shown above.
- **`fileTypeFromStream`**: not exposed. True-streaming via NAPI is not cheaper
  than buffering the first few hundred bytes and calling `fileTypeFromBufferSync`.
- **`FileTypeParser` class with custom detectors**: not supported.
