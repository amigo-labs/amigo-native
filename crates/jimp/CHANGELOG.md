# Changelog

## [0.2.0](https://github.com/amigo-labs/amigo-native/compare/jimp@0.1.0...jimp@0.2.0) (2026-07-02)


### Features

* **crates:** scaffold + implement 8 new crates from the perf-review batch ([4fe1790](https://github.com/amigo-labs/amigo-native/commit/4fe17902ac078b73a1d9515855680046a6d18b25))
* **jimp:** add WASM binding via core split ([ae0b130](https://github.com/amigo-labs/amigo-native/commit/ae0b130393a107dca249884d4d8059208d616c06))
* ship WASM bindings for all eligible crates (Angular/React support) ([792802f](https://github.com/amigo-labs/amigo-native/commit/792802f389e26463fad9269a0533d7f14cc8aa3f))


### Bug Fixes

* **build:** stop wasm-pack's pkg/.gitignore from emptying npm tarballs ([6a70b18](https://github.com/amigo-labs/amigo-native/commit/6a70b18577dd14d7776462fe286f15618a306e7b))
* **crates:** address CI failures from the 8-crate batch ([bcb41dd](https://github.com/amigo-labs/amigo-native/commit/bcb41ddbe601fb843253e03a8f8f98c27c0babff))
* **crates:** pixelmatch conformance + Copilot-flagged correctness bugs ([d0c6174](https://github.com/amigo-labs/amigo-native/commit/d0c61744bd32f8e56f59e21eea61cdc2d10e8b86))
* **jimp:** use is_empty() instead of len() &gt; 0 in wasm test ([e01aed2](https://github.com/amigo-labs/amigo-native/commit/e01aed248449c1b5862361caa5b1f85ce5dff202))


### Documentation

* **perf-review:** add 8 candidate decision docs (zstd, fuse, tldts, pngjs, linkify-it, jpeg-js, jimp, pixelmatch) ([e87bb01](https://github.com/amigo-labs/amigo-native/commit/e87bb01b055834c000cc156d6f0153da5752836b))
