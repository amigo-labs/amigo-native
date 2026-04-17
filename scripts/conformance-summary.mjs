#!/usr/bin/env node

/**
 * Runs vitest __conformance__ across all crates that have a __conformance__
 * directory, collects pass/fail counts per package + per file, and writes
 * two artifacts:
 *   - conformance-results.json (machine)
 *   - conformance-summary.md   (PR comment / GITHUB_STEP_SUMMARY)
 */

import { spawnSync } from 'node:child_process'
import { writeFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'

const root = process.cwd()
const cratesDir = join(root, 'crates')

const packages = []
for (const entry of readdirSync(cratesDir)) {
  if (entry === '_template') continue
  const dir = join(cratesDir, entry, '__conformance__')
  if (!existsSync(dir) || !statSync(dir).isDirectory()) continue
  const specs = readdirSync(dir).filter((f) => f.endsWith('.spec.ts'))
  if (!specs.length) continue
  packages.push(entry)
}

if (!packages.length) {
  console.log('No packages with __conformance__/ found.')
  writeFileSync(
    join(root, 'conformance-results.json'),
    JSON.stringify({ packages: [], aggregate: { passed: 0, failed: 0, total: 0 } }, null, 2),
  )
  writeFileSync(join(root, 'conformance-summary.md'), '## Conformance\n\n_No conformance tests found._\n')
  process.exit(0)
}

console.log(`Running conformance for: ${packages.join(', ')}\n`)

const results = []

for (const pkg of packages) {
  const pkgDir = join(cratesDir, pkg)
  console.log(`--- ${pkg} ---`)

  const run = spawnSync(
    'pnpm',
    ['exec', 'vitest', 'run', '__conformance__', '--reporter=json', '--no-color'],
    {
      cwd: pkgDir,
      encoding: 'utf-8',
      timeout: 600_000,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  const stdout = run.stdout || ''
  const stderr = run.stderr || ''

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
  let failed = 0
  let total = 0
  let suiteLoadError = false
  const files = []
  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.testResults)) {
      for (const tr of parsed.testResults) {
        let fp = 0
        let ff = 0
        for (const t of tr.assertionResults ?? []) {
          total++
          if (t.status === 'passed') {
            passed++
            fp++
          } else {
            failed++
            ff++
          }
        }
        files.push({ name: basename(tr.name ?? ''), passed: fp, failed: ff, total: fp + ff })
      }
    } else if (typeof parsed.numTotalTests === 'number') {
      total = parsed.numTotalTests
      passed = parsed.numPassedTests ?? 0
      failed = total - passed
    }
    if (
      total === 0 &&
      typeof parsed.numFailedTestSuites === 'number' &&
      parsed.numFailedTestSuites > 0
    ) {
      suiteLoadError = true
    }
  }

  if (!total && stderr) {
    console.warn(`  no tests parsed (stderr: ${stderr.split('\n').slice(0, 3).join(' | ')})`)
  }

  results.push({ name: pkg, passed, failed, total, files, suiteLoadError })
  const pct = total > 0 ? ((passed / total) * 100).toFixed(1) : '100.0'
  console.log(`  ${passed}/${total} passed (${pct}%)${failed ? `, ${failed} failed` : ''}`)
}

const agg = results.reduce(
  (acc, r) => ({
    passed: acc.passed + r.passed,
    failed: acc.failed + r.failed,
    total: acc.total + r.total,
  }),
  { passed: 0, failed: 0, total: 0 },
)

writeFileSync(
  join(root, 'conformance-results.json'),
  JSON.stringify({ packages: results, aggregate: agg }, null, 2),
)

const pct = agg.total > 0 ? ((agg.passed / agg.total) * 100).toFixed(1) : '100.0'
const anyLoadError = results.some((r) => r.suiteLoadError)
const allGreen = agg.failed === 0 && !anyLoadError
const header = allGreen
  ? 'Conformance: all green'
  : agg.failed > 0
    ? `Conformance: ${agg.failed} failing`
    : 'Conformance: suite load errors'

let md = `## ${header}\n\n`
md += `**Totals:** ${agg.passed} / ${agg.total} passed (${pct}%)`
if (agg.failed) md += ` — **${agg.failed} failed**`
md += '\n\n'
md += '| Package | Passed | Failed | Total | % |\n|:---|---:|---:|---:|---:|\n'
for (const r of results) {
  if (r.suiteLoadError) {
    md += `| **${r.name}** | — | — | — | _suite load error_ |\n`
    continue
  }
  const p = r.total > 0 ? ((r.passed / r.total) * 100).toFixed(1) : '100.0'
  const nameCell = r.failed ? `**${r.name}**` : r.name
  md += `| ${nameCell} | ${r.passed} | ${r.failed} | ${r.total} | ${p}% |\n`
}

writeFileSync(join(root, 'conformance-summary.md'), md)

console.log(
  `\nAggregate: ${agg.passed}/${agg.total} (${pct}%)${agg.failed ? `, ${agg.failed} failed` : ''}`,
)
console.log(`Written conformance-summary.md and conformance-results.json`)

if (agg.failed > 0 || anyLoadError) process.exit(1)
