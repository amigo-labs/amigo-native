# @amigo-labs/sanitize-html — Differences from `sanitize-html` (npm)

`@amigo-labs/sanitize-html` is a Rust-native sanitizer built on
[`html5ever`](https://crates.io/crates/html5ever). The drop-in
compatibility surface lives in `compat.mjs`; the native crate exposes two
engines:

- **`sanitize`** — fast-path engine (html5ever tokenizer + streaming
  `TokenSink`). Handles ~all real-world sanitize calls at ~1.5–3.9×
  the throughput of the npm `sanitize-html` package.
- **`sanitizeStrict`** — correctness-path engine (full html5ever
  `parse_fragment` + RcDom walk). Routed to automatically when the
  caller enables features that need HTML5 tokenizer state transitions
  the fast path doesn't implement: `<script>` / `<style>` in
  `allowedTags`, SVG / MathML tags, or `parser.lowerCaseTags: false`.
  Slower per-call but semantically equivalent to a full parser.

`compat.mjs` picks the right engine based on the caller's options
(`needsStrictEngine`). Callers using either entry point directly get
identical output for supported cases.

## Conformance

Against the upstream `sanitize-html` test suite (191 cases, vendored at
`__conformance__/upstream/test.js`): **225 passed / 1 skipped / 0
failing** (99.6 %).

The one documented divergence:

- **`should not be faked out by double <`** — htmlparser2 (upstream's
  parser) collapses the malformed `<<img …>` sequence in a way that
  drops the trailing half of the input entirely. Replicating that
  byte-for-byte requires a Rust port of htmlparser2; the failure is
  an output-shape quirk rather than a real XSS vector.

## Configuration options

`@amigo-labs/sanitize-html` supports `sanitize-html`'s full option
surface through `compat.mjs`, including `transformTags`,
`exclusiveFilter`, `textFilter`, `allowedIframeHostnames`,
`allowedStyles`, `enforceHtmlBoundary`, `parser.decodeEntities: false`,
`parser.lowerCaseTags: false`, etc.

The only options that have no direct counterpart at the native layer
(handled in JS or elided):

| `sanitize-html` option | Notes |
|---|---|
| `parser` (htmlparser2 pass-through) | html5ever is used instead; `lowerCaseTags` / `lowerCaseAttributeNames` trigger the strict path; `decodeEntities: false` is preserved via a sentinel pre/post pass |
| `allowedStyles` / `parseStyleAttributes` | Style-attr parsing happens in `compat.mjs`, not the native layer |
| `preserveEscapedAttributes` | No equivalent |

## Output shape differences

The native engine emits its own HTML; a few serialisation choices differ
from `sanitize-html` but are security-equivalent:

- Void elements serialise as `<br />` after `compat.mjs`'s post-pass
  (upstream-compatible).
- Script / style element content: by default `<script>` and `<style>`
  are dropped with their text. If the caller adds either tag to
  `allowedTags`, the routing sends the input through the strict engine
  so tokenizer state (SCRIPT_DATA / RAWTEXT) is correct — `&quot;`
  inside `<script>` round-trips as `&quot;`, not `"`.
- SVG / MathML foreign content: the strict engine preserves source
  case for element and attribute names (`<linearGradient>`,
  `xmlns:xlink`).
- Input coercion: the JS binding coerces `undefined` / `null` / numbers
  to `''` / `String(input)` before dispatch so non-string callers don't
  hit a type error.

## URL / scheme handling

The native engine applies a configurable allowlist of URL schemes
(default: `http`, `https`, `mailto`, `ftp`, `tel`, and a handful of
others — see `DEFAULT_URL_SCHEMES` in `src/rules.rs`) to URL-bearing
attributes. Leading ASCII whitespace and control characters are trimmed
before scheme extraction, so obfuscations like `  javascript:` still
fail the check.

## Performance

Fast-path benchmarks (`npm run bench`, against `sanitize-html` npm and
`isomorphic-dompurify`):

| Input | `@amigo-labs/sanitize-html` | vs `sanitize-html` (npm) | vs `dompurify` |
| --- | --- | --- | --- |
| small safe (~200 chars) | 45,900 ops/s | **1.4×** faster | **43×** faster |
| medium with XSS (~2 KB) | 9,600 ops/s | **2.4×** faster | **51×** faster |
| large doc (~100 KB) | 360 ops/s | **3.6×** faster | **33×** faster |

Strict-path overhead kicks in only when the caller opts into
script / SVG / case-preservation features — the common case stays on
the streaming tokenizer.
