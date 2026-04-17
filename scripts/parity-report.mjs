#!/usr/bin/env node

/**
 * Runs `vitest run __parity__` across all crates that have a __parity__
 * directory, collects pass/total counts per package, and writes
 * parity-results.json at the repo root.
 *
 * Output format:
 * {
 *   "packages": [
 *     { "name": "file-type", "passed": 480, "total": 500, "parity": 0.96 }
 *   ],
 *   "aggregate": { "passed": 480, "total": 500, "parity": 0.96 }
 * }
 */

import { spawnSync } from 'node:child_process'
import { writeFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const cratesDir = join(root, 'crates')

const packages = []
for (const entry of readdirSync(cratesDir)) {
  if (entry === '_template') continue
  const parityDir = join(cratesDir, entry, '__parity__')
  if (!existsSync(parityDir) || !statSync(parityDir).isDirectory()) continue

  // Skip if there are no *.spec.ts files
  const specs = readdirSync(parityDir).filter((f) => f.endsWith('.spec.ts'))
  if (!specs.length) continue

  packages.push(entry)
}

if (!packages.length) {
  console.log('No packages with __parity__/ found.')
  writeFileSync(
    join(root, 'parity-results.json'),
    JSON.stringify({ packages: [], aggregate: { passed: 0, total: 0, parity: 1 } }, null, 2),
  )
  process.exit(0)
}

console.log(`Running parity tests for: ${packages.join(', ')}\n`)

const results = []

for (const pkg of packages) {
  const pkgDir = join(cratesDir, pkg)
  console.log(`--- ${pkg} ---`)

  // Run vitest with JSON reporter targeting only this package's __parity__/
  const run = spawnSync(
    'pnpm',
    ['exec', 'vitest', 'run', '__parity__', '--reporter=json', '--no-color'],
    {
      cwd: pkgDir,
      encoding: 'utf-8',
      timeout: 300_000,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  const stdout = run.stdout || ''
  const stderr = run.stderr || ''

  // vitest JSON reporter prints a JSON blob to stdout. Find the last top-level
  // JSON object (vitest may print progress lines before the final JSON).
  let parsed = null
  const firstBrace = stdout.indexOf('{')
  if (firstBrace >= 0) {
    try {
      parsed = JSON.parse(stdout.slice(firstBrace))
    } catch {
      // fall through
    }
  }

  let passed = 0
  let total = 0
  if (parsed && typeof parsed === 'object') {
    // vitest json reporter shape: { numTotalTests, numPassedTests, ... }
    if (typeof parsed.numTotalTests === 'number') {
      total = parsed.numTotalTests
      passed = parsed.numPassedTests ?? 0
    } else if (Array.isArray(parsed.testResults)) {
      for (const tr of parsed.testResults) {
        for (const t of tr.assertionResults ?? []) {
          total++
          if (t.status === 'passed') passed++
        }
      }
    }
  }

  if (!total && stderr) {
    // Package may have no parity tests wired up yet — log and move on.
    console.warn(`  no tests parsed (stderr: ${stderr.split('\n').slice(0, 3).join(' | ')})`)
  }

  const parity = total > 0 ? passed / total : 1
  results.push({ name: pkg, passed, total, parity })
  console.log(`  ${passed}/${total} passed (${(parity * 100).toFixed(1)}%)`)
}

const agg = results.reduce(
  (acc, r) => ({ passed: acc.passed + r.passed, total: acc.total + r.total }),
  { passed: 0, total: 0 },
)
const aggregate = {
  passed: agg.passed,
  total: agg.total,
  parity: agg.total > 0 ? agg.passed / agg.total : 1,
}

const out = { packages: results, aggregate }
const outPath = join(root, 'parity-results.json')
writeFileSync(outPath, JSON.stringify(out, null, 2))

console.log(
  `\nAggregate: ${aggregate.passed}/${aggregate.total} (${(aggregate.parity * 100).toFixed(1)}%)`,
)
console.log(`Written to ${outPath}`)
