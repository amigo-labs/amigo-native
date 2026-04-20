# Conformance — `@amigo-labs/csv`

Verifies that `@amigo-labs/csv` stays compatible with the upstream
[`csv-parse`](https://www.npmjs.com/package/csv-parse) package for the
core parse/stringify surface.

## What's checked

- **`parity.spec.ts`** — cross-verification against `csv-parse/sync`:
  1. `parse()` output matches row-for-row, cell-for-cell on a corpus of
     hand-crafted inputs (quoted cells, embedded newlines, CRLF vs LF,
     BOM handling, empty fields).
  2. `parseWithHeaders()` produces the same object-shape rows as
     `csv-parse`'s `columns: true` option.
  3. Delimiter/quote/escape overrides are honoured.
- **`fuzz.spec.ts`** — property-based invariants: round-tripping
  (`parse(stringify(rows))`) preserves the row shape; no panics on random
  bytes; quoted-field state machine terminates on every input.

## Running

```bash
# from repo root:
pnpm --filter @amigo-labs/csv test:conformance

# or per-package:
cd crates/csv && pnpm test:conformance

# everything (unit + conformance):
pnpm --filter @amigo-labs/csv test:all
```

## Updating

When upstream releases a new version:

1. Update the `devDependency` version of `csv-parse` in this package's
   `package.json`.
2. Run `pnpm test:conformance` and record any new divergences in
   [`divergences.md`](./divergences.md).

Note: we deliberately don't target full `csv-parse` option-surface parity —
`csv-parse` has dozens of rarely-used options (cast callbacks, on-record
hooks, stream modes). Our scope is the "sync parse + sync stringify" core;
anything else is an Alternative, not a Drop-in.
