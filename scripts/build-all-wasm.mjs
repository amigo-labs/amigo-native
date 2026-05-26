#!/usr/bin/env node

/**
 * Builds the wasm-bindgen sub-crate for every (or a subset of) amigo crate.
 *
 *   node scripts/build-all-wasm.mjs                         # all dual-target crates
 *   node scripts/build-all-wasm.mjs --crates a,b            # just a and b
 *   node scripts/build-all-wasm.mjs --optimize              # + wasm-opt -Oz
 *   node scripts/build-all-wasm.mjs --crates a --optimize   # combo
 *
 * `--optimize` produces realistic bundle sizes by post-processing each
 * generated `pkg/*_bg.wasm` with `wasm-opt -Oz` (matches the CI bundle-size
 * job at .github/workflows/ci.yml:209). It requires `binaryen` to be on PATH;
 * if missing the optimisation step is skipped with a warning instead of
 * failing the build.
 *
 * Skips the Node-only tier (argon2 / jose / jwt) — these crates intentionally
 * ship no wasm sub-directory per docs/specs/expansion-2026.md.
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const NODE_ONLY_CRATES = new Set(['argon2', 'jose', 'jwt'])

function parseArgs(argv) {
  const args = { crates: null, optimize: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--crates') {
      args.crates = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    } else if (a.startsWith('--crates=')) {
      args.crates = a.slice('--crates='.length).split(',').map((s) => s.trim()).filter(Boolean)
    } else if (a === '--optimize') {
      args.optimize = true
    } else if (a === '--help' || a === '-h') {
      console.log('Usage: build-all-wasm.mjs [--crates a,b] [--optimize]')
      process.exit(0)
    } else {
      console.error(`Unknown argument: ${a}`)
      process.exit(2)
    }
  }
  return args
}

function dualTargetCrates() {
  const cratesDir = join(root, 'crates')
  return readdirSync(cratesDir)
    .filter((name) => !name.startsWith('_'))
    .filter((name) => !NODE_ONLY_CRATES.has(name))
    .filter((name) => {
      const stat = statSync(join(cratesDir, name))
      return stat.isDirectory() && existsSync(join(cratesDir, name, 'wasm', 'Cargo.toml'))
    })
    .sort()
}

function runWasmPack(crate) {
  return new Promise((resolve) => {
    const wasmDir = join(root, 'crates', crate, 'wasm')
    const proc = spawn(
      'wasm-pack',
      ['build', '--target', 'bundler', '--release', '--out-dir', 'pkg'],
      {
        cwd: wasmDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      },
    )
    let stderr = ''
    proc.stderr.on('data', (chunk) => { stderr += chunk })
    proc.on('exit', (code) => {
      resolve({ crate, ok: code === 0, stderr })
    })
    proc.on('error', (err) => {
      resolve({ crate, ok: false, stderr: err.message })
    })
  })
}

function hasWasmOpt() {
  const probe = spawnSync('wasm-opt', ['--version'], { stdio: 'ignore' })
  return probe.status === 0
}

function optimizeBgWasm(crate) {
  const pkgDir = join(root, 'crates', crate, 'wasm', 'pkg')
  if (!existsSync(pkgDir)) return { crate, ok: false, reason: 'no pkg/ produced' }
  const bg = readdirSync(pkgDir).find((f) => f.endsWith('_bg.wasm'))
  if (!bg) return { crate, ok: false, reason: 'no _bg.wasm found' }
  const wasmPath = join(pkgDir, bg)
  const optPath = `${wasmPath}.opt`
  const before = statSync(wasmPath).size
  const res = spawnSync('wasm-opt', ['-Oz', wasmPath, '-o', optPath], { stdio: 'pipe' })
  if (res.status !== 0) {
    if (existsSync(optPath)) unlinkSync(optPath)
    return { crate, ok: false, reason: 'wasm-opt failed' }
  }
  const after = statSync(optPath).size
  unlinkSync(wasmPath)
  renameSync(optPath, wasmPath)
  return { crate, ok: true, before, after }
}

const args = parseArgs(process.argv.slice(2))
const available = dualTargetCrates()
let targets = available
if (args.crates) {
  const requested = args.crates.filter((c) => !NODE_ONLY_CRATES.has(c))
  const unknown = requested.filter((c) => !available.includes(c))
  if (unknown.length) {
    console.error(`Unknown or non-dual-target crates: ${unknown.join(', ')}`)
    console.error(`Available: ${available.join(', ')}`)
    process.exit(2)
  }
  targets = [...new Set(requested)].sort()
}

if (!targets.length) {
  console.log('No dual-target crates to build.')
  process.exit(0)
}

console.log(`Building wasm for ${targets.length} crate(s): ${targets.join(', ')}`)
const buildResults = await Promise.all(targets.map(runWasmPack))
const builtOk = buildResults.filter((r) => r.ok).map((r) => r.crate)
const builtFail = buildResults.filter((r) => !r.ok)
for (const r of builtFail) {
  console.warn(`[wasm-pack] ${r.crate} failed`)
  if (r.stderr) console.warn(r.stderr.split('\n').slice(-5).join('\n'))
}
console.log(`wasm-pack: ${builtOk.length}/${targets.length} succeeded`)

if (args.optimize && builtOk.length) {
  if (!hasWasmOpt()) {
    console.warn('[wasm-opt] binaryen not on PATH; skipping size optimisation')
  } else {
    console.log(`\nRunning wasm-opt -Oz on ${builtOk.length} artefact(s)...`)
    for (const crate of builtOk) {
      const r = optimizeBgWasm(crate)
      if (r.ok) {
        const pct = ((1 - r.after / r.before) * 100).toFixed(1)
        console.log(`  ${crate}: ${r.before} → ${r.after} B (-${pct}%)`)
      } else {
        console.warn(`  ${crate}: ${r.reason}`)
      }
    }
  }
}

if (!builtOk.length) {
  console.error('All wasm-pack builds failed')
  process.exit(1)
}
