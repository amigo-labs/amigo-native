# @amigo-labs/typst

> Typst document compilation in-process. Source in → PDF out,
> one FFI crossing per document. Bundled Libertinus Serif, Mono,
> and New Computer Modern (math) fonts — no system-font fallback,
> deterministic output.
>
> Replaces CLI invocations (`typst compile`), Puppeteer-based
> PDF generators, and `pdfmake` for structured multi-page output
> where typography matters.

## Install

```bash
pnpm add @amigo-labs/typst
```

> Note: this package is larger than the rest of the portfolio
> (~15 MB per platform binary) because Libertinus + NCM + Fira
> fonts are bundled for deterministic output. See
> [`docs/perf-review/typst.md`](../../docs/perf-review/typst.md).

## Usage

```js
import { compile, compileMany } from '@amigo-labs/typst'

const { pdf, warnings } = compile(`
= Invoice

#table(
  columns: (1fr, auto, auto),
  [*Item*], [*Qty*], [*Amount*],
  [Consulting], [20 h], [\$2000],
)
`)
fs.writeFileSync('invoice.pdf', pdf)

// Inject data via sys.inputs:
const { pdf: templated } = compile(
  `Dear #sys.inputs.at("name", default: "Friend"), …`,
  { data: { name: 'Alice' } },
)

// Batch:
const outputs = compileMany([source1, source2, source3], { data })
```

## API

```ts
interface CompileOptions {
  data?: Record<string, string>  // exposed in sys.inputs
  fonts?: Buffer[]               // additional TTF / OTF font buffers
}

interface Diagnostic {
  severity: 'error' | 'warning' | 'hint'
  message: string
}

interface CompileResult {
  pdf: Buffer
  warnings: Diagnostic[]
}

function compile(source: string, options?: CompileOptions): CompileResult
function compileMany(sources: string[], options?: CompileOptions): CompileResult[]
```

## Scope (v0.1)

- Single-source-file documents.
- Bundled font set (Libertinus + NCM + DejaVu).
- Caller-provided extra fonts (CJK, brand fonts).
- `sys.inputs` via the `data` option.
- All Typst scripting: `#let`, `#if`, `#for`, `#show`, `#set`,
  math typesetting, tables, lists, user functions.

## Install for the browser

The same `import` works in Angular, React, Vite, esbuild, and webpack ≥ 5 — the bundler picks the WASM build via the `browser` conditional export:

```ts
const { compile } = await import('@amigo-labs/typst')
```

⚠️ **Bundle is ~5 MB gzipped** (typst-pdf + bundled Libertinus fonts) — well over the 500 KB soft budget. Always lazy-import in a code-split route; never include in the initial chunk. The chrono `wasmbind` feature wires `today()` through to JavaScript's `Date.now()`.

## Scope cuts

- **No `@preview/*` package resolution.** Supply-chain risk; stay
  offline. Inline the module source instead.
- **No multi-file imports**. Single-string source only. Use
  `#let`/`#show` for modularity.
- **No TypstCompiler class in v0.1.** Every `compile()` call
  rebuilds the world (~50–200 ms cold). For hot-path server
  workloads where you compile many documents with the same font
  set, batch via `compileMany()`. A stateful class is
  fast-follow.
- **No disk font resolution.** Deterministic bundle only.

See [`__conformance__/divergences.md`](./__conformance__/divergences.md).

## License

MIT (the Typst compiler itself is Apache-2.0; bundled fonts have
their own licenses — Libertinus SIL OFL, NCM GFL, Fira OFL).
