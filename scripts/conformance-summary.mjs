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
  let skipped = 0
  let total = 0
  let suiteLoadError = false
  const files = []
  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.testResults)) {
      for (const tr of parsed.testResults) {
        let fp = 0
        let ff = 0
        let fs = 0
        for (const t of tr.assertionResults ?? []) {
          total++
          if (t.status === 'passed') {
            passed++
            fp++
          } else if (t.status === 'skipped' || t.status === 'pending' || t.status === 'todo') {
            // Skipped tests are intentional opt-outs (KNOWN_DIVERGENCES,
            // it.skip) — not failures. Track them separately so the
            // summary can report them without flagging the PR red.
            skipped++
            fs++
          } else {
            failed++
            ff++
          }
        }
        files.push({
          name: basename(tr.name ?? ''),
          passed: fp,
          failed: ff,
          skipped: fs,
          total: fp + ff + fs,
        })
      }
    } else if (typeof parsed.numTotalTests === 'number') {
      total = parsed.numTotalTests
      passed = parsed.numPassedTests ?? 0
      skipped = (parsed.numPendingTests ?? 0) + (parsed.numTodoTests ?? 0)
      failed = total - passed - skipped
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

  results.push({ name: pkg, passed, failed, skipped, total, files, suiteLoadError })
  const pct = total > 0 ? ((passed / total) * 100).toFixed(1) : '100.0'
  const extra = [
    failed ? `${failed} failed` : '',
    skipped ? `${skipped} skipped` : '',
  ]
    .filter(Boolean)
    .join(', ')
  console.log(`  ${passed}/${total} passed (${pct}%)${extra ? `, ${extra}` : ''}`)
}

const agg = results.reduce(
  (acc, r) => ({
    passed: acc.passed + r.passed,
    failed: acc.failed + r.failed,
    skipped: acc.skipped + r.skipped,
    total: acc.total + r.total,
  }),
  { passed: 0, failed: 0, skipped: 0, total: 0 },
)

writeFileSync(
  join(root, 'conformance-results.json'),
  JSON.stringify({ packages: results, aggregate: agg }, null, 2),
)

const pct = agg.total > 0 ? ((agg.passed / agg.total) * 100).toFixed(1) : '100.0'
const anyLoadError = results.some((r) => r.suiteLoadError)
const allGreen = agg.failed === 0 && !anyLoadError
const header = allGreen
  ? agg.skipped
    ? `Conformance: all green (${agg.skipped} skipped)`
    : 'Conformance: all green'
  : agg.failed > 0
    ? `Conformance: ${agg.failed} failing`
    : 'Conformance: suite load errors'

let md = `## ${header}\n\n`
md += `**Totals:** ${agg.passed} / ${agg.total} passed (${pct}%)`
if (agg.failed) md += ` — **${agg.failed} failed**`
if (agg.skipped) md += ` — ${agg.skipped} skipped (documented divergences)`
md += '\n\n'
md += '| Package | Passed | Failed | Skipped | Total | % |\n|:---|---:|---:|---:|---:|---:|\n'
for (const r of results) {
  if (r.suiteLoadError) {
    md += `| **${r.name}** | — | — | — | — | _suite load error_ |\n`
    continue
  }
  const p = r.total > 0 ? ((r.passed / r.total) * 100).toFixed(1) : '100.0'
  const nameCell = r.failed ? `**${r.name}**` : r.name
  md += `| ${nameCell} | ${r.passed} | ${r.failed} | ${r.skipped} | ${r.total} | ${p}% |\n`
}

writeFileSync(join(root, 'conformance-summary.md'), md)

const aggExtra = [
  agg.failed ? `${agg.failed} failed` : '',
  agg.skipped ? `${agg.skipped} skipped` : '',
]
  .filter(Boolean)
  .join(', ')
console.log(
  `\nAggregate: ${agg.passed}/${agg.total} (${pct}%)${aggExtra ? `, ${aggExtra}` : ''}`,
)
console.log(`Written conformance-summary.md and conformance-results.json`)

// Skipped tests are documented divergences, not failures; only exit
// non-zero on real failures or suite load errors.
if (agg.failed > 0 || anyLoadError) process.exit(1)
