<p align="center">
  <img src="docs/logo.png" alt="amigo-native" width="128">
</p>

<h1 align="center">amigo-native</h1>

<p align="center">
  <a href="https://github.com/amigo-labs/amigo-native/actions/workflows/ci.yml"><img src="https://github.com/amigo-labs/amigo-native/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/amigo-labs/amigo-native/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
</p>

<p align="center">Rust-powered npm packages under the <code>@amigo-labs</code> scope.</p>

Monorepo using [napi-rs](https://napi.rs) for native Node.js addons, cross-compile CI, and independent npm packages per crate.

## Packages

<!-- PACKAGES_TABLE:START -->
| Package                                                   | Description                                              | Replaces                   | vs JS          | Parity | Status      |
| :-------------------------------------------------------- | :------------------------------------------------------- | :------------------------- | :------------- | :----- | :---------- |
| [`@amigo-labs/argon2`](./crates/argon2)                   | Argon2id password hashing (sync + async)                 | `argon2/hash-wasm`         | **1.36x**      | —      | Drop-in     |
| [`@amigo-labs/bcrypt`](./crates/bcrypt)                   | Bcrypt password hashing (sync + async)                   | `bcrypt/bcryptjs`          | **1.03-1.07x** | 100%   | Drop-in     |
| [`@amigo-labs/bm25`](./crates/bm25)                       | BM25 full-text search                                    | `wink-bm25-text-search`    | **14x**        | 100%   | Compatible  |
| [`@amigo-labs/commonmark`](./crates/commonmark)           | CommonMark + GFM renderer via `pulldown-cmark`           | `marked/markdown-it`       | **6.8x**       | 100%   | Alternative |
| [`@amigo-labs/csv`](./crates/csv)                         | CSV parsing/serialization via BurntSushi's `csv`         | `csv-parse/papaparse`      | **1.55-1.94x** | —      | Drop-in     |
| [`@amigo-labs/deepmerge`](./crates/deepmerge)             | Recursive object merge                                   | `deepmerge`                | **3-6.2x**     | 100%   | Compatible  |
| [`@amigo-labs/diff`](./crates/diff)                       | Text diff via `similar`, offset-packed hot-path          | `diff`                     | **0.26-26x**   | 100%   | Compatible  |
| [`@amigo-labs/encoding`](./crates/encoding)               | Character encoding via `encoding_rs`                     | `iconv-lite`               | **0.61-32x**   | 100%   | Alternative |
| [`@amigo-labs/file-type`](./crates/file-type)             | Magic-byte file detection via `infer`                    | `file-type`                | **28x**        | 100%   | Alternative |
| [`@amigo-labs/force-layout`](./crates/force-layout)       | Force-directed graph layout (batch)                      | `d3-force`                 | **3.5-6.6x**   | 100%   | Compatible  |
| [`@amigo-labs/graph-layout`](./crates/graph-layout)       | Hierarchical DAG layout, spec in, positions out          | `dagre`                    | **31-66x**     | 100%   | Compatible  |
| [`@amigo-labs/inflate`](./crates/inflate)                 | zlib deflate/inflate/gzip via `flate2` (zlib-rs)         | `pako`                     | **0.96-12x**   | 100%   | Compatible  |
| [`@amigo-labs/jose`](./crates/jose)                       | Ed25519 JWK + RFC 7638 thumbprints                       | `jose (subset)`            | **1.57-4.4x**  | 100%   | Alternative |
| [`@amigo-labs/jwt`](./crates/jwt)                         | JWT sign/verify via `jsonwebtoken` crate                 | `jsonwebtoken`             | **1.65-7.8x**  | 100%   | Drop-in     |
| [`@amigo-labs/language-detect`](./crates/language-detect) | Language detection via `whatlang`                        | `franc`                    | **3-16x**      | 100%   | Alternative |
| [`@amigo-labs/minisearch`](./crates/minisearch)           | In-memory full-text search + autocomplete                | `minisearch`               | **1.23-51x**   | 100%   | Compatible  |
| [`@amigo-labs/nanoid`](./crates/nanoid)                   | Crypto-safe URL-safe IDs via `nanoid` crate              | `nanoid`                   | **0.96-1.11x** | 100%   | Drop-in     |
| [`@amigo-labs/pdf`](./crates/pdf)                         | PDF generation, spec-in / Buffer-out                     | `pdfkit`                   | TBD            | 100%   | Subset      |
| [`@amigo-labs/pdf-parse`](./crates/pdf-parse)             | PDF text + metadata extraction                           | `pdf-parse`                | **0.46-2.5x**  | 100%   | Compatible  |
| [`@amigo-labs/sanitize-html`](./crates/sanitize-html)     | HTML sanitization via Mozilla's `ammonia`                | `sanitize-html`            | **1.65-3.8x**  | —      | Compatible  |
| [`@amigo-labs/sentences`](./crates/sentences)             | Sentence splitter, multi-language + offset hot-path      | `sbd`                      | TBD            | 100%   | Compatible  |
| [`@amigo-labs/slugify`](./crates/slugify)                 | Unicode-aware slugification via `deunicode`              | `slugify`                  | **2.4-5.3x**   | —      | Alternative |
| [`@amigo-labs/stemmer`](./crates/stemmer)                 | Porter/Snowball stemmer (batch-only) via `rust-stemmers` | `natural (stemmer subset)` | **7.1-8.3x**   | 100%   | Alternative |
| [`@amigo-labs/svgo`](./crates/svgo)                       | SVG optimizer, 8 preset-default plugins                  | `svgo`                     | **15-27x**     | 100%   | Subset      |
| [`@amigo-labs/text-splitters`](./crates/text-splitters)   | RAG splitters, tiktoken-aware                            | `@langchain/textsplitters` | **0.22-2.5x**  | 100%   | Compatible  |
| [`@amigo-labs/tiktoken`](./crates/tiktoken)               | OpenAI BPE tokenizer (cl100k, o200k) via `tiktoken-rs`   | `tiktoken/js-tiktoken`     | **0.28-0.31x** | 100%   | Drop-in     |
| [`@amigo-labs/turndown`](./crates/turndown)               | HTML → Markdown, CommonMark + GFM                        | `turndown`                 | **10-16x**     | 100%   | Subset      |
| [`@amigo-labs/typst`](./crates/typst)                     | Typst compiler, source → PDF                             | `typst-js`                 | TBD            | 100%   | New         |
| [`@amigo-labs/xlsx`](./crates/xlsx)                       | XLSX read + write                                        | `xlsx`                     | **2.3-3x**     | 100%   | Subset      |
| [`@amigo-labs/xxhash`](./crates/xxhash)                   | XXH32/64/XXH3 hashing with batch + streaming API         | `xxhash-wasm/xxhashjs`     | **0.34-2.7x**  | —      | Drop-in     |
| [`@amigo-labs/zip`](./crates/zip)                         | ZIP read/write via `zip` crate                           | `yauzl/adm-zip/jszip`      | **1.88-9.3x**  | 100%   | Alternative |
<!-- PACKAGES_TABLE:END -->

> The table above is regenerated from each crate's `package.json` `"amigo"` block by
> `scripts/sync-registry.mjs`. Don't edit it by hand.

Full benchmark data lives in [`docs/data.json`](./docs/data.json) (auto-generated by CI) and is rendered on the [dashboard](https://amigo-labs.github.io/amigo-native/).
Parity scores populated once each package's `__conformance__/upstream.spec.ts` is filled from the upstream test suite.

## Quick start

```bash
pnpm install
pnpm build
pnpm test
pnpm bench     # performance benchmarks
```

## Development

### Prerequisites

- Rust (edition 2024)
- Node.js >= 22
- pnpm

### Build

```bash
pnpm build          # all packages, release
pnpm build:debug    # all packages, debug (faster compile)
```

### Test

```bash
cargo test --workspace   # Rust unit tests
pnpm test                # Node.js tests (vitest)
```

### Benchmark

```bash
pnpm bench                                          # run all benchmarks (vitest bench)
pnpm bench:report                                   # run all benchmarks + size + parity, regenerate shards
node scripts/run-benchmarks.mjs --crates xxhash     # only this crate; writes bench-results-xxhash.json at repo root
node scripts/run-benchmarks.mjs --only-changed      # crates whose source changed vs origin/main
node scripts/generate-report.mjs                    # rebuild docs/data.json, generate docs/benchmarks/*.json, append history from fresh shards
```

CI does the same thing automatically: on each push to `main` it benches only the crates whose
`crates/<name>/` changed in that commit. Force a full rerun (e.g. after a toolchain bump) by
putting `[full-bench]` anywhere in the merge commit message.

### Lint

```bash
pnpm lint    # oxlint + cargo fmt --check + cargo clippy
```

## Adding a new package

```bash
./scripts/new-package.sh <package-name>
```

Then edit `crates/<name>/src/lib.rs` and `crates/<name>/Cargo.toml`.

## Architecture

```
amigo-native/
├── crates/
│   ├── <package>/        # one directory per @amigo-labs/<package> (see Packages table above)
│   └── _template/        # scaffold for new packages
├── scripts/
│   ├── new-package.sh         # package generator
│   ├── run-benchmarks.mjs
│   ├── measure-size.mjs
│   ├── generate-report.mjs    # rebuild docs/data.json
│   ├── sync-registry.mjs      # single-source-of-truth registry sync
│   └── conformance-summary.mjs
├── .github/workflows/
│   ├── ci.yml            # lint + test + benchmark (on main)
│   └── release.yml       # cross-compile + npm publish
├── wrangler.toml         # docs/ dashboard → Cloudflare Worker (Git integration)
├── Cargo.toml            # workspace root
└── vitest.config.ts
```

Each crate is a standalone npm package with:

- Rust source in `src/lib.rs`
- napi-rs bindings (`#[napi]` macros)
- Platform-specific npm packages in `npm/` (6 targets)
- Tests in `__test__/`, upstream conformance tests in `__conformance__/`, benchmarks in `__bench__/`
- `MIGRATION.md` when the package is not a 100% drop-in replacement

## Release

Tag with `<crate-name>@<version>` (e.g. `slugify@0.1.0`) to trigger the release workflow. It cross-compiles for 6 targets and publishes to npm with provenance.

| Target                      | OS             | Arch  |
| :-------------------------- | :------------- | :---- |
| `x86_64-unknown-linux-gnu`  | Linux          | x64   |
| `x86_64-unknown-linux-musl` | Linux (Alpine) | x64   |
| `aarch64-unknown-linux-gnu` | Linux          | ARM64 |
| `x86_64-apple-darwin`       | macOS          | x64   |
| `aarch64-apple-darwin`      | macOS          | ARM64 |
| `x86_64-pc-windows-msvc`    | Windows        | x64   |

## License

MIT
