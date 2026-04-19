# Post-Mortem: `@amigo-labs/xml`

**Status:** archived 2026-04-19 (never published to npm), recommending
`sax` (JS) for streaming and `fast-xml-parser` for tree-building.

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
- **`parseXmlToJson` (single-call "serialise-to-JSON-string" return
  mode)**: added in commit `d1e2e46` but unexported and unbenchmarked
  until the 2026-04-19 re-review. Measured result (Node 22, Linux x64,
  release build):

  | Scenario | `parseXml` | **`parseXmlToJson`** | `sax` | best amigo vs. sax |
  |---|---:|---:|---:|---:|
  | 1 KB SVG | 143 885 Hz | **279 093 Hz** | 179 724 Hz | **1,55× win** |
  | 100 KB RSS | 146 Hz | **354 Hz** | 455 Hz | 0,78× lose |
  | 10 MB SOAP | 0,46 Hz | **1,42 Hz** | 1,98 Hz | 0,72× lose |

  Big improvement over `parseXml` (1,9–3,1×) and wins the 1 KB bucket
  against `sax`, but still loses the 100 KB median and the 10 MB tail.
  Root cause at 10 MB: cost shifts from FFI to JS-side `JSON.parse` of
  the ~15 MB JSON output — a structural limit no further Rust-side
  lever can bypass for a tree-returning parser.

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

## Archival (2026-04-19)

Never published to npm, so no deprecation window or `npm deprecate`
flag is needed. Crate moved from `crates/xml/` to `archived/xml/`,
removed from the Cargo/pnpm workspace globs, and struck from
`docs/packages.json` / `docs/data.json` / `scripts/measure-size.mjs`.
Code preserved under `archived/xml/` as a reference implementation.

Recommended alternatives:
- `sax` — event-based streaming, the package we were trying to beat.
- `fast-xml-parser` — DOM tree building, often faster than sax on
  large documents.
- `@xmldom/xmldom` if a full W3C DOM API is needed.
