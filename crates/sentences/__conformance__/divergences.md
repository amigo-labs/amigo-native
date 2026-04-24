# Divergences — sentences

`@amigo-labs/sentences` targets **Pragmatic Segmenter** behaviour. We
are compatible with `sbd` for the majority of inputs, but known
divergences exist.

## Intentional scope cuts

### HTML handling

`sbd`'s `html_boundaries` and `allowed_tags` options are **not**
exposed. HTML cleanup belongs in `@amigo-labs/sanitize-html`.
**Migration:** strip HTML first, then call `split()`.

### Custom JS abbreviation callback

`sbd` supports arbitrary user-supplied logic via options. We only
expose `customAbbreviations: string[]` (merged into the built-in
abbreviation table). Use-case coverage: >95% of real-world configs.

### Newline-sentence-per-line mode

`sbd.sentences(text, { newline_boundaries: true })` treats every `\n`
as a boundary. We only treat `\n\n` (paragraph break) as hard. If you
need per-line splitting, preprocess with `text.split('\n')`.

## Behavioural gaps vs. sbd

### Ellipsis-at-word-boundary

Input: `"He said... Go"`. sbd and pragmatic-segmenter disagree.
We follow pragmatic-segmenter: the ellipsis is a boundary if followed
by a capitalized word.

### URL-dot handling

Inputs with URLs (`https://example.com/path`) can confuse sbd's
regex-heavy pipeline and produce false splits on the URL dots. We
pass URLs through cleanly via the abbreviation scan (URLs don't end
in `. ` so they're not boundaries).

### Abbreviation table differences

We ship the pragmatic-segmenter-derived table per language (EN, DE,
FR, ES, IT, PT, NL). sbd ships an English-only 400-entry list. On
non-English input, we recognize more abbreviations correctly; on
exotic English abbreviations not in our table, we may split where
sbd wouldn't. **Workaround:** pass `customAbbreviations`.

### Quote-balancing

`"He said 'Hello. World.'"` — sbd splits; we don't (we track quote
depth). Pragmatic-segmenter behaviour matches ours.

## Unsupported languages

Asian languages (zh, ja, ko) and scripts without whitespace-delimited
words or ASCII terminators need a different algorithm — e.g. kuromoji
for Japanese. v0.1 ships with European-language support. Add via
`customAbbreviations` for niche use.
