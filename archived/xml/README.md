# @amigo-labs/xml (archived)

> 🗄️ **ARCHIVED — never published to npm.** Folded up before a first
> release. `sax` (JS) beats every realistic-median use case, and a
> 2026-04-19 re-review confirmed that the remaining optimization lever —
> a single-call `parseXmlToJson` returning the event stream as a JSON
> string — wins the 1 KB bucket (1,55× sax) but still loses the 100 KB
> median (0,78× sax) and the 10 MB tail (0,72× sax). At 10 MB the
> bottleneck shifts from FFI to JS-side `JSON.parse` of the ~15 MB
> output — a structural limit no Rust lever can beat.
>
> - Post-mortem: [docs/post-mortems/xml.md](../../docs/post-mortems/xml.md)
> - Final measurement: [docs/perf-review/xml.md](../../docs/perf-review/xml.md)
> - Use `sax` (streaming) or `fast-xml-parser` (tree) instead.

---

SAX-style XML parsing via `quick-xml`, originally intended as a drop-in
for [`sax`](https://www.npmjs.com/package/sax), compiled via NAPI-RS.

Code preserved here as a reference implementation. Not built, not
tested in CI, not part of the pnpm/cargo workspace.

## Usage (historical)

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

Event kinds: `opentag`, `closetag`, `text`, `cdata`, `comment`,
`processinginstruction`, `doctype`.
