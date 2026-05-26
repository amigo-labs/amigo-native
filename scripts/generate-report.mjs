#!/usr/bin/env node

/**
 * Consumes per-crate `bench-results-<crate>.json` shards produced by
 * scripts/run-benchmarks.mjs (plus size-results.json and parity-results.json
 * from their respective generators) and updates the files that live in git:
 *
 *   docs/benchmarks/<crate>.json   — per-crate shard. Only crates that were
 *                                    re-benched this run are overwritten;
 *                                    everything else stays byte-identical so
 *                                    noisy hardware-variance diffs stop
 *                                    churning the tree.
 *   docs/history/<crate>.jsonl     — append-only trend log. One JSONL line
 *                                    per bench run per crate; compact
 *                                    (only hz + ratio) so it stays small.
 *   docs/data.json                 — legacy aggregate the dashboard
 *                                    (docs/app.js) consumes directly.
 *                                    Rebuilt from every shard on every run.
 *   docs/packages.json             — only the `speedup` field per entry is
 *                                    regenerated from the aggregated data.
 *
 * If no fresh `bench-results-*.json` exist, only the aggregate is rebuilt —
 * shards and history stay untouched.
 */

import { spawnSync } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const docsDir = join(root, 'docs')
const shardsDir = join(docsDir, 'benchmarks')
const historyDir = join(docsDir, 'history')

mkdirSync(shardsDir, { recursive: true })
mkdirSync(historyDir, { recursive: true })

function loadJson(path) {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch (err) {
    console.warn(`Failed to parse ${path}: ${err.message}`)
    return null
  }
}

function gitShortSha() {
  const res = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf-8' })
  return res.status === 0 ? res.stdout.trim() : null
}

function runnerLabel() {
  return process.env.RUNNER_OS
    ? `${process.env.RUNNER_OS.toLowerCase()}-${process.arch}`
    : `${process.platform}-${process.arch}`
}

// --- 1. Ingest fresh per-crate bench results -----------------------------

const freshShardFiles = readdirSync(root).filter(
  (f) => f.startsWith('bench-results-') && f.endsWith('.json'),
)

const now = new Date()
const commit = gitShortSha()
const runner = runnerLabel()
const nodeVersion = process.version
const generatedAt = now.toISOString()
const dateOnly = generatedAt.slice(0, 10)

for (const file of freshShardFiles) {
  const data = loadJson(join(root, file))
  if (!data?.crate || !Array.isArray(data.suites) || !data.suites.length) continue

  const shard = {
    crate: data.crate,
    generatedAt,
    commit,
    runner,
    nodeVersion,
    suites: data.suites,
  }
  writeFileSync(join(shardsDir, `${data.crate}.json`), JSON.stringify(shard, null, 2) + '\n')

  const historyEntry = {
    commit,
    date: dateOnly,
    runner,
    node: nodeVersion,
    suites: data.suites.map((s) => {
      const amigoEntries = s.entries.filter((e) => e.name.includes('@amigo') && e.hz > 0)
      const competitors = s.entries.filter((e) => !e.name.includes('@amigo') && e.hz > 0)
      const amigo = amigoEntries.length ? Math.max(...amigoEntries.map((e) => e.hz)) : null
      const bestCompetitor = competitors.length ? Math.max(...competitors.map((e) => e.hz)) : null
      return {
        name: s.name,
        amigo,
        best_competitor: bestCompetitor,
        ratio: amigo && bestCompetitor ? Number((amigo / bestCompetitor).toFixed(3)) : null,
      }
    }),
  }
  appendFileSync(join(historyDir, `${data.crate}.jsonl`), JSON.stringify(historyEntry) + '\n')
  // Consume the intermediate so a later run without a fresh bench for this
  // crate doesn't re-ingest stale numbers and double-append its history.
  unlinkSync(join(root, file))
  console.log(`Updated docs/benchmarks/${data.crate}.json + appended history`)
}

// --- 2. Rebuild docs/data.json aggregate from all shards -----------------

const allShards = readdirSync(shardsDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => loadJson(join(shardsDir, f)))
  .filter(Boolean)
  .sort((a, b) => a.crate.localeCompare(b.crate))

const aggregatedSuites = []
for (const shard of allShards) {
  for (const suite of shard.suites ?? []) aggregatedSuites.push(suite)
}

const sizeData = loadJson(join(root, 'size-results.json'))
const parityData = loadJson(join(root, 'parity-results.json'))

const docsData = {
  generatedAt: dateOnly,
  nodeVersion,
  platform: `${process.platform} ${process.arch}`,
  benchmarks: aggregatedSuites.length ? { suites: aggregatedSuites } : null,
  sizes: sizeData ?? null,
  parity: parityData ?? null,
}
writeFileSync(join(docsDir, 'data.json'), JSON.stringify(docsData, null, 2) + '\n')
console.log(`Wrote docs/data.json (${aggregatedSuites.length} suites from ${allShards.length} shards)`)

// --- 3. Refresh docs/packages.json speedup strings -----------------------

function formatRatio(x) {
  if (x < 2) return x.toFixed(2).replace(/\.?0+$/, '')
  if (x < 10) return x.toFixed(1).replace(/\.0$/, '')
  return Math.round(x).toString()
}

/**
 * Returns the *semantic* variant of a bench label — i.e. the suite-specific
 * suffix that distinguishes "streaming" from "loop", `split()` from
 * `splitToOffsets()`, etc. The `(napi)` / `(wasm)` markers are tier tags
 * (which binding produced the number) and are stripped before matching.
 *
 *   '@amigo-labs/xxhash (napi) (loop)' → '(loop)'
 *   '@amigo-labs/sentences (wasm) split()' → 'split()'
 *   'xxhashjs (loop)' → '(loop)'
 *   '@amigo-labs/slugify (napi)' → ''
 */
function entryVariant(name) {
  const stripped = name.replace(/\((?:napi|wasm)\)\s*/g, '').replace(/\s+/g, ' ').trim()
  const i = stripped.indexOf(' ')
  return i === -1 ? '' : stripped.slice(i + 1)
}

/**
 * Tier of an amigo bench entry: `'napi'` for native bindings, `'wasm'` for
 * the wasm-bindgen build, `null` for everything else (competitors or legacy
 * unsuffixed amigo entries). Driven entirely by the label suffix injected
 * by `scripts/scaffold-wasm-bench.mjs`.
 */
function entryTier(name) {
  if (!name.includes('@amigo')) return null
  if (name.includes('(napi)')) return 'napi'
  if (name.includes('(wasm)')) return 'wasm'
  return null
}

/**
 * Compute per-suite ratios of amigo (filtered by tier) vs. the best
 * competitor. The `competitors` list excludes amigo entries entirely so
 * napi-vs-wasm comparisons don't leak into the upstream comparison.
 */
function ratiosForTier(suites, tier) {
  const ratios = []
  for (const suite of suites) {
    const amigoEntries = suite.entries.filter(
      (e) => e.hz > 0 && entryTier(e.name) === tier,
    )
    const competitors = suite.entries.filter((e) => e.hz > 0 && !e.name.includes('@amigo'))
    if (!amigoEntries.length || !competitors.length) continue
    const hasVariants = new Set(amigoEntries.map((e) => entryVariant(e.name))).size > 1
    for (const amigo of amigoEntries) {
      const pool = hasVariants
        ? competitors.filter((e) => entryVariant(e.name) === entryVariant(amigo.name))
        : competitors
      const candidates = pool.length ? pool : competitors
      const bestHz = Math.max(...candidates.map((e) => e.hz))
      ratios.push(amigo.hz / bestHz)
    }
  }
  return ratios
}

function ratiosToLabel(ratios) {
  if (!ratios.length) return null
  const min = Math.min(...ratios)
  const max = Math.max(...ratios)
  if (min >= 1.05) {
    const lo = formatRatio(min)
    const hi = formatRatio(max)
    return lo === hi ? `${lo}× faster` : `${lo}–${hi}× faster`
  }
  if (max <= 0.95) {
    const lo = formatRatio(1 / max)
    const hi = formatRatio(1 / min)
    return lo === hi ? `${lo}× slower` : `${lo}–${hi}× slower`
  }
  const winners = ratios.filter((r) => r >= 1.05)
  const losers = ratios.filter((r) => r <= 0.95)
  const parts = []
  if (winners.length) parts.push(`up to ${formatRatio(Math.max(...winners))}× faster`)
  if (losers.length) parts.push(`${formatRatio(1 / Math.min(...losers))}× slower`)
  return parts.length ? parts.join(' / ') : '~equal'
}

/**
 * Build the speedupDetails structure consumed by the web UI per
 * docs/specs/wasm-perf-coverage.md Phase 5.
 *
 *   {
 *     napi: { label: '12× faster', hz: 4200, vsJs: 12.0 },
 *     wasm: { label: '7.8× faster', hz: 2740, vsJs: 7.8 }
 *   }
 *
 * `hz` is the geometric-mean throughput across the crate's suites (so single
 * absolute number per tier, useful for the badge), and `vsJs` is the median
 * ratio (resistant to a single outlier suite). Tiers with no data are
 * omitted. A legacy unsuffixed amigo entry (no `(napi)` / `(wasm)`) is
 * treated as `napi` for back-compat — that's where today's slugify-style
 * data lands.
 */
function computeSpeedupDetails(suites) {
  const result = {}
  for (const tier of ['napi', 'wasm']) {
    const ratios = ratiosForTier(suites, tier)
    const label = ratiosToLabel(ratios)
    if (label === null) continue
    const hzs = []
    for (const suite of suites) {
      for (const entry of suite.entries) {
        if (entry.hz > 0 && entryTier(entry.name) === tier) hzs.push(entry.hz)
      }
    }
    const geomHz = hzs.length
      ? Math.exp(hzs.reduce((s, h) => s + Math.log(h), 0) / hzs.length)
      : null
    const sortedRatios = [...ratios].sort((a, b) => a - b)
    const medianRatio = sortedRatios[Math.floor(sortedRatios.length / 2)]
    result[tier] = {
      label,
      hz: geomHz !== null ? Math.round(geomHz) : null,
      vsJs: Number(medianRatio.toFixed(2)),
    }
  }
  return Object.keys(result).length ? result : null
}

/**
 * Pre-Phase-3 variant matcher: returns everything after the first space.
 * Kept verbatim so legacy shards (no `(napi)` / `(wasm)` tier suffix)
 * produce the exact same speedup strings they did before this refactor.
 */
function legacyEntryVariant(name) {
  const i = name.indexOf(' ')
  return i === -1 ? '' : name.slice(i + 1)
}

function legacySpeedupRatios(suites) {
  const ratios = []
  for (const suite of suites) {
    const amigoEntries = suite.entries.filter((e) => e.name.includes('@amigo') && e.hz > 0)
    const competitors = suite.entries.filter((e) => !e.name.includes('@amigo') && e.hz > 0)
    if (!amigoEntries.length || !competitors.length) continue
    const variantMatch = new Set(amigoEntries.map((e) => legacyEntryVariant(e.name))).size > 1
    for (const amigo of amigoEntries) {
      const pool = variantMatch
        ? competitors.filter((e) => legacyEntryVariant(e.name) === legacyEntryVariant(amigo.name))
        : competitors
      if (!pool.length) continue
      const bestHz = Math.max(...pool.map((e) => e.hz))
      ratios.push(amigo.hz / bestHz)
    }
  }
  return ratios
}

/**
 * Legacy single-string speedup: prefers the napi tier (matches the historical
 * shape of the field), falls back to wasm if napi isn't present, otherwise
 * preserves the pre-Phase-3 algorithm byte-for-byte so existing speedup
 * strings stay stable until benches are re-recorded with tier suffixes.
 */
function computeSpeedupString(suites) {
  const ratios = ratiosForTier(suites, 'napi')
  if (ratios.length) return ratiosToLabel(ratios)
  const wasmRatios = ratiosForTier(suites, 'wasm')
  if (wasmRatios.length) return ratiosToLabel(wasmRatios)
  return ratiosToLabel(legacySpeedupRatios(suites)) ?? 'TBD'
}

const packagesPath = join(docsDir, 'packages.json')
if (aggregatedSuites.length && existsSync(packagesPath)) {
  const packagesData = JSON.parse(readFileSync(packagesPath, 'utf-8'))
  const suitesByCrate = new Map()
  for (const suite of aggregatedSuites) {
    const m = suite.file?.match(/^crates\/([^/]+)\//)
    if (!m) continue
    if (!suitesByCrate.has(m[1])) suitesByCrate.set(m[1], [])
    suitesByCrate.get(m[1]).push(suite)
  }
  for (const pkg of packagesData.packages ?? []) {
    const suites = suitesByCrate.get(pkg.name)
    if (!suites?.length) continue
    pkg.speedup = computeSpeedupString(suites)
    const details = computeSpeedupDetails(suites)
    if (details) {
      pkg.speedupDetails = details
    } else if (pkg.speedupDetails) {
      delete pkg.speedupDetails
    }
  }
  writeFileSync(packagesPath, JSON.stringify(packagesData, null, 2) + '\n')
  console.log(`Updated speedup strings in docs/packages.json`)
}
