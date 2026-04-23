# Candidate review: `tough-cookie`

> **Status:** NO-GO · **Predicted:** 🟡 Yellow (perf) / 🔴 Red (scope) · **Reviewed:** 2026-04-19

## Verdict

Cookie parsing is string-heavy and short — FFI-trap shape for the parse path. The actual work is cookie-jar state + Public Suffix List + IDN + RFC 6265-bis compatibility; that's a months-long project for a Yellow win.

## JS package

- **npm:** `tough-cookie`
- **Downloads:** ~157M/week
- **Exports / API surface:** `Cookie`, `CookieJar`, `Store`, `MemoryCookieStore`, `parseDate`, `canonicalDomain`, `permuteDomain`, `getPublicSuffix`
- **Typical input:** `Set-Cookie` header (~100–300 B) + request URL
- **Typical output:** `Cookie` instance or cookie list on jar retrieval
- **Realistic median use-case:** HTTP client stores cookie per response (a handful per request), reads them per request; state-heavy, not a hot loop

## Rust replacement

- **Candidate crate(s):** `cookie` (parse/format), `publicsuffix` (PSL), `idna` (IDN). No direct `tough-cookie` equivalent as a single crate
- **Maintenance / license:** all active, MIT
- **Known gotchas / divergences:** `tough-cookie` implements RFC 6265 + 6265-bis + WHATWG quirks (e.g. `same-site` eval, prefix rules `__Host-`/`__Secure-`, `expires` date format heuristics); browser-compat tests are extensive

## BACKLOG check

BACKLOG: *Parity too expensive* — confirmed. No change to the parity horizon since the last look.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | Parse a cookie header: ~500 ns – 2 µs in JS. FFI floor 109 ns = 5–20% baseline cost |
| Input size distribution | 50–500 B strings, directly in the FFI-trap zone |
| Output size distribution | A single cookie object with ~10 fields — object materialization over NAPI is expensive |
| Reusable setup (stateful potential) | PSL + jar as a NAPI class makes sense — but the JS `Jar` is already an object, the win is marginal |
| Batch-usage realism | Low (3–5 cookies per request) |
| FFI-share estimate vs. Rust work | High — per-cookie FFI + object output cost eat the Rust gain |

## Classification reasoning

Even if the Rust parser were 3× faster than `tough-cookie`, the real-world call lands at ~700 ns (FFI + object materialization) vs. `tough-cookie`'s ~1.5 µs → 2× win. But: PSL integration, IDN handling, `canonicalDomain` edge cases, browser-compat suite = weeks of engineering. And the win evaporates, because HTTP clients don't parse 100k cookies/s — they parse ~3 per request and then wait on the network. The perf return is structurally low.

## If NO-GO — BACKLOG entry

```markdown
- **tough-cookie** (157M). Browser-compat quirks + Public Suffix List + cookie-jar state. Easily a month-long project. Cookie parsing sits in FFI-trap range (short strings, small output objects) and HTTP clients don't parse cookies in hot loops — the win doesn't exist where it matters.
```

Section in `BACKLOG.md`: **Parity too expensive**
