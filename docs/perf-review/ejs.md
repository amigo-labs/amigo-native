# Candidate review: `ejs`

> **Status:** NO-GO (permanent) · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-19

## Verdict

`ejs` ist "JavaScript in Templates": `<% if (user.admin) { %>…<% } %>` — Template-Code ist echter JS-Code, zur Render-Zeit ausgeführt. Ohne eingebettete JS-Engine (QuickJS/Boa) nicht portierbar, und die Engine-Integration würde den Win sofort vernichten.

## JS package

- **npm:** `ejs`
- **Downloads:** ~39M/Woche
- **Exports / API surface:** `render(template, data, opts)`, `compile`, `renderFile`, `Template`-Class, Custom-Delimiters, Includes
- **Typical input:** Template-String mit eingebettetem JS + Data-Object
- **Typical output:** HTML-String
- **Realistic median use-case:** Express-View-Rendering, 10–50 KB HTML-Output

## Rust replacement

- **Candidate crate(s):** keine, die JS-Expressions ausführen. `tera`, `askama`, `minijinja` haben eigene DSL, nicht JS
- **Maintenance / license:** n/a
- **Known gotchas / divergences:** ejs-Syntax ist nicht adaptierbar — Jede non-trivial Template nutzt `<%= someJsFunction() %>` oder `<% items.forEach(…) %>`

## BACKLOG check

BACKLOG: *Needs a JS engine* — bestätigt, Black-Klassifikation (nicht nur NO-GO — strukturell unmöglich).

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | Template-Compile ist trivial; **alle** Kosten liegen im JS-Expression-Eval zur Render-Zeit |
| Input size distribution | Template 1–10 KB |
| Output size distribution | HTML 10–100 KB |
| Reusable setup (stateful potential) | Compiled Template Object — aber ohne JS-Eval wertlos |
| Batch-usage realism | n/a |
| FFI-share estimate vs. Rust work | 100% — entweder QuickJS embedden (massiver Bundle-Bloat, ~1 MB+, eigene GC) oder Callbacks pro Expression nach V8 zurück (`handlebars`-Shape × 100) |

## Classification reasoning

Zwei strukturell tödliche Optionen:
1. **Callbacks für jede `<%= … %>`**: Wenn Rust parst und V8 eval'd, muss Rust für jeden Expression-Block einen Callback in JS auslösen. Bei 50 `<%= foo %>` in einem Template = 50 × 2 µs FFI = 100 µs zusätzlich, während JS-Baseline vielleicht 300 µs braucht. 33% Overhead minimum, vor jedem Rust-Work.
2. **Embed QuickJS/Boa in Rust**: Ein zweiter JS-Interpreter neben V8. QuickJS ist ~500 KB Bundle, Boa ist reiner Interpreter (kein JIT), beide 5–20× langsamer als V8 für typischen JS-Code. Der "Rust-Gewinn" wäre also: "langsamere JS-Engine statt V8". Keine reale Nutzerbase würde das akzeptieren.

Permanent Black.

## If NO-GO — BACKLOG entry

```markdown
- **ejs** (39M). Executes embedded JS code at render time — not feasible without a QuickJS-style integration, which would either embed a slower JS engine or callback per expression (100+ FFI crossings per render). Structurally impossible. Permanent NO-GO.
```

Section in `BACKLOG.md`: **Needs a JS engine**
