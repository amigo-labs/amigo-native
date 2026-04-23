# @amigo-labs/pdf-parse

> PDF text + metadata extraction via
> [`pdf-extract`](https://crates.io/crates/pdf-extract) and
> [`lopdf`](https://crates.io/crates/lopdf). No pdf.js, no browser
> render pipeline — just content-stream tokenisation.

## Install

```bash
pnpm add @amigo-labs/pdf-parse
```

## Usage

```js
import { parse, parseSync } from '@amigo-labs/pdf-parse'

// Drop-in shape for upstream pdf-parse:
const result = await parse(fs.readFileSync('doc.pdf'))
console.log(result.text)        // plaintext
console.log(result.numpages)    // 42
console.log(result.info.Title)  // 'My Whitepaper'
console.log(result.version)     // '1.7'

// Sync path for small PDFs (< ~500 KB):
const sync = parseSync(buf)
```

## Options

```ts
interface PdfParseOptions {
  max?: number         // process at most N pages
  password?: string    // RC4 / AES-128 standard security
}
```

## Result

```ts
interface PdfParseResult {
  text: string                          // extracted plaintext
  numpages: number                       // total page count
  info: Record<string, string>           // Title, Author, Creator, ...
  metadata?: string                      // XMP metadata (if any)
  version: string                        // PDF spec version (e.g. "1.7")
}
```

## Scope

- **Text extraction** — the 95% use-case of `pdf-parse`.
- **Document metadata** — `/Info` dict and XMP stream.
- **Page count + PDF version.**
- Encrypted PDFs via `password` option (RC4, AES-128).

## Scope cuts

- No `pagerender(pageData)` callback. Per-page JS callbacks would
  cost an FFI crossing each — see
  [`docs/perf-review/pdf-parse.md`](../../docs/perf-review/pdf-parse.md).
  Post-process `text.split('\x0c')` to iterate pages.
- No Public-Key-Security. `pdf-extract` only implements standard
  security handlers.
- No malformed-PDF recovery on the scale of pdf.js. Scanner-output
  or very old Adobe files may fail — fall back to upstream in a
  try/catch pipeline.

See [`__conformance__/divergences.md`](./__conformance__/divergences.md)
for detailed differences.

## License

MIT
