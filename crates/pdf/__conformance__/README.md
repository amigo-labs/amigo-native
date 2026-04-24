# Conformance — `@amigo-labs/pdf`

## Files

- `parity.spec.ts` — both we and pdfkit produce valid PDFs that
  start with `%PDF-`. No byte-level parity claim.
- `upstream.spec.ts` — realistic scenarios (100-label batch, A4
  multi-element page).
- `fuzz.spec.ts` — no panics on random text / dimensions / page
  counts.
- `divergences.md` — what we don't do.

## Running

```bash
pnpm --filter @amigo-labs/pdf test:conformance
```

## Scope

Labels, tickets, simple reports. No custom fonts, no images, no
vector primitives beyond lines and rectangles in v0.1.
