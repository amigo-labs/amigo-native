#!/usr/bin/env node

/**
 * Runs `vitest bench` across all crates, parses the stdout table output,
 * and writes bench-results.json.
 *
 * Output format:
 * {
 *   "suites": [
 *     {
 *       "name": "slugify - short ASCII (20 chars)",
 *       "file": "__bench__/index.bench.ts",
 *       "entries": [
 *         { "name": "@amigo-labs/slugify", "hz": 1304735.29, "rme": 0.20, "samples": 652368 },
 *         { "name": "slugify (npm)", "hz": 455325.58, "rme": 2.04, "samples": 227663 }
 *       ]
 *     }
 *   ]
 * }
 */

import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

console.log('Running vitest bench (this may take a few minutes)...\n')

let output
try {
  output = execSync('npx vitest bench --no-color 2>&1', {
    cwd: root,
    encoding: 'utf-8',
    timeout: 600_000, // 10 minutes
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  })
} catch (err) {
  // vitest bench may exit non-zero if some benches fail, but we still want the output
  output = err.stdout || err.output?.join('') || ''
  if (!output.includes('·')) {
    console.error('vitest bench produced no results')
    console.error(err.message)
    process.exit(1)
  }
}

console.log(output)

// Parse the output
const suites = []
let currentSuite = null

for (const line of output.split('\n')) {
  // Suite line: " ✓ __bench__/index.bench.ts > slugify - short ASCII (20 chars) 1850ms"
  const suiteMatch = line.match(/[✓✗]\s+(\S+)\s+>\s+(.+?)\s+\d+ms/)
  if (suiteMatch) {
    currentSuite = {
      file: suiteMatch[1],
      name: suiteMatch[2],
      entries: [],
    }
    suites.push(currentSuite)
    continue
  }

  // Entry line: "   · @amigo-labs/slugify  1,304,735.29  0.0006  0.3809  0.0008  0.0007  0.0014  0.0015  0.0065  ±0.20%   652368"
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

const result = { suites }
const outPath = join(root, 'bench-results.json')
writeFileSync(outPath, JSON.stringify(result, null, 2))

console.log(`\nParsed ${suites.length} benchmark suites`)
console.log(`Written to ${outPath}`)
