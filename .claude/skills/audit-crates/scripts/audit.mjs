#!/usr/bin/env node
/**
 * audit-crates — verify every crate in crates/* conforms to the reference
 * conventions (argon2/csv/sanitize-html/slugify/xxhash). Outputs a markdown
 * report with a per-crate status table and a prioritized gap-fix checklist.
 *
 * Run from the monorepo root:
 *   node .claude/skills/audit-crates/scripts/audit.mjs
 *   node .claude/skills/audit-crates/scripts/audit.mjs --json
 */

import { readdirSync, existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const CRATES_DIR = join(ROOT, 'crates')
const PLATFORMS = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64-gnu',
  'linux-x64-gnu',
  'linux-x64-musl',
  'win32-x64-msvc',
]
const REGISTRY_FIELDS = ['title', 'description', 'speedup', 'npmUrl', 'sourceUrl', 'readmeUrl']

// Crates that intentionally stay Node.js-only and never get a WASM build.
// Source of truth: docs/specs/expansion-2026.md § Node.js server-only tier.
// Mirrored by scripts/sync-registry.mjs and .github/workflows/{ci,release}.yml.
const NODE_ONLY_CRATES = new Set(['argon2', 'jose', 'jwt'])

const asJson = process.argv.includes('--json')
const asPlan = process.argv.includes('--plan')

function die(msg) {
  console.error(`[audit-crates] ${msg}`)
  process.exit(2)
}

if (!existsSync(CRATES_DIR)) {
  die(`crates/ directory not found in ${ROOT}. Run from the monorepo root.`)
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

function isDir(p) {
  try { return statSync(p).isDirectory() } catch { return false }
}

function listCrates() {
  return readdirSync(CRATES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    // Skip _template (scaffold) and the `_<name>-core` internal crates —
    // those are pure-Rust libraries embedded as path deps by the dual-target
    // wrappers; they don't ship to npm, so the audit's "missing platform
    // stubs / docs entry / README" checks don't apply to them.
    .filter((e) => e.name !== '_template' && !e.name.startsWith('_'))
    .map((e) => e.name)
    .sort()
}

function auditCrate(name) {
  const dir = join(CRATES_DIR, name)
  const pkg = readJson(join(dir, 'package.json')) ?? {}
  const scripts = pkg.scripts ?? {}
  const devDeps = pkg.devDependencies ?? {}
  const amigoBlock = pkg.amigo ?? {}

  const npmDir = join(dir, 'npm')
  const missingPlatforms = PLATFORMS.filter((p) => !isDir(join(npmDir, p)))

  // parity.spec.ts (cross-verify our impl vs upstream) and upstream.spec.ts
  // (run upstream's own test suite against our impl) are both valid patterns
  // for conformance — either counts as parity coverage.
  const hasParitySpec = existsSync(join(dir, '__conformance__', 'parity.spec.ts'))
  const hasUpstreamSpec = existsSync(join(dir, '__conformance__', 'upstream.spec.ts'))

  // ── WASM dual-target scaffolding (per expansion-2026 conventions) ──
  // Required for every public crate NOT in NODE_ONLY_CRATES; forbidden for the
  // 3-crate Node-only group. Internal `_<name>` crates are pure-Rust libraries
  // (publish = false) — they get embedded as path deps in others' wasm sub-crates
  // and do not produce their own WASM artifact, so they're skipped entirely.
  const isInternal = name.startsWith('_')
  const isNodeOnly = NODE_ONLY_CRATES.has(name)
  const wasmDirPresent = isDir(join(dir, 'wasm'))
  const wasmCargoPresent = existsSync(join(dir, 'wasm', 'Cargo.toml'))
  const wasmLibPresent = existsSync(join(dir, 'wasm', 'src', 'lib.rs'))
  const buildWasmScript = typeof scripts['build:wasm'] === 'string'
  const exports_ = pkg.exports
  const dotExport = exports_ && typeof exports_ === 'object' ? exports_['.'] : null
  const browserExport = Boolean(
    pkg.browser ||
      (dotExport && typeof dotExport === 'object' && dotExport.browser),
  )
  const targetsField = Array.isArray(amigoBlock.targets) ? amigoBlock.targets : null

  // For internal crates, the WASM check is N/A — always OK.
  // For Node-only crates, all WASM scaffolding must be ABSENT.
  // For dual-target crates, the four WASM markers (dir, Cargo, lib, script) + browser export must be PRESENT.
  let wasmOk
  if (isInternal) {
    wasmOk = true
  } else if (isNodeOnly) {
    wasmOk =
      !wasmDirPresent &&
      !buildWasmScript &&
      !browserExport &&
      (targetsField === null || (targetsField.length === 1 && targetsField[0] === 'node'))
  } else {
    wasmOk =
      wasmDirPresent &&
      wasmCargoPresent &&
      wasmLibPresent &&
      buildWasmScript &&
      browserExport &&
      (targetsField === null || targetsField.includes('browser'))
  }

  return {
    name,
    isInternal,
    isNodeOnly,
    // modern convention
    conformanceDir: isDir(join(dir, '__conformance__')),
    parityFile: hasParitySpec,
    upstreamFile: hasUpstreamSpec,
    parityCoverage: hasParitySpec || hasUpstreamSpec,
    fuzzFile: existsSync(join(dir, '__conformance__', 'fuzz.spec.ts')),
    testConformanceScript: typeof scripts['test:conformance'] === 'string',
    testAllScript: typeof scripts['test:all'] === 'string',
    // legacy markers
    legacyParityDir: isDir(join(dir, '__parity__')),
    legacyTestParityScript: typeof scripts['test:parity'] === 'string',
    // shared
    testScript: typeof scripts.test === 'string',
    benchScript: typeof scripts.bench === 'string',
    benchFile: existsSync(join(dir, '__bench__', 'index.bench.ts')),
    testDir: isDir(join(dir, '__test__')),
    fastCheck: typeof devDeps['fast-check'] === 'string',
    readme: existsSync(join(dir, 'README.md')),
    npmDir: isDir(npmDir),
    missingPlatforms,
    cargo: existsSync(join(dir, 'Cargo.toml')),
    lib: existsSync(join(dir, 'src', 'lib.rs')),
    // wasm dual-target
    wasmDirPresent,
    wasmCargoPresent,
    wasmLibPresent,
    buildWasmScript,
    browserExport,
    targetsField,
    wasmOk,
  }
}

function auditDocs(crates) {
  // docs/packages.json is hand-edited (brand + marquee + heroTaglines + packages).
  // docs/data.json is auto-generated by scripts/generate-report.mjs (benchmarks + sizes + parity).
  const pkgs = readJson(join(ROOT, 'docs', 'packages.json'))
  const data = readJson(join(ROOT, 'docs', 'data.json'))

  const listed = new Set((pkgs?.packages ?? []).map((p) => p.name))
  const missingInPackagesJson = crates.filter((c) => !listed.has(c))

  const fieldGaps = []
  for (const p of pkgs?.packages ?? []) {
    const gaps = REGISTRY_FIELDS.filter((f) => !p[f] || String(p[f]).trim() === '')
    if (gaps.length) fieldGaps.push({ name: p.name, gaps })
  }

  const marqueeEntry = (pkgs?.marquee ?? []).find((m) => m.k === 'PACKAGES')
  const marqueeCount = marqueeEntry ? Number(marqueeEntry.v) : null
  const marqueeExpected = crates.length
  const marqueeOk = marqueeCount === marqueeExpected

  return {
    pkgsJsonFound: pkgs !== null,
    dataJsonFound: data !== null,
    missingInPackagesJson,
    fieldGaps,
    marqueeCount,
    marqueeExpected,
    marqueeOk,
  }
}

const crateNames = listCrates()
const crates = crateNames.map(auditCrate)
const docs = auditDocs(crateNames)

// --- Priority buckets for the checklist ---

const legacyCrates = crates.filter((r) => r.legacyParityDir || r.legacyTestParityScript)
const missingParityCoverage = crates.filter((r) => !r.parityCoverage)
const missingFuzz = crates.filter((r) => !r.fuzzFile)
const missingScriptsOrDeps = crates.filter((r) => !r.testConformanceScript || !r.testAllScript)
const missingFastCheck = crates.filter((r) => !r.fastCheck)
const missingReadme = crates.filter((r) => !r.readme)
const missingNpm = crates.filter((r) => !r.npmDir || r.missingPlatforms.length > 0)
const missingBench = crates.filter((r) => !r.benchFile)
const missingWasm = crates.filter((r) => !r.wasmOk)

const clean =
  legacyCrates.length === 0 &&
  missingParityCoverage.length === 0 &&
  missingFuzz.length === 0 &&
  missingScriptsOrDeps.length === 0 &&
  missingFastCheck.length === 0 &&
  missingReadme.length === 0 &&
  missingNpm.length === 0 &&
  missingBench.length === 0 &&
  missingWasm.length === 0 &&
  docs.missingInPackagesJson.length === 0 &&
  docs.marqueeOk &&
  docs.fieldGaps.length === 0

// --- JSON mode: dump everything and exit ---

// --- Plan mode: emit an executable fix plan ---

if (asPlan) {
  const plan = []
  plan.push('# Fix Plan')
  plan.push('')
  if (clean) {
    plan.push('_All checks pass — no plan needed._')
    console.log(plan.join('\n'))
    process.exit(0)
  }
  plan.push('_Run from monorepo root. Steps grouped by automation level._')
  plan.push('')

  // Automatable: shell commands that can run unattended
  const autoSteps = []

  for (const r of legacyCrates) {
    if (r.legacyParityDir) {
      autoSteps.push(`git mv crates/${r.name}/__parity__ crates/${r.name}/__conformance__`)
    }
  }
  if (legacyCrates.some((r) => r.legacyTestParityScript) || missingScriptsOrDeps.length) {
    const targets = new Set([
      ...legacyCrates.filter((r) => r.legacyTestParityScript).map((r) => r.name),
      ...missingScriptsOrDeps.map((r) => r.name),
    ])
    autoSteps.push(
      `# Rewrite scripts (test:parity → test:conformance, add test:all):\nnode -e "const fs=require('node:fs');for (const c of ${JSON.stringify([...targets])}){const p='crates/'+c+'/package.json';const raw=fs.readFileSync(p,'utf-8');const nl=raw.endsWith('\\n');const pkg=JSON.parse(raw);pkg.scripts??={};if(pkg.scripts['test:parity']){pkg.scripts['test:conformance']=pkg.scripts['test:parity'].replace('__parity__','__conformance__');delete pkg.scripts['test:parity'];}else if(!pkg.scripts['test:conformance']){pkg.scripts['test:conformance']='vitest run __conformance__';}pkg.scripts['test:all']??='vitest run';fs.writeFileSync(p,JSON.stringify(pkg,null,2)+(nl?'\\n':''));}"`,
    )
  }
  if (!docs.marqueeOk) {
    autoSteps.push(
      `# Update marquee PACKAGES:\nnode -e "const fs=require('node:fs');const p='docs/packages.json';const raw=fs.readFileSync(p,'utf-8');const nl=raw.endsWith('\\n');const j=JSON.parse(raw);const m=j.marquee.find(e=>e.k==='PACKAGES');if(m)m.v=String(${docs.marqueeExpected});fs.writeFileSync(p,JSON.stringify(j,null,2)+(nl?'\\n':''));"`,
    )
  }
  for (const r of missingNpm) {
    if (!r.npmDir) {
      autoSteps.push(`# Generate npm platform stubs for ${r.name}:\n(cd crates/${r.name} && pnpm exec napi create-npm-dirs)`)
    }
  }
  for (const r of missingFastCheck) {
    autoSteps.push(`(cd crates/${r.name} && pnpm add -D fast-check)`)
  }

  if (autoSteps.length) {
    plan.push('## 1. Automatable (run unattended)')
    plan.push('')
    plan.push('```bash')
    plan.push(autoSteps.join('\n\n'))
    plan.push('```')
    plan.push('')
  }

  // Content fixes: templates the human/AI must fill
  if (missingReadme.length) {
    plan.push('## 2. Per-crate README templates')
    plan.push('')
    plan.push('For each crate listed below, create `crates/<name>/README.md` using this template (adjust description, drop-in status, and API surface):')
    plan.push('')
    plan.push('```markdown')
    plan.push('# @amigo-labs/<name>')
    plan.push('')
    plan.push('> Rust-powered drop-in for [`<npm-name>`](https://www.npmjs.com/package/<npm-name>). Compiled via NAPI-RS.')
    plan.push('')
    plan.push('## Install')
    plan.push('')
    plan.push('```bash')
    plan.push('npm install @amigo-labs/<name>')
    plan.push('```')
    plan.push('')
    plan.push('## Usage')
    plan.push('')
    plan.push('```ts')
    plan.push("import { ... } from '@amigo-labs/<name>'")
    plan.push('```')
    plan.push('')
    plan.push('## Parity')
    plan.push('')
    plan.push('See [`__conformance__/`](./__conformance__) and [`divergences.md`](./__conformance__/divergences.md).')
    plan.push('```')
    plan.push('')
    plan.push(`Crates needing README: ${missingReadme.map((r) => '`' + r.name + '`').join(', ')}`)
    plan.push('')
  }

  if (docs.missingInPackagesJson.length) {
    plan.push('## 3. `docs/packages.json` entries')
    plan.push('')
    plan.push('Append to the `packages` array. Use measured `speedup` from `docs/data.json` if available:')
    plan.push('')
    plan.push('```json')
    for (const name of docs.missingInPackagesJson) {
      plan.push(JSON.stringify({
        name,
        title: name.charAt(0).toUpperCase() + name.slice(1),
        description: `TODO: one-line description of @amigo-labs/${name}`,
        speedup: 'TODO: e.g. "1.5–3× faster"',
        npmUrl: `https://www.npmjs.com/package/@amigo-labs/${name}`,
        sourceUrl: `https://github.com/amigo-labs/amigo-native/tree/main/crates/${name}`,
        readmeUrl: `https://github.com/amigo-labs/amigo-native/blob/main/crates/${name}/README.md`,
      }, null, 2) + ',')
    }
    plan.push('```')
    plan.push('')
  }

  if (missingFuzz.length) {
    plan.push('## 4. `fuzz.spec.ts` skeleton')
    plan.push('')
    plan.push('For each crate, create `crates/<name>/__conformance__/fuzz.spec.ts`. Example shape (adapt to the crate\'s API):')
    plan.push('')
    plan.push('```ts')
    plan.push("import { describe, it } from 'vitest'")
    plan.push("import fc from 'fast-check'")
    plan.push("import { someFn } from '../index.js'")
    plan.push('')
    plan.push("describe('<name> fuzzing', () => {")
    plan.push("  it('holds invariant under random input', () => {")
    plan.push('    fc.assert(')
    plan.push('      fc.property(fc.string(), (input) => {')
    plan.push('        const out = someFn(input)')
    plan.push('        return /* invariant check */ true')
    plan.push('      }),')
    plan.push('      { numRuns: 200, seed: 42 },')
    plan.push('    )')
    plan.push('  })')
    plan.push('})')
    plan.push('```')
    plan.push('')
    plan.push(`Crates needing fuzz: ${missingFuzz.map((r) => '`' + r.name + '`').join(', ')}`)
    plan.push('')
  }

  plan.push('## Verify')
  plan.push('')
  plan.push('```bash')
  plan.push('node .claude/skills/audit-crates/scripts/audit.mjs')
  plan.push('```')

  console.log(plan.join('\n'))
  process.exit(clean ? 0 : 1)
}

if (asJson) {
  const out = {
    root: ROOT,
    crates,
    docs,
    summary: {
      clean,
      legacy: legacyCrates.map((r) => r.name),
      missingParityCoverage: missingParityCoverage.map((r) => r.name),
      missingFuzz: missingFuzz.map((r) => r.name),
      missingScriptsOrDeps: missingScriptsOrDeps.map((r) => r.name),
      missingFastCheck: missingFastCheck.map((r) => r.name),
      missingReadme: missingReadme.map((r) => r.name),
      missingNpm: missingNpm.map((r) => r.name),
      missingBench: missingBench.map((r) => r.name),
      missingWasm: missingWasm.map((r) => r.name),
      nodeOnly: [...NODE_ONLY_CRATES],
    },
  }
  console.log(JSON.stringify(out, null, 2))
  process.exit(clean ? 0 : 1)
}

// --- Markdown report ---

const mark = (b) => (b ? '✓' : '✗')
const lines = []

lines.push('# Crate Consistency Audit')
lines.push('')
lines.push(`Root: \`${ROOT}\``)
lines.push(`Crates scanned: **${crateNames.length}**`)
lines.push('')

lines.push('## Per-Crate Status')
lines.push('')
lines.push('_parity column: ✓ = `parity.spec.ts` or `upstream.spec.ts` present (either satisfies conformance coverage)_')
lines.push(`_wasm column: ✓ = dual-target (wasm/ + build:wasm + browser export); N = Node-only group (${[...NODE_ONLY_CRATES].join(', ')})_`)
lines.push('')
lines.push('| Crate | `__conf__` | parity | fuzz | `test:conf` | `test:all` | fast-check | README | `npm/` | bench | wasm | legacy |')
lines.push('|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|')
for (const r of crates) {
  const legacy = r.legacyParityDir || r.legacyTestParityScript ? '⚠' : ''
  const npmCell = r.npmDir
    ? r.missingPlatforms.length === 0
      ? '✓'
      : `✗ (−${r.missingPlatforms.length})`
    : '✗'
  const wasmCell = r.isInternal ? '—' : r.isNodeOnly ? (r.wasmOk ? 'N' : '✗') : mark(r.wasmOk)
  lines.push(
    `| ${r.name} | ${mark(r.conformanceDir)} | ${mark(r.parityCoverage)} | ${mark(r.fuzzFile)} | ${mark(r.testConformanceScript)} | ${mark(r.testAllScript)} | ${mark(r.fastCheck)} | ${mark(r.readme)} | ${npmCell} | ${mark(r.benchFile)} | ${wasmCell} | ${legacy} |`,
  )
}
lines.push('')

lines.push('## Docs Registry')
lines.push('')
if (!docs.pkgsJsonFound) lines.push('- ✗ `docs/packages.json` not found or invalid JSON')
if (!docs.dataJsonFound) lines.push('- ✗ `docs/data.json` not found or invalid JSON')
if (docs.missingInPackagesJson.length) {
  lines.push(
    `- ✗ Not listed in \`docs/packages.json\`: ${docs.missingInPackagesJson.map((c) => `\`${c}\``).join(', ')}`,
  )
}
for (const { name, gaps } of docs.fieldGaps) {
  lines.push(`- ⚠ \`${name}\` in \`docs/packages.json\` missing fields: ${gaps.join(', ')}`)
}
if (docs.marqueeOk) {
  lines.push(`- ✓ \`docs/packages.json\` marquee PACKAGES = ${docs.marqueeCount}`)
} else {
  lines.push(`- ✗ \`docs/packages.json\` marquee PACKAGES = ${docs.marqueeCount ?? 'missing'}, expected ${docs.marqueeExpected}`)
}
lines.push('')

lines.push('## Gap-Fix Checklist')
lines.push('')
lines.push('_Priority: 🔴 legacy first (consolidates conventions) → 🟠 test infrastructure → 🟡 polish_')
lines.push('')

if (legacyCrates.length) {
  lines.push('### 🔴 Legacy convention (modernize)')
  for (const r of legacyCrates) {
    const bits = []
    if (r.legacyParityDir) bits.push('rename `__parity__/` → `__conformance__/`')
    if (r.legacyTestParityScript) bits.push('rename script `test:parity` → `test:conformance`')
    lines.push(`- [ ] **${r.name}** — ${bits.join('; ')}`)
  }
  lines.push('')
}

if (missingParityCoverage.length) {
  lines.push('### 🟠 Missing parity coverage')
  for (const r of missingParityCoverage) {
    lines.push(`- [ ] **${r.name}** — add \`__conformance__/parity.spec.ts\` or \`__conformance__/upstream.spec.ts\``)
  }
  lines.push('')
}

if (missingFuzz.length) {
  lines.push('### 🟡 Missing fuzz coverage (property-based)')
  for (const r of missingFuzz) {
    lines.push(`- [ ] **${r.name}** — add \`__conformance__/fuzz.spec.ts\` using \`fast-check\``)
  }
  lines.push('')
}

if (missingScriptsOrDeps.length) {
  lines.push('### 🟠 Missing package.json scripts')
  for (const r of missingScriptsOrDeps) {
    const bits = []
    if (!r.testConformanceScript) bits.push('`test:conformance` script')
    if (!r.testAllScript) bits.push('`test:all` script')
    lines.push(`- [ ] **${r.name}** — add ${bits.join(', ')}`)
  }
  lines.push('')
}

if (missingFastCheck.length) {
  lines.push('### 🟡 Missing `fast-check` devDependency')
  lines.push('_Only required if the crate has a `fuzz.spec.ts`._')
  for (const r of missingFastCheck) {
    lines.push(`- [ ] **${r.name}** — add \`fast-check\` to \`devDependencies\``)
  }
  lines.push('')
}

if (missingBench.length) {
  lines.push('### 🟡 Missing benchmark suite')
  for (const r of missingBench) {
    lines.push(`- [ ] **${r.name}** — add \`__bench__/index.bench.ts\``)
  }
  lines.push('')
}

if (missingReadme.length) {
  lines.push('### 🟡 Missing README')
  for (const r of missingReadme) {
    lines.push(`- [ ] **${r.name}** — add \`README.md\``)
  }
  lines.push('')
}

if (missingNpm.length) {
  lines.push('### 🟡 Missing `npm/` platform stub directories')
  for (const r of missingNpm) {
    if (!r.npmDir) {
      lines.push(`- [ ] **${r.name}** — create \`npm/\` with all 6 platform subdirs`)
    } else {
      lines.push(
        `- [ ] **${r.name}** — missing ${r.missingPlatforms.map((p) => `\`${p}\``).join(', ')}`,
      )
    }
  }
  lines.push('')
}

if (missingWasm.length) {
  lines.push('### 🟠 WASM dual-target scaffolding')
  lines.push(`_Source of truth: \`NODE_ONLY_CRATES = { ${[...NODE_ONLY_CRATES].join(', ')} }\` (audit.mjs)._`)
  lines.push('_Dual-target crates need: `wasm/Cargo.toml`, `wasm/src/lib.rs`, `build:wasm` script, `browser` export, `amigo.targets` including "browser"._')
  lines.push('_Node-only crates must NOT have a `wasm/` directory and must declare `amigo.targets: ["node"]`._')
  for (const r of missingWasm) {
    const bits = []
    if (r.isNodeOnly) {
      if (r.wasmDirPresent) bits.push('remove `wasm/` directory')
      if (r.buildWasmScript) bits.push('remove `build:wasm` script')
      if (r.browserExport) bits.push('remove `browser` export')
      if (!(r.targetsField && r.targetsField.length === 1 && r.targetsField[0] === 'node')) {
        bits.push('set `amigo.targets: ["node"]`')
      }
      lines.push(`- [ ] **${r.name}** (Node-only) — ${bits.join('; ')}`)
    } else {
      if (!r.wasmDirPresent) bits.push('create `wasm/` sub-crate (mirror `crates/slugify/wasm/`)')
      if (!r.wasmCargoPresent) bits.push('add `wasm/Cargo.toml`')
      if (!r.wasmLibPresent) bits.push('add `wasm/src/lib.rs` with `#[wasm_bindgen]` wrappers')
      if (!r.buildWasmScript) bits.push('add `build:wasm` script to package.json')
      if (!r.browserExport) bits.push('add `browser` field + conditional `exports`')
      if (!(r.targetsField && r.targetsField.includes('browser'))) {
        bits.push('set `amigo.targets: ["node", "browser"]`')
      }
      lines.push(`- [ ] **${r.name}** — ${bits.join('; ')}`)
    }
  }
  lines.push('')
}

if (
  docs.missingInPackagesJson.length ||
  !docs.marqueeOk ||
  docs.fieldGaps.length ||
  !docs.pkgsJsonFound ||
  !docs.dataJsonFound
) {
  lines.push('### 🟡 Docs registry')
  for (const name of docs.missingInPackagesJson) {
    lines.push(
      `- [ ] Add \`${name}\` entry to \`docs/packages.json\` (name, title, description, speedup, npmUrl, sourceUrl, readmeUrl)`,
    )
  }
  for (const { name, gaps } of docs.fieldGaps) {
    lines.push(`- [ ] Fill in \`${name}\` fields: ${gaps.join(', ')}`)
  }
  if (!docs.marqueeOk) {
    lines.push(
      `- [ ] Update \`docs/packages.json\` marquee \`PACKAGES\`: ${docs.marqueeCount ?? 'missing'} → ${docs.marqueeExpected}`,
    )
  }
  lines.push('')
}

if (clean) {
  lines.push('**All crates conform to the reference conventions. ✓**')
} else {
  const gapCount =
    legacyCrates.length +
    missingParityCoverage.length +
    missingFuzz.length +
    missingFastCheck.length +
    missingScriptsOrDeps.length +
    missingReadme.length +
    missingNpm.length +
    missingBench.length +
    missingWasm.length +
    docs.missingInPackagesJson.length +
    docs.fieldGaps.length +
    (docs.marqueeOk ? 0 : 1)
  lines.push(`_Summary: **${gapCount} gap(s)** across ${crateNames.length} crates._`)
}

console.log(lines.join('\n'))
process.exit(clean ? 0 : 1)
