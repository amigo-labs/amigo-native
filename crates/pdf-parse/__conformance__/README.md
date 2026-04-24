# Conformance — `@amigo-labs/pdf-parse`

## Files

- `parity.spec.ts` — head-to-head with upstream `pdf-parse`. Checks
  both extract non-empty text, report matching page counts, and
  agree on shared vocabulary on the same inputs.
- `upstream.spec.ts` — fixture corpus smoke tests (example.pdf +
  unicode.pdf from lopdf's assets).
- `fuzz.spec.ts` — property-based: no panics on random bytes, no
  panics on almost-a-pdf bytes.
- `divergences.md` — documented gaps between us and upstream.
- `corpus/` — PDF fixtures (example.pdf, unicode.pdf from lopdf).

## Running

```bash
pnpm --filter @amigo-labs/pdf-parse test:conformance
```

## Parity scope

Text-extraction path — same as upstream `pdf-parse`'s primary
use-case. We target the 95% of real-world PDFs. See `divergences.md`
for known edge cases.
