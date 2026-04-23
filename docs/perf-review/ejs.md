# Candidate review: `ejs`

> **Status:** NO-GO (permanent) · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-19

## Verdict

`ejs` is "JavaScript in templates": `<% if (user.admin) { %>…<% } %>` — template code is real JS code, executed at render time. Not portable without an embedded JS engine (QuickJS/Boa), and the engine integration would immediately wipe out the win.

## JS package

- **npm:** `ejs`
- **Downloads:** ~39M/week
- **Exports / API surface:** `render(template, data, opts)`, `compile`, `renderFile`, `Template` class, custom delimiters, includes
- **Typical input:** template string with embedded JS + data object
- **Typical output:** HTML string
- **Realistic median use-case:** Express view rendering, 10–50 KB HTML output

## Rust replacement

- **Candidate crate(s):** none that execute JS expressions. `tera`, `askama`, `minijinja` have their own DSL, not JS
- **Maintenance / license:** n/a
- **Known gotchas / divergences:** ejs syntax is not adaptable — every non-trivial template uses `<%= someJsFunction() %>` or `<% items.forEach(…) %>`

## BACKLOG check

BACKLOG: *Needs a JS engine* — confirmed, Black classification (not just NO-GO — structurally impossible).

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | Template compile is trivial; **all** cost is in JS expression eval at render time |
| Input size distribution | Template 1–10 KB |
| Output size distribution | HTML 10–100 KB |
| Reusable setup (stateful potential) | Compiled template object — but worthless without JS eval |
| Batch-usage realism | n/a |
| FFI-share estimate vs. Rust work | 100% — either embed QuickJS (massive bundle bloat, ~1 MB+, its own GC) or callbacks per expression back to V8 (`handlebars` shape × 100) |

## Classification reasoning

Two structurally fatal options:
1. **Callbacks for every `<%= … %>`**: if Rust parses and V8 evals, Rust has to fire a callback into JS for every expression block. At 50 `<%= foo %>` in a template = 50 × 2 µs FFI = 100 µs extra, while the JS baseline maybe needs 300 µs. 33% overhead minimum, before any Rust work.
2. **Embed QuickJS/Boa in Rust**: a second JS interpreter alongside V8. QuickJS is ~500 KB bundle, Boa is a pure interpreter (no JIT), both 5–20× slower than V8 for typical JS code. So the "Rust win" would be: "a slower JS engine instead of V8". No real user base would accept that.

Permanent Black.

## If NO-GO — BACKLOG entry

```markdown
- **ejs** (39M). Executes embedded JS code at render time — not feasible without a QuickJS-style integration, which would either embed a slower JS engine or callback per expression (100+ FFI crossings per render). Structurally impossible. Permanent NO-GO.
```

Section in `BACKLOG.md`: **Needs a JS engine**
