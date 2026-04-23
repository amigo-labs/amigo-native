# Candidate review: `handlebars`

> **Status:** NO-GO · **Predicted:** 🔴 Red · **Reviewed:** 2026-04-19

## Verdict

Helper callbacks are the normal case with Handlebars — every helper is a JS function call. An FFI roundtrip per helper call (Rust → V8 → Rust) eliminates any parse/render win, and `handlebars-rust` has documented divergences from the JS original.

## JS package

- **npm:** `handlebars`
- **Downloads:** ~35M/week
- **Exports / API surface:** `Handlebars.compile(template) → (data) => string`, `registerHelper(name, fn)`, `registerPartial`, `SafeString`, precompilation (`handlebars` CLI)
- **Typical input:** template string (compiled once) + context object per render
- **Typical output:** HTML string
- **Realistic median use-case:** email/HTML template rendering with ~5–20 helpers, render output 1–50 KB

## Rust replacement

- **Candidate crate(s):** `handlebars-rust`
- **Maintenance / license:** active, MIT
- **Known gotchas / divergences:** [documented](https://docs.rs/handlebars/latest/handlebars/#differences-with-javascript-version) — including helper signatures, `{{lookup}}` semantics, whitespace-control edge cases, no JS-expression eval inside `{{#if …}}`

## BACKLOG check

BACKLOG: *Parity too expensive* — confirmed. The FFI-callback angle makes the classification even harder than what's noted there.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | Template render is linear in output size. 10 KB output → ~100 µs in JS (V8 JIT on the compiled template) |
| Input size distribution | Context object arbitrarily complex; template AST held in Rust state |
| Output size distribution | String 1–50 KB; FFI output cost ~0.35 ns/byte per BASELINE |
| Reusable setup (stateful potential) | **High** — compiled template as a NAPI class would be the only option |
| Batch-usage realism | Variable: email sending batched, web rendering not |
| FFI-share estimate vs. Rust work | **Callbacks dominate**: every `{{myHelper arg}}` needs Rust → JS → Rust (~2 µs overhead per helper call) |

## Classification reasoning

A real Handlebars template has 5–20 helper calls per render. Every `{{helper}}` has to propagate the JS context back into V8, call the helper, and marshal the result back to Rust. At 10 helpers × 2 µs = 20 µs of pure FFI cost, while a JS baseline render is 100 µs. Rust parse time of the template expressions themselves is irrelevant if the bottleneck is the callbacks. On top of that: `handlebars-rust` deviates from the JS behavior in documented ways — the parity gap would be noticeable in existing users' tests. Exactly the `ejs`/`handlebars` shape: template engines with embedded logic belong in a JS engine.

## If NO-GO — BACKLOG entry

```markdown
- **handlebars** (35M). `handlebars-rust` ships with documented divergences; helper callbacks across the FFI boundary would be expensive (~2µs per helper call). Real templates use 5–20 helpers per render — the callback cost alone erases any parse/render gain.
```

Section in `BACKLOG.md`: **Parity too expensive**
