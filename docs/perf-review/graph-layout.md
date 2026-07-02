# Perf-Review: `@amigo-labs/graph-layout`

> **Status:** 🟢 Green (measured) · **Reviewed:** 2026-07-02 · **Version:** 0.1.1

## Verdict

**62.3× (20 nodes / 25 edges) and 74.97× (100 nodes / 140 edges)** vs. `@dagrejs/dagre` (bench 2026-06-10). The candidate review predicted Green with a 2–5× expectation; the measurement lands far above it. Honest caveat on the multiplier: part of it is **algorithm choice, not a pure Rust win** — we ship a longest-path ranker with 4 barycentric crossing-reduction sweeps, while dagre runs network-simplex ranking plus 24 sweeps. Same visual class of layout, materially less work per layout. Crossing counts can be 5–15 % higher than dagre's on dense graphs.

## Evidence

### Measured speedup (docs/benchmarks/graph-layout.json, 2026-06-10, commit `8c743bf`)

| Scenario | @amigo-labs/graph-layout | @dagrejs/dagre | Speedup |
|---|---:|---:|---:|
| small DAG (20 nodes, 25 edges) | 8 936.36 Hz | 143.54 Hz | **62.3×** |
| medium DAG (100 nodes, 140 edges) | 1 708.74 Hz | 22.79 Hz | **74.97×** |

- `docs/packages.json` speedup: `"62–75× faster"`.
- Install size: 436 KB vs `dagre`'s 2.7 MB / `@dagrejs/dagre`'s 1.6 MB.

## What shipped vs. the candidate prediction

- **Not a drop-in** — a spec-object API (`layout(spec) → positions`) instead of dagre's mutable graphlib graph.
- **Longest-path ranker only** (no network-simplex option yet).
- **Straight-line 2-point edges** — no dagre-style edge points/label nodes.
- Cycle reversal is skipped in v0.1 (inputs must be DAGs).
- Extras beyond dagre: `layoutMany` batch API and pinned ranks.

## Divergences

Coordinates are not dagre-identical (different ranker + sweep count); rank ordering and layer assignment match on the conformance corpus. On dense graphs expect somewhat more edge crossings than dagre. See `crates/graph-layout/__conformance__/divergences.md`.

Pre-port assessment: [`dagre.md`](./dagre.md)

## References

- Crate: `crates/graph-layout`
- Bench shard: `docs/benchmarks/graph-layout.json`
- `docs/packages.json` speedup: `"62–75× faster"`
