# @amigo-labs/turndown

> HTML → Markdown via [`html5ever`](https://github.com/servo/html5ever)
> plus a bespoke rule walker. Ships CommonMark defaults + GFM tables /
> strikethrough / task-lists behind a single flag.

## Install

```bash
pnpm add @amigo-labs/turndown
```

## Usage

```js
import { turndown, turndownBatch } from '@amigo-labs/turndown'

turndown('<h1>Hello</h1><p><strong>Bold</strong>.</p>')
// '# Hello\n\n**Bold**.'

// GFM tables + strikethrough:
turndown('<table>...</table>', { gfm: true })

// Batch-convert in one FFI crossing:
turndownBatch([html1, html2, html3])
```

## Options

```ts
interface TurndownOptions {
  headingStyle?: 'setext' | 'atx'       // default 'atx'
  hr?: string                            // default '* * *'
  bulletListMarker?: '*' | '-' | '+'     // default '*'
  codeBlockStyle?: 'indented' | 'fenced' // default 'indented'
  fence?: '```' | '~~~'                   // default '```'
  emDelimiter?: '_' | '*'                // default '_'
  strongDelimiter?: '__' | '**'          // default '**'
  linkStyle?: 'inlined' | 'referenced'   // default 'inlined'
  gfm?: boolean                          // default false
  keep?: string[]                         // tag names to preserve as raw HTML
  remove?: string[]                       // tag names to drop entirely
}
```

## Scope

- Covers CommonMark defaults + GFM tables, strikethrough, task-lists.
- **Not** exposed: `.addRule()`, `.use(plugin)`, and keep/remove by
  function. Each per-visit callback would cost a FFI crossing — see
  [`docs/perf-review/turndown.md`](../../docs/perf-review/turndown.md)
  for rationale.
- Power users with custom rules stay on upstream `turndown`.

See [`__conformance__/divergences.md`](./__conformance__/divergences.md)
for byte-level differences.

## Install for the browser

The same `import` works in Angular, React, Vite, esbuild, and webpack ≥ 5 — the bundler picks the WASM build via the `browser` conditional export:

```ts
import { turndown } from '@amigo-labs/turndown'
```

Shares `html5ever` with `@amigo-labs/sanitize-html` — when both are loaded the bundler typically dedupes the parser overhead.

## License

MIT
