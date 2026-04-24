# Migrating from `sbd`

`@amigo-labs/sentences` is close-but-not-identical to
[`sbd`](https://www.npmjs.com/package/sbd).

## What works

- `split(text)` ≈ `sbd.sentences(text)` for the vast majority of
  English-language input.
- `customAbbreviations` replaces sbd's `abbreviations` option.
- Multi-language support: `language: 'de'` works out of the box (sbd
  is English-only).
- Built-in abbreviation tables for EN, DE, FR, ES, IT, PT, NL.

## What changes

- **Named export, not default**: `import { split }` instead of
  `import sbd from 'sbd'; sbd.sentences(...)`.
- **HTML options removed**: `html_boundaries` and `allowed_tags` are
  out of scope. Pre-strip HTML.
- **`newline_boundaries` reinterpreted**: only `\n\n` (paragraph
  break) is a hard boundary, not every `\n`.
- **Two new APIs**: `splitToOffsets()` and `splitBatchToOffsets()`
  return `Buffer` of packed `[start, end]` u32 pairs — skip the
  per-sentence string allocation when you only need to iterate.

## Migration checklist

1. Replace `import sbd from 'sbd'` with
   `import { split } from '@amigo-labs/sentences'`.
2. Rename `sbd.sentences(text, options)` to `split(text, options)`.
3. Rename options keys to camelCase
   (`newline_boundaries` → `newlineBoundaries`,
   `preserve_whitespace` → `preserveWhitespace`,
   `abbreviations` → `customAbbreviations`).
4. If you previously used HTML options — preprocess the HTML upstream
   with `@amigo-labs/sanitize-html` or equivalent.
5. Validate on your corpus. Expect 95–98% match on English; 100% on
   pragmatic-segmenter aligned test sets.

## Staying on `sbd`

If you have tight bit-exact dependence on `sbd`'s abbreviation table
or HTML handling, stay on upstream.
