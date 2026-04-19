# @amigo-labs/levenshtein — archived

> 🗄️ **Archived 2026-04-19.** Deprecated in 0.2.0; source removed from
> the tree after the post-mortem landed.

`fast-levenshtein` is 1,7–7,6× faster on realistic strings (10k chars:
54 ops/s vs our 7). Each input string crosses the NAPI boundary with
UTF-16→UTF-8 conversion, which dominates runtime. A Phase-C spike
(`distanceU16`) missed the ≥1,5× gate at 10k chars. See
[post-mortem](../../docs/post-mortems/levenshtein.md) and
[perf-review](../../docs/perf-review/levenshtein.md) for the numbers.

**Migration:** `npm install fast-levenshtein`.

**Source history:** last full tree at commit `3a308be`
(`chore(levenshtein): archive crate, waive the three-month window`).
The npm package `@amigo-labs/levenshtein` remains at its last
deprecated release; nothing new ships from this tree.
