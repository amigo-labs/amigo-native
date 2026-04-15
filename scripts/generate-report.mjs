#!/usr/bin/env node

/**
 * Generates BENCHMARKS.md from bench-results.json and size-results.json.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const benchPath = join(root, 'bench-results.json')
const sizePath = join(root, 'size-results.json')

function formatOps(hz) {
  if (hz >= 1_000_000) return `${(hz / 1_000_000).toFixed(2)}M`
  if (hz >= 1_000) return `${(hz / 1_000).toFixed(1)}K`
  return `${hz.toFixed(1)}`
}

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return 'N/A'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function parseSpeedup(amigoHz, competitorHz) {
  if (!amigoHz || !competitorHz) return 'N/A'
  const ratio = amigoHz / competitorHz
  if (ratio >= 1) return `**${ratio.toFixed(1)}x faster**`
  return `${(1 / ratio).toFixed(1)}x slower`
}

// --- Parse bench results ---

let benchData = null
if (existsSync(benchPath)) {
  try {
    benchData = JSON.parse(readFileSync(benchPath, 'utf-8'))
  } catch (err) {
    console.warn(`Failed to parse ${benchPath}: ${err.message}`)
  }
}

let sizeData = null
if (existsSync(sizePath)) {
  try {
    sizeData = JSON.parse(readFileSync(sizePath, 'utf-8'))
  } catch (err) {
    console.warn(`Failed to parse ${sizePath}: ${err.message}`)
  }
}

if (!benchData && !sizeData) {
  console.error('No benchmark or size data found. Run `pnpm bench` and `pnpm bench:size` first.')
  process.exit(1)
}

// --- Build markdown ---

const lines = []
lines.push('# Benchmarks')
lines.push('')
lines.push(`> Generated on ${new Date().toISOString().split('T')[0]}`)
lines.push(`> Node.js ${process.version}, ${process.platform} ${process.arch}`)
lines.push('')

// Process bench results
if (benchData) {
  // vitest bench JSON format: { testResults: [{ children: [{ name, benchmark: { ... } }] }] }
  // Or it may be a flat array. Let's handle both.

  const suites = new Map() // suiteName -> { benchName -> hz }

  function extractBenchmarks(obj) {
    if (Array.isArray(obj)) {
      for (const item of obj) extractBenchmarks(item)
      return
    }
    if (obj.children) {
      for (const child of obj.children) extractBenchmarks(child)
    }
    if (obj.tasks) {
      for (const task of obj.tasks) {
        if (task.meta?.benchmark && task.result?.benchmark) {
          const suiteName = obj.name || 'default'
          if (!suites.has(suiteName)) suites.set(suiteName, new Map())
          suites.get(suiteName).set(task.name, task.result.benchmark.hz)
        }
      }
    }
    // Handle flat testResults format
    if (obj.testResults) {
      for (const tr of obj.testResults) extractBenchmarks(tr)
    }
  }

  extractBenchmarks(benchData)

  if (suites.size > 0) {
    lines.push('## Performance')
    lines.push('')

    // Group suites by crate (slugify, argon2, etc.)
    const crateGroups = new Map()
    for (const [suiteName, benchmarks] of suites) {
      // Detect crate from suite name
      let crate = 'other'
      for (const c of ['slugify', 'argon2', 'xxh', 'sanitize', 'csv']) {
        if (suiteName.toLowerCase().includes(c)) {
          crate = c === 'xxh' ? 'xxhash' : c === 'sanitize' ? 'sanitize-html' : c
          break
        }
      }
      if (!crateGroups.has(crate)) crateGroups.set(crate, [])
      crateGroups.get(crate).push({ suiteName, benchmarks })
    }

    for (const [crate, suiteList] of crateGroups) {
      lines.push(`### ${crate}`)
      lines.push('')

      for (const { suiteName, benchmarks } of suiteList) {
        lines.push(`**${suiteName}**`)
        lines.push('')
        lines.push('| Implementation | ops/sec | Comparison |')
        lines.push('|:---|---:|:---|')

        const entries = [...benchmarks.entries()]
        const amigoEntry = entries.find(([name]) => name.includes('@amigo'))
        const amigoHz = amigoEntry ? amigoEntry[1] : null

        for (const [name, hz] of entries) {
          const comparison = name.includes('@amigo')
            ? '**baseline**'
            : parseSpeedup(amigoHz, hz)
          lines.push(`| ${name} | ${formatOps(hz)} | ${comparison} |`)
        }

        lines.push('')
      }
    }
  }
}

// Process size results
if (sizeData) {
  lines.push('## Install Size')
  lines.push('')
  lines.push('Single-platform install footprint (node_modules).')
  lines.push('')

  for (const [crate, packages] of Object.entries(sizeData)) {
    lines.push(`### ${crate}`)
    lines.push('')
    lines.push('| Package | Install Size | vs @amigo-labs |')
    lines.push('|:---|---:|:---|')

    const amigoKey = `@amigo-labs/${crate}`
    const amigoSize = packages[amigoKey]?.installSize

    for (const [pkg, data] of Object.entries(packages)) {
      const size = data.installSize
      let comparison = ''
      if (pkg === amigoKey) {
        comparison = '**baseline**'
      } else if (size !== null && amigoSize) {
        const ratio = size / amigoSize
        if (ratio > 1) {
          comparison = `${ratio.toFixed(1)}x larger`
        } else {
          comparison = `${(1 / ratio).toFixed(1)}x smaller`
        }
      }
      lines.push(`| ${pkg} | ${formatBytes(size)} | ${comparison} |`)
    }

    lines.push('')
  }
}

const md = lines.join('\n')
const outPath = join(root, 'BENCHMARKS.md')
writeFileSync(outPath, md)
console.log(`Written to ${outPath}`)
console.log(`\n${md}`)
