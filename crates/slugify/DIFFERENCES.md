# @amigo-labs/slugify — Differences from `slugify` (npm)

Ground truth for comparison: `slugify` npm v1.6.x with `{ lower: true, strict: true }`.

## Intentional divergences

### CJK / Arabic / Korean transliteration
- `@amigo-labs/slugify` transliterates via `deunicode`, yielding a usable slug.
- `slugify` npm drops the characters entirely in `strict` mode.

| Input | `slugify` (npm, strict) | `@amigo-labs/slugify` |
|---|---|---|
| `日本語テスト` | `""` | `"ri-ben-yu-tesuto"` |
| `한국어 테스트` | `""` | `"hangugeo-teseuteu"` |
| `مرحبا بالعالم` | `""` | `"mrhb-bl-lm"` |
| `Ꝃ extended latin` | `"extended-latin"` | `"k-extended-latin"` |
| `Ελληνικά κείμενο` | `"ellhnika-keimeno"` | `"ellenika-keimeno"` |

Rationale: linguistically usable slugs are more valuable than dropping non-ASCII content silently.

### Punctuation acts as a word boundary
- `@amigo-labs/slugify` treats `@ . / ? = _` and similar punctuation as separators, collapsing them into `-`.
- `slugify` npm's `strict: true` mode removes them with no replacement, fusing adjacent words.

| Input | `slugify` (npm, strict) | `@amigo-labs/slugify` |
|---|---|---|
| `foo@bar.com` | `"foobarcom"` | `"foo-bar-com"` |
| `node.js rocks` | `"nodejs-rocks"` | `"node-js-rocks"` |
| `under_score case` | `"underscore-case"` | `"under-score-case"` |
| `path/to/file` | `"pathtofile"` | `"path-to-file"` |
| `query?param=value` | `"queryparamvalue"` | `"query-param-value"` |
| `\0null\0byte` | `"nullbyte"` | `"null-byte"` |

Rationale: slugs derived from paths, URLs, and identifiers stay readable.

### No symbol-to-word expansion
- `slugify` npm rewrites `&` → `and`, `$` → `dollar`, `%` → `percent`, etc.
- `@amigo-labs/slugify` strips these characters and treats them as separators.

| Input | `slugify` (npm, strict) | `@amigo-labs/slugify` |
|---|---|---|
| `hello & goodbye` | `"hello-and-goodbye"` | `"hello-goodbye"` |
| `price: $100` | `"price-dollar100"` | `"price-100"` |
| `50% off!` | `"50percent-off"` | `"50-off"` |

Rationale: symbol-to-word mapping is locale-specific and is not currently exposed via a config surface.

### Emoji handling
- `@amigo-labs/slugify` drops emoji silently.
- `slugify` npm with `strict` names them using its internal emoji table (`tada`, `rocket`, etc.).

| Input | `slugify` (npm, strict) | `@amigo-labs/slugify` |
|---|---|---|
| `🎉 emoji 🚀 test 🌍` | `"tada-emoji-rocket-test-earth-africa"` | `"emoji-test"` |

Rationale: emoji naming depends on a language-tagged lookup table; out of scope for a minimal core.

## Known limitations (not implemented yet)

### No custom replacement map
- `slugify` npm accepts `{ replacement: { '&': 'and' } }`.
- `@amigo-labs/slugify` does not currently expose a custom-replacement API.
- Status: candidate for a future minor release.

### No locale-specific transliteration
- `slugify` npm accepts a `locale` option (e.g. `de`, `tr`) that swaps transliterations.
- `@amigo-labs/slugify` uses `deunicode`'s single global mapping.
- Status: candidate for a future minor release.
