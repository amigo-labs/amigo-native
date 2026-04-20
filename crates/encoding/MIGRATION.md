# Migration — `iconv-lite` → `@amigo-labs/encoding`

`@amigo-labs/encoding` implements iconv-lite's non-streaming API backed by
Firefox' [`encoding_rs`](https://crates.io/crates/encoding_rs) crate.

## Summary

- **Supported**: `encode`, `decode`, `encodingExists` for all major encodings
  (UTF-8, UTF-16 LE/BE, Latin-1, Windows-125x, Shift_JIS, GBK, Big5, EUC-KR,
  EUC-JP, and the full set of ISO-8859-*).
- **Legacy alias resolution**: common iconv-lite aliases (`cp932`, `cp1252`,
  `utf8`, `iso88591`, …) are mapped to WHATWG-standard labels internally.
- **Not supported (v1)**: streaming `Decoder`/`Encoder` classes.

## API mapping

| iconv-lite                          | amigo                           |
|:------------------------------------|:--------------------------------|
| `iconv.encode(str, enc)`            | `encode(str, enc)`              |
| `iconv.decode(buf, enc)`            | `decode(buf, enc)`              |
| `iconv.encodingExists(enc)`         | `encodingExists(enc)`           |
| `iconv.decodeStream(enc)` / stream  | *not supported* — use iconv-lite. |

## Known differences

- **Substitution characters** for un-mappable input may differ between
  `encoding_rs` (WHATWG spec) and `iconv-lite` (library-specific defaults). See
  `__conformance__/divergences.md` after running the conformance suite.
- **Legacy single-byte encodings** like `KOI8-R` are recognised by both but
  byte-encoding may differ in edge cases involving the Euro sign or NEL.
