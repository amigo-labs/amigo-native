#!/usr/bin/env node

/**
 * Back-fills the `vsJs` and `parity` fields in each crate's
 * `package.json` `"amigo"` block from the measured data sources, then
 * regenerates the README table via sync-registry.mjs.
 *
 * Sources:
 *   docs/benchmarks/<crate>.json  → vsJs ratio (amigo / best-competitor)
 *   conformance-results.json      → parity percentage (passed / total)
 *
 * conformance-results.json is not committed — it is produced by
 * scripts/conformance-summary.mjs. Run that first, or pass
 * `--with-conformance` to run it as part of this script.
 *
 * Crates whose existing `vsJs` or `parity` is the literal "—" (em-dash,
 * meaning "no JS competitor exists" or "no upstream test suite exists")
 * are never overwritten — that signal is hand-curated.
 *
 * Usage:
 *   node scripts/backfill-amigo-stats.mjs              # use existing artifacts
 *   node scripts/backfill-amigo-stats.mjs --with-conformance  # run conformance first
 *   node scripts/backfill-amigo-stats.mjs --dry-run    # report changes only
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const cratesDir = join(root, 'crates')
const benchmarksDir = join(root, 'docs', 'benchmarks')
const conformanceResultsPath = join(root, 'conformance-results.json')

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const withConformance = args.has('--with-conformance')

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function formatRatio(x) {
  if (x < 2) return x.toFixed(2).replace(/\.?0+$/, '')
  if (x < 10) return x.toFixed(1).replace(/\.0$/, '')
  return Math.round(x).toString()
}

function entryVariant(name) {
  const i = name.indexOf(' ')
  return i === -1 ? '' : name.slice(i + 1)
}

// Mirrors generate-report.mjs::computeSpeedupString but emits the
// short README format ("X-Yx", "Xx", or "TBD") instead of "X× faster".
function computeVsJs(suites) {
  const ratios = []
  for (const suite of suites) {
    const amigoEntries = suite.entries.filter((e) => e.name.includes('@amigo') && e.hz > 0)
    const competitors = suite.entries.filter((e) => !e.name.includes('@amigo') && e.hz > 0)
    if (!amigoEntries.length || !competitors.length) continue
    const variantMatch = new Set(amigoEntries.map((e) => entryVariant(e.name))).size > 1
    for (const amigo of amigoEntries) {
      const pool = variantMatch
        ? competitors.filter((e) => entryVariant(e.name) === entryVariant(amigo.name))
        : competitors
      if (!pool.length) continue
      const bestHz = Math.max(...pool.map((e) => e.hz))
      ratios.push(amigo.hz / bestHz)
    }
  }
  if (!ratios.length) return null
  const min = Math.min(...ratios)
  const max = Math.max(...ratios)
  const lo = formatRatio(min)
  const hi = formatRatio(max)
  return lo === hi ? `${lo}x` : `${lo}-${hi}x`
}

function computeParity(pkgEntry) {
  const total = pkgEntry.total ?? 0
  if (!total) return null
  const passed = pkgEntry.passed ?? 0
  const skipped = pkgEntry.skipped ?? 0
  // Skipped tests are documented divergences and shouldn't drag the
  // percentage down — count them as part of the "passing" side.
  const ratio = (passed + skipped) / total
  if (ratio >= 0.995) return '100%'
  return `${Math.round(ratio * 100)}%`
}

function shouldKeep(value) {
  // Em-dash is the hand-curated "no competitor" / "no upstream suite"
  // signal. Never overwrite it.
  return value === '—'
}

if (withConformance) {
  console.log('Running conformance suite first...')
  const res = spawnSync('node', ['scripts/conformance-summary.mjs'], { stdio: 'inherit' })
  if (res.status !== 0) {
    console.error('conformance-summary.mjs failed; aborting.')
    process.exit(1)
  }
}

const conformanceData = existsSync(conformanceResultsPath) ? loadJson(conformanceResultsPath) : null
const conformanceByCrate = new Map(
  (conformanceData?.packages ?? []).map((p) => [p.name, p]),
)
if (!conformanceData) {
  console.log('No conformance-results.json — parity will not be updated.')
}

const changes = []

for (const entry of readdirSync(cratesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  if (entry.name === '_template') continue
  const pkgPath = join(cratesDir, entry.name, 'package.json')
  if (!existsSync(pkgPath)) continue
  const pkg = loadJson(pkgPath)
  if (pkg.private || !pkg.amigo) continue

  const before = { vsJs: pkg.amigo.vsJs, parity: pkg.amigo.parity }
  const after = { ...before }

  const benchPath = join(benchmarksDir, `${entry.name}.json`)
  if (existsSync(benchPath) && !shouldKeep(before.vsJs)) {
    const shard = loadJson(benchPath)
    const vsJs = computeVsJs(shard.suites ?? [])
    if (vsJs) after.vsJs = vsJs
  }

  const conf = conformanceByCrate.get(entry.name)
  if (conf && !shouldKeep(before.parity)) {
    const parity = computeParity(conf)
    if (parity) after.parity = parity
  }

  if (after.vsJs !== before.vsJs || after.parity !== before.parity) {
    changes.push({ crate: entry.name, before, after })
    if (!dryRun) {
      pkg.amigo.vsJs = after.vsJs
      pkg.amigo.parity = after.parity
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
    }
  }
}

if (!changes.length) {
  console.log('No changes.')
  process.exit(0)
}

console.log(`${dryRun ? '[dry-run] ' : ''}Updated ${changes.length} crate(s):`)
for (const { crate, before, after } of changes) {
  const parts = []
  if (before.vsJs !== after.vsJs) parts.push(`vsJs ${before.vsJs ?? '(unset)'} → ${after.vsJs}`)
  if (before.parity !== after.parity) parts.push(`parity ${before.parity ?? '(unset)'} → ${after.parity}`)
  console.log(`  ${crate}: ${parts.join(', ')}`)
}

if (!dryRun) {
  console.log('\nRegenerating README via sync-registry.mjs...')
  const res = spawnSync('node', ['scripts/sync-registry.mjs'], { stdio: 'inherit' })
  if (res.status !== 0) {
    console.error('sync-registry.mjs failed.')
    process.exit(1)
  }
}
