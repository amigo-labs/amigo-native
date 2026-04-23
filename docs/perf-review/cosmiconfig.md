# Candidate review: `cosmiconfig`

> **Status:** NO-GO · **Predicted:** 🔴 Red · **Reviewed:** 2026-04-19

## Verdict

`cosmiconfig` is fs traversal: search for `.fooconfig.js`, `.fooconfig.json`, `foo.config.ts`, `package.json#foo` up the filesystem until found. The bottleneck is `fs.stat`/`fs.readFile`, not CPU. NAPI would add an extra crossing between Rust and Node's fs.

## JS package

- **npm:** `cosmiconfig`
- **Downloads:** ~143M/week
- **Exports / API surface:** `cosmiconfig(moduleName, options)` → `{ search(from), load(filepath), clearCaches() }`, async + sync
- **Typical input:** start directory, searched up to the home directory
- **Typical output:** `{ config, filepath }` or `null`
- **Realistic median use-case:** tool startup (ESLint, Prettier, Stylelint) searching for a config file — once per run

## Rust replacement

- **Candidate crate(s):** no direct replacement. `figment`, `config-rs` follow a different philosophy (explicit sources)
- **Maintenance / license:** n/a
- **Known gotchas / divergences:** `cosmiconfig` loads `.ts`/`.mjs`/`.cjs` configs through Node's require hook — that has to be done by JS, not Rust

## BACKLOG check

BACKLOG: *FFI overhead > gain* — confirmed. Classification: I/O-bound, not CPU-bound.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | Minimal — path-string manipulation + fs calls |
| Input size distribution | Paths, small |
| Output size distribution | Config object (JSON-parsed) |
| Reusable setup (stateful potential) | Cache for search results — already implemented in JS |
| Batch-usage realism | Zero |
| FFI-share estimate vs. Rust work | Rust would have to do fs via `std::fs` or `tokio::fs` — its own I/O implementation parallel to libuv, no gain |

## Classification reasoning

`cosmiconfig` spends 99% of its time in `fs.stat` (does the file exist?) and `fs.readFile`. These syscalls go through the OS kernel anyway — whether called from Rust or JS doesn't matter, but the switch Rust→JS or Rust `std::fs`→kernel saves nothing. On top of that: `cosmiconfig`'s killer feature — loading `.ts`/`.mjs` configs — is pure Node semantics (`require`/dynamic-import hook). Rust cannot execute `.ts`. A Rust `cosmiconfig` would therefore necessarily be a subset, and that breaks drop-in parity.

## If NO-GO — BACKLOG entry

```markdown
- **cosmiconfig** (143M). Mostly filesystem I/O, not CPU; plus `.ts`/`.mjs` config loading requires Node's module system, which Rust can't provide. Any Rust port would be a non-drop-in subset with no perf win.
```

Section in `BACKLOG.md`: **FFI overhead > gain**
