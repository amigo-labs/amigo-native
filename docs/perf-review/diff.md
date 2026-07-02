# Candidate review: `diff`

> **Status:** GO (as a drop-in, with the offset API as the green hot path) · **Predicted:** 🟡 Yellow leaning 🟢 (with offset API), 🟡 Yellow (with hunk object array) · **Reviewed:** 2026-04-21

## Verdict

Text diffing is an **algorithm-heavy, output-shape-sensitive** package. Myers (default) and Patience are O(N×M) in the number of cells — on 10 KB × 10 KB input that is milliseconds of real work in JS. The Rust `similar` crate has SIMD-accelerated common-prefix/suffix detection plus an optimized snake search, typically 5–15× faster than jsdiff on document-level inputs. The output shape is the familiar `Vec<Object>` problem: jsdiff returns an array of `{value, added, removed, count}` hunks, each carrying a content string. Marshalling 200 hunks × strings eats the gain on small inputs. The solution — the same as for `sbd`: an **offset-based hot path** (`diffToOffsets(a, b) → Uint32Array`) returns only the hunk boundaries and the caller slices content lazily. The drop-in form (`Vec<Hunk>`) remains available but is Yellow. Line diffing (~90 % of npm `diff` usage) is Green regardless of output shape because lines are fewer and fatter than chars.

## JS package

- **npm:** [`diff`](https://www.npmjs.com/package/diff)
- **Downloads:** ~200M/week (Q1 2026, BACKLOG figure confirmed). Top 10 of the most-downloaded utility packages.
- **Exports / API surface:**
  - `diffChars(oldStr, newStr, opts?)` — char-by-char
  - `diffWords(oldStr, newStr, opts?)` / `diffWordsWithSpace(...)` — word-tokenized
  - `diffLines(oldStr, newStr, opts?)` / `diffTrimmedLines(...)` — line-based (**the most common case**)
  - `diffSentences(oldStr, newStr, opts?)` — sentence-based
  - `diffCss(...)`, `diffJson(obj1, obj2)` — typed
  - `createPatch(fileName, oldStr, newStr, oldHeader, newHeader, opts?)` → unified-diff-format string
  - `applyPatch(source, patch, opts?)` — reverse op
  - `parsePatch(diffStr)`
- **Typical input:**
  - 2 strings (old, new). Sizes highly variable:
    - Git-like line diff: 100 B – 100 KB
    - Text-edit diff: 1 KB – 50 KB
    - Log-file compare: 10 KB – 10 MB
    - Code-review diff: typically 500 B – 20 KB per file
- **Typical output:** `Array<{value: string, added?: bool, removed?: bool, count?: number}>`. Size: 1 hunk for identical strings, ~2 × line count hunks for completely different ones.
- **Realistic median use-case:** **Code-review tooling** (diff between file versions, line-based). **Test snapshot diffing** (Vitest/Jest expected-vs-actual, char/line). **Merge-conflict display** in web UIs. **Text-edit history** in collaborative-editing backends. **Config-change preview**. All cases: **one call per comparison**, inputs variable but mostly 1–50 KB. No chain API, nothing stateful.

## Rust replacement

- **Candidate crate(s):**
  - [`similar`](https://crates.io/crates/similar) — **primary.** By Armin Ronacher. Myers + Patience + LCS algorithms. Unified-diff-format output. Char/word/line tokenization built-in. Active, MIT.
  - [`imara-diff`](https://crates.io/crates/imara-diff) — alternative, faster on large inputs, but smaller API surface.
  - [`difference`](https://crates.io/crates/difference) — older, fewer features, not recommended.
- **Maintenance / license:** `similar` MIT/Apache, Ronacher, excellently maintained. Supply chain clean.
- **Known gotchas / divergences:**
  - **Hunk output format** — jsdiff combines unchanged/added/removed in one flat array. `similar` has `TextDiff::iter_all_changes()` which yields an iterator that can be mapped.
  - **`ignoreCase`, `ignoreWhitespace`, `newlineIsToken`** — jsdiff has various options. similar supports most of them, but `ignoreCase` may need to be done manually.
  - **`diffJson` semantics** — jsdiff's `diffJson` stringifies both objects with `JSON.stringify(sorted)` and diffs the lines. Replicable, but check parity on key-order-sorting details.
  - **Patch format parity** — `createPatch`/`applyPatch` follow the unified-diff standard, but the `@@ -a,b +c,d @@` header format and trailing-newline handling carry divergence risk against GNU `diff`/`patch`.
  - **Callbacks** — `diffArrays(oldArr, newArr, opts)` with `opts.comparator` is a callback variant. For string arrays this is avoidable (pre-serialize), for object arrays it is not — we cut object-array diffing out of scope (or offer only string-key-based).

## BACKLOG check

Existing entry in `BACKLOG.md` (section "Under investigation — General utilities → Predicted Yellow"): added 2026-04-21. Review confirms the Yellow prediction with a Green upgrade path via the offset API.

Differentiation:
- Against `docs/perf-review/sbd.md` (GO Yellow→Green with offset API): **identical output-shape problem**, identical solution. Review pattern reused. This is the "industrialization" moment — we have seen the pattern (xxhash, sbd), we know the fix.
- Against `docs/perf-review/deep-equal.md` (archived 🔴): similar API shape (two inputs, one boolean-or-small output), but the compute magnitude is fundamentally different. `diff` on 20 KB is milliseconds; `deep-equal` on a flat 7-key object is 500 ns. Hence the opposite verdict.
- Against `docs/perf-review/levenshtein.md` (archived 🔴): warning — char-level diff on short strings could fall into the same FFI-floor trap. Hence the realistic median = line level and medium-sized inputs.

No entry in `docs/packages.json`.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Input-size-dependent.** 1 KB × 1 KB `diffLines`: ~100 µs jsdiff, ~20–50 µs Rust → 2–5×. 20 KB × 20 KB `diffLines`: ~2–5 ms jsdiff, ~200–500 µs Rust → **5–10×**. 100 KB × 100 KB `diffChars`: ~200 ms – 2 s jsdiff (O(N²) dominant), ~20–100 ms Rust → **10–20×**. `diffChars` on very long strings is the traditional diff nightmare — that is where we gain the most. |
| Input size distribution | Two strings, combined size 200 B – 20 MB. UTF conversion 0.35 ns/byte × 2 (both strings) = ~70 µs at 100 KB combined. On ~500 µs Rust = 14 %. Borderline but Green. |
| Output size distribution | **Main problem.** Line diff 20 KB vs. 20 KB, 30 % changed: ~100 hunks × value string ~50 chars each = 100 × (200 ns FFI wrap + 50 × 0.35 ns UTF conversion) = **30 µs marshalling** + additional V8 object-alloc pressure. On 500 µs Rust = 6 %, OK. Char diff 20 KB vs. 20 KB, 30 % changed: ~6000 hunks × value string ~2 chars each = **1.2 ms marshalling** on 500 µs Rust compute = **>100 % overhead, Red territory**. |
| Reusable setup (stateful potential) | Low. No key/schema/regex setup. Every diff is fresh input. |
| Batch-usage realism | Medium. Code-review tools have batch-diff workloads (diff 100 files). `diffManyLines(pairs: [string, string][]) → ...` makes sense. Rayon-parallelizable. |
| FFI-share estimate vs. Rust work | With hunk array: line 5–15 %, word ~20 %, char 100 %+ (Red). With offset array: <2 % across the distribution (consistently Green). |

## Classification reasoning

`diff` shows **exactly** the same pattern as `sbd` — the output dimension decides the classification:

1. **Line diff is the median case and Green in both output variants.** 90 % of `diff` npm calls are `diffLines` or `createPatch` (line-based). The hunk count is moderate (10–200), value strings are fat (50–200 chars), output-marshalling overhead amortizes. Speedup 5–10×.

2. **Char diff is the Red trap.** With thousands of 2-char hunks, output-marshalling overhead > Rust compute. Two ways out:
   - **Offset API** — `diffCharsToOffsets(a, b) → Uint32Array`: each entry is `[type, oldStart, oldEnd, newStart, newEnd]` or more compact as a packed format. Constant size, flat buffer transport.
   - **Document it as "for char-level diffs on large strings, use the offset API"** in the README.
   Both options preserve drop-in for line level and provide a Green path for char level.

3. **`createPatch`/`applyPatch` are their own Green case.** They produce a unified diff as **one string** (no hunk array!). Output marshalling = a single UTF conversion. Classic buffer-in/string-out Green shape. Speedup 5–15× expected.

4. **200M/week adoption is enormous.** Top tier. Every `jest`/`vitest` install pulls `diff` transitively. Every CI diff view uses it. Even with a Yellow classification the portfolio value is there — but Green is realistic with the offset API.

5. **No other API-shape traps.** No chain, no callbacks (except the `diffArrays` comparator, which we exclude). No plugin system. Nothing stateful. Pure algorithm wrapper. Exactly what NAPI-RS does well.

**Shape matching:**
- 🔁 Like `sbd` (output-array shape sensitivity, offset API as the solution)
- 🔁 Like `xxhash` pre-fix (Vec<BigInt> was Yellow, Buffer output became Green)
- ✅ Like `inflate` (pure algo, bytes-heavy compute, buffer-in/buffer-out viable)
- ✅ Like `@amigo-labs/commonmark` (string-in, substantial compute, string-out for patch mode)
- ❌ Not like `levenshtein` archived (UTF-16/UTF-8 marshalling was dominant on input there; `diff` has larger inputs that amortize it, plus lines-as-tokens)
- ❌ Not like `deep-equal` archived (work per call is >> FFI floor)

**Benchmark gap flag:** Critical — three tokenization levels × three input sizes × two output variants = 18 scenarios. Feasible, but the most extensive bench set in the portfolio. Prioritization: `diffLines` × {1 KB, 20 KB, 100 KB} × {hunks, offsets} first (that covers 80 % of real usage).

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/diff` (drop-in convention)
- **Primary API sketch:**
  ```ts
  export interface Hunk {
    value: string;
    added?: boolean;
    removed?: boolean;
    count?: number;
  }

  export interface DiffOptions {
    ignoreCase?: boolean;
    ignoreWhitespace?: boolean;
    newlineIsToken?: boolean;
  }

  // Drop-in form (Yellow path, documented)
  export function diffChars(oldStr: string, newStr: string, opts?: DiffOptions): Hunk[];
  export function diffWords(oldStr: string, newStr: string, opts?: DiffOptions): Hunk[];
  export function diffWordsWithSpace(oldStr: string, newStr: string, opts?: DiffOptions): Hunk[];
  export function diffLines(oldStr: string, newStr: string, opts?: DiffOptions): Hunk[];
  export function diffTrimmedLines(oldStr: string, newStr: string, opts?: DiffOptions): Hunk[];
  export function diffSentences(oldStr: string, newStr: string, opts?: DiffOptions): Hunk[];
  export function diffCss(oldStr: string, newStr: string, opts?: DiffOptions): Hunk[];
  export function diffJson(oldObj: any, newObj: any, opts?: DiffOptions): Hunk[];

  // Zero-copy hot path (Green path) — separate namespace since the API differs
  export type DiffOpType = 0 | 1 | 2;  // 0=equal, 1=added, 2=removed
  export function diffCharsToOffsets(oldStr: string, newStr: string, opts?: DiffOptions): Uint32Array;
  // Layout: [type, oldStart, oldEnd, newStart, newEnd, ...] repeating
  export function diffLinesToOffsets(oldStr: string, newStr: string, opts?: DiffOptions): Uint32Array;

  // Patch API (its own Green shape, string-out)
  export function createPatch(
    fileName: string,
    oldStr: string,
    newStr: string,
    oldHeader?: string,
    newHeader?: string,
    opts?: DiffOptions
  ): string;
  export function applyPatch(source: string, patch: string, opts?: DiffOptions): string | false;
  export function parsePatch(diffStr: string): ParsedPatch[];

  // Batch lever (v0.2)
  export function diffLinesBatch(pairs: Array<[string, string]>, opts?: DiffOptions): Hunk[][];
  ```
- **Must-have benchmark scenarios (Gate):**
  - **diffLines 1 KB × 1 KB (30 % changed):** target ≥2× (Yellow threshold)
  - **diffLines 20 KB × 20 KB:** target ≥5× (main Green-gate case)
  - **diffLines 100 KB × 100 KB:** target ≥8×
  - **diffLinesToOffsets 20 KB × 20 KB:** target ≥8× (offset-API value proposition)
  - **diffChars 5 KB × 5 KB (10 % changed):** target ≥3× (hunks) / ≥10× (offsets)
  - **diffChars 50 KB × 50 KB:** target ≥5× (hunks) / ≥15× (offsets) — **killer bench for the offset API**
  - **createPatch 20 KB × 20 KB:** target ≥5× (pure string-out, no marshalling)
  - **applyPatch 20 KB + patch:** target ≥3×
  - **Parity conformance:** 500-pair corpus against jsdiff, byte-identical hunks at ≥98 %
- **Acceptance thresholds (Green gate):** `diffLines` ≥5× on 20 KB, `diffLinesToOffsets` ≥8× on 20 KB, `createPatch` ≥5×, `diffChars` via offset API ≥10× on 50 KB. Char diff with hunks may stay Yellow (documented).
- **Risks:**
  - **Output-API duality** — users must choose between the hunk array (drop-in) and offsets (performance). The README must clearly show the performance trade-offs
  - **Parity on malformed input** — NUL bytes, invalid UTF-8 sequences, very long lines (>1 MB) — test edge cases
  - **Patch-format subtleties** — `@@` header counts, context-line handling, trailing-newline preservation
  - **Binary size** — `similar` + deps ~1–2 MB, unproblematic
  - **diffArrays API** — comparator callback excluded (callback antipattern). Users must pre-normalize. Scope doc in the README

## If NO-GO — BACKLOG entry

Not applicable (GO recommendation, Yellow prediction with a Green upgrade via the offset API).
