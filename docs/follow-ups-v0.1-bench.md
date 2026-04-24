# BENCH SAY WHAT BROKE. FIX LIST.

run date: 2026-04-23. release build. branch `claude/crate-performance-audit-6KLOJ`.
12 crate shipped. bench say some fast. bench say some slow. below say why and fix.

priority: 🔴 fix soon. 🟡 fix when bored. ⚪ document, walk away.

---

## 🔴 1. text-splitters slow on big doc

- bench: 140 KB input → langchain 3.4× faster. us 50 ms, them 15 ms.
- small input: us win 2.8× ✅. medium: us win 1.3× ✅. big: us lose.
- hypothesis: `text-splitter` crate do unicode grapheme walk.
  langchain do regex char split. big doc = many grapheme. slow.
- also: `ChunkConfig.with_sizer()` may re-tokenize on every candidate cut.
  100 chunks × re-tokenize = quadratic-ish.

**fix path**:
1. profile first. flamegraph on 140 KB. prove it grapheme walk.
2. swap sizer to byte-count (not char-count) for `lengthMetric: 'chars'`.
   byte-count is O(1). drop-in, no parity break for ASCII.
3. if still slow: fork `text-splitter`, replace segmenter.

**goal**: 1× on 140 KB. 2× stretch. don't break short/medium.
**scope**: 1 day profiling + 1 day fix.
**crate**: `crates/text-splitters/`

---

## 🔴 2. minisearch addAll 2.3× slower than upstream

- bench: 1000 docs. us 8 ms. upstream 3.4 ms.
- hypothesis: V8 → Rust string marshalling per doc. 1000 strings = 1000 UTF-16→UTF-8.
  upstream stay in JS. no crossing.
- second hypothesis: `Index.add()` re-computes `avg_doc_len` every insert.
  that O(N) per add → O(N²) bulk. FIX THIS FIRST, easy.

**fix path**:
1. cheap fix: defer `recompute_avg` to end of `addAll`. one pass.
2. if still slow: bulk-ingest API take `Buffer` (NDJSON / CSV-style). single marshal.

**goal**: 1× parity on addAll. query already 5×, don't regret.
**scope**: half day for (1). another day for (2).
**crate**: `crates/_search-core/` + `crates/minisearch/`

---

## 🟡 3. sentences split() lose on tiny input

- bench: 50-char text, 4 sentences. sbd 2.4× faster. us 7 µs, them 3 µs.
- review predict this. FFI floor 109 ns. rust work also 109 ns. share 50/50.
- `splitToOffsets` also lose (3.8× slower) on short. even worse.

**fix path**:
- accept. document. point user at batch API.
- `__bench__/index.bench.ts` already show the cut-over: medium 4.6× win.
- README.md already say "use offsets for hot path". fine.

**goal**: no code fix. add one line to divergences.md:
  "for input <100 bytes, upstream `sbd` can be faster — FFI overhead dominates".
**scope**: 10 minutes doc tweak.
**crate**: `crates/sentences/__conformance__/divergences.md`

---

## 🟡 4. pdf-parse lose on tiny PDF

- bench: 580-byte PDF. upstream 3.1× faster. us 1.5 ms, them 0.5 ms.
- bench: 4 KB PDF. us win 1.6× ✅.
- hypothesis: pdf.js has fast-path for <2 KB (cached parser state, no font init).
  `pdf-extract` do full parse + `lopdf` do full trailer walk regardless.

**fix path**:
- not worth the complexity. pdf-parse use case is batch-ingest on real PDFs
  (whitepapers, invoices). tiny PDF is not median.
- document in divergences.md: "for <2 KB PDFs upstream may be faster".

**goal**: docs only. no code change.
**scope**: 10 min.
**crate**: `crates/pdf-parse/__conformance__/divergences.md`

---

## 🟡 5. typst no JS baseline

- bench: we measure self only. 2100 ops/s trivial, 1870 multi-section.
- no `typst-js` WASM comparison. no puppeteer comparison.

**fix path**:
- add `puppeteer` as devDep to `crates/typst/`. render equivalent HTML → PDF.
- bench: invoice template (us: typst source, them: HTML template).
- wall-clock comparison. expect us 10-50× (puppeteer start cost).

**goal**: real speedup number for dashboard. `"speedup": "TBD"` → real.
**scope**: 1 day. puppeteer is heavy dep, test it lands cleanly.
**crate**: `crates/typst/__bench__/`

---

## 🟡 6. pdf no JS baseline (pdfkit tslib blocked)

- `pdfkit` conformance test failed: `tslib` missing. pnpm resolve quirk.
- bench only measure ours. 17k ops/s simple label, 190 batch-100.

**fix path**:
- try newer `pdfkit` version or pin `tslib` devDep explicitly.
- if still broken: swap to `pdfmake` as comparison target.
- restore parity tests + bench comparison.

**goal**: working upstream in bench. `"speedup": "TBD"` → real.
**scope**: half day.
**crate**: `crates/pdf/__conformance__/parity.spec.ts` + `__bench__/`

---

## 🟡 7. typst stateful class (v0.2 hebel)

- per docs/perf-review/typst.md: cold start 50-200 ms. hot with `TypstCompiler`-class: 5-10 ms.
- v0.1 rebuild world every `compile()`. leave perf on table.

**fix path**:
1. add `#[napi]` class `TypstCompiler`.
2. constructor load fonts, build `World`, cache.
3. `.compile(source, opts)` reuse cached world, update main source + data.
4. bench: hot invoice render. expect 5-10× vs cold `compile()`.

**goal**: `TypstCompiler` class ships. bench show hot-path speedup.
**scope**: 2-3 days. typst World invalidation is tricky (comemo).
**crate**: `crates/typst/`

---

## 🟡 8. force-layout Barnes-Hut quadtree

- bench: 100 nodes 4.2× win. 500 nodes: O(V²) hurt us bad (not benched).
- d3-force use Barnes-Hut → O(V log V).
- we O(V²). at 1000 nodes: d3 win.

**fix path**:
- implement quadtree. `fdg` crate has one. or write own (~200 LOC).
- bench: 500 and 1000 node scenarios.

**goal**: 2× win at 1000 nodes (match d3 + NAPI cost).
**scope**: 2 days (quadtree + tests + bench).
**crate**: `crates/force-layout/`

---

## ⚪ 9. bm25 no index-build baseline

- bench compare query only. index build has no upstream match.
- `okapibm25` rebuild every query — no persistent index. unfair either way.
- `wink-bm25-text-search` would be the right comparison but has stemmer-pipeline
  dep tree we ship-cut.

**fix path**:
- add minimal `wink-bm25-text-search` bench. disable its stemmer.
  measure index-build parity for same tokenizer surface.
- currently "speedup: 15×" covers query. acceptable for v0.1.

**goal**: optional. add build-time numbers when bored.
**scope**: half day.
**crate**: `crates/bm25/__bench__/`

---

## ⚪ 10. svgo add path-arithmetic plugins

- bench say 14-22× on icon/medium ✅. already strong green.
- but parity cut: no `convertPathData`, `mergePaths`, `reusePaths`.
  those are biggest byte-savers on illustrations.

**fix path**:
- v0.2: port `convertPathData` first (~800 LOC). biggest gain.
- measure output-size improvement on 30 KB illustration fixture.

**goal**: match svgo compression ratio to within 5% on illustrations.
**scope**: 1 week. real path arithmetic.
**crate**: `crates/svgo/`

---

# PRIORITY BATCH ORDER

if one session: 2 → 3 → 4.  low-hanging. doc + one-pass recompute fix.
if one sprint: 1, 2, 7.  real wins.
if one quarter: 1, 2, 7, 8, 10.  closes all soft spots.

happy hunting. fire good.
