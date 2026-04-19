# Candidate review: `cosmiconfig`

> **Status:** NO-GO · **Predicted:** 🔴 Red · **Reviewed:** 2026-04-19

## Verdict

`cosmiconfig` ist fs-Traversal: suche `.fooconfig.js`, `.fooconfig.json`, `foo.config.ts`, `package.json#foo` hoch durchs Dateisystem, bis gefunden. Bottleneck ist `fs.stat`/`fs.readFile`, nicht CPU. NAPI würde zwischen Rust und Nodes fs eine zusätzliche Kreuzung einfügen.

## JS package

- **npm:** `cosmiconfig`
- **Downloads:** ~143M/Woche
- **Exports / API surface:** `cosmiconfig(moduleName, options)` → `{ search(from), load(filepath), clearCaches() }`, async + sync
- **Typical input:** Start-Directory, durchsucht bis zur Home-Directory
- **Typical output:** `{ config, filepath }` oder `null`
- **Realistic median use-case:** Tool-Start (ESLint, Prettier, Stylelint) sucht Config-Datei — einmal pro Lauf

## Rust replacement

- **Candidate crate(s):** kein direkter Ersatz. `figment`, `config-rs` sind andere Philosophie (explizite Sources)
- **Maintenance / license:** n/a
- **Known gotchas / divergences:** `cosmiconfig` lädt `.ts`/`.mjs`/`.cjs`-Configs durch Node-Require-Hook — das muss JS machen, nicht Rust

## BACKLOG check

BACKLOG: *FFI overhead > gain* — bestätigt. Klassifikation: I/O-bound, nicht CPU-bound.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | Minimal — Pfad-String-Manipulation + fs-Calls |
| Input size distribution | Pfade, klein |
| Output size distribution | Config-Object (JSON-parsed) |
| Reusable setup (stateful potential) | Cache für search-Ergebnisse — schon in JS implementiert |
| Batch-usage realism | Null |
| FFI-share estimate vs. Rust work | Rust müsste fs durch `std::fs` oder `tokio::fs` machen — eigene I/O-Implementierung parallel zu libuv, kein Gain |

## Classification reasoning

`cosmiconfig` verbringt 99% der Zeit in `fs.stat` (existiert die Datei?) und `fs.readFile`. Diese Syscalls durchlaufen ohnehin den OS-Kernel — ob aufgerufen aus Rust oder JS ist egal, aber der Wechsel Rust→JS oder Rust-`std::fs`→Kernel spart nichts. Zusätzlich: Die killer-Feature von `cosmiconfig` — das Laden von `.ts`/`.mjs`-Configs — ist pure Node-Semantik (`require`/dynamic-import-Hook). Rust kann `.ts` nicht ausführen. Ein Rust-`cosmiconfig` wäre also zwingend ein Subset, wodurch Drop-in-Parity verloren geht.

## If NO-GO — BACKLOG entry

```markdown
- **cosmiconfig** (143M). Mostly filesystem I/O, not CPU; plus `.ts`/`.mjs` config loading requires Node's module system, which Rust can't provide. Any Rust port would be a non-drop-in subset with no perf win.
```

Section in `BACKLOG.md`: **FFI overhead > gain**
