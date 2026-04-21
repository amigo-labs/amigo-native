# Candidate review: `ajv`

> **Status:** NO-GO · **Predicted:** 🔴 Red · **Reviewed:** 2026-04-19

## Verdict

`ajv` is a codegen: a JSON schema is turned into specialized JS that V8 optimizes into perfectly monomorphic inlining paths. A Rust port would be an interpreter — architecturally inferior at exactly the metric `ajv` exists for.

## JS package

- **npm:** `ajv`
- **Downloads:** ~120M/week (total ecosystem incl. `ajv-formats`, `ajv-keywords` ~200M)
- **Exports / API surface:** `new Ajv(options)`, `compile(schema) → validate(data)`, `addKeyword`, `addFormat`, `addSchema`, async validation, `$ref` resolution, custom error reporter
- **Typical input:** JSON Schema Draft-07/2019-09/2020-12 (once) + validated JS objects (hot loop)
- **Typical output:** `boolean` + `validate.errors` array
- **Realistic median use-case:** API request body validation — one schema, 10K+ payloads/s, typically 1 KB per payload

## Rust replacement

- **Candidate crate(s):** `jsonschema` (Dmitry Dygalo), `boon`
- **Maintenance / license:** active, MIT
- **Known gotchas / divergences:** interpretation vs. codegen; no LLVM inlining for the specific schema. Custom keywords would have to be JS callbacks across the NAPI boundary — expensive. Error-format parity is non-trivial

## BACKLOG check

BACKLOG: *Parity too expensive* — confirmed, but the stronger reason today is *Architecturally inferior*: `ajv` generates specialized JS code per schema that V8 JITs perfectly.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | Very small per validation: a handful of property accesses on a known shape. `ajv` uses V8 hidden classes perfectly |
| Input size distribution | Typically <2 KB JSON, often <200 B. Right in the FFI trap zone |
| Output size distribution | `boolean` + optional error array (usually empty) |
| Reusable setup (stateful potential) | **High** — a compiled validator as a NAPI class would be the only sensible API shape |
| Batch-usage realism | High, but `ajv` is already called per-call in Express/Fastify |
| FFI-share estimate vs. Rust work | See `deep-equal`: JS object traversal via `get_named_property` = FFI per field. Dominates over the Rust work |

## Classification reasoning

The post-mortem shape is exactly `deep-equal`: small inputs, many property accesses per call, V8 JITs the JS equivalent down to machine-code level. `ajv`'s compile step is the decisive trick — the compiled JS is monomorphic, has no dispatch table, and V8 inlines the property lookups. A Rust interpreter would have to walk a match-dispatch table per keyword and at the same time fetch JS values per property across the FFI. That doesn't win at small payloads (FFI floor) and doesn't win at large ones (object traversal). Custom keywords as JS callbacks would be another 1000+ ns overhead per call.

## If NO-GO — BACKLOG entry

```markdown
- **ajv** / **json-schema** (ajv ~40M weekly). `ajv` is codegen-based; Rust `jsonschema` is a spec interpreter. Two different philosophies, not a port. Object-traversal FFI shape matches the `deep-equal` post-mortem.
```

Section in `BACKLOG.md`: **Parity too expensive**
