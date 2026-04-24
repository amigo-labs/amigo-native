# Migration — `diff` → `@amigo-labs/diff`

`@amigo-labs/diff` matches the jsdiff `diffLines`/`diffWords`/
`diffChars`/`diffTrimmedLines`/`createPatch` entry points on the
hunk-array shape. v0.1 omits a few entry points and the callback-based
`diffArrays`.

## Summary

Drop-in for the line/word/char diff surface and `createPatch`. Omitted
in v0.1: `applyPatch`, `parsePatch`, `diffJson`, `diffCss`,
`diffSentences`, callback-based `diffArrays`.

## Known differences

### Minimum-edit-script choice

Myers/Patience doesn't define a unique output when multiple equally-
short edit scripts exist. `similar` and jsdiff may pick different
canonical paths. The reconstruction invariant — concat all non-removed
hunk values and you get the new string — holds for both.

## Unsupported in v0.1

- **`applyPatch`, `parsePatch`** — patch round-trip deferred to v0.2.
  Use GNU `patch` or upstream `diff` for now.
- **`diffJson`** — stringify in JS, call `diffLines` on the result.
- **`diffCss`** — tokenise in JS, call `diffLines` or `diffWords`.
- **`diffSentences`** — use `@amigo-labs/sentences` to split, then
  `diffLines` on the joined output.
- **`diffArrays(a, b, { comparator })`** — JS comparator callbacks
  over FFI are a measured antipattern (see `docs/post-mortems/xml.md`).
  Pre-serialise array elements to strings and use `diffLines`.

## New additions beyond `diff`

- **`diffLinesToOffsets`, `diffCharsToOffsets`** — offset-packed output
  in a single Buffer. Five `u32` values per entry: `[tag, oldStart,
  oldEnd, newStart, newEnd]` with `tag` `0 = equal`, `1 = added`,
  `2 = removed`. The Green hot-path for large / char-level diffs.
