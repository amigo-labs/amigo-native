# Candidate review: `mime-types`

> **Status:** NO-GO · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-19

## Verdict

Structurally identical to `mime`: hashmap lookup. Same Black shape, same verdict. `mime-types` additionally wraps the `mime-db` data, but that doesn't change the hot path.

## JS package

- **npm:** `mime-types`
- **Downloads:** ~180M/week
- **Exports / API surface:** `lookup(path)`, `contentType(type)`, `extension(type)`, `charset(type)`, `types`, `extensions`
- **Typical input:** file path / extension / MIME, <100 B
- **Typical output:** string or `false`
- **Realistic median use-case:** Express/Fastify/Koa middleware determining response content type

## Rust replacement

- **Candidate crate(s):** `mime_guess` (reads the same `mime-db` database at build time), `new_mime_guess`
- **Maintenance / license:** active, MIT
- **Known gotchas / divergences:** `mime_guess` embeds the DB statically — identical lookups, no `addType` API

## BACKLOG check

BACKLOG: *FFI overhead > gain* (combined with `mime`) — confirmed.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | ~30–60 ns in JS |
| Input size distribution | <100 B |
| Output size distribution | <50 B |
| Reusable setup (stateful potential) | Zero |
| Batch-usage realism | Low — per-request call |
| FFI-share estimate vs. Rust work | >90% FFI |

## Classification reasoning

See `mime.md` — same reasoning. Small difference: `mime-types.charset()` is a second lookup step, still in the nanosecond range. Rust has no lever, neither algorithmic nor data-structure-side (V8 inlines static maps). Black.

## If NO-GO — BACKLOG entry

Consolidated with `mime` under one entry:

```markdown
- **mime** / **mime-types** (combined 343M). Pure hashmap lookups — see `mime`.
```

Section in `BACKLOG.md`: **FFI overhead > gain**
