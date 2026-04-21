# Candidate review: `dotenv`

> **Status:** NO-GO · **Predicted:** 🔴 Red · **Reviewed:** 2026-04-19

## Verdict

The parser is ~50 lines of JS, called once at process start. FFI floor > parse time for typical `.env` files (<1 KB). No batch, no state, no win.

## JS package

- **npm:** `dotenv`
- **Downloads:** ~91M/week
- **Exports / API surface:** `config({ path, encoding, debug, override })`, `parse(src)`, `populate`
- **Typical input:** `.env` file, typically 10 lines / 200 B, at most a few KB
- **Typical output:** `{ parsed: { KEY: value, … } }`
- **Realistic median use-case:** **once** at process start — not on the hot path

## Rust replacement

- **Candidate crate(s):** `dotenvy` (fork), `dotenv`
- **Maintenance / license:** `dotenvy` active, MIT
- **Known gotchas / divergences:** quoting semantics (`"foo\nbar"` vs. `'foo\nbar'`), variable expansion (`$OTHER`), multiline values (since `dotenv@16`) — minor deviations possible

## BACKLOG check

BACKLOG: *FFI overhead > gain* — confirmed.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | 200 B parse ~5 µs in JS (regex-like) |
| Input size distribution | Typically <1 KB |
| Output size distribution | Small object with 5–30 fields — object materialization is the largest item here |
| Reusable setup (stateful potential) | Zero |
| Batch-usage realism | Zero — `.env` is loaded once |
| FFI-share estimate vs. Rust work | >80%: one call at startup, fs read already dominates |

## Classification reasoning

Two reasons why, even at a 2× Rust parse speedup, this doesn't pay off:
1. **Frequency**: `dotenv.config()` is called once, before all requests. Even 10× faster = 50 µs instead of 500 µs → irrelevant in the process-startup budget.
2. **Output shape**: object with N fields via `get_named_property`/`set_named_property` = N FFI crossings, dominates the Rust work (see the `deep-equal` post-mortem).

No batch API possible (there is only one `.env`). No stateful API makes sense. No hot path.

## If NO-GO — BACKLOG entry

```markdown
- **dotenv** (91M). Parser is ~50 lines of JS; called once at process start; output is a small object over FFI — the materialization cost alone dominates. No hot path to optimize into.
```

Section in `BACKLOG.md`: **FFI overhead > gain**
