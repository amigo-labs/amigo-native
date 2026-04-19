# @amigo-labs/commonmark

Blazing-fast native CommonMark + GFM renderer. Powered by Rust and [`pulldown-cmark`](https://crates.io/crates/pulldown-cmark), delivered as prebuilt binaries via NAPI-RS.

> **Not a drop-in for `marked` or `markdown-it`.** This package targets the [CommonMark 0.30 spec](https://spec.commonmark.org/0.30/) plus standard [GFM extensions](https://github.github.com/gfm/). Output is not byte-identical to either `marked` or GitHub's renderer — see [`__conformance__/divergences.md`](./__conformance__/divergences.md).

## Install

```bash
npm install @amigo-labs/commonmark
```

The correct prebuilt binary for your platform is selected automatically. Supported: Linux x64 (glibc+musl), Linux arm64, macOS x64, macOS arm64, Windows x64.

## Usage

```ts
import { render, renderMany, Renderer } from '@amigo-labs/commonmark'

// One-shot
render('# Hello, **world**')
// → '<h1 id="hello-world">Hello, <strong>world</strong></h1>\n'

// Batch (site builder shape)
renderMany(['# Page 1', '# Page 2', '# Page 3'])
// → ['<h1 id="page-1">Page 1</h1>\n', …]

// Reusable renderer (same options across many calls)
const r = new Renderer({ gfm: true, unsafeHtml: false })
r.render('## Section')

// Buffer-input overload — skips V8 UTF-16 → UTF-8 copy on the FFI boundary.
// Measurably faster on small inputs; parity on medium/large where
// rendering dominates.
import { renderBytes } from '@amigo-labs/commonmark'
renderBytes(Buffer.from('# fast'))
```

## Options

All options are optional.

| Option | Type | Default | Description |
|---|---|---|---|
| `gfm` | `boolean` | `true` | Enable GFM extensions: tables, strikethrough, task lists, autolinks. |
| `footnotes` | `boolean` | `false` | Enable footnote syntax (`[^1]`). |
| `smartPunctuation` | `boolean` | `false` | Convert `--` → en-dash, `...` → ellipsis, straight quotes → curly. |
| `unsafeHtml` | `boolean` | `false` | Allow raw HTML blocks in Markdown. **Disabled by default** — raw HTML is dropped silently. |
| `headingIds` | `boolean` | `true` | Auto-generate ASCII slug IDs for headings (`# Hello World` → `<h1 id="hello-world">`). |

## Safety

The default (`unsafeHtml: false`) drops raw HTML blocks and inline HTML. This is the right choice for **untrusted input** (user-submitted Markdown). It is **not** a full XSS sanitizer — link scheme filtering (`javascript:`, `data:`, etc.) is not applied. For fully-sanitized output, chain with [`@amigo-labs/sanitize-html`](../sanitize-html):

```ts
import { render } from '@amigo-labs/commonmark'
import { sanitize } from '@amigo-labs/sanitize-html'

const unsafe_but_html_free = render(userMarkdown)
const safe = sanitize(unsafe_but_html_free)
```

## When to choose this package

- **You control the Markdown source** (docs, README files, CMS authored by trusted editors) and want faster site builds.
- **Your app renders Markdown in a hot path** (AI chat responses, realtime editor preview) and FFI overhead is amortized.
- **You can accept CommonMark+GFM-spec output** and don't depend on `marked`-specific rendering quirks.

## When *not* to choose this package

- You rely on `marked`'s tight-vs-loose list heuristics, plugin API, or raw-HTML passthrough.
- You need `markdown-it`'s plugin ecosystem (anchors, containers, footnote styles, custom tokenizers).
- You need output byte-identical to GitHub's renderer (usernames, issue refs, SHA autolinks).

## Performance

Measured on Linux x64 with `pnpm bench` (Vitest). Best of `render`, `renderBytes`, and `render({ headingIds: false, unsafeHtml: true })`:

| Size | vs `marked` | vs `markdown-it` |
|---|---:|---:|
| Small (~0.1 KB) | **8.05×** | 5.19× |
| Medium (~2.8 KB) | **10.73×** | 7.63× |
| Large (~81 KB) | **9.36×** | 7.56× |
| Batch (500 × medium, `renderMany`) | **51.79×** | 42.65× |

Notes on the options that drive these numbers:

- `renderBytes(Buffer)` avoids the V8 UTF-16 → UTF-8 copy on input — about 5% faster than `render(string)` on small inputs; roughly parity once rendering dominates.
- `{ headingIds: false, unsafeHtml: true }` enables the streaming fast-path: no event collection, no filter pass. ~1.23–1.37× faster than default options.
- `renderMany` parallelises across cores via `rayon` for batches ≥ 8 docs where at least one doc is ≥ 512 bytes. On a 500-doc batch it's **5.45×** faster than calling `render` in a per-call loop.

Numbers are re-published in [`docs/data.json`](../../docs/data.json) after each release.

## Conformance

- Spec compliance: [CommonMark 0.30](https://spec.commonmark.org/0.30/) + [GFM](https://github.github.com/gfm/) as per `pulldown-cmark`'s test suite.
- Safety invariants verified via property-based fuzzing (`fast-check`).
- Divergences from other renderers documented in [`__conformance__/divergences.md`](./__conformance__/divergences.md).

```bash
pnpm test             # unit tests
pnpm test:conformance # parity + upstream + fuzz
pnpm test:all         # everything
pnpm bench            # vs marked + markdown-it
```

## License

MIT
