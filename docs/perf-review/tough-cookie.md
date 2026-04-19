# Candidate review: `tough-cookie`

> **Status:** NO-GO · **Predicted:** 🟡 Yellow (Perf) / 🔴 Red (Scope) · **Reviewed:** 2026-04-19

## Verdict

Cookie-Parsing ist string-lastig und kurz — FFI-Trap-Shape für den Parse-Pfad. Der eigentliche Aufwand ist Cookie-Jar-State + Public Suffix List + IDN + RFC-6265-bis-Kompat; das ist ein Monatsprojekt für einen Yellow-Win.

## JS package

- **npm:** `tough-cookie`
- **Downloads:** ~157M/Woche
- **Exports / API surface:** `Cookie`, `CookieJar`, `Store`, `MemoryCookieStore`, `parseDate`, `canonicalDomain`, `permuteDomain`, `getPublicSuffix`
- **Typical input:** `Set-Cookie`-Header (~100–300 B) + Request-URL
- **Typical output:** `Cookie`-Instanz oder Cookie-Liste bei Jar-Retrieval
- **Realistic median use-case:** HTTP-Client speichert Cookie pro Response (eine Handvoll pro Request), liest sie pro Request; State-heavy, nicht Hot-Loop

## Rust replacement

- **Candidate crate(s):** `cookie` (parse/format), `publicsuffix` (PSL), `idna` (IDN). Kein direkter `tough-cookie`-Äquivalent als ein Crate
- **Maintenance / license:** alle aktiv, MIT
- **Known gotchas / divergences:** `tough-cookie` implementiert RFC 6265 + 6265-bis + WHATWG-Quirks (z.B. `same-site` eval, prefix-rules `__Host-`/`__Secure-`, `expires` Datumsformat-Heuristiken); Browser-Kompat-Tests sind umfangreich

## BACKLOG check

BACKLOG: *Parity too expensive* — bestätigt. Seit der letzten Sichtung keine Änderung am Parity-Horizont.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | Parse eines Cookie-Headers: ~500 ns – 2 µs in JS. FFI-Floor 109 ns = 5–20% Grundlast |
| Input size distribution | 50–500 B Strings, direkt im FFI-Trap-Bereich |
| Output size distribution | Einzelnes Cookie-Objekt mit ~10 Feldern — Object-Materialisierung über NAPI ist teuer |
| Reusable setup (stateful potential) | PSL + Jar als NAPI-Class sinnvoll — aber JS `Jar` ist schon ein Objekt, der Win ist marginal |
| Batch-usage realism | Niedrig (3–5 Cookies pro Request) |
| FFI-share estimate vs. Rust work | Hoch — pro-Cookie FFI + Object-Output-Kosten essen Rust-Gain |

## Classification reasoning

Selbst wenn der Rust-Parser 3× schneller wäre als `tough-cookie`, landet der Realworld-Call bei ~700 ns (FFI + Object-Materialisierung) vs. `tough-cookie` ~1.5 µs → 2× Win. Aber: PSL-Integration, IDN-Handling, `canonicalDomain`-Edge-Cases, Browser-Kompat-Suite = Wochen an Engineering. Und der Win verpufft, weil HTTP-Clients keine 100k Cookies/s parsen — sie parsen ~3 pro Request und warten dann auf Netzwerk. Die Perf-Rendite ist strukturell niedrig.

## If NO-GO — BACKLOG entry

```markdown
- **tough-cookie** (157M). Browser-compat quirks + Public Suffix List + cookie-jar state. Easily a month-long project. Cookie parsing sits in FFI-trap range (short strings, small output objects) and HTTP clients don't parse cookies in hot loops — the win doesn't exist where it matters.
```

Section in `BACKLOG.md`: **Parity too expensive**
