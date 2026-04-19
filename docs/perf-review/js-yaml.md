# Candidate review: `js-yaml`

> **Status:** NO-GO (drop-in) · **Predicted:** 🟡 Yellow · **Reviewed:** 2026-04-19

## Verdict

Perf wäre wahrscheinlich Yellow/Green, aber `js-yaml` ist de facto ein YAML-1.1-Parser mit zehn Jahren Ruby-Psych-Kompat-Ballast — ein drop-in mit `saphyr` (YAML 1.2 strict) ist keine Kompat-Ersetzung, sondern ein anderes Paket.

## JS package

- **npm:** `js-yaml`
- **Downloads:** ~156M/Woche
- **Exports / API surface:** `load`, `loadAll`, `dump`, Custom-Types-System (`Type`, `Schema`, `DEFAULT_SCHEMA`, `CORE_SCHEMA`, `FAILSAFE_SCHEMA`), Error-Klassen
- **Typical input:** UTF-8 YAML-Dokument, 100 B – 100 KB (CI-Configs, k8s-Manifeste)
- **Typical output:** Beliebiger JS-Graph (Objects/Arrays/Primitives)
- **Realistic median use-case:** einmalige Config-Datei beim Start eines Tools parsen; seltene Hot-Loops

## Rust replacement

- **Candidate crate(s):** `saphyr` (YAML 1.2 strict), `serde_yaml` (deprecated), `yaml-rust2` (Nachfolger)
- **Maintenance / license:** `saphyr` aktiv, MIT/Apache; `serde_yaml` archiviert (2024)
- **Known gotchas / divergences:** YAML 1.1 vs. 1.2 (boolsches `yes`/`no`, Sexagesimal, Okt-Notation), Custom-Tags (`!!js/regexp`, `!!js/function`), Anchor-Aliasing-Semantik, Merge-Keys (`<<:`), Fehler-Positionen für Toolchains

## BACKLOG check

Aktuelle BACKLOG-Einordnung: *Parity too expensive* — 1:1 bestätigt. Die Entscheidung steht.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | Substantiell ab ~10 KB; bei 1 KB Config vs. `js-yaml` V8-JIT nur ~1.5× denkbar |
| Input size distribution | Bytes-in, `Buffer`-overload möglich → FFI-Kosten vernachlässigbar bei Median |
| Output size distribution | Object-Graph-Materialisierung über NAPI ist teuer (`JsObject::set_named_property` pro Feld ist eine FFI-Kreuzung) |
| Reusable setup (stateful potential) | Kein Schema-Cache nötig — Loader ist zustandslos |
| Batch-usage realism | Typisch nicht gebatcht (eine Config pro Prozessstart) |
| FFI-share estimate vs. Rust work | Output-Materialisierung dominiert, siehe `deep-equal`-Post-Mortem |

## Classification reasoning

Perf-Seite alleine wäre Yellow: große YAMLs (k8s-Manifeste, CI-Matrizen) skalieren gut, aber der Median-Fall ist ≤1 KB und V8+`js-yaml` bewältigt das in ~50 µs — knapp über dem FFI-Floor. Entscheidender Killer ist Parity: `js-yaml` emuliert **YAML 1.1** (Default-Schema), akzeptiert Ruby-Psych-Custom-Tags und liefert extrem spezifische Fehlertypen/-positionen, gegen die Tools wie ESLint, Docusaurus, Webpack testen. `saphyr` ist strict 1.2. Das ist kein Drop-in — das ist ein anderes Paket mit denselben Nutzern.

## If NO-GO — BACKLOG entry

```markdown
- **js-yaml** (156M downloads). Spec-compliant YAML parity via `saphyr` is realistic, but `js-yaml` has years of legacy custom tags and Ruby Psych compat quirks. Could ship as a "CommonMark-YAML" alternative — not as a drop-in.
```

Section in `BACKLOG.md`: **Parity too expensive**
