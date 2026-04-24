# Conformance — `@amigo-labs/xlsx`

## Files

- `parity.spec.ts` — cross-read with SheetJS (`xlsx` npm): our
  output is SheetJS-readable, and vice versa.
- `upstream.spec.ts` — roundtrip scenarios (empty, unicode,
  100-row, multi-sheet).
- `fuzz.spec.ts` — roundtrip preservation on random strings, no
  panics on random bytes.
- `divergences.md` — known gaps vs. SheetJS / ExcelJS.

## Running

```bash
pnpm --filter @amigo-labs/xlsx test:conformance
```
