# Migration — `franc` → `@amigo-labs/language-detect`

`@amigo-labs/language-detect` is inspired by `franc`'s shape — ISO-639-3
codes, `minLength`-gated, `only`/`ignore` lists — but is **not** a
byte-level drop-in. It uses `whatlang` under the hood where `franc` is
pure JS over its own trigram corpus.

## Summary

Nearly-drop-in for mainstream language detection on paragraph-sized
inputs (Latin/Cyrillic/CJK). Breaking differences concern confidence
scores, rare-language coverage, and the short-input safe default.

## Known differences

### Confidence scores are on `[0, 1]`, not `franc`'s internal range

`detectAll(...)` returns `{ lang, confidence }` with `confidence` in
`[0, 1]`, not the implementation-specific trigram score `francAll`
produces. If your code thresholds on the old scale, re-tune against
the new range.

### Rare languages from `franc-all` are not supported

`franc-all` covers 414 languages; `whatlang` covers 87. Inputs in
unsupported languages return `'und'`. `lingua-rs` (which would reach
`franc-all` parity) ships a 100+ MB model binary per target —
disqualified by the portfolio bundle-size policy. See
`docs/perf-review/franc.md`.

### `detect` returns `'und'` for short inputs

`franc` always returns a best-guess code. `@amigo-labs/language-detect`
returns `'und'` below `minLength` (default 10 bytes). Use
`detectIfLong` if you prefer `null` over a sentinel:

```js
detect('hi')                    // 'und'
detectIfLong('hi')              // null
detect('hello world!')          // 'eng'
detectIfLong('hello world!')    // 'eng'
```

## New additions beyond `franc`

- `detectMany(texts, options?)` — batch entry point, one FFI crossing
  for N inputs.
- `languageExists(code)` — check whether an ISO-639-3 code is
  supported by the engine.
- `detectIfLong(text, options?)` — `null` instead of `'und'` below
  `minLength`. Recommended default for pipelines.
