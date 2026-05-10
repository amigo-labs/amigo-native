# Candidate review: `tldts`

> **Status:** 🟡 GO (conditional on batch API) · **Predicted:** Yellow per-call, Green for batch · **Reviewed:** 2026-05-10

## Verdict

`tldts` is a Public-Suffix-List-driven domain parser. The shape is
half-Green, half-FFI-trap: the trie traversal is a textbook stateful
load-once-query-many workload (Green-shape), but a single
`parse('example.com')` call costs ~1 µs in pure JS, leaving little
headroom over the 109 ns NAPI floor + ~234 ns string round-trip
(`docs/BASELINE.md:23, 24`). The package only wins decisively when
the realistic call shape is "parse N hostnames in one call" or
"parse this batch of 1M log lines" — analytics pipelines, cookie-jar
scope checks, log enrichment. **Recommendation: GO**, but the v0.1
charter must lead with a batch / array-of-strings API; a Rust port
of the single-call API alone is a Yellow / Red risk that would
repeat the `mime` post-mortem.

## JS package

- **npm:** `tldts` (and `tldts-experimental` for the smaller "TLD list
  only" variant). `psl`, `parse-domain`, `tld-extract` are siblings.
- **Downloads (week of 2026-05-02):** `tldts` 47.5M, `psl` 46.4M
  (the older alternative — still the larger absolute number,
  surprisingly close). Aggregate domain-parsing on npm ≈ 95M / wk
  across these two, much of it transitive through cookie / fetch
  libraries.
- **Exports / API surface:** `parse(url) → { hostname, domain,
  subdomain, publicSuffix, isIcann, isPrivate, isIp }`, plus
  shortcut helpers: `getDomain(url)`, `getPublicSuffix(url)`,
  `getHostname(url)`, `getSubdomain(url)`. Options for ICANN-only
  / private-domain inclusion and detect-IP flags.
- **Typical input:** hostname or URL string, 5–80 chars.
- **Typical output:** small object with 4–8 string fields; total
  output size 20–200 bytes.
- **Realistic median use-case:**
  - **Per-call**: middleware on incoming requests parses one
    `Host` header per request (~1 µs JS, called once per request).
  - **Batch**: log enrichment / analytics pipeline parses millions
    of URLs from a log file (where total work is meaningful).
  - **Stateful**: per-request cookie scope check against a long-
    lived suffix trie (one parse call but the trie is reused
    forever).

## Rust replacement

- **Candidate crate(s):** `publicsuffix` (canonical Rust binding,
  loads the IANA PSL into a trie). `addr` is a higher-level
  alternative built on `publicsuffix`. For IDN parity: `idna`
  (Servo's IDN implementation).
- **Maintenance / license:** `publicsuffix` 2.x is actively
  maintained (rushmorem/publicsuffix), MIT/Apache-2.0. `idna` is
  Servo project, very actively maintained.
- **Known gotchas / divergences:**
  - PSL data shipping: `tldts` bundles a versioned PSL blob and
    re-publishes weekly. The Rust crate either bundles the same
    blob at build time (semver bump per PSL update) or accepts a
    runtime-loaded list (parity-friendlier, lower release cadence).
    The bundled-at-build-time approach matches how `tldts` works
    today.
  - IDN / punycode handling: `tldts` performs unicode-to-ASCII via
    its bundled `punycode` shim. Rust must use `idna` to match
    semantics.
  - `tldts` vs `psl` divergence on edge cases (single-label
    hostnames, private domains): pick one. `tldts` is the larger
    target.

## BACKLOG check

No entry in `BACKLOG.md` for `tldts`, `psl`, `parse-domain`, or
related. Fresh territory.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Low at the single-call boundary.** `tldts.parse('foo.example.com')` runs in ~0.5–1.5 µs (trie traversal of ~5 labels). NAPI floor 109 ns + ~234 ns string round-trip ≈ 350 ns is a meaningful share of that 1 µs. Per-call Rust port: 1.5–3× at best, 1.0× plausible. |
| Input size distribution | Narrow: hostnames are 5–80 chars almost always. No "large input" regime to amortize FFI over. |
| Output size distribution | Small struct with 4–8 strings. Marshalling cost ~200–400 ns via V8 object construction. Comparable to the Rust work. |
| Reusable setup (stateful potential) | **Very high on the data side**: the suffix trie loads once (~200 KB of PSL data → ~150k labels) and is queried per call. But this is *implicit* state — both `tldts` and the Rust port hold it as a static / lazy-initialized data structure. Not a "NAPI class" lever, just a one-time-init lever. |
| Batch-usage realism | **Critical lever.** Analytics / log enrichment workloads parse N hostnames in tight loops. `parseMany(urls: Buffer[]) → Buffer` returning packed `Uint32Array` of offsets or struct-of-arrays is where the Green win lives. |
| FFI-share estimate vs. Rust work | Per-call: 30–50% (FFI-bound). Batch (1M urls in one call): <1%. The two paths have opposite classifications. |

## Classification reasoning

The single-call shape is dangerously close to the `mime` / `dotenv`
FFI-trap post-mortem family: tiny per-call work, small string in,
small object out, called in tight loops. The BASELINE table is
unambiguous: 100 KB string round-trip is 35 µs, scaling at
0.35 ns / byte. A 50-char hostname pays ~125 ns just for the string
conversion, before the trie walk. Pure-JS `tldts` runs the trie walk
in plain V8 with the suffix list in a JS object — that is fast.

The single-call path is therefore likely 🟡 Yellow at best, possibly
🔴 Red. This is the same shape that killed `nanoid` (260 ns JS vs
1500 ns NAPI).

The batch path is a different package. A `parseMany(urls: Buffer[])`
call with N=10k–1M flips the ratio: 1M small allocations + 1M trie
walks in pure-JS dominate; one big call into Rust with zero per-item
FFI overhead is a clean Green.

The stateful-trie aspect (load PSL once into a Rust trie) is real but
not a `Compressor`-class-style lever — `tldts` already does this in
pure JS. It's the *batch loop boundary* that matters, not the trie
storage.

**Predicted classification:** 🔴 Red on the naive per-call API,
🟢 Green on the batch API. The package only ships if the batch API
is first-class.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/tldts` (matches the
  upstream npm name verbatim, simplest migration)
- **Primary API sketch:**
  ```ts
  type ParseResult = {
    hostname: string | null
    domain: string | null
    subdomain: string | null
    publicSuffix: string | null
    isIcann: boolean
    isPrivate: boolean
    isIp: boolean
  }

  type ParseOptions = {
    allowPrivateDomains?: boolean
    detectIp?: boolean
    extractHostname?: boolean
  }

  // Parity drop-in (per-call; expected Yellow)
  export function parse(input: string, opts?: ParseOptions): ParseResult
  export function getDomain(input: string, opts?: ParseOptions): string | null
  export function getPublicSuffix(input: string, opts?: ParseOptions): string | null
  export function getHostname(input: string): string | null
  export function getSubdomain(input: string, opts?: ParseOptions): string | null

  // The Green-shape batch API
  export function parseMany(
    inputs: string[] | Buffer,  // Buffer = newline-separated UTF-8 hostnames
    opts?: ParseOptions
  ): {
    domains: (string | null)[]
    publicSuffixes: (string | null)[]
    flags: Uint8Array  // bit-packed isIcann/isPrivate/isIp/etc.
  }

  // Stateful class (optional — primarily for tooling that wants to
  // load a custom PSL or pin to a PSL snapshot)
  export class Parser {
    constructor(options?: {
      psl?: Buffer  // override default bundled PSL
      allowPrivateDomains?: boolean
    })
    parse(input: string): ParseResult
    parseMany(inputs: string[] | Buffer): ParseManyResult
  }
  ```
- **Must-have benchmark scenarios:**
  - Single `parse('foo.bar.example.com')` — vs `tldts`, `psl`
  - 1k / 10k / 100k urls in a tight loop, calling `parse` per item
    — vs `tldts`, `psl`
  - 10k / 100k / 1M urls via `parseMany(buffer)` — the Green-path
  - Long-lived `Parser` instance vs free functions (rule out
    re-init cost)
  - IDN / punycode round-trip — parity verification
  - Edge cases: localhost, IP literals (v4 + v6), single-label
    hostnames, trailing dots
- **Acceptance thresholds (Green gate):**
  - ≥1.0× vs `tldts` on the per-call path (parity floor — anything
    below this is Red and the package does not ship)
  - ≥5× vs `tldts` on `parseMany(100k)` (the batch path —
    Green-gate)
  - Output parity verified against `tldts` test suite (port the
    table-driven cases)
- **Risks:**
  - **Per-call FFI floor**: documented in BASELINE. If the per-call
    parity is below 1.0× even after `&str` / Buffer overload, the
    per-call API ships with a "use parseMany for bulk workloads"
    note in the README. Do not paper over this with a fake speedup.
  - **PSL update cadence**: bundling the PSL means a republish per
    PSL change. Decide whether `@amigo-labs/tldts` will track
    upstream `tldts` weekly or pin to monthly snapshots. Document
    the chosen cadence in the README.
  - **Mime-trap regression**: if the per-call path benchmarks worse
    than `tldts` and the user prefers single-call ergonomics, the
    portfolio loses adoption to `tldts`. The batch API + clear
    README guidance is the mitigation. If neither is acceptable,
    NO-GO.

## If NO-GO — BACKLOG entry

```markdown
- [`tldts`] — **[FFI] per-call shape too small**: typical
  `tldts.parse('host.example.com')` is ~1 µs in pure JS; NAPI floor
  + string round-trip eats most of that. Batch-API approach would
  win on log-enrichment workloads, but the realistic call shape in
  the npm ecosystem is per-request (cookie scope, middleware), so
  the headline drop-in path stays FFI-bound. Considered 2026-05-10,
  see `docs/perf-review/tldts.md`.
```

Section in `BACKLOG.md`: **[FFI] too small — per-call work below
the NAPI floor or string-marshalling cost**

## References

- BASELINE: `docs/BASELINE.md` (NAPI floor 109 ns, string 35 µs /
  100 KB → 0.35 ns / byte; small-input regime is the dangerous one
  for this shape)
- FFI-trap precedents: `docs/perf-review/dotenv.md`,
  `docs/perf-review/mime.md` (if present),
  `docs/post-mortems/nanoid.md` (if present)
- Portfolio Green-pattern reference: `crates/sentences/` (batch
  offset-packed output)
- Rust crate: <https://crates.io/crates/publicsuffix>,
  <https://crates.io/crates/idna>
- Upstream JS: <https://github.com/remusao/tldts>
