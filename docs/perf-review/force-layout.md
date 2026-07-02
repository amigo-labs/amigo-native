# Perf-Review: `@amigo-labs/force-layout`

> **Status:** 🟢 Green (measured) · **Reviewed:** 2026-07-02 · **Version:** 0.1.1

## Verdict

**7.18× (20 nodes) and 3.58× (100 nodes)** vs. `d3-force` (bench 2026-06-10). The candidate review predicted Yellow leaning Green and feared sub-2× on small graphs; the measurement beats that prediction on both buckets — the small-graph bucket clears the candidate's ≥1× gate by a wide margin, and the median bucket sits above the ≥2× Green threshold. The structural lever is the batch shape: one `simulate()` call runs all iterations in Rust, so the per-tick FFI crossings that would dominate a d3-style tick loop never happen.

## Evidence

### Measured speedup (docs/benchmarks/force-layout.json, 2026-06-10, commit `8c743bf`)

| Scenario | @amigo-labs/force-layout | d3-force | Speedup |
|---|---:|---:|---:|
| small graph (20 nodes) | 1 221.01 Hz | 170.16 Hz | **7.18×** |
| medium graph (100 nodes) | 56.61 Hz | 15.83 Hz | **3.58×** |

- `docs/packages.json` speedup: `"3.6–7.2× faster"`.
- Install size: 404 KB vs `d3-force`'s 169 KB — we are **larger**; the win is compute, not footprint.

### Benchmark gaps

- **Large bucket (500/800 nodes) not benched.** Relevant because of the O(V²) many-body caveat below — the crossover point vs. d3's Barnes–Hut is unmeasured.

## What shipped vs. the candidate prediction

- **Batch `simulate()` only** — no per-tick callback API. Layouts that need animated ticks stay on d3-force by design.
- **O(V²) many-body force** instead of Barnes–Hut. Honest caveat: above roughly 1000 nodes d3's O(V log V) approximation should win; the shipped sweet spot is the ≤ a-few-hundred-nodes dashboard graph.
- Multiplicative alpha decay and a deterministic RNG — same layout for the same input, unlike d3's `Math.random()` jitter.

## Divergences

Not coordinate-identical to d3-force (deterministic seeding, decay-schedule differences); topology-level parity (cluster separation, link-length distribution) is what the conformance suite asserts. See `crates/force-layout/__conformance__/divergences.md`.

Pre-port assessment: [`d3-force.md`](./d3-force.md)

## References

- Crate: `crates/force-layout`
- Bench shard: `docs/benchmarks/force-layout.json`
- `docs/packages.json` speedup: `"3.6–7.2× faster"`
