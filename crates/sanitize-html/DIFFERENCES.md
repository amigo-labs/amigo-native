# @amigo-labs/sanitize-html — Differences from `sanitize-html` (npm)

`@amigo-labs/sanitize-html` is a Rust-native sanitizer built directly on top of [`html5ever`](https://crates.io/crates/html5ever)'s tokenizer. It shares a design goal with `sanitize-html` (npm) but the two use different parsers and different default policies, so byte-level parity is not a goal. Security-critical behavior is covered by the XSS vector suite (`__conformance__/parity.spec.ts`) and the fuzz invariants (`__conformance__/fuzz.spec.ts`).

The drop-in compatibility surface lives in `compat.mjs`; it translates the upstream API (transformTags, filters, iframe hostnames, etc.) into the native engine's allow-list-driven model.

## Unsupported configuration options

`@amigo-labs/sanitize-html`'s native entry point exposes: `allowedTags`, `allowedAttributes`, `allowedClasses`, `allowedSchemes`, `stripComments`, `linkRel`. The richer upstream options are reconstructed in `compat.mjs` where possible; the ones in the table below still have no direct equivalent at the native layer:

| `sanitize-html` option | Why it's out of scope |
|---|---|
| `parser` (htmlparser2 pass-through) | the native layer is html5ever only |
| `allowedStyles` / `parseStyleAttributes` | the native layer doesn't parse CSS |
| `decodeEntities` | the tokenizer always decodes character references in HTML content |
| `preserveEscapedAttributes` | no equivalent |
| `nestingLimit` | enforced in `compat.mjs`, not the native layer |

## Output shape differences

The native engine is stream-based: it walks the html5ever token stream and emits a filtered copy directly, without building a full DOM tree. That keeps it fast but produces output that differs from `sanitize-html` in a few narrow ways:

- Self-closing tag serialization (`<br />` vs `<br>`) — we emit HTML5-style void elements.
- Script / style element content: by default `<script>` and `<style>` (and their text content) are dropped entirely. If the caller explicitly adds either tag to `allowedTags`, the drop-content rule is lifted so the element and its contents survive.
- Script content round-trip: because state transitions for HTML's `SCRIPT_DATA` tokenizer state only happen when driving html5ever via the full tree builder, the tokenizer-only path decodes `&quot;` inside `<script>` to `"`. Byte-identical round-trip of entity-laden script bodies is therefore not guaranteed. Safe by default — `<script>` is in the drop-content set unless explicitly opted in.
- Entity re-encoding: text content is always re-encoded using `&amp;`/`&lt;`/`&gt;`.
- Input coercion: the JS binding coerces `undefined` / `null` / numbers to `''` or `String(input)` before dispatch to match upstream's looseness.

Most of these are serialization choices, not security-relevant. The exception is the `script` / `style` override: allowing either tag via `allowedTags` is security-sensitive, and allowing `script` in particular lets active content pass through. Only enable it for inputs you fully trust.

## URL / scheme handling

The native engine applies a configurable allowlist of URL schemes (default: `http`, `https`, `mailto`, `ftp`, `tel`, and a handful of others — see `DEFAULT_URL_SCHEMES` in `crates/sanitize-html/src/v2.rs`) to URL-bearing attributes. Leading ASCII whitespace and control characters are trimmed before scheme extraction, so obfuscations like `  javascript:` still fail the check. The upstream suite exercises many variants (`javascript:` smuggling, protocol-relative URLs, character-code padding). Our fuzz suite verifies the hard guarantee — `javascript:` URLs never survive — but the *exact output* when a URL is rejected differs from sanitize-html (we strip the entire attribute; sanitize-html may replace or escape).
