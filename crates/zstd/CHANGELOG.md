# Changelog

## [0.2.0](https://github.com/amigo-labs/amigo-native/compare/zstd@0.1.0...zstd@0.2.0) (2026-07-21)


### Features

* **crates:** scaffold + implement 8 new crates from the perf-review batch ([4fe1790](https://github.com/amigo-labs/amigo-native/commit/4fe17902ac078b73a1d9515855680046a6d18b25))
* ship WASM bindings for all eligible crates (Angular/React support) ([792802f](https://github.com/amigo-labs/amigo-native/commit/792802f389e26463fad9269a0533d7f14cc8aa3f))
* **zstd:** WASM via ruzstd fallback (decompress-only) ([ba2b292](https://github.com/amigo-labs/amigo-native/commit/ba2b2920a27f9122bd790b1ec35e796e338865be))


### Bug Fixes

* **build:** stop wasm-pack's pkg/.gitignore from emptying npm tarballs ([6a70b18](https://github.com/amigo-labs/amigo-native/commit/6a70b18577dd14d7776462fe286f15618a306e7b))
* **crates:** address CI failures from the 8-crate batch ([bcb41dd](https://github.com/amigo-labs/amigo-native/commit/bcb41ddbe601fb843253e03a8f8f98c27c0babff))
* **crates:** pixelmatch conformance + Copilot-flagged correctness bugs ([d0c6174](https://github.com/amigo-labs/amigo-native/commit/d0c61744bd32f8e56f59e21eea61cdc2d10e8b86))


### Documentation

* **perf-review:** add 8 candidate decision docs (zstd, fuse, tldts, pngjs, linkify-it, jpeg-js, jimp, pixelmatch) ([e87bb01](https://github.com/amigo-labs/amigo-native/commit/e87bb01b055834c000cc156d6f0153da5752836b))
