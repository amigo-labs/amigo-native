# Candidate review: `request`

> **Status:** NO-GO (don't touch) · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-21

## Verdict

`request` was **formally deprecated** by the maintainer in February 2020. The package has been on npm purely for legacy code for 5+ years. On top of that: even without the deprecation it would still be HTTP I/O — i.e. the `openai`/`anthropic-ai` category (→ `docs/perf-review/openai.md`) — zero compute surface, pure network.

## JS package

- **npm:** [`request`](https://www.npmjs.com/package/request)
- **Downloads:** ~8M/week (declining, pure legacy)
- **Status:** Formally deprecated February 2020. Maintainer: "The request module is going to be archived. There will be no more new releases."

## Rust replacement

- `reqwest` (Rust HTTP client) exists — but the real point is: **no HTTP client needs a Rust port**, because network latency is orders of magnitude above any client-side code. See `docs/perf-review/openai.md`.

## BACKLOG check

Entry in `BACKLOG.md` → "Deprecated / superseded": "Don't touch." Review confirms.

## Classification reasoning

1. **Upstream deprecated since 2020.** Zero argument for cloning.
2. **HTTP-I/O shape is Black across the board.** See `openai.md`.
3. **Modern alternatives.** `undici` (Node built-in), `axios`, `got`, `ky`, `ofetch` — all active JS alternatives. No gap to fill.

## If NO-GO — BACKLOG entry

Archived 2026-04-21. Full review: `docs/perf-review/request.md`. The general HTTP-client Black shape is documented in `docs/perf-review/openai.md`.
