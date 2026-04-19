# Conformance — `@amigo-labs/commonmark`

`@amigo-labs/commonmark` is **not** a drop-in replacement for `marked`, `markdown-it`, or `commonmark.js`. It targets the CommonMark 0.30 spec plus standard GFM extensions (tables, strikethrough, task lists, autolinks, optional footnotes) as implemented by `pulldown-cmark`.

## Files

- `parity.spec.ts` — invariants that must hold regardless of upstream comparison: valid CommonMark input produces valid HTML output, safe defaults, heading-ID stability.
- `upstream.spec.ts` — representative tests from the CommonMark and GFM spec suites. Imports point at `../index.js`.
- `fuzz.spec.ts` — property-based tests (`fast-check`) that exercise invariants across random Markdown input: total function, no panics, no XSS escape when `unsafeHtml: false`, valid UTF-8 output.
- `divergences.md` — documented deviations from upstream renderers we benchmark against (`marked`, `markdown-it`). Useful for users migrating.

## Running

```bash
# from repo root
pnpm --filter @amigo-labs/commonmark test:conformance

# or per-package
cd crates/commonmark && pnpm test:conformance
```

## Scope

`@amigo-labs/commonmark` makes these promises:

1. **Spec-conformance**: CommonMark 0.30 + GFM per the `pulldown-cmark` test suite.
2. **Total function**: any UTF-8 input produces output without panic.
3. **Safe default**: raw HTML is dropped unless `unsafeHtml: true` is set explicitly.
4. **Deterministic heading IDs**: same input produces same IDs; collisions get a numeric suffix.

It does **not** promise byte-identical output to `marked`, `markdown-it`, or GitHub's renderer.
