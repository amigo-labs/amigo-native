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

Target (see [`__bench__/index.bench.ts`](./__bench__/index.bench.ts) — run `pnpm bench`):

| Size | Target vs `marked` | Target vs `markdown-it` |
|---|---:|---:|
| 1 KB | ≥ 2× | ≥ 2× |
| 50 KB | ≥ 5× | ≥ 5× |
| 500 KB | ≥ 8× | ≥ 8× |

Numbers are published in [`docs/data.json`](../../docs/data.json) after the first release.

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
