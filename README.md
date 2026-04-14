# amigo-native

Rust-powered npm packages under the `@amigo-labs` scope.

Monorepo using [napi-rs](https://napi.rs) for native Node.js addons, cross-compile CI, and independent npm packages per crate.

## Packages

| Package | Description | Status |
|---------|-------------|--------|
| [`@amigo-labs/slugify`](./crates/slugify) | Blazing fast slugify powered by Rust | Phase 1 |

## Development

### Prerequisites

- Rust (edition 2024)
- Node.js >= 18
- pnpm

### Setup

```bash
pnpm install
```

### Build

```bash
# Build all packages (release)
pnpm build

# Build all packages (debug, faster)
pnpm build:debug
```

### Test

```bash
# Rust tests
cargo test --workspace

# Node.js tests
pnpm test
```

### Lint

```bash
pnpm lint
```

## Adding a new package

```bash
./scripts/new-package.sh <package-name>
```

Then edit `crates/<name>/src/lib.rs` and `crates/<name>/Cargo.toml`.

## Release

Tag with `<crate-name>@<version>` (e.g. `slugify@0.1.0`) to trigger the release workflow.

## License

MIT
