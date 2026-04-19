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

## Unsupported

- **Custom tokenizer plugins** (as in `marked` / `markdown-it`)
- **Front-matter parsing** — use a separate parser upstream
- **Script execution inside `{{…}}` templates** (Handlebars/EJS-style) — not Markdown

Users who need exact `marked` or GitHub output should stay with those tools.
