# Conformance — `@amigo-labs/typst`

## Files

- `parity.spec.ts` — Typst spec features: paragraphs, headings,
  lists, inline formatting, math, tables, scripting.
- `upstream.spec.ts` — invoice / templated-letter scenarios.
- `fuzz.spec.ts` — random text documents, no panics.

## Running

```bash
pnpm --filter @amigo-labs/typst test:conformance
```

## Scope

No JS drop-in exists — Typst is its own language. Conformance
target is the Typst language spec + our bundled-font / offline-
package scope cuts.
