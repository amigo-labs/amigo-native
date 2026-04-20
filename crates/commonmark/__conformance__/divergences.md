# Divergences — `@amigo-labs/commonmark`

`@amigo-labs/commonmark` targets CommonMark 0.30 + GFM as implemented by `pulldown-cmark`. It is **not** byte-compatible with `marked`, `markdown-it`, or GitHub's renderer. Known deviations users migrating from those libraries should expect:

## vs. `marked`

- **Tight-vs-loose list detection**: `marked` uses different heuristics for when a list item gets wrapped in `<p>`. CommonMark spec (and this package) wraps only when blank lines separate items or when an item contains multiple block elements.
- **Raw HTML in Markdown**: `marked` passes most raw HTML through by default. This package drops raw HTML unless `unsafeHtml: true` is set. This is a **deliberate safe default**.
- **Code-block language class**: both emit `<pre><code class="language-X">`, matching.
- **Heading IDs**: `marked` does not auto-generate IDs by default (requires `marked-gfm-heading-id` plugin). This package does, via ASCII slugification.

## vs. `markdown-it`

- **Plugin ecosystem**: `markdown-it` has hundreds of plugins for footnotes, anchor-links, container blocks, etc. This package ships a fixed feature set.
- **Typographer**: `markdown-it`'s `typographer: true` is similar to our `smartPunctuation: true`, but the set of replacements differs in edge-cases (quote nesting, apostrophes inside words).
- **HTML passthrough**: `markdown-it` default is `html: false` (escape raw HTML as text). This package drops raw HTML blocks entirely under `unsafeHtml: false`.

## vs. GitHub's renderer

- **Autolink in prose**: GFM spec autolinks bare URLs and emails that appear in running prose (e.g. `visit https://example.com today` → clickable). **This package does not** — `pulldown-cmark` only autolinks explicit angle-bracket form (`<https://example.com>`). Migrating prose that relies on bare-URL autolinking will need explicit `<…>` wrapping or `[text](url)` form.
- **Autolink extensions**: GitHub additionally auto-links issue references, usernames, SHA hashes, etc. — none of those are in the GFM spec and are not emitted by this package.
- **Task list attribute order**: GitHub emits `<input type="checkbox" disabled>`. This package emits `<input disabled="" type="checkbox" checked="" />` — semantic equivalent; attribute order and quoting differ.
- **Heading ID slugification**: GitHub uses a non-ASCII-preserving slugifier (keeps unicode letters). This package strips non-ASCII. Migrating docs that rely on GitHub-generated anchor fragments will break.

## CommonMark / GFM spec deviations from `pulldown-cmark`

These are inherited from the underlying parser and documented for transparency:

- **Indented code block trailing newline**: spec renders `    code` as `<pre><code>code\n</code></pre>`; this package emits `<pre><code>code</code></pre>` (no trailing `\n` inside `<code>`). Display in browsers is identical.
- **Single-tilde strikethrough**: GFM spec requires **double** tilde (`~~X~~`). `pulldown-cmark` also accepts single tilde (`~X~`) as strikethrough. If you have literal `~` characters in your Markdown, escape them (`\~`) to preserve them.

### Full-spec pass rate

`upstream.spec.ts` runs the complete CommonMark 0.31.2 spec corpus
(652 examples from the `commonmark-spec` npm package) against our
`render(md, { headingIds: false, unsafeHtml: true })`. As of the
current `pulldown-cmark` dependency, **630 / 652 examples pass
(96.6 %)**. The 22 failures cluster in:

- **Backslash escapes** (2 cases) — edge cases in escape sequences
  inside link titles and attribute values.
- **Entity and numeric character references** (2 cases) — expansion
  of `&#xNN;` forms inside attribute contexts.
- **Link reference definitions** (3 cases) — multi-line definition
  normalization.
- **Emphasis and strong emphasis** (6 cases) — a handful of edge
  cases in the precedence algorithm for intra-word `_` / `*`.
- **Code spans** (1 case).
- **Links / Images** (2 cases) — corner cases in title parsing.
- **Raw HTML** (4 cases) — `pulldown-cmark`'s tag-boundary heuristic
  differs on some multi-line tag forms.
- **Setext headings / HTML blocks** (2 cases).

None of these affect the Green verdict — they are documented
behavioural divergences of the underlying parser, not bugs in the
binding. Users who need byte-identical CommonMark reference output
should stay with `commonmark.js` (pure JS, lower performance).

## Unsupported

- **Custom tokenizer plugins** (as in `marked` / `markdown-it`)
- **Front-matter parsing** — use a separate parser upstream
- **Script execution inside `{{…}}` templates** (Handlebars/EJS-style) — not Markdown

Users who need exact `marked` or GitHub output should stay with those tools.
