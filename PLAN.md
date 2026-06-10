# Deep Fixup Plan — 2026-06-10

Session record for the analyze → plan → execute pass on branch
`claude/deep-fixup-v7j8ey`. Tasks are executed top to bottom, one atomic
commit per task (`T<nr>: <title>`).

## Baseline (green bar)

Measured before any change, all PASS:

```bash
cargo fmt --check
cargo check --workspace          # ~57s
cargo clippy --workspace -- -D warnings
cargo test --workspace           # 50 suites
```

Full-session verification = the four commands above, plus the vitest suites
of touched packages (csv, xlsx), `node scripts/render-readmes.mjs --check`,
and `node scripts/sync-registry.mjs` idempotency after README changes.

JS side: the container starts without `node_modules`; only touched packages
get built and tested (full 36-crate release build is out of scope).

## Tasks

- [x] T1: csv — reject out-of-range delimiter/quote/escape/comment instead of silent u32→u8 truncation
      Files: crates/_csv-core/src/lib.rs:19-40 (+ tests), crates/csv/src/lib.rs, crates/csv/wasm/src/lib.rs (only if signatures shift)
      Change: `opts.delimiter as u8` etc. silently wraps (256 → NUL). Make the
      option translation fallible: validate each of delimiter/quote_char/
      escape_char/comment with `u8::try_from`, returning
      `Err("<option> must be a single byte (0-255), got <v>")`. `make_reader`
      (and the writer-side equivalent) become `Result<_, String>`; all core
      entry points (`parse`, `parse_with_headers`, `stringify`, …) already
      return `Result<_, String>`, and both bindings propagate that — no
      binding API change expected. Add core unit tests: delimiter 256 errors,
      delimiter 44 still parses, quote/escape/comment 256+ error.
      Verify: cargo test -p amigo-csv-core; pnpm --filter @amigo-labs/csv build:debug && vitest suite of crates/csv

- [x] T2: xlsx — error on >65,535 columns instead of silent u16 wraparound
      Files: crates/_xlsx-core/src/lib.rs:165-188 (+ tests)
      Change: `let col_u = c as u16;` wraps for c ≥ 65,536 → cells silently
      land in wrong columns (rust_xlsxwriter only rejects 16,384–65,535).
      Replace with `u16::try_from(c).map_err(...)` and
      `u32::try_from(r).map_err(...)` returning a descriptive
      `Err("row <r>: too many cells (<n>); XLSX allows at most 16384 columns")`.
      Add a core unit test asserting `write_workbook` errors (not corrupts)
      for an oversized row — use a row of 65,537 minimal cells.
      Verify: cargo test -p amigo-xlsx-core

- [x] T3: template/generator — scaffold core + wasm + dual-target package.json
      Files: crates/_template/{core/Cargo.toml.tmpl, core/src/lib.rs,
             wasm/Cargo.toml.tmpl, wasm/src/lib.rs, wasm/tests/web.rs,
             README.md.tmpl} (new); crates/_template/{package.json.tmpl,
             Cargo.toml.tmpl, src/lib.rs} (modified);
             scripts/new-package.sh; CONTRIBUTING.md §Adding a crate
      Change: bring the generator up to the documented convention
      (CLAUDE.md crate layout; reference impls: _slugify-core / slugify /
      csv/package.json):
      (a) `_template/core/` scaffold — `Cargo.toml.tmpl` (name
          amigo-{{NAME}}-core, publish=false, edition 2024) + `src/lib.rs`
          with a `hello()` stub + unit test; new-package.sh moves it to
          `crates/_{{NAME}}-core`. Nested location keeps it invisible to the
          workspace globs (`crates/*`, `crates/*/wasm`); no root Cargo.toml
          change (prefix exclude + .tmpl manifests already cover
          `_template/wasm`).
      (b) `_template/wasm/` scaffold — Cargo.toml.tmpl (crate-type
          ["cdylib","rlib"], workspace deps wasm-bindgen +
          wasm-bindgen-test, commented serde lines, wasm-opt=false,
          path dep on ../../_{{NAME}}-core), src/lib.rs delegating to
          `amigo_{{NAME_UNDERSCORE}}_core::hello()`, tests/web.rs parity test.
      (c) `package.json.tmpl` → full dual-target shape: browser field +
          conditional exports + 5 wasm/pkg files entries (all using
          `amigo_{{NAME_UNDERSCORE}}_wasm.*`), scripts build:wasm /
          build:all / test:wasm / prepublishOnly, amigo block gains
          `"targets": ["node", "browser"]` and `category`; dev-dep versions
          aligned with csv (@napi-rs/cli ^3.6.2, fast-check ^4.8.0,
          vitest ^4.1.7).
      (d) `Cargo.toml.tmpl` adds `amigo-{{NAME}}-core = { path =
          "../_{{NAME}}-core" }`; `src/lib.rs` delegates to core.
      (e) `README.md.tmpl` minimal skeleton incl. "Install for the browser".
      (f) `new-package.sh`: `NAME_UNDERSCORE=${NAME//-/_}`, second sed
          expression for `{{NAME_UNDERSCORE}}`, `mv core → crates/_<name>-core`,
          collision check for the core dir, both dirs in the find loops,
          updated echo hints (core first, wasm wrappers, npm/ stubs,
          build:all, test:wasm).
      (g) CONTRIBUTING.md: reword steps 1 and 5 from "add X" to "fill in the
          scaffolded X".
      Verify: ./scripts/new-package.sh scratch-test-pkg; grep underscored
      names in generated files; cargo check -p amigo-scratch-test-pkg-core
      -p amigo-scratch-test-pkg -p amigo-scratch-test-pkg-wasm; cargo test
      -p amigo-scratch-test-pkg-core; then rm -rf crates/scratch-test-pkg
      crates/_scratch-test-pkg-core && git checkout -- Cargo.lock
      (cleanup BEFORE any sync-registry/pnpm run).

- [x] T4: add "Install for the browser" README section to the 8 remaining dual-target crates
      Files: crates/{diff,force-layout,graph-layout,pdf,pdf-parse,slugify,
             text-splitters,xlsx}/README.md; docs/readmes/*.html (regenerated)
      Change: closes the open status.md checkbox "README 'Install for the
      browser' subsection per shipping crate" (25 of 33 done). Follow the
      established patterns: bm25/README.md:64 for normal crates; check zip /
      jimp wording for the bundle-heavy ones (pdf, pdf-parse, xlsx — mention
      lazy import); text-splitters notes the tiktoken-on-wasm32 exclusion
      (mirror existing wording in its README/MIGRATION if present). Then
      regenerate the rendered fragments: pnpm install && pnpm --filter
      @amigo-labs/commonmark build && node scripts/render-readmes.mjs.
      Verify: node scripts/render-readmes.mjs --check; git diff shows only
      the 8 READMEs + their 8 html fragments.

- [ ] T5: rewrite stale status.md to post-expansion reality
      Files: status.md
      Change: last updated 2026-05-17; claims Batch 1 in progress
      (tldts/turndown remaining), Batches 2/3 + edge cases unstarted, active
      draft PR #134. Reality: all 33 dual-target crates shipped. Rewrite:
      "In flight" emptied (or this fixup session), expansion moved to
      "Recently shipped" (one summary row, not per-batch), "Next up" keeps
      only the still-open items — pack-verify CI step (absent from
      workflows) and dashboard targets *filter* facet (TargetsPill display
      exists, filter doesn't) — drops the README-subsection item (done in
      T4). Update header (date, branch), keep Q1/Q2 open questions table.
      Verify: re-read; no claim contradicts the repo state.

- [ ] T6: correct NODE_ONLY_CRATES "four places" undercount to six
      Files: CLAUDE.md:132, docs/specs/expansion-2026.md:427, CONTRIBUTING.md:103
      Change: the constant is duplicated in six places (audit.mjs,
      sync-registry.mjs, build-all-wasm.mjs, scaffold-wasm-bench.mjs,
      ci.yml, release.yml) — all values agree; only the prose count is
      wrong. Update the three docs to list all six locations.
      Verify: grep -rn "four places\|four spots" returns nothing relevant;
      listed paths exist.

## Not this session

- Checked-in generated napi loaders are stale (discovered during T1): a local
  `napi build` of csv regenerates `crates/csv/native.cjs` with the platform
  package version check updated 0.1.0 → 0.1.1 and `native.d.ts` without doc
  comments that no longer exist in `src/lib.rs`. The same drift likely affects
  other crates (cf. earlier commit "Fix: index.js version drift across 26
  crates", 69116f5). Regenerating consistently needs a full `pnpm build` of
  all 36 packages — out of scope here; the churn was reverted.
- pack-verify CI step (status.md backlog item — CI-only, can't validate locally)
- dashboard "targets" filter facet in the web UI (feature, not drift)
- full JS-side test run across all 36 packages (requires full release builds)
