# @amigo-labs/language-detect

> Language detection via [`whatlang`](https://crates.io/crates/whatlang) — ISO-639-3 codes out, `franc`-compatible shape.

Paragraph-sized Latin/Cyrillic/CJK detection is clear Green; short strings
(<50 B) fall back to `'und'` by design because no trigram detector is
reliable there. See `docs/perf-review/franc.md` for the full shape analysis.

## Install

```bash
pnpm add @amigo-labs/language-detect
```

## Usage

```js
import {
  detect,
  detectIfLong,
  detectAll,
  detectMany,
  languageExists,
} from '@amigo-labs/language-detect'

detect('The quick brown fox jumps over the lazy dog')
// 'eng'

detect('Der schnelle braune Fuchs springt über den faulen Hund')
// 'deu'

detect('hi')
// 'und' — below default minLength (10 bytes)

detectIfLong('hi')
// null — prefer this over 'und' in pipelines that branch on result

detectAll('Le chat dort sur le tapis rouge')
// [{ lang: 'fra', confidence: 0.92 }]

detectMany([
  'The quick brown fox…',
  'Der schnelle braune Fuchs…',
  'hi',
])
// ['eng', 'deu', 'und']

languageExists('eng') // true
languageExists('xyz') // false
```

## Options

```ts
type DetectOptions = {
  minLength?: number  // default 10 bytes
  only?: string[]     // ISO-639-3 allow-list
  ignore?: string[]   // ISO-639-3 deny-list, applied after `only`
}
```

## Install for the browser

The same `import` works in Angular, React, Vite, esbuild, and webpack ≥ 5 — the bundler picks the WASM build via the `browser` conditional export:

```ts
import { detect } from '@amigo-labs/language-detect'
```

Node consumers get the napi binary; browser consumers get the in-tarball `wasm/pkg/` artifact. `whatlang`'s bundle is ~100 KB gzipped, well under the 500 KB browser budget.

## Migration from `franc`

See `MIGRATION.md` — nearly drop-in on common cases; the confidence
scale is `[0, 1]` instead of `franc`'s internal range, and rare
`franc-all` languages return `'und'` here (bundle-size trade-off).

## License

MIT
