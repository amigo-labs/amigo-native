# Post-Mortem: `@amigo-labs/xml`

**Status:** deprecated in 0.2.0, recommending `sax` (JS) for streaming
and `fast-xml-parser` for tree-building.

## Expected gain

XML parsing over `quick-xml` (Rust's fastest streaming parser) should
outperform `sax` (pure JS) on large documents — `quick-xml` claims
multi-GB/s throughput; `sax` is a state machine running through V8's
regex engine.

## Measured gain

| Scenario | `@amigo-labs/xml` | `sax` | Ratio |
|---|---:|---:|---:|
| small SVG (1 KB) | 119,130 ops/s (parseXml), 116,883 (sax API) | 173,946 ops/s | **0.68×** |
| RSS feed (100 KB) | 139 ops/s | 320 ops/s | **0.44×** |
| SOAP response (10 MB) | not benchmarked | 2 ops/s | — |

Loses on every size class. The 100 KB scenario is the typical
real-world XML document (RSS feed, config file, API response) — we're
less than half as fast there.

## Root cause

Two packages, two different modes, same underlying problem:

**`parseXml` (tree-building) mode:** allocates a JS object tree from
Rust. Every element becomes a JS object with `.name`, `.attrs`,
`.children` properties created via `napi::JsObject::create`. For the
100 KB RSS feed with thousands of elements, each element costs several
hundred nanoseconds of FFI-boundary work. We effectively spend all our
time constructing JS values, not parsing XML.

**SAX API mode:** the user provides a callback that fires on
`onStartElement`, `onText`, etc. Each callback is an FFI round-trip
*from Rust back into JS* per event. For a 100 KB document with ~10k
events that's ~10k FFI crossings — more than the `sax` library's
entire JS execution.

`sax` works inside V8 the whole time: it walks a Uint8Array / string,
emits events via JIT'd function calls, no boundary crossings. Its
state machine is simple enough that V8 inlines it. The SAX event
dispatch is free.

## What was tried

- Tree API vs SAX API: both paid FFI costs, just at different granularities.
- We did not try a single-call "serialise-to-JSON-string" return mode
  (the csv `parseToJson` pattern), which would collapse all the FFI
  crossings into one. That might work for tree-building, but would
  duplicate effort for users who then `JSON.parse` the result — V8's
  native JSON parser is fast but not free.

Not pursued further because the SAX use case (streaming, event-driven)
fundamentally can't work with a "one FFI call returns everything"
pattern. And the tree-building use case has better JS alternatives
already (`fast-xml-parser` routinely beats `sax` on throughput).

## What we learned

- NAPI callbacks-from-Rust-into-JS are the single most expensive
  pattern in the whole FFI toolkit. Any streaming parser that wants
  to emit events to user code has to cross the boundary N times.
- Tree-building parsers paying per-node FFI cost lose against pure-JS
  parsers that build objects within V8's heap directly.
- For XML specifically, the SAX-style streaming pattern is
  fundamentally a JS pattern — the event-driven API *is* the
  performance advantage. Rust can't help because it can't stay on the
  JS side.

## Deprecation plan

- 0.2.0: `deprecated` field in package.json; README warning.
- Three month window.
- After: archived/.

Recommended alternatives:
- `sax` — event-based streaming, the package we were trying to beat.
- `fast-xml-parser` — DOM tree building, often faster than sax on
  large documents.
- `@xmldom/xmldom` if a full W3C DOM API is needed.
