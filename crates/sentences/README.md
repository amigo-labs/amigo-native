# @amigo-labs/sentences

> Multi-language rule-based sentence boundary detection. String-array
> compat form plus an offset-packed zero-copy hot-path for NLP
> pipelines that don't need substring allocation.

## Install

```bash
pnpm add @amigo-labs/sentences
```

## Usage

### Compat (drop-in-shape for `sbd`)

```js
import { split } from '@amigo-labs/sentences'

split('Hello world. How are you?')
// → ['Hello world.', 'How are you?']

split('Das ist z.B. gut. Super!', { language: 'de' })
// → ['Das ist z.B. gut.', 'Super!']
```

### Zero-copy hot-path

For pipelines that downstream embed, translate or classify sentences,
the offset-packed API avoids the O(N) string allocation.

```js
import { splitToOffsets } from '@amigo-labs/sentences'

const text = 'First. Second. Third.'
const buf = splitToOffsets(text)
const view = new Uint32Array(buf.buffer, buf.byteOffset, buf.length / 4)
for (let i = 0; i < view.length; i += 2) {
  const [start, end] = [view[i], view[i + 1]]
  // text.slice(start, end) is the i-th sentence.
}
```

### Batch

```js
import { splitBatch, splitBatchToOffsets } from '@amigo-labs/sentences'

splitBatch([doc1, doc2, doc3])
// → Array<string[]>

splitBatchToOffsets([doc1, doc2, doc3])
// → Array<Buffer>
```

## Options

```ts
type SbdLanguage = 'en' | 'de' | 'fr' | 'es' | 'it' | 'pt' | 'nl'

interface SplitOptions {
  language?: SbdLanguage            // default 'en'
  newlineBoundaries?: boolean        // treat \n\n as hard break, default false
  preserveWhitespace?: boolean       // default false (sentences are trimmed)
  customAbbreviations?: string[]     // merged into per-language table
}
```

## Parity

We target **Pragmatic Segmenter** behaviour, not bit-exact `sbd`. See
[`__conformance__/divergences.md`](./__conformance__/divergences.md)
for documented gaps.

## License

MIT
