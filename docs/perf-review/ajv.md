# Candidate review: `ajv`

> **Status:** NO-GO · **Predicted:** 🔴 Red · **Reviewed:** 2026-04-19

## Verdict

`ajv` ist ein Codegen: aus einem JSON-Schema wird spezialisiertes JS, das V8 in perfekt monomorphe Inlining-Pfade optimiert. Ein Rust-Port wäre ein Interpreter — architektonisch unterlegen bei genau dem Metrik, für die `ajv` existiert.

## JS package

- **npm:** `ajv`
- **Downloads:** ~120M/Woche (Gesamt-Ökosystem inkl. `ajv-formats`, `ajv-keywords` ~200M)
- **Exports / API surface:** `new Ajv(options)`, `compile(schema) → validate(data)`, `addKeyword`, `addFormat`, `addSchema`, async-Validation, `$ref`-Auflösung, Custom-Error-Reporter
- **Typical input:** JSON-Schema-Draft-07/2019-09/2020-12 (einmalig) + validierte JS-Objekte (hot loop)
- **Typical output:** `boolean` + `validate.errors` Array
- **Realistic median use-case:** API-Request-Body-Validation — ein Schema, 10K+ Payloads/s, typisch 1 KB pro Payload

## Rust replacement

- **Candidate crate(s):** `jsonschema` (Dmitry Dygalo), `boon`
- **Maintenance / license:** aktiv, MIT
- **Known gotchas / divergences:** Interpretation vs. Codegen; kein Inlining durch LLVM für das spezifische Schema. Custom-Keywords müssten als JS-Callbacks über NAPI-Boundary — teuer. Error-Format parity ist nicht-trivial

## BACKLOG check

BACKLOG: *Parity too expensive* — bestätigt, aber der härtere Grund ist heute *Architektonisch unterlegen*: `ajv` generiert pro Schema spezialisierten JS-Code, der V8 perfekt JITtet.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | Pro Validation sehr klein: ein paar Property-Zugriffe auf bekanntem Shape. `ajv` nutzt V8-Hidden-Classes perfekt |
| Input size distribution | Typisch <2 KB JSON, häufig <200 B. Direkt im FFI-Trap-Bereich |
| Output size distribution | `boolean` + optional Error-Array (meist leer) |
| Reusable setup (stateful potential) | **Hoch** — compiled Validator als NAPI-Class wäre der einzige sinnvolle API-Shape |
| Batch-usage realism | Hoch, aber `ajv` wird bereits per-call in Express/Fastify gerufen |
| FFI-share estimate vs. Rust work | Siehe `deep-equal`: JS-Objekt-Traversal über `get_named_property` = FFI pro Field. Dominiert gegenüber Rust-Arbeit |

## Classification reasoning

Der Post-Mortem-Shape ist exakt `deep-equal`: kleine Inputs, viele Property-Zugriffe pro Call, V8 JITtet das JS-Äquivalent auf Maschinencode-Niveau. `ajv`s compile-Schritt ist dabei der entscheidende Trick — das kompilierte JS ist monomorphisch, hat keine Dispatch-Tabelle, und V8 inlined Property-Lookups. Ein Rust-Interpreter müsste pro Keyword eine Match-Dispatch-Tabelle durchgehen und gleichzeitig JS-Werte pro Property über FFI abholen. Das gewinnt weder bei kleinen Payloads (FFI-Floor) noch bei großen (Object-Traversal). Custom Keywords als JS-Callbacks wären nochmal 1000+ns Overhead pro Aufruf.

## If NO-GO — BACKLOG entry

```markdown
- **ajv** / **json-schema** (ajv ~40M weekly). `ajv` is codegen-based; Rust `jsonschema` is a spec interpreter. Two different philosophies, not a port. Object-traversal FFI shape matches the `deep-equal` post-mortem.
```

Section in `BACKLOG.md`: **Parity too expensive**
