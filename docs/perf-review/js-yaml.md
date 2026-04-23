# Candidate review: `js-yaml`

> **Status:** NO-GO (drop-in) · **Predicted:** 🟡 Yellow · **Reviewed:** 2026-04-19

## Verdict

Perf would probably be Yellow/Green, but `js-yaml` is effectively a YAML-1.1 parser with ten years of Ruby-Psych compat ballast — a drop-in with `saphyr` (YAML 1.2 strict) isn't a compat replacement, it's a different package.

## JS package

- **npm:** `js-yaml`
- **Downloads:** ~156M/week
- **Exports / API surface:** `load`, `loadAll`, `dump`, custom-types system (`Type`, `Schema`, `DEFAULT_SCHEMA`, `CORE_SCHEMA`, `FAILSAFE_SCHEMA`), error classes
- **Typical input:** UTF-8 YAML document, 100 B – 100 KB (CI configs, k8s manifests)
- **Typical output:** arbitrary JS graph (objects/arrays/primitives)
- **Realistic median use-case:** parse a config file once at tool startup; rarely a hot loop

## Rust replacement

- **Candidate crate(s):** `saphyr` (YAML 1.2 strict), `serde_yaml` (deprecated), `yaml-rust2` (successor)
- **Maintenance / license:** `saphyr` active, MIT/Apache; `serde_yaml` archived (2024)
- **Known gotchas / divergences:** YAML 1.1 vs. 1.2 (boolean `yes`/`no`, sexagesimal, octal notation), custom tags (`!!js/regexp`, `!!js/function`), anchor-aliasing semantics, merge keys (`<<:`), error positions for toolchains

## BACKLOG check

Current BACKLOG classification: *Parity too expensive* — confirmed 1:1. The decision stands.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | Substantial from ~10 KB; at 1 KB config vs. `js-yaml`'s V8 JIT only ~1.5× conceivable |
| Input size distribution | Bytes-in, `Buffer` overload possible → FFI cost negligible at the median |
| Output size distribution | Object-graph materialization over NAPI is expensive (`JsObject::set_named_property` per field is an FFI crossing) |
| Reusable setup (stateful potential) | No schema cache needed — the loader is stateless |
| Batch-usage realism | Usually not batched (one config per process start) |
| FFI-share estimate vs. Rust work | Output materialization dominates, see `deep-equal` post-mortem |

## Classification reasoning

Perf side alone would be Yellow: large YAMLs (k8s manifests, CI matrices) scale well, but the median case is ≤1 KB and V8+`js-yaml` handles that in ~50 µs — just above the FFI floor. The decisive killer is parity: `js-yaml` emulates **YAML 1.1** (default schema), accepts Ruby-Psych custom tags, and produces very specific error types/positions that tools like ESLint, Docusaurus, Webpack test against. `saphyr` is strict 1.2. That isn't a drop-in — it's a different package with the same users.

## If NO-GO — BACKLOG entry

```markdown
- **js-yaml** (156M downloads). Spec-compliant YAML parity via `saphyr` is realistic, but `js-yaml` has years of legacy custom tags and Ruby Psych compat quirks. Could ship as a "CommonMark-YAML" alternative — not as a drop-in.
```

Section in `BACKLOG.md`: **Parity too expensive**
