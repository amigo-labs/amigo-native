# Candidate review: `mime`

> **Status:** NO-GO · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-19

## Verdict

Hashmap-Lookup. V8 macht das in <50 ns; FFI-Floor ist 109 ns. Strukturell nicht schlagbar — der Standard-FFI-Trap-Shape aus dem Post-Mortem-Katalog.

## JS package

- **npm:** `mime`
- **Downloads:** ~60M/Woche (zusammen mit `mime-types` ~343M)
- **Exports / API surface:** `getType(path)`, `getExtension(type)`, `define(types, force?)`
- **Typical input:** Dateipfad oder MIME-String, <100 B
- **Typical output:** MIME-String oder Extension-String
- **Realistic median use-case:** Static-File-Server bestimmt Content-Type pro Request

## Rust replacement

- **Candidate crate(s):** `mime_guess`, `mime`
- **Maintenance / license:** aktiv, MIT/Apache
- **Known gotchas / divergences:** keine — Lookup-Tabelle ist im Wesentlichen identisch

## BACKLOG check

BACKLOG: *FFI overhead > gain* — bestätigt, Klassifikation Black (nicht Red), weil keine Input-Größe rettet.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | ~20–50 ns (String-Hash + HashMap-Lookup) in JS |
| Input size distribution | Pfade <100 B |
| Output size distribution | <50 B MIME-String |
| Reusable setup (stateful potential) | Null — Hashmap ist statisch |
| Batch-usage realism | Möglich, aber selten — meist ein Call pro Request |
| FFI-share estimate vs. Rust work | **>90% FFI**: Floor 109 ns vs. JS 20–50 ns. Rust verliert im Grundzustand |

## Classification reasoning

Baseline-Messung beantwortet es direkt: `echoString` mit 10 B Input kostet bereits 234 ns. Der eigentliche Lookup würde nochmal ~50 ns addieren. Das sind ~280 ns pro Call. JS macht das in ~50 ns, weil V8 die Lookup-Tabelle als Hidden-Class monomorphisch inlined. Selbst ein batch-API (`getTypes(paths: string[])`) rettet nichts: der `sumArray`-Baseline zeigt ~43 ns/Element für Array-Marshalling, das ist noch immer langsamer als der JS-Direct-Lookup. Klassischer `nanoid`/`mime`-Shape aus den Post-Mortems.

## If NO-GO — BACKLOG entry

```markdown
- **mime** / **mime-types** (combined 343M). Pure hashmap lookups in JS (~50ns/call) vs. 109ns FFI floor — structurally slower through NAPI. Black-classification anti-shape. No batch API rescues it (~43ns/element for array marshalling exceeds JS lookup cost).
```

Section in `BACKLOG.md`: **FFI overhead > gain**
