---
name: audit-crates
description: Audit and fix crate/package consistency in the amigo-native monorepo. Use whenever new crates are added, branches are merged that introduced new crates, or you need to verify every crate follows the reference conventions established by argon2/csv/sanitize-html/slugify/xxhash. Checks __conformance__ test infrastructure (parity.spec.ts/upstream.spec.ts + fuzz.spec.ts), package.json scripts (test:conformance, test:all) and dev-deps (fast-check), README presence, npm/ platform-stub directories (6 NAPI targets), docs/packages.json registration with all metadata fields, and marquee PACKAGES count. Flags the legacy __parity__/test:parity convention as outdated. After reporting gaps, this skill offers to apply the fix plan interactively — mechanical fixes (renames, script patches, npm stubs) get applied automatically, content fixes (README, docs entries, fuzz tests) get generated as templates the user reviews. Run this before publishing, before opening PRs that add crates, after merging feature branches, or when CI fails on test:conformance or missing platform binaries.
---

# audit-crates

Verify every `crates/*` entry in the amigo-native monorepo conforms to the reference conventions established by **argon2**, **csv**, **sanitize-html**, **slugify**, and **xxhash** — then offer to fix the gaps.

## When to use

- After adding a new crate under `crates/`
- After merging a branch that introduced new crates (conventions diverge easily in parallel work)
- Before publishing or opening a PR that touches package layout
- When CI complains about `test:conformance` or missing platform stubs
- When the GitHub Pages dashboard shows wrong package count or missing entries

## Workflow — how Claude should run this skill

The skill is interactive. Don't just dump the report and stop — **offer to apply the fix plan** at the end. The concrete loop:

### Step 1 — Run the audit

```bash
node .claude/skills/audit-crates/scripts/audit.mjs
```

The script exits non-zero if gaps exist. Read the output — you'll need it for step 3.

### Step 2 — If clean, you're done

If the audit reports "All crates conform", confirm briefly to the user and stop.

### Step 3 — If gaps exist, fetch the fix plan

```bash
node .claude/skills/audit-crates/scripts/audit.mjs --plan
```

The plan is grouped into sections:

1. **Automatable** — bash commands that run unattended (renames, script rewrites, `napi create-npm-dirs`, `pnpm add -D fast-check`, marquee updates)
2. **README templates** — per-crate markdown skeletons
3. **`docs/packages.json` entries** — JSON skeletons with TODO placeholders for `description` and `speedup`
4. **`fuzz.spec.ts` skeleton** — a `fast-check` property-test starting point

### Step 4 — Present a concise summary and ask the user

Summarize what's in each section (counts and which crates are affected), then ask explicitly how to proceed. Offer three choices — use clear German phrasing:

> Ich hab N Lücken gefunden. Wie soll ich vorgehen?
> - **A** — Alles automatisierbare anwenden (Section 1). Content-Gaps zeige ich dir als Liste.
> - **B** — Den ganzen Plan durchziehen: automatisch fixen + Content-Templates befüllen (READMEs, docs-Einträge, fuzz-Skelette — ich nehme sinnvolle Defaults aus Crate-API + Benchmarks).
> - **C** — Nur Report, ich fixe selbst.

Wait for the answer before touching anything. Don't assume — the user may want to split it differently (e.g. "nur die READMEs jetzt").

### Step 5 — Execute according to the answer

- **A**: Run section 1 commands. Verify with `node .claude/skills/audit-crates/scripts/audit.mjs` after. Report what's left.
- **B**: A, then for each content section walk crate-by-crate. For speedups, check `BENCHMARKS.md` — if unmeasured, write `"TBD"` rather than inventing numbers. For fuzz tests, read the crate's `src/lib.rs` and `__test__/` to understand the API before writing properties.
- **C**: Stop. Leave the plan output visible so the user can work from it.

After any fix pass, commit using conventional commits (`refactor:`, `feat:`, `docs:`) — one commit per logical group (mechanical fixes, READMEs, docs entries) so the history stays reviewable.

## What it checks

For each crate (excluding `_template`):

| Check | Why it matters |
|---|---|
| `__conformance__/` with `parity.spec.ts` **or** `upstream.spec.ts` | Drop-in parity coverage vs. the npm original (either pattern counts) |
| `__conformance__/fuzz.spec.ts` | Property-based tests that catch semantic drift |
| `package.json` scripts: `test`, `test:conformance`, `test:all`, `bench` | Reference-convention test entrypoints |
| `fast-check` in devDependencies | Only needed when `fuzz.spec.ts` exists |
| `README.md` | Every published package needs one |
| `npm/` with 6 platform subdirs (`darwin-arm64`, `darwin-x64`, `linux-arm64-gnu`, `linux-x64-gnu`, `linux-x64-musl`, `win32-x64-msvc`) | NAPI-RS platform-stub packages — without them, `npm install` fails on that platform |
| `__bench__/index.bench.ts` | Vitest benchmark suite consumed by `bench:report` |
| Registered in `docs/packages.json` with all metadata fields | Appears on the GitHub Pages dashboard |

Globally:

- `docs/packages.json` marquee `PACKAGES` value equals the crate count (`docs/data.json` is auto-generated benchmark output; `packages.json` holds the hand-edited brand/marquee/registry)
- Legacy `__parity__/` dirs or `test:parity` scripts are flagged as **must modernize**

## Invocation flags

| Flag | Purpose |
|---|---|
| _(none)_ | Markdown report (default — what you show the user first) |
| `--plan` | Executable fix plan — bash commands + templates |
| `--json` | Machine-readable output for scripting or CI gates |

All modes exit non-zero on gaps.

## Why the conventions matter

The reference crates were set up so parity with the npm original can be verified **independently per-crate** (`pnpm --filter <crate> run test:conformance`) instead of only via a central script. Each crate owns its own conformance suite, and CI can gate on it selectively. `fast-check` enables property-based fuzz testing — that's how semantic drift gets caught automatically when upstream changes.

The `npm/` platform stubs are what `@napi-rs/cli` publishes as `optionalDependencies`. Tiny metadata packages, but without them `npm install` fails on platforms with no matching binary — the publish is effectively broken.

And `docs/packages.json` is the single source of truth for the GitHub Pages dashboard. A package not listed there is **invisible to users** even if it's on npm.

A crate that drifts from the conventions will eventually cause a CI failure, a broken install on some platform, or an embarrassing gap on the landing page. This skill catches — and offers to fix — all three before they ship.

## Extending the audit

If you add a new convention (e.g. a required `CHANGELOG.md`, a new lint step), add the check to `scripts/audit.mjs` in the `auditCrate` function, then extend the `--plan` output with the corresponding fix template. Keep checks cheap (no network, no subprocess) so the audit stays fast and CI-friendly.
