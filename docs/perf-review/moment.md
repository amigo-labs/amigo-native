# Candidate review: `moment`

> **Status:** NO-GO (don't touch) · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-21

## Verdict

`moment` has been **legacy** since 2020 (per upstream). The Moment maintainers explicitly recommend migrating to `date-fns`, `dayjs`, `luxon` or the native `Temporal` API. A port would mean:

1. Replicating a library the upstream recommends abandoning.
2. Sitting behind a growing user-migration trend (active for 5+ years).
3. Without a perf lever — the Moment alternatives (dayjs at 2 KB, date-fns tree-shakeable) are already small and fast.

## JS package

- **npm:** [`moment`](https://www.npmjs.com/package/moment)
- **Downloads:** ~15M/week (declining, but still high through legacy codebases)
- **Status:** Upstream "in maintenance mode" since September 2020. No new features, only bug fixes. [Official migration guide](https://momentjs.com/docs/#/-project-status/).

## Rust replacement

- **Candidate crate(s):** `chrono`, `time`, `jiff` — all considerably more maintainable than a Moment-parity port would be. If we ever wanted native date handling: a direct `@amigo-labs/datetime` port via `jiff` would be its own candidate, but **not** with Moment-API parity.
- **Maintenance / license:** All MIT, active.

## BACKLOG check

Entry in `BACKLOG.md` → "Deprecated / superseded": "Don't touch." Review confirms.

## Classification reasoning

1. **Upstream deprecated.** The Moment maintainers recommend alternatives. A Rust clone would inherit the deprecation.
2. **API baggage.** Moment's mutable API (`m.add(1, 'day')` mutates) is the original reason for the community switch. Parity = replicating a bad API.
3. **Zero portfolio value.** Any project that consciously modernises picks date-fns / dayjs / Temporal over Moment.

## If NO-GO — BACKLOG entry

Archived 2026-04-21. Full review: `docs/perf-review/moment.md`. If date handling becomes a portfolio topic: separate review for `@amigo-labs/datetime` based on `jiff`, no Moment port.
