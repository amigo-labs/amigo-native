# @amigo-labs/sanitize-html — Differences from `sanitize-html` (npm)

`@amigo-labs/sanitize-html` wraps Rust's [`ammonia`](https://crates.io/crates/ammonia). Ammonia and `sanitize-html` (npm) solve the same problem with different designs, so byte-level parity is not a goal. Security-critical behavior is covered by the XSS vector suite (`__conformance__/parity.spec.ts`) and the fuzz invariants (`__conformance__/fuzz.spec.ts`).

Of the 191 upstream test cases, 57 pass against `@amigo-labs/sanitize-html` without any changes, and 134 are skipped for the reasons below.

## Unsupported configuration options

`@amigo-labs/sanitize-html` exposes: `allowedTags`, `allowedAttributes`, `allowedClasses`, `stripComments`, `linkRel`. Everything else below is **not supported** — options passed for these keys are ignored:

| `sanitize-html` option | Why it's out of scope |
|---|---|
| `transformTags` | ammonia doesn't expose tag rewriting |
| `exclusiveFilter` | ammonia doesn't expose a node-level filter callback |
| `textFilter` | ammonia doesn't expose text-node callbacks |
| `nonTextTags` | ammonia handles `script`/`style` content internally |
| `disallowedTagsMode` (`escape` / `recursiveEscape`) | ammonia always drops disallowed tags |
| `enforceHtmlBoundary` | concept doesn't exist in ammonia |
| `allowedStyles` / `parseStyleAttributes` | ammonia doesn't parse CSS |
| `allowedIframeHostnames` / `allowedIframeDomains` / `allowProtocolRelative` | ammonia has different URL/iframe policies |
| `allowedScriptDomains` / `allowedScriptHostnames` | ammonia always removes script tags by default |
| `allowedSchemes` / `allowedSchemesByTag` / `allowedSchemesAppliedToAttributes` | ammonia uses a fixed default scheme allowlist for URL attributes |
| `parser` (htmlparser2 pass-through) | ammonia uses `html5ever` |
| `nestingLimit` | ammonia doesn't expose a depth limit |
| `allowVulnerableTags` | not applicable — ammonia warns via Rust logs, not JS console |
| `decodeEntities` | ammonia always normalizes entities |
| `preserveEscapedAttributes` | no equivalent |
| `allowedEmptyAttributes` / boolean-attribute handling | ammonia emits attributes based on its own rules |
| `srcset` allowlist | ammonia doesn't parse `srcset` values |
| `onOpenTag` / `onCloseTag` callbacks | no SAX-style callback surface |
| `allowedAttributes` glob patterns (e.g. `'data-*'`) | ammonia takes explicit attribute names |
| `allowedClasses` regex or wildcard `*` | ammonia expects explicit class values per tag |

## Output shape differences

Ammonia normalizes the parsed DOM tree before re-serializing, so it often produces an equivalent but not byte-identical output. Examples the upstream suite exposes:

- Self-closing tag serialization (`<br />` vs `<br>`)
- Ordering of attributes within a tag
- Whitespace between siblings
- Closing-tag insertion for unclosed `<p>`, `<li>`, etc.
- Entity re-encoding (`&amp;lt;` vs `&lt;`)
- Script / style element content: ammonia always drops the contents unconditionally, even when the tag itself is allowed.
- Input coercion: ammonia accepts `String`-convertible inputs; sanitize-html coerces `undefined` / `null` / numbers to `''` at the JS boundary.

None of these are security-relevant; they are serialization choices.

## Input-coercion differences

`sanitize-html` accepts `null`, `undefined`, and numbers, coercing to `''` or `String(input)` respectively. Our native function expects a string, so the JS-side adapter (see `__conformance__/upstream.spec.ts`) coerces non-string inputs before dispatching. Callers passing non-strings directly will get a type error from NAPI rather than silent coercion.

## URL / scheme handling

Ammonia applies a fixed default allowlist for URL-bearing attributes (`http`, `https`, `mailto`, `ftp`, `tel`, relative). The upstream suite exercises many variants (`javascript:` smuggling, protocol-relative URLs, character-code padding). Our fuzz suite verifies the hard guarantee — `javascript:` URLs never survive — but the *exact output* when a URL is rejected differs from sanitize-html (ammonia strips the entire attribute; sanitize-html replaces or escapes).
