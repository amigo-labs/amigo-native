#!/usr/bin/env node

/**
 * Runs clippy for the `wasm32-unknown-unknown` target over every wasm-bindgen
 * sub-crate (`crates/<name>/wasm`) in the workspace.
 *
 *   node scripts/clippy-wasm.mjs
 *
 * `cargo clippy --workspace --all-targets` only lints the host target, so code
 * behind `#[cfg(target_arch = "wasm32")]` (e.g. the ruzstd fallback in
 * `_zstd-core`) would never see the workspace lint table. Clippy is installed
 * as `RUSTC_WORKSPACE_WRAPPER`, so the `_<name>-core` crates the wasm crates
 * depend on are linted for wasm32 as well.
 *
 * The crate list comes from `cargo metadata`: the Node-only tier (argon2 /
 * jose / jwt) has no wasm sub-crate and excluded crates (typst) are not
 * workspace members, so neither needs to be listed here.
 */

import { spawnSync } from 'node:child_process'
import { sep } from 'node:path'

const meta = spawnSync('cargo', ['metadata', '--no-deps', '--format-version', '1'], {
  encoding: 'utf-8',
  maxBuffer: 64 * 1024 * 1024,
})
if (meta.status !== 0) {
  process.stderr.write(meta.stderr)
  process.exit(meta.status ?? 1)
}

const wasmSuffix = `${sep}wasm${sep}Cargo.toml`
const packages = JSON.parse(meta.stdout)
  .packages.filter((p) => p.manifest_path.endsWith(wasmSuffix))
  .map((p) => p.name)
  .sort()

if (!packages.length) {
  console.error('clippy-wasm: no wasm sub-crates found in the workspace')
  process.exit(1)
}

console.log(`clippy-wasm: linting ${packages.length} wasm crate(s) for wasm32-unknown-unknown`)
const args = ['clippy', '--target', 'wasm32-unknown-unknown', '--all-targets']
for (const p of packages) args.push('-p', p)
args.push('--', '-D', 'warnings')

const result = spawnSync('cargo', args, { stdio: 'inherit' })
process.exit(result.status ?? 1)
