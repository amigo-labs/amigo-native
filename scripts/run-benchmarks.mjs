#!/usr/bin/env node

/**
 * Runs `vitest bench` and writes one `bench-results-<crate>.json` per crate
 * that actually produced suites. Use flags to scope which crates run:
 *
 *   node scripts/run-benchmarks.mjs                # all crates
 *   node scripts/run-benchmarks.mjs --crates a,b   # just a and b
 *   node scripts/run-benchmarks.mjs --only-changed # crates whose source is
 *                                                    changed vs origin/main
 *   node scripts/run-benchmarks.mjs --exclude a,b  # drop a and b from any of
 *                                                    the above (CI passes
 *                                                    BROKEN_CRATES here)
 *
 * Downstream (scripts/generate-report.mjs) treats each file as an independent
 * shard and only overwrites the crates that were re-benched this run, leaving
 * other shards untouched.
 */

import { spawn, spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'

const root = process.cwd()

function parseArgs(argv) {
  const args = { crates: null, exclude: [], onlyChanged: false, skipWasmBuild: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--crates') {
      args.crates = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    } else if (a.startsWith('--crates=')) {
      args.crates = a.slice('--crates='.length).split(',').map((s) => s.trim()).filter(Boolean)
    } else if (a === '--exclude') {
      args.exclude = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    } else if (a.startsWith('--exclude=')) {
      args.exclude = a.slice('--exclude='.length).split(',').map((s) => s.trim()).filter(Boolean)
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

if (args.exclude.length) {
  const skipped = targetCrates.filter((c) => args.exclude.includes(c))
  if (skipped.length) console.log(`Excluding: ${skipped.join(', ')}`)
  targetCrates = targetCrates.filter((c) => !args.exclude.includes(c))
  if (!targetCrates.length) {
    console.log('Every selected crate is excluded — nothing to bench.')
    process.exit(0)
  }
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

// Results are read from vitest's JSON reporter rather than scraped from the
// console table. Each `await bench(...).run()` inside a `test()` adds one
// entry to that test's `benchmarks` array; the test is the suite.
const reportPath = join(tmpdir(), `amigo-vitest-bench-${process.pid}.json`)
rmSync(reportPath, { force: true })
const vitestArgs = [
  'exec', 'vitest', 'bench', '--no-color', '--run',
  '--reporter=default', '--reporter=json', `--outputFile.json=${reportPath}`,
]
// Always scope explicitly so bench-only scaffolding like _ffi-bench/_template
// doesn't run as a side effect of "bench all".
for (const c of targetCrates) vitestArgs.push(`crates/${c}/__bench__`)

const result = spawnSync('pnpm', vitestArgs, {
  cwd: root,
  encoding: 'utf-8',
  // vitest 5 samples each benchmark for ~1 s (tinybench's default), so a
  // full run over every crate takes well over the old 10-minute budget.
  timeout: 3_600_000,
  env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

const output = `${result.stdout || ''}${result.stderr || ''}`
console.log(output)

if (!existsSync(reportPath)) {
  console.error('vitest bench produced no results')
  console.error(result.error?.message ?? `vitest bench exited with status ${result.status}`)
  process.exit(1)
}

const report = JSON.parse(readFileSync(reportPath, 'utf-8'))
rmSync(reportPath, { force: true })

// Shard shape is unchanged from the vitest 4 era:
//   { file, name, entries: [{ name, hz, rme, samples }] }
// hz is tinybench's classic ops/sec (1000 / mean latency in ms); rme and
// samples come from the latency statistics, as the old console table did.
const round2 = (n) => Math.round(n * 100) / 100
const crateOf = (relFile) => relFile.match(/^crates\/([^/]+)\//)?.[1]
const suites = []
// A crate with any failed benchmark (or a bench file that failed to load)
// gets no shard this run, so its previous docs/benchmarks data stays intact
// instead of being overwritten by the subset of suites that completed.
const failedCrates = new Set()
for (const file of report.testResults ?? []) {
  const relFile = relative(root, file.name).split(sep).join('/')
  if (file.status === 'failed' && file.message) {
    failedCrates.add(crateOf(relFile))
    console.error(`Benchmark file failed: ${relFile}\n${file.message.split('\n').slice(0, 5).join('\n')}`)
  }
  for (const test of file.assertionResults ?? []) {
    if (test.status === 'failed') {
      failedCrates.add(crateOf(relFile))
      console.error(`Benchmark failed: ${relFile} > ${test.fullName}`)
      for (const msg of test.failureMessages ?? []) console.error(msg.split('\n').slice(0, 5).join('\n'))
      continue
    }
    const tasks = (test.benchmarks ?? []).flatMap((b) => b.tasks)
    if (!tasks.length) continue
    suites.push({
      file: relFile,
      name: [...test.ancestorTitles, test.title].join(' > '),
      entries: tasks.map((t) => ({
        name: t.name,
        hz: round2(1000 / t.period),
        rme: round2(t.latency.rme),
        samples: t.latency.samplesCount,
      })),
    })
  }
}

const byCrate = new Map()
for (const suite of suites) {
  const crate = crateOf(suite.file)
  if (!crate) continue
  if (!byCrate.has(crate)) byCrate.set(crate, [])
  byCrate.get(crate).push(suite)
}

if (byCrate.size === 0 && !failedCrates.size) {
  console.error('vitest bench report contained no crate-scoped suites')
  process.exit(1)
}

for (const crate of targetCrates) {
  if (failedCrates.has(crate)) {
    console.error(`Benchmarks failed for crate ${crate}; shard will not be written.`)
    continue
  }
  const crateSuites = byCrate.get(crate) ?? []
  if (!crateSuites.length) {
    console.warn(`No suites produced for crate ${crate}; shard will not be written.`)
    continue
  }
  const outPath = join(root, `bench-results-${crate}.json`)
  writeFileSync(outPath, JSON.stringify({ crate, suites: crateSuites }, null, 2))
  console.log(`Written ${outPath} (${crateSuites.length} suites)`)
}

if (failedCrates.size) {
  console.error(`\nBenchmark failures in: ${[...failedCrates].sort().join(', ')}`)
  process.exit(1)
}
