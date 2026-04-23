# Migrating from `turndown`

`@amigo-labs/turndown` covers the 95% case: CommonMark output from
typical HTML, with GFM extensions. The extensibility surface is
narrower than upstream's.

## What works

- `turndown(html)` replaces `new TurndownService().turndown(html)`.
- All constructor options (headingStyle, bulletListMarker,
  codeBlockStyle, fence, emDelimiter, strongDelimiter, hr, linkStyle)
  are accepted.
- GFM (`turndown-plugin-gfm`) behaviour is enabled via `{ gfm: true }`.
- `keep` / `remove` accept tag-name arrays.

## What doesn't

- **`.addRule(name, { filter, replacement })`** — not exposed. The
  per-visit JS callback is a documented anti-pattern. Stay on
  upstream `turndown` if you have custom rules.
- **`.use(plugin)`** — plugin-registration surface isn't exposed.
  GFM is flag-based.
- **`keep` / `remove` by function** — only tag-name lists supported.
- **Access to `TurndownService` instance** — no `this` to pass rules
  into. The top-level `turndown(html, options)` is the only API.

## Migration checklist

1. Replace
   ```js
   import TurndownService from 'turndown'
   const svc = new TurndownService(options)
   const md = svc.turndown(html)
   ```
   with
   ```js
   import { turndown } from '@amigo-labs/turndown'
   const md = turndown(html, options)
   ```
2. If you `.use(gfm)`, switch to `{ gfm: true }`.
3. If you `.addRule(...)`, stay on upstream for those paths.
4. Re-check byte-level snapshots; the output may differ slightly
   (see `__conformance__/divergences.md`).

## When to stay on upstream

- Any custom rule via `.addRule()`.
- Any `keep` / `remove` that uses a function filter.
- Pipelines that extend turndown with third-party plugins beyond
  `turndown-plugin-gfm`.
