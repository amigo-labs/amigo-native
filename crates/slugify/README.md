# @amigo-labs/slugify

[![npm version](https://img.shields.io/npm/v/@amigo-labs/slugify)](https://www.npmjs.com/package/@amigo-labs/slugify)
[![npm downloads](https://img.shields.io/npm/dm/@amigo-labs/slugify)](https://www.npmjs.com/package/@amigo-labs/slugify)
[![license](https://img.shields.io/npm/l/@amigo-labs/slugify)](https://github.com/amigo-labs/amigo-native/blob/main/LICENSE)

Blazing fast slugify powered by Rust via [NAPI-RS](https://napi.rs). Converts any string into a URL-friendly slug with Unicode support.

## Installation

```bash
npm install @amigo-labs/slugify
```

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
