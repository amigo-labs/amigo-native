> ⚠️ **DEPRECATED in 0.2.0.** `sax` (JS) outperforms us on every size (0.44-0.68× our speed). SAX-style parsing is fundamentally a JS pattern — event callbacks across the NAPI boundary are the expensive part. See [docs/post-mortems/xml.md](../../docs/post-mortems/xml.md). Please migrate to `sax` (streaming) or `fast-xml-parser` (tree).

# @amigo-labs/xml

> SAX-style XML parsing via `quick-xml`. Drop-in for [`sax`](https://www.npmjs.com/package/sax), compiled via NAPI-RS.

## Install

```bash
npm install @amigo-labs/xml
```

## Usage

```ts
import { parseXml } from '@amigo-labs/xml'

const events = parseXml('<root><item id="1">hi</item></root>')
// [
//   { kind: 'opentag', name: 'root', attrs: [] },
//   { kind: 'opentag', name: 'item', attrs: [{ name: 'id', value: '1' }] },
//   { kind: 'text', text: 'hi' },
//   { kind: 'closetag', name: 'item' },
//   { kind: 'closetag', name: 'root' },
// ]
```

Event kinds: `opentag`, `closetag`, `text`, `cdata`, `comment`, `processinginstruction`, `doctype`. Pass `strict: false` (default) to match `sax`'s tolerant mode; `strict: true` enforces well-formedness.

## Parity

Tests in [`__conformance__/`](./__conformance__) run the upstream `sax` test suite against this implementation. See [`divergences.md`](./__conformance__/divergences.md) for documented differences.
