# Candidate review: `handlebars`

> **Status:** NO-GO · **Predicted:** 🔴 Red · **Reviewed:** 2026-04-19

## Verdict

Helper-Callbacks sind der Normalfall bei Handlebars — jeder Helper ist ein JS-Funktionsaufruf. FFI-Roundtrip pro Helper-Call (Rust → V8 → Rust) eliminiert jeden Parse/Render-Gewinn, und `handlebars-rust` hat dokumentierte Abweichungen zum JS-Original.

## JS package

- **npm:** `handlebars`
- **Downloads:** ~35M/Woche
- **Exports / API surface:** `Handlebars.compile(template) → (data) => string`, `registerHelper(name, fn)`, `registerPartial`, `SafeString`, Precompilation (`handlebars` CLI)
- **Typical input:** Template-String (einmalig kompiliert) + Context-Object pro Render
- **Typical output:** HTML-String
- **Realistic median use-case:** E-Mail-/HTML-Template-Rendering mit ~5–20 Helpers, Render-Output 1–50 KB

## Rust replacement

- **Candidate crate(s):** `handlebars-rust`
- **Maintenance / license:** aktiv, MIT
- **Known gotchas / divergences:** [dokumentiert](https://docs.rs/handlebars/latest/handlebars/#differences-with-javascript-version) — u.a. Helper-Signaturen, `{{lookup}}`-Semantik, Whitespace-Control-Edge-Cases, kein JS-Expressions-Eval innerhalb `{{#if …}}`

## BACKLOG check

BACKLOG: *Parity too expensive* — bestätigt. Der FFI-Callback-Winkel macht die Klassifikation sogar härter als dort notiert.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | Template-Render ist linear zur Output-Größe. 10 KB Output → ~100 µs in JS (V8-JIT auf kompiliertem Template) |
| Input size distribution | Context-Object beliebig komplex; Template-AST im Rust-State gehalten |
| Output size distribution | String 1–50 KB; FFI-Output-Kosten ~0.35 ns/Byte laut BASELINE |
| Reusable setup (stateful potential) | **Hoch** — compiled Template als NAPI-Class wäre die einzige Option |
| Batch-usage realism | Variable: E-Mail-Versand batched, Web-Rendering nicht |
| FFI-share estimate vs. Rust work | **Callbacks dominieren**: jeder `{{myHelper arg}}` braucht Rust → JS → Rust (~2 µs Overhead pro Helper-Call) |

## Classification reasoning

Reales Handlebars-Template hat 5–20 Helper-Aufrufe pro Render. Jeder `{{helper}}` muss JS-Kontext zurück ins V8 propagieren, den Helper callen, das Ergebnis zurück nach Rust marshallen. Bei 10 Helpers à 2 µs = 20 µs reine FFI-Kosten, während der JS-Baseline-Render 100 µs ist. Rust-Parse-Zeit der Template-Ausdrücke selbst ist irrelevant, wenn der Bottleneck die Callbacks sind. Dazu: `handlebars-rust` weicht dokumentiert vom JS-Verhalten ab — die Parity-Lücke wäre spürbar in Tests existierender Nutzer. Genau der `ejs`/`handlebars`-Shape: Template-Engines mit eingebetteter Logik gehören in eine JS-Engine.

## If NO-GO — BACKLOG entry

```markdown
- **handlebars** (35M). `handlebars-rust` ships with documented divergences; helper callbacks across the FFI boundary would be expensive (~2µs per helper call). Real templates use 5–20 helpers per render — the callback cost alone erases any parse/render gain.
```

Section in `BACKLOG.md`: **Parity too expensive**
