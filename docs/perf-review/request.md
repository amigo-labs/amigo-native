# Candidate review: `request`

> **Status:** NO-GO (don't touch) · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-21

## Verdict

`request` wurde Februar 2020 **formal deprecated** vom Maintainer. Das Paket ist seit 5+ Jahren nur noch wegen Legacy-Code auf npm. Plus: selbst ohne Deprecation wäre es HTTP-I/O, also `openai`/`anthropic-ai`-Kategorie (→ `docs/perf-review/openai.md`) — zero compute surface, pure network.

## JS package

- **npm:** [`request`](https://www.npmjs.com/package/request)
- **Downloads:** ~8M/Woche (sinkend, reines Legacy)
- **Status:** Formal deprecated Februar 2020. Maintainer: "The request module is going to be archived. There will be no more new releases."

## Rust replacement

- `reqwest` (Rust-HTTP-Client) existiert — aber der eigentliche Punkt ist: **kein HTTP-Client braucht einen Rust-Port**, weil Netzwerk-Latency um Größenordnungen über jedem Client-Code liegt. Siehe `docs/perf-review/openai.md`.

## BACKLOG check

Eintrag in `BACKLOG.md` → "Deprecated / superseded": "Don't touch." Review bestätigt.

## Classification reasoning

1. **Upstream deprecated seit 2020.** Null Argument für Clone.
2. **HTTP-I/O-Shape ist Black allgemein.** Siehe `openai.md`.
3. **Moderne Alternativen.** `undici` (Node built-in), `axios`, `got`, `ky`, `ofetch` — alle aktive JS-Alternativen. Keine Lücke.

## If NO-GO — BACKLOG entry

Archiviert 2026-04-21. Full review: `docs/perf-review/request.md`. Allgemeine HTTP-Client-Black-Shape dokumentiert in `docs/perf-review/openai.md`.
