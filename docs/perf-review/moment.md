# Candidate review: `moment`

> **Status:** NO-GO (don't touch) · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-21

## Verdict

`moment` ist seit 2020 **legacy** (upstream erklärt). Die Moment-Maintainer empfehlen explizit die Migration zu `date-fns`, `dayjs`, `luxon` oder dem nativen `Temporal`-API. Ein Port wäre:

1. Replicating a library the upstream recommends abandoning
2. Hinter einer wachsenden User-Migration-Bewegung (seit 5+ Jahren aktiv)
3. Ohne Perf-Hebel — die Moment-Alternativen (dayjs 2 KB, date-fns tree-shakeable) sind bereits klein und schnell.

## JS package

- **npm:** [`moment`](https://www.npmjs.com/package/moment)
- **Downloads:** ~15M/Woche (sinkend, aber noch hoch durch Legacy-Codebases)
- **Status:** Upstream "in maintenance mode" seit September 2020. Keine neuen Features, nur Bug-Fixes. [Offizieller Migration-Guide](https://momentjs.com/docs/#/-project-status/).

## Rust replacement

- **Candidate crate(s):** `chrono`, `time`, `jiff` — alle deutlich besser pflegbar als ein moment-parity-Port wäre. Würde man Date-Handling nativ brauchen: direkter `@amigo-labs/datetime`-Port via `jiff` wäre eigener Kandidat, aber **nicht** mit Moment-API-Parity.
- **Maintenance / license:** Alle MIT, aktiv.

## BACKLOG check

Eintrag in `BACKLOG.md` → "Deprecated / superseded": "Don't touch." Review bestätigt.

## Classification reasoning

1. **Upstream deprecated.** Moment-Maintainer empfehlen Alternativen. Ein Rust-Clone würde deprecation hinter sich her schleppen.
2. **API-Baggage.** Moment's mutable-API (`m.add(1, 'day')` mutiert) ist der Grund für den ursprünglichen Community-Wechsel. Parity = Replication of bad API.
3. **Zero Portfolio-Wert.** Jedes Projekt, das sich bewusst modernisiert, wählt date-fns/dayjs/Temporal über Moment.

## If NO-GO — BACKLOG entry

Archiviert 2026-04-21. Full review: `docs/perf-review/moment.md`. Wenn Date-Handling als Portfolio-Thema aufkommt: separates Review für `@amigo-labs/datetime` basierend auf `jiff`, kein Moment-Port.
