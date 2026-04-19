#!/usr/bin/env node

/**
 * One-shot investigator: temporarily un-skip every sanitize-html KNOWN_DIVERGENCE,
 * run the vitest upstream suite, capture each failure's actual vs expected,
 * and group the failures by inferred root cause. Writes:
 *   - sanitize-skip-categorization.json (raw failures + category per test)
 *   - sanitize-skip-categorization.md   (human summary table)
 *
 * Does NOT commit any changes to the spec file; the patch is in a temp copy.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const pkgDir = resolve(repoRoot, 'crates/sanitize-html')
const specPath = resolve(pkgDir, '__conformance__/upstream.spec.ts')
const specBackup = specPath + '.bak'

// --- 1) Patch the spec to run every test (no skips) ---

if (!existsSync(specPath)) {
  console.error(`spec not found: ${specPath}`)
  process.exit(1)
}

copyFileSync(specPath, specBackup)
try {
  const original = readFileSync(specPath, 'utf8')
  const patched = original.replace(
    'if (KNOWN_DIVERGENCES.has(t.title)) {',
    'if (false /* categorize-run: un-skip all */) {',
  )
  if (patched === original) {
    throw new Error('patch point not found; aborting without modifying spec')
  }
  writeFileSync(specPath, patched)

  // --- 2) Run vitest with JSON reporter ---

  console.log('Running full upstream suite (this may take ~10s)...\n')
  const run = spawnSync(
    'pnpm',
    ['exec', 'vitest', 'run', '__conformance__/upstream.spec.ts', '--reporter=json', '--no-color'],
    {
      cwd: pkgDir,
      encoding: 'utf-8',
      timeout: 300_000,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  const stdout = run.stdout || ''
  const firstBrace = stdout.indexOf('{')
  if (firstBrace < 0) {
    console.error('no json output; stderr:\n' + (run.stderr || '').slice(0, 2000))
    process.exit(1)
  }
  const parsed = JSON.parse(stdout.slice(firstBrace))

  // --- 3) Extract failing assertions ---

  const failures = []
  const passing = []
  for (const file of parsed.testResults || []) {
    for (const t of file.assertionResults || []) {
      if (t.status === 'passed') {
        passing.push(t.title || t.fullName || '(unnamed)')
      } else {
        const msg = (t.failureMessages || []).join('\n')
        failures.push({
          title: t.title || t.fullName || '(unnamed)',
          message: msg,
        })
      }
    }
  }

  // --- 4) Categorize by inferred root cause ---

  function categorize({ title, message }) {
    const t = title.toLowerCase()
    const m = (message || '').toLowerCase()

    // Input / invocation errors (wrapper contract)
    if (m.includes('failed to convert') || m.includes('typeerror') || m.includes('cannot read properties')) {
      return 'wrapper-input-type'
    }
    // Missing features that surface as thrown errors or wrong output
    if (
      t.includes('transformtag') ||
      t.includes('transforming function') ||
      t.includes('replace ol to ul') ||
      t.includes('transform text content')
    ) {
      return 'feature-transformTags'
    }
    if (t.includes('exclusivefilter') || t.includes('exclusive filter')) {
      return 'feature-exclusiveFilter'
    }
    if (t.includes('textfilter') || t.includes('text nodes with provided function') || t.includes('text nodes based on tagname')) {
      return 'feature-textFilter'
    }
    if (t.includes('recursiveescape') || t.includes('escape mode') || t.includes('disallowedtagsmode') || t.includes('escape markup not allowlisted') || t.includes('escape self closing') || t.includes('escape not closed p')) {
      return 'feature-disallowedTagsMode-escape'
    }
    if (t.includes('allowedclass') || t.includes('allow classes that match') || t.includes('allow all classes')) {
      return 'feature-allowedClasses-patterns'
    }
    if (t.includes('srcset')) {
      return 'feature-srcset'
    }
    if (t.includes('iframe') && (t.includes('hostname') || t.includes('domain'))) {
      return 'feature-allowedIframeHostnames'
    }
    if (t.includes('allowedschemesbytag') || t.includes('defining schemes on a per-tag')) {
      return 'feature-allowedSchemesByTag'
    }
    if (t.includes('vulnerable')) {
      return 'feature-allowVulnerableTags'
    }
    if (t.includes('style') && (t.includes('parsestyle') || t.includes('allowedstyles') || t.includes('allowed styles') || t.includes('sanitize styles') || t.includes('important styles') || t.includes('invalid styles') || t.includes('empty style') || t.includes('sourcemappingurl'))) {
      return 'feature-allowedStyles'
    }
    if (t.includes('onopentag') || t.includes('oncllosetag') || t.includes('onclosetag')) {
      return 'feature-parser-callbacks'
    }
    if (t.includes('htmlparser2 options')) {
      return 'feature-htmlparser2-options'
    }
    if (t.includes('enforcehtmlboundary')) {
      return 'feature-enforceHtmlBoundary'
    }
    if (t.includes('nestinglimit')) {
      return 'feature-nestingLimit'
    }
    if (t.includes('allowedtags is set to') || t.includes('pass through all markup if allowedtags')) {
      return 'feature-allowedTags-false-or-falsy'
    }
    if (t.includes('allowedattributes') && (t.includes('glob') || t.includes('*'))) {
      return 'feature-allowedAttributes-globs'
    }
    if (t.includes('allowedemptyattributes') || t.includes('empty attributes') || t.includes('boolean attributes that are empty')) {
      return 'feature-allowedEmptyAttributes'
    }
    if (t.includes('preserveescapedattributes')) {
      return 'feature-preserveEscapedAttributes'
    }
    if (t.includes('allowprotocolrelative') || t.includes('protocol relative')) {
      return 'feature-allowProtocolRelative'
    }
    if (t.includes('nontexttags') || t.includes('fibble element') || t.includes('content of fibble')) {
      return 'feature-nonTextTags'
    }
    if (t.includes('textarea') && (t.includes('drop') || t.includes('content'))) {
      return 'feature-drop-textarea-content'
    }
    if (t.includes('script') && t.includes('drop')) {
      return 'feature-drop-script-content'
    }
    if (t.includes('option elements')) {
      return 'feature-drop-option-content'
    }
    if (t.includes('style elements') && t.includes('drop')) {
      return 'feature-drop-style-content'
    }
    if (t.includes('javascript url') || t.includes('javascript:') || t.includes('sneaky encoded') || t.includes('character codes 1-32') || t.includes('reject hrefs') || t.includes('scheme') || t.includes('nice relative url') || t.includes('hashcode with a :') || t.includes('nice schemes')) {
      return 'url-scheme-handling'
    }
    if (t.includes('data urls')) {
      return 'feature-data-urls'
    }
    if (t.includes('attribute value') && t.includes('specific')) {
      return 'feature-attribute-value-allowlist'
    }
    if (t.includes('decodeentities')) {
      return 'feature-decodeEntities'
    }

    // Output shape / tree-builder differences catch-all (no feature hit above)
    if (
      t.includes('simple, well-formed markup') ||
      t.includes('pass through') ||
      t.includes('closing tags') ||
      t.includes('not closed p tags') ||
      t.includes('unclosed') ||
      t.includes('empty string') ||
      t.includes('comments') ||
      t.includes('custom list') ||
      t.includes('double <') ||
      t.includes('respect text nodes') ||
      t.includes('not crash') ||
      t.includes('naked =') ||
      t.includes('not act weird') ||
      t.includes('object prototype') ||
      t.includes('collapse nested') ||
      t.includes('reject attributes')
    ) {
      return 'output-shape-diff'
    }

    // Input coercion that slipped through (e.g. Numbers)
    if (t.includes('numbers as strings')) {
      return 'wrapper-input-coercion'
    }

    return 'uncategorized'
  }

  // --- 5) Group and summarize ---

  const categorized = failures.map((f) => ({ ...f, category: categorize(f) }))
  const nowPassingUnskipped = [] // tests we currently skip but that already pass
  const currentlySkipped = new Set()
  {
    // Re-read current skip list from backup (untouched original)
    const orig = readFileSync(specBackup, 'utf8')
    const match = orig.match(/const KNOWN_DIVERGENCES = new Set<string>\(\[([\s\S]*?)\]\);/m)
    if (match) {
      const listLiteral = match[1]
      const re = /'([^']*)'|"([^"]*)"/g
      let m2
      while ((m2 = re.exec(listLiteral)) !== null) {
        currentlySkipped.add(m2[1] ?? m2[2])
      }
    }
  }
  for (const title of passing) {
    if (currentlySkipped.has(title)) nowPassingUnskipped.push(title)
  }

  const byCat = new Map()
  for (const f of categorized) {
    if (!byCat.has(f.category)) byCat.set(f.category, [])
    byCat.get(f.category).push(f)
  }

  const catOrder = [...byCat.keys()].sort(
    (a, b) => byCat.get(b).length - byCat.get(a).length,
  )

  writeFileSync(
    resolve(repoRoot, 'sanitize-skip-categorization.json'),
    JSON.stringify(
      {
        totals: {
          failures: failures.length,
          passing: passing.length,
          nowPassingButStillSkipped: nowPassingUnskipped.length,
        },
        nowPassingButStillSkipped: nowPassingUnskipped.sort(),
        byCategory: Object.fromEntries(
          catOrder.map((c) => [
            c,
            byCat.get(c).map((f) => ({
              title: f.title,
              sample: (f.message || '').split('\n').slice(0, 4).join('\n'),
            })),
          ]),
        ),
      },
      null,
      2,
    ),
  )

  // Markdown summary
  let md = '# sanitize-html upstream skip categorization\n\n'
  md += `Ran upstream.spec.ts with every KNOWN_DIVERGENCE un-skipped.\n\n`
  md += `- **Total assertions:** ${failures.length + passing.length}\n`
  md += `- **Passed (incl. already passing + now-green-if-unskipped):** ${passing.length}\n`
  md += `- **Failed:** ${failures.length}\n`
  md += `- **Currently skipped but now green (free wins):** ${nowPassingUnskipped.length}\n\n`

  if (nowPassingUnskipped.length) {
    md += '## Free wins — can be removed from KNOWN_DIVERGENCES today\n\n'
    for (const t of nowPassingUnskipped.slice(0, 200)) md += `- ${t}\n`
    md += '\n'
  }

  md += '## Failures grouped by inferred root cause\n\n'
  md += '| Category | Count |\n|:---|---:|\n'
  for (const c of catOrder) md += `| ${c} | ${byCat.get(c).length} |\n`
  md += '\n'

  for (const c of catOrder) {
    md += `### ${c} (${byCat.get(c).length})\n\n`
    for (const f of byCat.get(c).slice(0, 50)) {
      md += `- ${f.title}\n`
    }
    if (byCat.get(c).length > 50) md += `- … ${byCat.get(c).length - 50} more\n`
    md += '\n'
  }

  writeFileSync(resolve(repoRoot, 'sanitize-skip-categorization.md'), md)

  console.log(`Failures: ${failures.length}`)
  console.log(`Now-passing-but-still-skipped: ${nowPassingUnskipped.length}`)
  console.log(`\nBy category:`)
  for (const c of catOrder) console.log(`  ${c.padEnd(45)} ${byCat.get(c).length}`)
  console.log(`\nWrote sanitize-skip-categorization.{md,json}`)
} finally {
  // --- 6) Always restore the spec file ---
  if (existsSync(specBackup)) {
    copyFileSync(specBackup, specPath)
    unlinkSync(specBackup)
    console.log('\nRestored upstream.spec.ts')
  }
}
