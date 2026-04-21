# Perf review: `@amigo-labs/xml`

> **Status:** 🗄️ Archived (never published) · **Reviewed:** 2026-04-19 · **Version:** 0.2.0 (final)

## Verdict

Archived without a deprecation window — the package was never on npm and
therefore didn't need a 3-month warning phase. The crate now lives under
`archived/xml/`, out of the Cargo/pnpm workspace, and removed from
`docs/packages.json` / `docs/data.json` / `scripts/measure-size.mjs`.
The reason stays the same: `parseXmlToJson` is a real lever (1.9–3.1× faster
than the old `parseXml`, wins the 1 KB bucket 1.55× against `sax`), but on
the median 100 KB RSS 0.78× and on the 10 MB SOAP 0.72× of `sax`. The
post-mortem text ("not tried") was wrong and has been replaced with the
real numbers from this measurement.

## Classification rationale

**Pass-A gate (from the 2026-04-19 plan) missed.** The threshold was:
10 MB ≥ 2× sax AND 100 KB ≥ 1× sax. Real measurement after export +
bench addition:

- 10 MB: 1.42 Hz amigo vs. 1.98 Hz sax → **0.72×** (missed, factor of 2
  missing)
- 100 KB: 354 Hz amigo vs. 455 Hz sax → **0.78×** (missed, 28%
  missing)
- 1 KB: 279k Hz amigo vs. 180k Hz sax → **1.55×** (passed, but not
  decisive on its own)

**Pass B (partial):** the 100 KB gap is tight enough that C.1/C.2 buffer
I/O could potentially flip it (forecast ~1.1× sax). The 10 MB gap is
too big — the analysis shows that **JSON.parse on the JS side** (~15 MB
JSON back) is the main cost driver there, no longer FFI. That's
structural: any Rust port that returns events as JSON will be limited by
V8's JSON decoder for the full output.

## Evidence

### Measured speedup (freshly re-benched 2026-04-19)

Node v22.x, Linux x64 glibc, vitest 3.2.4, release build (workspace LTO).

| Scenario | parseXml | **parseXmlToJson** | SAX API | sax | vs. sax (best amigo) |
|---|---:|---:|---:|---:|---:|
| small SVG 1 KB | 143,885 Hz | **279,093 Hz** | 142,554 Hz | 179,724 Hz | **1.55×** ✓ |
| RSS 100 KB | 146 Hz | **354 Hz** | — | 455 Hz | 0.78× ✗ |
| SOAP 10 MB | 0.462 Hz | **1.42 Hz** | — | 1.98 Hz | 0.72× ✗ |

Compared to the old `docs/data.json` number: `parseXml` 100 KB was
110 Hz, now 146 Hz — variance within the runs (±2.66% rme), but
order of magnitude consistent.

Within our own variants, `parseXmlToJson` is the clear
winner:

- vs. `parseXml`: 1.94× (1 KB), 2.43× (100 KB), **3.07× (10 MB)**
- vs. SAX API: 1.96× (1 KB, other sizes not run)

That's the most significant single-lever result this crate ever
had — but only relative to its own baseline.

### Realistic use-case

100 KB RSS is the median use-case (feed reader, config parser,
simple SOAP responses). That's the bucket we lose. 1 KB SVG parsing
comes up in the web-dev context (inline icons, simple graphics), but
there the win barely justifies a native binary-dependency overhead.
10 MB is the tail (dumps, batch APIs) — where we have a structural
JSON-parse overhead.

### Benchmark gaps

All previous gaps are now filled:

- ✅ `parseXmlToJson` measured in all three size classes
- ✅ 10 MB SOAP amigo side measured (`parseXml` AND `parseXmlToJson`)

Remaining potential gap: **a buffer input/output variant is still
missing** (not just the bench, but the API). Forecast: would plausibly
raise 100 KB to ~1.1× `sax`, 10 MB would stay lost because of
JSON.parse.

### API surface

Three exported paths now:

- `parseXml(input, strict?) → XmlEvent[]` — tree-of-events, expensive because of
  `Vec<Object>` marshalling. Mid- to long-term candidate for dead
  code.
- `parseXmlToJson(input, strict?) → string` — the only realistic
  performance API. 1 FFI crossing, JSON.parse on the JS side. Freshly
  exported in `wrapper.js` (previously only in `index.js`).
- `parser()` (wrapper.js) — `sax`-compatible callback API. Internally calls
  `parseXml` once + dispatches in JS. Structurally unsalvageable since we
  also don't want to go directly to Rust callbacks.

### Bundle / binary size

From `docs/data.json`: `@amigo-labs/xml` install size 434 KB vs.
`sax`'s 56 KB. **7.7× larger** — for a bucket we lose at the median,
that's extra ammunition for the deprecation.

### FFI-overhead baseline

Prediction from `docs/BASELINE.md` was: parseXmlToJson should deliver
~250–300 Hz at 100 KB (parity with sax). Real measurement: **354 Hz.**
The prediction underestimated the JS-side JSON.parse cost at 10 MB,
but at 100 KB the estimate was even pessimistic. The baseline model
is usable for small/medium inputs, underestimates the JS-side
JSON.parse share at 10 MB+.

## Phase-C optimization checklist (updated with measurement data)

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimization (Buffer overload) | **gated (marginal)** | 100 KB: ~0.35 ms/call savable (~12%). 10 MB: ~35 ms (~5%). Only makes sense combined with C.2, and even then doesn't reverse the deprecation. |
| C.2 | Output type (parseXmlToJson → Buffer) | **gated (marginal)** | 100 KB: ~0.5 ms savable (~18%). Together with C.1 plausibly 1.05–1.15× sax @ 100 KB — borderline. 10 MB: JSON.parse JS-side dominates → Buffer-out changes nothing. |
| C.3 | Batch API | n/a | parse_xml* is already 1-call-per-doc. |
| C.4 | Stateful API | n/a | quick-xml has no notable setup cost. |
| C.5 | Parallelization | n/a | XML parse is sequential. |
| C.6 | Algorithm swap | already done | quick-xml is state-of-the-art. |
| C.7 | Allocator tuning (SmallVec in decode_attrs) | **gated (small)** | Micro-optimization. ~2–5% plausible, doesn't change classification. |
| C.8 | Bundle size | already done | Workspace profile. Binary install size (434 KB) can't be pressed below `sax`'s 56 KB. |

**Additional lever, not in the standard list:**
- A **filter/query API** (e.g. `extractTextByPath(xml, "//title") → Buffer`)
  would skip JSON.parse entirely and would plausibly be 5–10× sax at
  10 MB. But that's a different product. Not in the scope of XML-parse
  deprecation.

## Action taken (2026-04-19)

Pulled through, since the package was never published and no migration
phase is needed:

1. `crates/xml/` → `archived/xml/` (git rename preserved).
2. `archived/xml/package.json` gets `"private": true`, `deprecated`
   field removed, description changed to archive hint.
3. `archived/xml/README.md` completely rewritten to archive header +
   historical-usage example.
4. Cargo workspace (`Cargo.toml`) and pnpm workspace (`pnpm-workspace.yaml`)
   point to `crates/*` — the move out of `crates/` removed xml
   automatically, no edits needed. Verified with `cargo metadata`: amigo-xml
   is no longer a member.
5. `docs/packages.json` — xml entry removed.
6. `docs/data.json` — both xml blocks (benchmarks + install size)
   removed.
7. `scripts/measure-size.mjs` — xml entry removed.
8. `docs/post-mortems/xml.md` — "not tried" replaced by the real numbers
   from this review, status set to "archived 2026-04-19 (never
   published to npm)", deprecation plan replaced by an archival
   section.
9. `docs/perf-review.md` result table — xml row updated to
   🗄️ **ARCHIVED** with parseXml/parseXmlToJson range.

## Not done — justifiably dropped

- **Buffer I/O sprint (C.1/C.2):** would plausibly lift 100 KB to 1.05–1.15×
  `sax`, but 10 MB stays JSON.parse-dominated and the
  bundle-size gap (7.7×) stays. Effort not justified for a borderline win
  at the median.
- **Filter/query API:** would be a different product. If a concrete
  use-case justifies it in the future: BACKLOG entry under a new
  "XML extraction" scope, not a revival of the general-purpose
  parser.

## References

- Archived crate: `archived/xml/` (was `crates/xml/`)
- Bench (historical): removed with the deprecated-bench cleanup; see git history for `archived/xml/__bench__/index.bench.ts`
- Lib (historical): `archived/xml/src/lib.rs`
- Post-mortem (updated with measured numbers): `docs/post-mortems/xml.md`
- FFI baseline: `docs/BASELINE.md`
- Implementation commit `parseXmlToJson`: `d1e2e46`
- Re-bench + archive commits: this PR
