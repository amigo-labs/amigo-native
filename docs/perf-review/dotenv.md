# Candidate review: `dotenv`

> **Status:** NO-GO · **Predicted:** 🔴 Red · **Reviewed:** 2026-04-19

## Verdict

Parser ist ~50 Zeilen JS, einmaliger Call beim Prozessstart. FFI-Floor > Parse-Zeit für typische `.env`-Dateien (<1 KB). Kein Batch, kein State, kein Win.

## JS package

- **npm:** `dotenv`
- **Downloads:** ~91M/Woche
- **Exports / API surface:** `config({ path, encoding, debug, override })`, `parse(src)`, `populate`
- **Typical input:** `.env`-Datei, typisch 10 Zeilen / 200 B, maximal ein paar KB
- **Typical output:** `{ parsed: { KEY: value, … } }`
- **Realistic median use-case:** **Einmal** beim Prozessstart — nicht in der Hot-Path

## Rust replacement

- **Candidate crate(s):** `dotenvy` (fork), `dotenv`
- **Maintenance / license:** `dotenvy` aktiv, MIT
- **Known gotchas / divergences:** Quoting-Semantik (`"foo\nbar"` vs. `'foo\nbar'`), Variable-Expansion (`$OTHER`), Multiline-Values (seit `dotenv@16`) — leichte Abweichungen möglich

## BACKLOG check

BACKLOG: *FFI overhead > gain* — bestätigt.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | 200 B Parse ~5 µs in JS (regex-ähnlich) |
| Input size distribution | Typisch <1 KB |
| Output size distribution | Kleines Object mit 5–30 Feldern — Object-Materialisierung ist hier der größte Posten |
| Reusable setup (stateful potential) | Null |
| Batch-usage realism | Null — `.env` wird einmal geladen |
| FFI-share estimate vs. Rust work | >80%: einmaliger Call bei Start, fs-Read dominiert ohnehin |

## Classification reasoning

Zwei Gründe, warum das selbst bei Rust-2×-Parse-Speedup nicht lohnt:
1. **Frequenz**: `dotenv.config()` wird einmal gerufen, vor allen Requests. Selbst 10× schneller = 50 µs statt 500 µs → irrelevant im Prozess-Startup-Budget.
2. **Output-Shape**: Object mit N Feldern via `get_named_property`/`set_named_property` = N FFI-Kreuzungen, dominiert die Rust-Arbeit (siehe `deep-equal`-Post-Mortem).

Keine Batch-API möglich (es gibt nur eine `.env`). Keine Stateful-API sinnvoll. Kein Hot-Path.

## If NO-GO — BACKLOG entry

```markdown
- **dotenv** (91M). Parser is ~50 lines of JS; called once at process start; output is a small object over FFI — the materialization cost alone dominates. No hot path to optimize into.
```

Section in `BACKLOG.md`: **FFI overhead > gain**
