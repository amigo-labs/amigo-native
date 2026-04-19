# Candidate review: `marked`

> **Status:** NO-GO (als `marked`-Drop-in) · **Predicted:** 🟢 Green (für CommonMark-Paket) · **Reviewed:** 2026-04-19

## Verdict

Perf-Seite: `pulldown-cmark` wäre klar Green — bytes-in / bytes-out, substantial compute, FFI-Floor irrelevant bei ≥1 KB Markdown. Aber `marked`s GFM-Interpretation ≠ CommonMark/`pulldown-cmark`, und Nutzer testen gegen exakt `marked`s Output-Bytes. Als eigenständiges `@amigo-labs/commonmark`-Paket (nicht als `marked`-Ersatz) wäre GO — das ist eine separate Produktentscheidung.

## JS package

- **npm:** `marked`
- **Downloads:** ~30M/Woche
- **Exports / API surface:** `marked(src, options)`, Lexer/Parser-Split, Custom-Renderer, Extensions-API, `walkTokens`
- **Typical input:** Markdown-Dokument 1 KB – 1 MB
- **Typical output:** HTML-String
- **Realistic median use-case:** Dokumentations-Site (z. B. docusaurus-ähnlich), Blog-Post-Rendering; auch CLI-README-Viewer

## Rust replacement

- **Candidate crate(s):** `pulldown-cmark` (CommonMark + GFM-Extensions), `comrak`
- **Maintenance / license:** beide aktiv, MIT
- **Known gotchas / divergences:** `marked` implementiert eine **eigene** Markdown-Interpretation, die mit CommonMark nicht identisch ist: Listen-Loose/Tight-Detection anders, Tabellen-Parsing anders, HTML-Inline-Handling anders. `comrak` ist am nächsten an `marked`/GFM, aber immer noch Byte-Diffs auf reale Inputs

## BACKLOG check

BACKLOG: *Parity too expensive* — bestätigt. Zusatz-Empfehlung: kein `marked`-Port, aber Evaluierung eines **eigenständigen** `@amigo-labs/commonmark` (spec-strict, kein Drop-in-Versprechen) könnte separat sinnvoll sein.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | 100 KB Markdown → ~5 ms in JS (`marked`), `pulldown-cmark` ~500 µs → 10× Potenzial |
| Input size distribution | Typisch ≥1 KB; `Buffer`-input möglich |
| Output size distribution | HTML-String ~1.5× Input; Output-Kosten 0.35 ns/Byte FFI, tolerabel |
| Reusable setup (stateful potential) | Niedrig — Renderer-Config klein |
| Batch-usage realism | Batch-Rendering (Site-Build) sehr realistisch |
| FFI-share estimate vs. Rust work | Niedrig bei ≥10 KB; FFI dominiert nur bei winzigen Inputs |

## Classification reasoning

Post-Mortem-Shape matcht `sanitize-html`/`inflate`: bytes-in / bytes-out, kein Object-Traversal. Das ist **der** Green-Shape. Der einzige Blocker ist Parity. Snapshot-Tests von Docusaurus, GitHub-API-Renderer, Stack-Overflow-ähnlichen Editoren hängen an exakten Byte-Diffs — und `marked` hat Quirks (z. B. `> quote\nparagraph` wird anders interpretiert als CommonMark vorschreibt). Ein `marked`-kompatibles Paket würde die Abweichungen händisch nachbauen müssen, was die 10×-Win schnell auffrisst. Alternative: ehrlich als CommonMark-Paket positionieren, Nutzer migrieren bewusst. Das ist eine Produktfrage, nicht eine Perf-Frage.

## If NO-GO — BACKLOG entry

```markdown
- **marked** (~30M). `marked`'s GFM interpretation ≠ `pulldown-cmark`'s GFM. Perf-shape is clean (bytes-in/bytes-out, Green candidate), but parity to exact byte output is what users rely on. A `@amigo-labs/commonmark` as a *new* package (not a `marked` drop-in) would be worth re-evaluating separately.
```

Section in `BACKLOG.md`: **Parity too expensive** (mit Follow-up-Flag)
