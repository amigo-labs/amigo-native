# Archived packages

Packages whose deprecation window has closed. Source kept for git-archaeology
purposes (post-mortems link into it), but:

- **Not built** — the top-level `Cargo.toml` workspace glob `crates/*` and
  `pnpm-workspace.yaml` only match `crates/`, so `pnpm -r build`, `cargo test
  --workspace`, and `scripts/run-benchmarks.mjs` skip everything here.
- **Not published** — the npm packages remain as their last deprecated release.
  Nothing new ships from this tree.
- **Not tested in CI** — conformance, parity, and bench runners enumerate
  `crates/`, not `archived/`.

For the why, see `docs/post-mortems/<pkg>.md` and `docs/perf-review/<pkg>.md`.
