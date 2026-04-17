# Migration — `pako` → `@amigo-labs/inflate`

`@amigo-labs/inflate` implements pako's non-streaming API backed by the Rust
[`flate2`](https://crates.io/crates/flate2) crate with the `zlib-rs` backend.

## Summary

- **Supported**: `deflate`, `inflate`, `deflateRaw`, `inflateRaw`, `gzip`, `ungzip`
  (non-streaming). Output is byte-compatible with pako and Node's built-in `zlib`.
- **Not supported (v1)**: streaming `Inflate`/`Deflate` classes, dictionary support,
  strategy tuning beyond `level`.

## API mapping

| pako                          | amigo                                 |
|:------------------------------|:--------------------------------------|
| `pako.deflate(buf, {level})`  | `deflate(buf, {level})`               |
| `pako.inflate(buf)`           | `inflate(buf)`                        |
| `pako.deflateRaw(buf)`        | `deflateRaw(buf)`                     |
| `pako.inflateRaw(buf)`        | `inflateRaw(buf)`                     |
| `pako.gzip(buf)`              | `gzip(buf)`                           |
| `pako.ungzip(buf)`            | `ungzip(buf)`                         |
| `new pako.Inflate()` streaming| **not supported**, use `pako` or `node:zlib`. |

## Unsupported

- **Streaming classes** (`pako.Inflate`, `pako.Deflate`): stay on pako for now.
- **Dictionary** option: not exposed in v1.
- **`to`/`raw` output formats**: we always return `Buffer`. Use `.toString('utf-8')`
  if you need a string.
