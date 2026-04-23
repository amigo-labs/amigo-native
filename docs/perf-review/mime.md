# Candidate review: `mime`

> **Status:** NO-GO · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-19

## Verdict

Hashmap lookup. V8 does it in <50 ns; FFI floor is 109 ns. Structurally unbeatable — the standard FFI trap shape from the post-mortem catalog.

## JS package

- **npm:** `mime`
- **Downloads:** ~60M/week (together with `mime-types` ~343M)
- **Exports / API surface:** `getType(path)`, `getExtension(type)`, `define(types, force?)`
- **Typical input:** file path or MIME string, <100 B
- **Typical output:** MIME string or extension string
- **Realistic median use-case:** static-file server determining content type per request

## Rust replacement

- **Candidate crate(s):** `mime_guess`, `mime`
- **Maintenance / license:** active, MIT/Apache
- **Known gotchas / divergences:** none — the lookup table is essentially identical

## BACKLOG check

BACKLOG: *FFI overhead > gain* — confirmed, classification Black (not Red), because no input size rescues it.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | ~20–50 ns (string hash + HashMap lookup) in JS |
| Input size distribution | Paths <100 B |
| Output size distribution | <50 B MIME string |
| Reusable setup (stateful potential) | Zero — the hashmap is static |
| Batch-usage realism | Possible, but rare — usually one call per request |
| FFI-share estimate vs. Rust work | **>90% FFI**: floor 109 ns vs. JS 20–50 ns. Rust loses in the base case |

## Classification reasoning

The baseline measurement answers it directly: `echoString` with a 10 B input already costs 234 ns. The actual lookup would add another ~50 ns. That's ~280 ns per call. JS does it in ~50 ns, because V8 inlines the lookup table as a monomorphic hidden class. Even a batch API (`getTypes(paths: string[])`) doesn't rescue it: the `sumArray` baseline shows ~43 ns/element for array marshalling, still slower than the JS direct lookup. Classic `nanoid`/`mime` shape from the post-mortems.

## If NO-GO — BACKLOG entry

```markdown
- **mime** / **mime-types** (combined 343M). Pure hashmap lookups in JS (~50ns/call) vs. 109ns FFI floor — structurally slower through NAPI. Black-classification anti-shape. No batch API rescues it (~43ns/element for array marshalling exceeds JS lookup cost).
```

Section in `BACKLOG.md`: **FFI overhead > gain**
