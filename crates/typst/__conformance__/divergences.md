# Divergences — typst

`@amigo-labs/typst` embeds the Typst compiler library. Divergences
are versus the Typst CLI (`typst compile`) — not versus a JS package
(none exists as a direct replacement).

## Package resolution

### `#import "@preview/..."` is rejected

The CLI resolves `@preview/*` imports by downloading from
[packages.typst.org](https://packages.typst.org). We reject these
with `FileError::NotFound` — loading external code from a library
call is a supply-chain concern.

**Workaround**: inline the package source. Most `@preview/*`
packages are small single-file modules; paste them into your
template.

### Local file imports

Only the main source file is available (`main.typ`). Multi-file
projects (`#import "header.typ": *`) are not supported in v0.1 —
the file-system access we'd need isn't part of a library call.

**Workaround**: concatenate into a single source string, or use
`#let` / `#show` rules instead of imports.

## Fonts

### Bundled set

Libertinus Serif / Mono + New Computer Modern + DejaVu Sans +
Fira. ~15 MB of embedded TTFs. Covers:
- European text (Latin + most diacritics)
- Math typesetting (NCM)
- Monospace (Libertinus Mono, DejaVu Sans Mono)

### Caller-provided fonts

`compile(source, { fonts: [Buffer, ...] })` registers additional
TTF/OTF buffers. Useful for CJK, Arabic, or brand-specific fonts.

### No disk-based font resolution

Typst CLI walks `FONT_PATHS` + system fonts. We don't — deterministic
output across environments matters more than CLI parity.

## Dates

`datetime.today()` returns UTC "today" regardless of the `offset:`
argument. Explicit timezone-aware scheduling requires passing the
date via `sys.inputs`.

## Binary size

The compiled `.node` binary is **~15–20 MB per platform target**,
versus ~2–5 MB for the rest of the portfolio. This is a conscious
policy exception documented in `docs/perf-review/typst.md`. No
v0.1 option to strip the bundled fonts for a leaner binary; fast-
follow if there's demand.

## Cold vs. hot

First `compile()` call spends ~50–200 ms loading fonts + building
the standard library. Subsequent calls in the same process are
~5–30 ms for simple documents.

v0.1 builds a fresh `World` per `compile()` call. Fast-follow:
expose a `TypstCompiler` NAPI class that caches the world across
calls (the docs/perf-review/typst.md recommendation).

## Scripting

All Typst scripting features work: `#let`, `#if`, `#for`, `#show`,
`#set`, user functions, array/dict comprehensions. Only `#import`
for external packages is restricted.
