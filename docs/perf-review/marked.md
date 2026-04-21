# Candidate review: `marked`

> **Status:** NO-GO (as a `marked` drop-in) · **Predicted:** 🟢 Green (for a CommonMark package) · **Reviewed:** 2026-04-19

## Verdict

Perf side: `pulldown-cmark` would be clearly Green — bytes-in / bytes-out, substantial compute, FFI floor irrelevant at ≥1 KB Markdown. But `marked`'s GFM interpretation ≠ CommonMark/`pulldown-cmark`, and users test against `marked`'s exact output bytes. As a standalone `@amigo-labs/commonmark` package (not as a `marked` replacement) it would be GO — that's a separate product decision.

## JS package

- **npm:** `marked`
- **Downloads:** ~30M/week
- **Exports / API surface:** `marked(src, options)`, Lexer/Parser split, custom renderer, extensions API, `walkTokens`
- **Typical input:** Markdown document 1 KB – 1 MB
- **Typical output:** HTML string
- **Realistic median use-case:** documentation site (e.g. docusaurus-style), blog-post rendering; also CLI README viewers

## Rust replacement

- **Candidate crate(s):** `pulldown-cmark` (CommonMark + GFM extensions), `comrak`
- **Maintenance / license:** both active, MIT
- **Known gotchas / divergences:** `marked` implements its **own** Markdown interpretation, which is not identical to CommonMark: list loose/tight detection differs, table parsing differs, HTML inline handling differs. `comrak` is closest to `marked`/GFM, but there are still byte diffs on real inputs

## BACKLOG check

BACKLOG: *Parity too expensive* — confirmed. Additional recommendation: no `marked` port, but evaluating a **standalone** `@amigo-labs/commonmark` (spec-strict, no drop-in promise) could be worth doing separately.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | 100 KB Markdown → ~5 ms in JS (`marked`), `pulldown-cmark` ~500 µs → 10× potential |
| Input size distribution | Typically ≥1 KB; `Buffer` input possible |
| Output size distribution | HTML string ~1.5× input; output cost 0.35 ns/byte FFI, tolerable |
| Reusable setup (stateful potential) | Low — renderer config is small |
| Batch-usage realism | Batch rendering (site build) very realistic |
| FFI-share estimate vs. Rust work | Low at ≥10 KB; FFI only dominates for tiny inputs |

## Classification reasoning

The post-mortem shape matches `sanitize-html`/`inflate`: bytes-in / bytes-out, no object traversal. That's **the** Green shape. The only blocker is parity. Snapshot tests from Docusaurus, GitHub API renderers, Stack Overflow-style editors hang on exact byte diffs — and `marked` has quirks (e.g. `> quote\nparagraph` is interpreted differently than CommonMark prescribes). A `marked`-compatible package would have to reproduce the deviations by hand, which quickly eats the 10× win. Alternative: honestly position as a CommonMark package, users migrate consciously. That's a product question, not a perf question.

## If NO-GO — BACKLOG entry

```markdown
- **marked** (~30M). `marked`'s GFM interpretation ≠ `pulldown-cmark`'s GFM. Perf-shape is clean (bytes-in/bytes-out, Green candidate), but parity to exact byte output is what users rely on. A `@amigo-labs/commonmark` as a *new* package (not a `marked` drop-in) would be worth re-evaluating separately.
```

Section in `BACKLOG.md`: **Parity too expensive** (with follow-up flag)
