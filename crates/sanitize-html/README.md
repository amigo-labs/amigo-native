# @amigo-labs/sanitize-html

[![npm version](https://img.shields.io/npm/v/@amigo-labs/sanitize-html)](https://www.npmjs.com/package/@amigo-labs/sanitize-html)
[![npm downloads](https://img.shields.io/npm/dm/@amigo-labs/sanitize-html)](https://www.npmjs.com/package/@amigo-labs/sanitize-html)
[![license](https://img.shields.io/npm/l/@amigo-labs/sanitize-html)](https://github.com/amigo-labs/amigo-native/blob/main/LICENSE)

Blazing fast HTML sanitization powered by Rust via [NAPI-RS](https://napi.rs). A native Node.js binding to the [ammonia](https://crates.io/crates/ammonia) crate.

## Installation

```bash
npm install @amigo-labs/sanitize-html
```

## Usage

```ts
import { sanitize, isClean } from "@amigo-labs/sanitize-html";

// Sanitize HTML (removes dangerous tags/attributes)
const clean = sanitize('<p>Hello <script>alert("xss")</script></p>');
// "<p>Hello </p>"

// Check if HTML is already clean
const safe = isClean("<p>Hello</p>"); // true
const unsafe = isClean('<img onerror="alert(1)">'); // false

// With custom options
const result = sanitize("<div class='foo'>bar</div>", {
  allowedTags: ["div", "p", "b", "i"],
  allowedAttributes: { div: ["class"] },
});
```

## API

### `sanitize(html, options?): string`

Sanitizes HTML by removing dangerous tags and attributes. Returns the cleaned HTML string.

### `isClean(html, options?): boolean`

Returns `true` if the HTML contains no dangerous content (i.e. sanitization would not change it).

### Options

| Option | Type | Description |
| --- | --- | --- |
| `allowedTags` | `string[]` | Tags to allow (default: ammonia defaults) |
| `allowedAttributes` | `Record<string, string[]>` | Attributes to allow per tag |
| `allowedClasses` | `Record<string, string[]>` | CSS classes to allow per tag |
| `stripComments` | `boolean` | Whether to strip HTML comments |
| `linkRel` | `string` | Value for `rel` attribute on links |

## Supported Platforms

| Platform | Architecture |
| --- | --- |
| Linux | x64 (glibc), x64 (musl), arm64 |
| macOS | x64, arm64 |
| Windows | x64 |

## License

MIT
