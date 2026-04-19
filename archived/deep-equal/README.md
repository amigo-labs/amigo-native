# @amigo-labs/deep-equal — archived

> 🗄️ **Archived 2026-04-19.** Deprecated in 0.2.0; source removed from
> the tree after the post-mortem landed.

`fast-deep-equal` is parity-or-better on every scenario we measured
(0,96× – 1,30×). Native packages structurally cannot beat a
monomorphic 50-line JS function that V8 inlines. See
[post-mortem](../../docs/post-mortems/deep-equal.md) and
[perf-review](../../docs/perf-review/deep-equal.md) for the numbers.

**Migration:** `npm install fast-deep-equal`.

**Source history:** last full tree at commit `5b92e44`
(`chore(deep-equal): archive deprecated crate`). The npm package
`@amigo-labs/deep-equal` remains at its last deprecated release;
nothing new ships from this tree.
