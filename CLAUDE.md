# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Language

All repository content — documentation, code comments, commit messages, PR
descriptions, and perf-review / post-mortem documents — must be written in
**English**. This applies to every file under `docs/`, every crate
`README.md`, `BACKLOG.md`, `CONTRIBUTING.md`, and all source-code comments.

Non-English strings are only allowed when they are deliberate test fixtures
for Unicode handling (e.g. `"Schöne Grüße"` in a slugify test, `"café"` in
an encoding test). Those are data, not prose, and should stay as-is.

When adding new documentation or translating existing content, keep the
tone and formatting consistent with the surrounding English text.

## Dual-target convention (Node + Browser)

Every public crate ships both an napi binding (Node) and a wasm-bindgen
binding (Angular / React / Vite / esbuild / webpack ≥ 5) inside a single
`@amigo-labs/<name>` npm package, with the right artifact picked via
conditional `exports`. Three crates intentionally stay Node-only — see
"Node.js server-only tier" below.

### Crate layout

```
crates/_<name>-core/        # pure-Rust algorithm. publish = false.
                            # No napi / wasm-bindgen attributes; just the logic.
crates/<name>/              # the napi binding + npm package
  Cargo.toml                # depends on `amigo-<name>-core` via path
  src/lib.rs                # #[napi] wrappers
  npm/<6 platforms>/        # napi platform-stub packages
  wasm/Cargo.toml           # depends on `amigo-<name>-core` via path
  wasm/src/lib.rs           # #[wasm_bindgen] wrappers
  wasm/tests/web.rs         # wasm-bindgen-test parity tests
  package.json              # conditional `exports` + `browser` + files list
```

The pure-Rust core is the **single source of truth** for the algorithm.
The napi crate translates `Buffer` / `BigInt` / option structs to/from
the core types; the wasm crate does the same with `Uint8Array` /
JS BigInt / serde-wasm-bindgen.

### Cargo.toml conventions for the wasm sub-crate

```toml
[lib]
crate-type = ["cdylib", "rlib"]   # rlib needed for wasm-bindgen-test
                                  # to link against the crate's symbols

[dependencies]
amigo-<name>-core = { path = "../../_<name>-core" }
wasm-bindgen = { workspace = true }
serde-wasm-bindgen = { workspace = true }
serde = { version = "1", features = ["derive"] }   # for option-struct deserialization

[dev-dependencies]
wasm-bindgen-test = { workspace = true }

[package.metadata.wasm-pack.profile.release]
# wasm-pack tries to download a prebuilt binaryen at build time;
# we disable it and run wasm-opt -Oz in CI as a separate step.
wasm-opt = false
```

### package.json conventions

```jsonc
{
  "main": "./index.js",                              // existing napi loader
  "types": "./index.d.ts",
  "browser": "./wasm/pkg/amigo_<name>_wasm.js",
  "exports": {
    ".": {
      "browser": {                                   // Vite, esbuild, webpack ≥ 5
        "types": "./wasm/pkg/amigo_<name>_wasm.d.ts",
        "default": "./wasm/pkg/amigo_<name>_wasm.js"
      },
      "default": {
        "types": "./index.d.ts",
        "default": "./index.js"
      }
    }
  },
  "files": [
    "index.js", "index.d.ts", "README.md",
    "wasm/pkg/amigo_<name>_wasm.js",
    "wasm/pkg/amigo_<name>_wasm_bg.js",
    "wasm/pkg/amigo_<name>_wasm_bg.wasm",
    "wasm/pkg/amigo_<name>_wasm.d.ts",
    "wasm/pkg/amigo_<name>_wasm_bg.wasm.d.ts"
  ],
  "scripts": {
    "build:wasm": "cd wasm && wasm-pack build --target bundler --release --out-dir pkg",
    "build:all":  "pnpm build && pnpm build:wasm",
    "prepublishOnly": "pnpm build:wasm && napi pre-publish --skip-optional-publish --no-gh-release",
    "test:wasm":  "cd wasm && wasm-pack test --node"
  },
  "amigo": {
    "targets": ["node", "browser"]                   // surfaced in docs/packages.json
  }
}
```

**wasm-pack filename gotcha**: `amigo-<crate>-wasm` becomes
`amigo_<crate>_wasm.js` (dashes → underscores). For crates with dashes
(`pdf-parse`, `linkify-it`, `file-type`, `sanitize-html`, etc.) the
`files` field and `exports` paths must use the underscored form, e.g.
`wasm/pkg/amigo_pdf_parse_wasm.js`.

### Node.js server-only tier

Three crates intentionally stay napi-only and do **not** have a `wasm/`
sub-directory:

| Crate | Reason |
|---|---|
| `argon2` | Performance — memory-hard hash, ~2× slower in WASM; browser password hashing is an anti-pattern |
| `jose`   | Server-only crypto — private signing keys must not ship to the browser |
| `jwt`    | Server-only crypto — same as `jose` |

These crates declare `amigo.targets: ["node"]` in `package.json` and
have a "WASM-target exclusion" section in their
`docs/perf-review/<name>.md`. The full policy lives in
[`docs/specs/expansion-2026.md`](docs/specs/expansion-2026.md)
§ Node.js server-only tier.

The **single source of truth** for the group is the constant
`NODE_ONLY_CRATES = {argon2, jose, jwt}`, duplicated in six places:

- `.claude/skills/audit-crates/scripts/audit.mjs`
- `scripts/sync-registry.mjs`
- `scripts/build-all-wasm.mjs`
- `scripts/scaffold-wasm-bench.mjs`
- `.github/workflows/ci.yml` (env var)
- `.github/workflows/release.yml` (env var + `contains(fromJSON('…'))`)

To add or remove a crate from the group, edit all six together and
update the policy section in `expansion-2026.md`. The audit-crates
skill verifies the invariants are upheld.

### Randomness in WASM

Crates that depend on `getrandom` (cryptographic RNG, salts, key
generation) need an explicit feature in their core crate when targeting
wasm32:

```toml
[target.'cfg(target_arch = "wasm32")'.dependencies]
getrandom = { version = "0.3", features = ["wasm_js"] }   # 0.2 uses "js"
```

Currently no shipped dual-target crate needs this — `jose` and `jwt`
are in the Node-only group. Revisit if a future crate adds randomness
(e.g. a `nanoid`-style ID generator).
