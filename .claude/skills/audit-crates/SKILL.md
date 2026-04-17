---
name: audit-crates
description: Audit crate/package consistency in the amigo-native monorepo. Use whenever new crates are added, branches are merged that introduced new crates, or you need to verify every crate follows the reference conventions established by argon2/csv/sanitize-html/slugify/xxhash. Checks __conformance__ test infrastructure (parity.spec.ts + fuzz.spec.ts), package.json scripts (test:conformance, test:all) and dev-deps (fast-check), README presence, npm/ platform-stub directories (6 NAPI targets), docs/packages.json registration with all metadata fields, and docs/data.json marquee PACKAGES count. Flags the legacy __parity__/test:parity convention as outdated. Outputs a markdown table of per-crate status plus a priority-ordered gap-fix checklist. Run this before publishing, before opening PRs that add crates, after merging feature branches that introduce new crates, or when investigating CI failures involving test:conformance, missing platform binaries, or the GitHub Pages dashboard showing wrong package counts.
---

# audit-crates

Verify every `crates/*` entry in the amigo-native monorepo conforms to the reference conventions established by **argon2**, **csv**, **sanitize-html**, **slugify**, and **xxhash**.

## When to use

- After adding a new crate under `crates/`
- After merging a branch that introduced new crates (conventions diverge easily in parallel work)
- Before publishing or opening a PR that touches package layout
- When CI complains about `test:conformance` or missing platform stubs
- When the GitHub Pages dashboard shows wrong package count or missing entries

## How to run

From the monorepo root:

```bash
node .claude/skills/audit-crates/scripts/audit.mjs
```

The script prints a markdown report to stdout and exits **non-zero if any gaps are found**, so it can gate CI.

For JSON output (machine-readable):

```bash
node .claude/skills/audit-crates/scripts/audit.mjs --json
```

## What it checks

For each crate (excluding `_template`):

| Check | Why it matters |
|---|---|
| `__conformance__/parity.spec.ts` + `fuzz.spec.ts` | Per-crate drop-in parity tests vs. the npm original |
| `package.json` scripts: `test`, `test:conformance`, `test:all`, `bench` | Reference-convention test entrypoints |
| `fast-check` in devDependencies | Required for property-based fuzz tests |
| `README.md` | Every published package needs one |
| `npm/` with 6 platform subdirs (`darwin-arm64`, `darwin-x64`, `linux-arm64-gnu`, `linux-x64-gnu`, `linux-x64-musl`, `win32-x64-msvc`) | NAPI-RS platform-stub packages — without them, `npm install` fails on that platform |
| `__bench__/index.bench.ts` | Vitest benchmark suite consumed by `bench:report` |
| Registered in `docs/packages.json` with all metadata fields | Appears on the GitHub Pages dashboard |

Globally:

- `docs/packages.json` marquee `PACKAGES` value equals the crate count (note: `docs/data.json` is auto-generated benchmark output; `packages.json` holds the hand-edited brand/marquee/registry)
- Legacy `__parity__/` dirs or `test:parity` scripts are flagged as **must modernize**

## How to read the output

Three sections:

1. **Per-Crate Status table** — quick visual scan. A `⚠` in the legacy column means the crate is stuck on the old convention and must be migrated.
2. **Docs Registry** — global `docs/packages.json` and `docs/data.json` health.
3. **Gap-Fix Checklist** — actionable, priority-ordered. Fix 🔴 legacy items first (they consolidate conventions), then 🟠 missing test infra, then 🟡 docs/README polish.

## Why the conventions matter (theory of mind for future edits)

The reference crates were set up so parity with the npm original can be verified **independently per-crate** (`pnpm --filter <crate> run test:conformance`) instead of only via a central script. This scales: each crate owns its own conformance suite, and CI can gate on it selectively. `fast-check` enables property-based fuzz testing — that's how semantic drift gets caught automatically when upstream changes.

The `npm/` platform stubs are what `@napi-rs/cli` publishes as `optionalDependencies`. They're tiny metadata packages, but without them `npm install` fails on platforms with no matching binary — the publish is effectively broken.

And `docs/packages.json` is the single source of truth for the GitHub Pages dashboard. A package not listed there is **invisible to users** even if it's on npm.

A crate that drifts from the conventions will eventually cause one of: a CI failure, a broken install on some platform, or an embarrassing gap on the landing page. This skill catches all three before they ship.

## Extending the audit

If you add a new convention (e.g., a required `CHANGELOG.md`, a new lint step), add the check to `scripts/audit.mjs` in the `auditCrate` function and render a new row/section. Keep checks cheap (no network, no subprocess) so the audit stays fast and CI-friendly.
