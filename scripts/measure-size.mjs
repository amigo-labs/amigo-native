#!/usr/bin/env node

/**
 * Measures install footprint of amigo-native packages vs competitors.
 * Outputs size-results.json at the repo root.
 */

import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, statSync, readdirSync } from 'node:fs'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const PACKAGES = {
  slugify: {
    amigo: { crate: 'slugify' },
    competitors: ['slugify'],
  },
  argon2: {
    amigo: { crate: 'argon2' },
    competitors: ['argon2', 'hash-wasm'],
  },
  xxhash: {
    amigo: { crate: 'xxhash' },
    competitors: ['xxhash-wasm', 'xxhashjs'],
  },
  'sanitize-html': {
    amigo: { crate: 'sanitize-html' },
    competitors: ['sanitize-html', 'isomorphic-dompurify'],
  },
  csv: {
    amigo: { crate: 'csv' },
    competitors: ['csv-parse', 'papaparse'],
  },
}

function getDirSize(dir) {
  let total = 0
  try {
    const entries = readdirSync(dir, { withFileTypes: true, recursive: true })
    for (const entry of entries) {
      if (entry.isFile()) {
        try {
          total += statSync(join(entry.parentPath || entry.path, entry.name)).size
        } catch {
          // skip inaccessible files
        }
      }
    }
  } catch {
    // directory doesn't exist
  }
  return total
}

function measureAmigoSize(crateName) {
  const crateDir = join(process.cwd(), 'crates', crateName)
  let total = 0

  // Measure .node binary + index.js + index.d.ts (what ships in the package)
  for (const file of readdirSync(crateDir)) {
    if (file.endsWith('.node') || file === 'index.js' || file === 'index.d.ts') {
      total += statSync(join(crateDir, file)).size
    }
  }

  return total
}

function measureNpmInstallSize(packageName) {
  const tmp = mkdtempSync(join(tmpdir(), 'amigo-size-'))
  try {
    execSync(`npm install --prefix "${tmp}" ${packageName} --ignore-scripts --no-audit --no-fund 2>/dev/null`, {
      stdio: 'pipe',
      timeout: 60000,
    })
    const nmDir = join(tmp, 'node_modules')
    return getDirSize(nmDir)
  } catch (err) {
    console.warn(`  Failed to install ${packageName}: ${err.message}`)
    return null
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

function formatBytes(bytes) {
  if (bytes === null) return 'N/A'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

console.log('Measuring package sizes...\n')

const results = {}

for (const [name, config] of Object.entries(PACKAGES)) {
  console.log(`--- ${name} ---`)
  results[name] = {}

  // Amigo package
  const amigoSize = measureAmigoSize(config.amigo.crate)
  results[name][`@amigo-labs/${name}`] = { installSize: amigoSize }
  console.log(`  @amigo-labs/${name}: ${formatBytes(amigoSize)}`)

  // Competitors
  for (const pkg of config.competitors) {
    console.log(`  ${pkg}: measuring...`)
    const size = measureNpmInstallSize(pkg)
    results[name][pkg] = { installSize: size }
    console.log(`  ${pkg}: ${formatBytes(size)}`)
  }

  console.log()
}

const outPath = join(process.cwd(), 'size-results.json')
writeFileSync(outPath, JSON.stringify(results, null, 2))
console.log(`Results written to ${outPath}`)
