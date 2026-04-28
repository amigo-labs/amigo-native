# Candidate review: `har-validator`

> **Status:** NO-GO (don't touch) · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-21

## Verdict

`har-validator` validates HAR (HTTP Archive) files against a JSON Schema. The package has been **deprecated since 2020** (the maintainer marked it explicitly). The last meaningful release was 2019. It has only been pulled in transitively by `request` (also deprecated). With `request` gone, `har-validator` is effectively orphaned. On top of that: JSON-Schema validation falls into the `ajv` category (→ `docs/perf-review/ajv.md`, parity too expensive — codegen-vs-interpreter philosophies don't reconcile). Doubly Black.

## JS package

- **npm:** [`har-validator`](https://www.npmjs.com/package/har-validator)
- **Downloads:** ~5M/week (pure legacy transitive, declining steadily)
- **Status:** Deprecated, unmaintained. [GitHub status](https://github.com/ahmadnassri/node-har-validator).

## Rust replacement

Not applicable. HAR is a niche format; schema validation is the `ajv` shape, already NO-GO.

## BACKLOG check

Entry in `BACKLOG.md` → "Deprecated / superseded": "Don't touch." Review confirms.

## Classification reasoning

1. **Upstream has been deprecated for years.** No port case.
2. **Orphaned by `request` deprecation.** The main reason for adoption was transitive pull-through `request`; with `request` formally deprecated, har-validator falls with it.
3. **Schema-validation shape category is already NO-GO** (`ajv.md`). Even if someone resurrected it, the shape kill is already documented.

## If NO-GO — BACKLOG entry

Archived 2026-04-21. Full review: `docs/perf-review/har-validator.md`.
