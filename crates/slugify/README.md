# @amigo-labs/slugify

[![npm version](https://img.shields.io/npm/v/@amigo-labs/slugify)](https://www.npmjs.com/package/@amigo-labs/slugify)
[![npm downloads](https://img.shields.io/npm/dm/@amigo-labs/slugify)](https://www.npmjs.com/package/@amigo-labs/slugify)
[![license](https://img.shields.io/npm/l/@amigo-labs/slugify)](https://github.com/amigo-labs/amigo-native/blob/main/LICENSE)

Blazing fast slugify powered by Rust via [NAPI-RS](https://napi.rs). Converts any string into a URL-friendly slug with Unicode support.

## Installation

```bash
npm install @amigo-labs/slugify
```

Same install command for Node and the browser. Bundlers select the
right artifact via conditional `exports`: Node consumers get the
NAPI-RS binary; browser consumers (Vite, esbuild, webpack ≥ 5,
Angular CLI, Bun) get a WebAssembly build with the same JavaScript
API. No separate `-wasm` package.

> **Local development.** The WebAssembly artifact in `wasm/pkg/` is
> build-time output (gitignored). `prepublishOnly` builds it before
> `npm publish`, so published tarballs always contain it. For
> in-tree work (workspace consumers, `pnpm pack`, local linking)
> run `pnpm build:wasm` first.

## Usage

```ts
import { slugify, slugifyWithSeparator } from "@amigo-labs/slugify";

slugify("Hello World!"); // "hello-world"
slugify("Schöne Grüße"); // "schone-grusse"
slugify("日本語テスト"); // "ri-ben-yu-tesuto"

// With custom separator
slugifyWithSeparator("Hello World!", "_"); // "hello_world"
```

## API

### `slugify(input): string`

Converts a string into a URL-friendly slug using `-` as separator.

### `slugifyWithSeparator(input, separator): string`

Converts a string into a URL-friendly slug using a custom separator.

## Supported Platforms

| Platform | Architecture |
| --- | --- |
| Linux | x64 (glibc), x64 (musl), arm64 |
| macOS | x64, arm64 |
| Windows | x64 |

## License

MIT
