# @amigo-labs/diff

> Myers/Patience text diff via [`similar`](https://crates.io/crates/similar) — jsdiff-compatible hunk-array shape, plus an offset-packed hot-path for large or char-level diffs.

## Install

```bash
pnpm add @amigo-labs/diff
```

## Usage

```js
import {
  diffLines,
  diffWords,
  diffChars,
  diffTrimmedLines,
  diffLinesToOffsets,
  diffCharsToOffsets,
  createPatch,
} from '@amigo-labs/diff'

diffLines('alpha\nbeta\n', 'alpha\nBETA\n')
// [
//   { value: 'alpha\n' },
//   { value: 'beta\n', removed: true },
//   { value: 'BETA\n', added: true },
// ]

createPatch('file.txt', oldContent, newContent)
// --- file.txt
// +++ file.txt
// @@ -1,3 +1,3 @@
//  alpha
// -beta
// +BETA
//  gamma
```

## Offset-packed hot-path

For large documents or char-level diffs, the hunk-array shape spends
most of its time on `Vec<String>` FFI marshalling. Switch to the
offset-packed API to keep the crossing flat:

```js
const buf = diffLinesToOffsets(oldStr, newStr)
// Uint32Array-style packed layout: [tag, oldStart, oldEnd, newStart, newEnd, …]
// tag: 0 = equal, 1 = added, 2 = removed

const view = new Uint32Array(buf.buffer, buf.byteOffset, buf.length / 4)
for (let i = 0; i < view.length; i += 5) {
  const [tag, oldStart, oldEnd, newStart, newEnd] = view.slice(i, i + 5)
  const segment =
    tag === 2 ? oldStr.slice(oldStart, oldEnd) : newStr.slice(newStart, newEnd)
  // ... render
}
```

## Migration from `diff`

Nearly drop-in for the hunk-array entry points (`diffLines`,
`diffWords`, `diffChars`, `diffTrimmedLines`, `createPatch`). See
[`MIGRATION.md`](./MIGRATION.md) for the scope cuts — primarily
`applyPatch`, `diffJson`, `diffCss`, and callback-based `diffArrays`.

## License

MIT
