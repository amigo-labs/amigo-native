# Candidate review: `har-validator`

> **Status:** NO-GO (don't touch) · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-21

## Verdict

`har-validator` validiert HAR (HTTP Archive)-Dateien gegen JSON-Schema. Das Paket ist **seit 2020 deprecated** (Maintainer hat es explicit markiert). Der letzte meaningful Release war 2019. Es wurde nur noch transitiv durch `request` (selbst deprecated) gepullt. Mit `request` weg ist `har-validator` effektiv orphan. Außerdem: JSON-Schema-Validation ist in der `ajv`-Kategorie (→ `docs/perf-review/ajv.md`, Parity too expensive — codegen-vs-interpreter unterschiedliche Philosophien). Doppelt-Black.

## JS package

- **npm:** [`har-validator`](https://www.npmjs.com/package/har-validator)
- **Downloads:** ~5M/Woche (reine Legacy-Transitive, sinkt stetig)
- **Status:** Deprecated, unmaintained. [GitHub-Status](https://github.com/ahmadnassri/node-har-validator).

## Rust replacement

Nicht zutreffend. HAR ist ein Nischen-Format; Schema-Validation ist `ajv`-Shape, bereits NO-GO.

## BACKLOG check

Eintrag in `BACKLOG.md` → "Deprecated / superseded": "Don't touch." Review bestätigt.

## Classification reasoning

1. **Upstream deprecated seit Jahren.** Kein Port-Case.
2. **Orphan durch `request`-Deprecation.** Hauptgrund der Adoption war transitiv über `request`; mit `request` formal deprecated fällt har-validator mit.
3. **Schema-Validation-Shape-Kategorie ist bereits NO-GO** (`ajv.md`). Selbst wenn jemand das rettet, haben wir den Shape-Kill bereits dokumentiert.

## If NO-GO — BACKLOG entry

Archiviert 2026-04-21. Full review: `docs/perf-review/har-validator.md`.
