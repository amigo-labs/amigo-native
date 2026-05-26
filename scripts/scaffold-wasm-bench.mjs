#!/usr/bin/env node

/**
 * Phase-3 codemod for docs/specs/wasm-perf-coverage.md.
 *
 * For every dual-target crate that does not yet have WASM bench coverage:
 *
 *   1. Insert a conditional `await import('../wasm/pkg/amigo_<name>_wasm.js')`
 *      block right after the existing `from '../index.js'` named-import line.
 *      Mirrors each named symbol as `wasm<Symbol>` so wasm benches can
 *      reference them without colliding with the napi names.
 *   2. Rename every `'@amigo-labs/<name>'` bench label to
 *      `'@amigo-labs/<name> (napi)'`, so the suffix matcher in
 *      `scripts/generate-report.mjs#entryVariant()` can separate variants.
 *   3. For every single-call `bench('@amigo-labs/<name> (napi)', () => { sym(...) })`
 *      whose body invokes one of the imported symbols, append a guarded
 *      mirror `if (wasm<Symbol>) bench('@amigo-labs/<name> (wasm)', ...)`.
 *
 * Bench files that don't fit the pattern are left untouched and a TODO is
 * surfaced for manual follow-up:
 *   - Already wired (`wasm/pkg` reference present)
 *   - Placeholder (`bench.todo` is the only bench call)
 *   - Class- or instance-based benches
 *   - Multi-statement bench bodies
 *   - Default imports / non-`../index.js` import paths
 *
 *   node scripts/scaffold-wasm-bench.mjs --dry-run   # report only
 *   node scripts/scaffold-wasm-bench.mjs             # write changes
 *   node scripts/scaffold-wasm-bench.mjs --crates a,b
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const NODE_ONLY_CRATES = new Set(['argon2', 'jose', 'jwt'])

function parseArgs(argv) {
  const args = { crates: null, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--crates') {
      args.crates = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    } else if (a.startsWith('--crates=')) {
      args.crates = a.slice('--crates='.length).split(',').map((s) => s.trim()).filter(Boolean)
    } else if (a === '--dry-run') {
      args.dryRun = true
    } else {
      console.error(`Unknown argument: ${a}`)
      process.exit(2)
    }
  }
  return args
}

function dualTargetCrates() {
  const cratesDir = join(root, 'crates')
  return readdirSync(cratesDir)
    .filter((name) => !name.startsWith('_'))
    .filter((name) => !NODE_ONLY_CRATES.has(name))
    .filter((name) => {
      const stat = statSync(join(cratesDir, name))
      return (
        stat.isDirectory() &&
        existsSync(join(cratesDir, name, 'wasm', 'Cargo.toml')) &&
        existsSync(join(cratesDir, name, '__bench__', 'index.bench.ts'))
      )
    })
    .sort()
}

function wasmFileName(crateName) {
  // dashes → underscores per wasm-pack convention
  return `amigo_${crateName.replace(/-/g, '_')}_wasm.js`
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Transform a single bench file. Returns { status, content?, reason? }.
 */
function transform(crate, source) {
  if (source.includes('wasm/pkg/amigo_')) {
    return { status: 'skip', reason: 'already wired' }
  }

  // Detect placeholder benches: only bench.todo calls, no real bench()
  const realBenchCount = (source.match(/^\s*bench\(/gm) ?? []).length
  if (realBenchCount === 0) {
    return { status: 'skip', reason: 'placeholder bench.todo only' }
  }

  // Find the named import from '../index.js' (may span multiple lines).
  // `[^}]` already matches newlines, so this works for both one-line and
  // multi-line imports while never crossing into the next import statement.
  const importMatch = source.match(
    /^import\s*\{\s*([^}]+?)\s*\}\s*from\s*['"]\.\.\/index\.js['"]\s*;?\s*$/m,
  )
  if (!importMatch) {
    return {
      status: 'skip',
      reason: "no `import { … } from '../index.js'` line — manual scaffold required",
    }
  }

  // Parse the symbol list. Support `{ foo, bar as baz }`, trailing commas,
  // and multi-line imports (whitespace already stripped by the outer regex).
  const symbols = importMatch[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(\w+)(?:\s+as\s+(\w+))?$/)
      if (!m) return null
      return { exported: m[1], local: m[2] ?? m[1] }
    })
  if (!symbols.length || symbols.some((s) => s === null)) {
    return { status: 'skip', reason: 'unable to parse import symbols' }
  }

  // Build the WASM import block.
  const wasmFile = wasmFileName(crate)
  const wasmDecls = symbols
    .map((s) => `let wasm${capitalize(s.local)}: typeof ${s.local} | null = null`)
    .join('\n')
  const wasmAssigns = symbols
    .map((s) => `  wasm${capitalize(s.local)} = mod.${s.exported}`)
    .join('\n')

  const wasmBlock = `
// WASM is built as build output, not committed. On a fresh checkout
// run \`pnpm build:wasm\` before \`pnpm bench\` to include the WASM
// comparator; otherwise the bench skips those entries with a warning.
${wasmDecls}
try {
  // @ts-expect-error — generated artifact path; not in source tree
  const mod = await import('../wasm/pkg/${wasmFile}')
${wasmAssigns}
} catch {
  console.warn('[bench] WASM artifact missing — run \`pnpm build:wasm\` to include WASM comparator')
}`

  // 1) Insert the WASM block after the napi import line.
  let out = source.replace(importMatch[0], `${importMatch[0]}${wasmBlock}`)

  // 2) Rename existing bench labels:
  //      `bench('@amigo-labs/<crate>', ...)` → `bench('@amigo-labs/<crate> (napi)', ...)`
  //      `bench('@amigo-labs/<crate> <suffix>', ...)` → `bench('@amigo-labs/<crate> (napi) <suffix>', ...)`
  // Preserves any existing parenthesised or trailing variant suffix.
  const crateEscaped = crate.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
  const napiLabelRe = new RegExp(
    `bench\\(\\s*(['"\\\`])@amigo-labs/${crateEscaped}([^'"\\\`]*)\\1`,
    'g',
  )
  let renamed = 0
  out = out.replace(napiLabelRe, (match, quote, suffix) => {
    if (suffix.includes('(napi)') || suffix.includes('(wasm)')) return match
    renamed++
    const trimmedSuffix = suffix.trim()
    return trimmedSuffix
      ? `bench(${quote}@amigo-labs/${crate} (napi) ${trimmedSuffix}${quote}`
      : `bench(${quote}@amigo-labs/${crate} (napi)${quote}`
  })

  // 3) Mirror simple single-call napi benches with guarded wasm benches.
  //    Matches:  bench('@amigo-labs/<crate> (napi)<…>', () => { fn(args) })
  //    where `fn` is one of the imported symbols.
  const symbolSet = new Set(symbols.map((s) => s.local))
  const symbolToWasm = new Map(symbols.map((s) => [s.local, `wasm${capitalize(s.local)}`]))
  const mirrorRe = new RegExp(
    String.raw`(^( *)bench\(\s*'@amigo-labs/${crate.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\s*\(napi\)([^']*)'\s*,\s*(?:async\s*)?\(\)\s*=>\s*\{\s*([A-Za-z_$][\w$]*)\(([^()]*)\)\s*\}\s*\)\s*$)`,
    'gm',
  )
  let mirrored = 0
  const todoSuites = new Set()
  out = out.replace(mirrorRe, (match, full, indent, suffix, fn, args) => {
    if (!symbolSet.has(fn)) {
      todoSuites.add(`${fn}(${args.trim()})`)
      return match
    }
    mirrored++
    const wasmFn = symbolToWasm.get(fn)
    const label = `'@amigo-labs/${crate} (wasm)${suffix}'`
    const cleanArgs = args.trim()
    const mirror = `\n${indent}if (${wasmFn}) bench(${label}, () => { ${wasmFn}!(${cleanArgs}) })`
    return `${full}${mirror}`
  })

  if (mirrored === 0) {
    return {
      status: 'partial',
      content: out,
      renamed,
      mirrored: 0,
      reason: 'imports + label renames added, but no simple bench bodies to mirror; add wasm benches manually',
    }
  }

  return { status: 'ok', content: out, renamed, mirrored }
}

const args = parseArgs(process.argv.slice(2))
const available = dualTargetCrates()
let targets = available
if (args.crates) {
  const unknown = args.crates.filter((c) => !available.includes(c))
  if (unknown.length) {
    console.error(`Unknown or non-dual-target crates: ${unknown.join(', ')}`)
    console.error(`Available: ${available.join(', ')}`)
    process.exit(2)
  }
  targets = [...new Set(args.crates)].sort()
}

const report = { ok: [], partial: [], skipped: [] }

for (const crate of targets) {
  const benchPath = join(root, 'crates', crate, '__bench__', 'index.bench.ts')
  const source = readFileSync(benchPath, 'utf-8')
  const result = transform(crate, source)
  if (result.status === 'ok') {
    if (!args.dryRun) writeFileSync(benchPath, result.content)
    report.ok.push({ crate, renamed: result.renamed, mirrored: result.mirrored })
  } else if (result.status === 'partial') {
    if (!args.dryRun) writeFileSync(benchPath, result.content)
    report.partial.push({ crate, renamed: result.renamed, reason: result.reason })
  } else {
    report.skipped.push({ crate, reason: result.reason })
  }
}

const banner = args.dryRun ? '(dry-run) ' : ''
console.log(`\n${banner}Scaffolded WASM benches for ${report.ok.length} crate(s):`)
for (const r of report.ok) {
  console.log(`  ✓ ${r.crate}: renamed ${r.renamed} label(s), mirrored ${r.mirrored} bench(es)`)
}
if (report.partial.length) {
  console.log(`\nPartial (imports added, manual mirror needed) for ${report.partial.length} crate(s):`)
  for (const r of report.partial) {
    console.log(`  ~ ${r.crate}: ${r.reason}`)
  }
}
if (report.skipped.length) {
  console.log(`\nSkipped ${report.skipped.length} crate(s) — manual follow-up:`)
  for (const r of report.skipped) {
    console.log(`  - ${r.crate}: ${r.reason}`)
  }
}
