# Candidate review: `mime-types`

> **Status:** NO-GO · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-19

## Verdict

Strukturell identisch zu `mime`: Hashmap-Lookup. Gleicher Black-Shape, gleiches Urteil. `mime-types` wickelt zusätzlich die `mime-db`-Daten, aber am Hot-Path ändert das nichts.

## JS package

- **npm:** `mime-types`
- **Downloads:** ~180M/Woche
- **Exports / API surface:** `lookup(path)`, `contentType(type)`, `extension(type)`, `charset(type)`, `types`, `extensions`
- **Typical input:** Dateipfad/Extension/MIME, <100 B
- **Typical output:** String oder `false`
- **Realistic median use-case:** Express/Fastify/Koa-Middleware bestimmt Response-Content-Type

## Rust replacement

- **Candidate crate(s):** `mime_guess` (liest dieselbe `mime-db`-Datenbank zur Build-Zeit), `new_mime_guess`
- **Maintenance / license:** aktiv, MIT
- **Known gotchas / divergences:** `mime_guess` embedded die DB statisch — identische Lookups, keine `addType`-API

## BACKLOG check

BACKLOG: *FFI overhead > gain* (kombiniert mit `mime`) — bestätigt.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | ~30–60 ns in JS |
| Input size distribution | <100 B |
| Output size distribution | <50 B |
| Reusable setup (stateful potential) | Null |
| Batch-usage realism | Niedrig — per-Request-Call |
| FFI-share estimate vs. Rust work | >90% FFI |

## Classification reasoning

Siehe `mime.md` — gleiche Argumentation. Kleiner Unterschied: `mime-types.charset()` ist ein zweiter Lookup-Schritt, immer noch im Nanosekunden-Bereich. Rust hat keinen Hebel, weder Algorithmus- noch Datenstruktur-seitig (V8 inlined statische Maps). Black.

## If NO-GO — BACKLOG entry

Konsolidiert mit `mime` unter einem Eintrag:

```markdown
- **mime** / **mime-types** (combined 343M). Pure hashmap lookups — see `mime`.
```

Section in `BACKLOG.md`: **FFI overhead > gain**
