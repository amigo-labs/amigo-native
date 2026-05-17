# @amigo-labs/sanitize-html

[![npm version](https://img.shields.io/npm/v/@amigo-labs/sanitize-html)](https://www.npmjs.com/package/@amigo-labs/sanitize-html)
[![npm downloads](https://img.shields.io/npm/dm/@amigo-labs/sanitize-html)](https://www.npmjs.com/package/@amigo-labs/sanitize-html)
[![license](https://img.shields.io/npm/l/@amigo-labs/sanitize-html)](https://github.com/amigo-labs/amigo-native/blob/main/LICENSE)

HTML sanitization powered by Rust via [NAPI-RS](https://napi.rs). A stream-based native Node.js sanitizer built directly on top of the [`html5ever`](https://crates.io/crates/html5ever) tokenizer. Live benchmark numbers vs `sanitize-html` and `isomorphic-dompurify` are on the [dashboard](https://amigo-native.amigo-labs.workers.dev/).

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
| `allowedTags` | `string[]` | Tags to allow (default: a conservative safe set — see `DEFAULT_TAGS` in `src/v2.rs`) |
| `allowedAttributes` | `Record<string, string[]>` | Attributes to allow per tag |
| `allowedClasses` | `Record<string, string[]>` | CSS classes to allow per tag |
| `allowedSchemes` | `string[]` | URL schemes accepted in `href`/`src`/… (default: http, https, mailto, ftp, tel, …) |
| `stripComments` | `boolean` | Whether to strip HTML comments (default: true) |
| `linkRel` | `string` | Value for `rel` attribute on `<a href>` (default: `"noopener noreferrer"`) |

## Performance

Live benchmark numbers vs upstream `sanitize-html` and `isomorphic-dompurify` are tracked on the [dashboard](https://amigo-native.amigo-labs.workers.dev/) and in [`docs/data.json`](../../docs/data.json). The margin grows with input size — the streaming tokenizer avoids the DOM build cost the JS alternatives pay.

## Install for the browser

The same `import` works in Angular, React, Vite, esbuild, and webpack ≥ 5 — the bundler picks the WASM build via the `browser` conditional export:

```ts
import { sanitize } from '@amigo-labs/sanitize-html'
```

`ammonia` + `html5ever` is ~250–400 KB gzipped (the heaviest text-category crate, but still under the 500 KB budget). The napi `Either<String, f64>` input quirk is dropped on the browser side — pass a string (or `null`/`undefined`) directly.

## Supported Platforms

| Platform | Architecture |
| --- | --- |
| Linux | x64 (glibc), x64 (musl), arm64 |
| macOS | x64, arm64 |
| Windows | x64 |

## License

MIT
