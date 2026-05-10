# @amigo-labs/nanoid — archived

> 🗄️ **Archived 2026-05-10.** Source removed from the tree after the
> re-review and post-mortem landed.

The package carried no Rust since 0.2.0 (`794396b`); after dropping back
to pure JS it ran 0.91× – 1.17× vs upstream `nanoid@5` across realistic
scenarios, with the median single-call path *slower* than upstream.
Re-review on 2026-05-10 reclassified it 🔴 Red — see
[post-mortem](../../docs/post-mortems/nanoid.md) and
[perf-review](../../docs/perf-review/nanoid.md) for the numbers.

**Migration:** `npm install nanoid` (the upstream package; the API is
identical because `@amigo-labs/nanoid` was already a same-strategy
reimplementation).

**Source history:** last full tree at commit `c95b3e6`
(`chore: release main`). The npm package `@amigo-labs/nanoid` remains at
its last deprecated release; nothing new ships from this tree.
