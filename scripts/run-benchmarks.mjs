#!/usr/bin/env node

/**
 * Runs `vitest bench` and writes one `bench-results-<crate>.json` per crate
 * that actually produced suites. Use flags to scope which crates run:
 *
 *   node scripts/run-benchmarks.mjs                # all crates
 *   node scripts/run-benchmarks.mjs --crates a,b   # just a and b
 *   node scripts/run-benchmarks.mjs --only-changed # crates whose source is
 *                                                    changed vs origin/main
 *
 * Downstream (scripts/generate-report.mjs) treats each file as an independent
 * shard and only overwrites the crates that were re-benched this run, leaving
 * other shards untouched.
 */

import { spawn, spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function parseArgs(argv) {
  const args = { crates: null, onlyChanged: false, skipWasmBuild: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--crates') {
      args.crates = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    } else if (a.startsWith('--crates=')) {
      args.crates = a.slice('--crates='.length).split(',').map((s) => s.trim()).filter(Boolean)
    } else if (a === '--only-changed') {
      args.onlyChanged = true
    } else if (a === '--skip-wasm-build') {
      args.skipWasmBuild = true
    } else {
      console.error(`Unknown argument: ${a}`)
      process.exit(2)
    }
  }
  return args
}

function availableCrates() {
  const cratesDir = join(root, 'crates')
  return readdirSync(cratesDir)
    .filter((name) => !name.startsWith('_'))
    .filter((name) => {
      const stat = statSync(join(cratesDir, name))
      if (!stat.isDirectory()) return false
      return existsSync(join(cratesDir, name, '__bench__'))
    })
    .sort()
}

function changedCrates(available) {
  const res = spawnSync('git', ['diff', '--name-only', 'origin/main..HEAD'], {
    cwd: root,
    encoding: 'utf-8',
  })
  if (res.status !== 0) {
    console.error('git diff against origin/main failed; nothing to bench')
    console.error(res.stderr || res.stdout)
    return []
  }
  const set = new Set()
  for (const path of res.stdout.split('\n')) {
    const m = path.match(/^crates\/([^/]+)\//)
    if (m && available.includes(m[1])) set.add(m[1])
  }
  return [...set].sort()
}

const args = parseArgs(process.argv.slice(2))
const available = availableCrates()

let targetCrates
if (args.onlyChanged) {
  targetCrates = changedCrates(available)
  if (!targetCrates.length) {
    console.log('No crates changed vs origin/main — nothing to bench.')
    process.exit(0)
  }
} else if (args.crates) {
  if (!args.crates.length) {
    console.error('`--crates` requires at least one crate name')
    process.exit(2)
  }
  const unknown = args.crates.filter((c) => !available.includes(c))
  if (unknown.length) {
    console.error(`Unknown crates: ${unknown.join(', ')}`)
    console.error(`Available: ${available.join(', ')}`)
    process.exit(2)
  }
  targetCrates = [...new Set(args.crates)].sort()
} else {
  targetCrates = available
}

console.log(`Running vitest bench for ${targetCrates.length} crate(s): ${targetCrates.join(', ')}\n`)

// Build WASM artefacts in parallel before vitest spawns so the conditional
// `await import('../wasm/pkg/...')` inside each bench file resolves instead
// of falling through to the graceful skip path. Failures are non-blocking —
// the bench will simply omit the (wasm) entry for that crate.
function cratesWithWasmBuild(names) {
  const have = []
  for (const c of names) {
    const pkgPath = join(root, 'crates', c, 'package.json')
    if (!existsSync(pkgPath)) continue
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      if (pkg?.scripts?.['build:wasm']) have.push(c)
    } catch {
      // skip unreadable package.json
    }
  }
  return have
}

function runBuildWasm(crate) {
  return new Promise((resolve) => {
    const proc = spawn('pnpm', ['--filter', `@amigo-labs/${crate}`, 'run', 'build:wasm'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    })
    let stderr = ''
    proc.stderr.on('data', (chunk) => { stderr += chunk })
    proc.on('exit', (code) => {
      if (code === 0) {
        resolve({ crate, ok: true })
      } else {
        console.warn(`[build:wasm] ${crate} failed (exit ${code}); WASM comparators skipped`)
        if (stderr) console.warn(stderr.split('\n').slice(0, 5).join('\n'))
        resolve({ crate, ok: false })
      }
    })
    proc.on('error', (err) => {
      console.warn(`[build:wasm] ${crate} failed to spawn: ${err.message}; WASM comparators skipped`)
      resolve({ crate, ok: false })
    })
  })
}

if (args.skipWasmBuild) {
  console.log('Skipping WASM build (artefacts assumed prebuilt by scripts/build-all-wasm.mjs)\n')
} else {
  const wasmCrates = cratesWithWasmBuild(targetCrates)
  if (wasmCrates.length) {
    console.log(`Building WASM artefacts for ${wasmCrates.length} crate(s) in parallel: ${wasmCrates.join(', ')}\n`)
    const wasmResults = await Promise.all(wasmCrates.map(runBuildWasm))
    const ok = wasmResults.filter((r) => r.ok).length
    console.log(`WASM build: ${ok}/${wasmResults.length} succeeded\n`)
  }
}

const vitestArgs = ['exec', 'vitest', 'bench', '--no-color', '--run']
// Always scope explicitly so bench-only scaffolding like _ffi-bench/_template
// doesn't run as a side effect of "bench all".
for (const c of targetCrates) vitestArgs.push(`crates/${c}/__bench__`)

const result = spawnSync('pnpm', vitestArgs, {
  cwd: root,
  encoding: 'utf-8',
  timeout: 600_000,
  env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

const output = `${result.stdout || ''}${result.stderr || ''}`

if (result.error) {
  if (!output.includes('·')) {
    console.error('vitest bench produced no results')
    console.error(result.error.message)
    process.exit(1)
  }
} else if (result.status !== 0 && !output.includes('·')) {
  console.error('vitest bench produced no results')
  console.error(output || `vitest bench exited with status ${result.status}`)
  process.exit(1)
}

console.log(output)

const suites = []
let currentSuite = null

for (const line of output.split('\n')) {
  const suiteMatch = line.match(/[✓✗]\s+(\S+)\s+>\s+(.+?)\s+\d+ms/)
  if (suiteMatch) {
    currentSuite = { file: suiteMatch[1], name: suiteMatch[2], entries: [] }
    suites.push(currentSuite)
    continue
  }

  const entryMatch = line.match(
    /·\s+(.+?)\s{2,}([\d,]+(?:\.\d+)?)\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+±([\d.]+)%\s+(\d+)/,
  )
  if (entryMatch && currentSuite) {
    currentSuite.entries.push({
      name: entryMatch[1].trim(),
      hz: parseFloat(entryMatch[2].replace(/,/g, '')),
      rme: parseFloat(entryMatch[3]),
      samples: parseInt(entryMatch[4], 10),
    })
  }
}

const byCrate = new Map()
for (const suite of suites) {
  const m = suite.file?.match(/^crates\/([^/]+)\//)
  if (!m) continue
  if (!byCrate.has(m[1])) byCrate.set(m[1], [])
  byCrate.get(m[1]).push(suite)
}

if (byCrate.size === 0) {
  console.error('Parsed output contained no crate-scoped suites')
  process.exit(1)
}

for (const crate of targetCrates) {
  const crateSuites = byCrate.get(crate) ?? []
  if (!crateSuites.length) {
    console.warn(`No suites produced for crate ${crate}; shard will not be written.`)
    continue
  }
  const outPath = join(root, `bench-results-${crate}.json`)
  writeFileSync(outPath, JSON.stringify({ crate, suites: crateSuites }, null, 2))
  console.log(`Written ${outPath} (${crateSuites.length} suites)`)
}
