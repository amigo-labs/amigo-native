# @amigo-labs/tldts

> Rust-powered domain / public-suffix parser. Subset-compatible shape with [`tldts`](https://www.npmjs.com/package/tldts), backed by the [`psl`](https://crates.io/crates/psl) crate (bundled IANA Public Suffix List) plus [`idna`](https://crates.io/crates/idna). Compiled via NAPI-RS.

## Install

```bash
npm install @amigo-labs/tldts
```

## Usage

```ts
import {
  parse,
  getDomain,
  getPublicSuffix,
  getHostname,
  getSubdomain,
  parseMany,
} from '@amigo-labs/tldts'

parse('https://www.example.co.uk/path')
// {
//   hostname: 'www.example.co.uk',
//   domain: 'example.co.uk',
//   subdomain: 'www',
//   publicSuffix: 'co.uk',
//   isIcann: true,
//   isPrivate: false,
//   isIp: false,
// }

getDomain('mail.example.com')        // 'example.com'
getHostname('https://x.y.com:443/')  // 'x.y.com'

// Batch — one FFI crossing amortises over N inputs.
parseMany(['a.com', 'b.org'])
```

## Install for the browser

The same `import` works in Angular, React, Vite, esbuild, and webpack ≥ 5 — the bundler picks the WASM build via the `browser` conditional export:

```ts
import { parse } from '@amigo-labs/tldts'
```

The bundled IANA Public Suffix List (~50 KB gzipped) is embedded in the WASM artifact; no runtime resource loading.

## Parity

Subset of upstream `tldts@7`: the bundled IANA PSL covers the default
(ICANN ∪ PRIVATE) list. `allow_private_domains` and `detect_ip` are
documented no-ops in v0.1 — see the inline rustdoc on `ParseOptions`
in `src/lib.rs`. `extract_hostname: false` is honoured.

## License

MIT
