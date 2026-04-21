# Perf-Review: `@amigo-labs/sanitize-html`

> **Status:** 🟢 Green · **Reviewed:** 2026-04-21 · **Version:** 0.2.0

## Verdict

**1,63×–4,15× vs. `sanitize-html` npm** auf der Sanitize-Surface; **39,6×–122× vs. `isomorphic-dompurify`** auf großen Documents. HTML-Parsing + Rule-Dispatch + Serialize ist exakt der Green-Shape aus `commonmark`/`turndown`: Buffer-in/String-out, substantial compute, kein Chain-API. Mozilla `ammonia` ist der Backend (auch in servo und den Mozilla-Observatory-Scannern verwendet), bei 100 KB Input mit XSS-Inhalten sind wir **4,15×** schneller als upstream-`sanitize-html`. Transform-API (regex + tokenizer-based wrapper) bringt Medium-/Heavy-HTML-Mutation zusätzliche 1,5–2,6× über das npm-Äquivalent.

## Classification rationale

1. **`ammonia` = `html5ever` + Whitelist-Rules.** Der Parser (html5ever, Mozilla Servo) ist SIMD-beschleunigt und zero-GC. Rule-Dispatch in Rust ist Pattern-Match auf Node-Type (kein JS-Hashmap-Lookup per Tag).
2. **V0.2-Upgrade mit Hybrid-Engine.** Tokenizer-Wrapper + Regex-Wrapper koexistieren — Regex ist der schnellste Pfad für einfache Tag-Renames (ol→ul), Tokenizer für Attribute-Mutations. User wählt pro Transform-Operation das passende Tool.
3. **Small-Case-Delta ist konservativ.** 200-char safe-HTML: 1,63× vs. sanitize-html. Für sehr kleine Inputs sitzt der FFI-Floor sichtbarer — aber bleibt über 1×, daher Green-konform.
4. **DOMPurify-Vergleich ist Extremfall.** DOMPurify ist Browser-orientiert und im Node-Kontext (jsdom-basiert) massiv langsam. 122×-Win auf 100 KB bestätigt, dass DOMPurify keine echte Server-Alternative ist.

## Evidence

### Measured speedup (docs/data.json, 2026-04-18)

**Sanitize-Surface:**

| Scenario | @amigo-labs/sanitize-html | sanitize-html npm | isomorphic-dompurify | vs. sanitize-html | vs. dompurify |
|---|---:|---:|---:|---:|---:|
| small safe HTML (~200 chars) | 45 747 Hz | 28 032 Hz | 1 157 Hz | **1,63×** | **39,5×** |
| medium with XSS (~2 KB) | 10 320 Hz | 3 928 Hz | 227 Hz | **2,63×** | **45,5×** |
| large document (~100 KB) | 375,5 Hz | 90,5 Hz | 9,5 Hz | **4,15×** | **39,6×** |

**Transform-Surface** (ol→ul Simple-Rename):

| Scenario | regex-wrapper + amigo | tokenizer-wrapper + amigo | sanitize-html npm | best-of-amigo vs. upstream |
|---|---:|---:|---:|---:|
| small (~80B) | 25 923 Hz | 25 409 Hz | 35 525 Hz | 0,73× (small: upstream still wins) |
| medium (~6KB, 100 lists) | 4 737 Hz | 3 032 Hz | 1 821 Hz | **2,60×** (regex-wrapper) |
| heavy (~40KB, 1000 transforms) | 602,3 Hz | 178,7 Hz | 283,4 Hz | **2,13×** (regex-wrapper) |

### Realistic use-case

**User-Generated-Content-Sanitization** — Kommentare, Forum-Posts, Rich-Text-Editor-Output. Typisch 500 B – 10 KB. **E-Mail-HTML-Rendering** mit XSS-Prevention für Incoming-Mails. **Markdown-zu-HTML-Pipeline** nach `@amigo-labs/commonmark`. **Content-Import** aus Legacy-Systems mit unsicherem HTML. Median: 2 KB safe oder untrusted HTML.

Transform-Use-Case ist seltener: **CMS-Content-Migration** (z.B. ol→ul für Style-Konsistenz), **Rich-Text-Editor-Normalization** (WYSIWYG-Output-Cleanup).

### Benchmark gaps

- **Very-large (1 MB+) nicht gebenched.** Realistic für Article-Corpus-Processing.
- **Allow-list-heavy Config** (viele custom-allowed-tags + -attributes) nicht isoliert gemessen. Rule-Set-Größe beeinflusst Dispatch-Overhead.
- **Multi-Transform-Chain** (tokenizer + regex in einem Pass) nicht gebenched — User müssten heute zwei Calls machen.

### API surface

Basierend auf sanitize-html-Parity plus hybrid-engine-Additions:

- `sanitize(html, options?)` — main call, returns cleaned HTML-string
- Options: `allowedTags`, `allowedAttributes`, `allowedClasses`, `allowedSchemes`, `transformTags`, `textFilter`, `parser`, etc. (sanitize-html-parity)
- Hybrid-Engine-Flag oder Auto-Select: der User muss idealerweise nicht entscheiden zwischen regex/tokenizer.

### Bundle / binary size

`ammonia` + `html5ever` + deps: ~2–3 MB pro Target. Eines der größeren Portfolio-Binaries, aber gerechtfertigt durch 4× Speedup + Security.

### FFI-overhead baseline

- 100 KB sanitize: Buffer-Input ~180 ns, String-Output 80 KB ~28 µs UTF-Konv. Auf ~2,7 ms Rust-Parse+Sanitize = **1 % FFI-Share**. Tolerabel.
- 200-char sanitize: FFI ~1 µs auf ~22 µs Rust = ~5 %. Noch Green-Territorium.

## Phase-C optimization checklist

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimization | ✅ already done | Buffer-zero-copy |
| C.2 | Output-type minimization | ✅ already done | — |
| C.3 | Batch API (`sanitizeMany`) | 🟡 potential | Bulk-UGC-Import, Comments-Migration. Nicht gemessen |
| C.4 | Stateful API (pre-compiled rule-set) | ✅ already done | `ammonia::Builder`-Pattern: User konstruiert Config einmal, ruft `.clean()` viele Male |
| C.5 | Parallelization (rayon über Document-Batch) | 🟡 potential | Nur für Batch-API |
| C.6 | Algorithm swap | ❌ not applicable | `ammonia` + `html5ever` ist best-in-class |
| C.7 | Allocator tuning | ✅ already done | — |
| C.8 | Bundle-size | ⚠️ trade-off | ~2-3 MB ist groß, aber unvermeidbar für HTML-Parser. LTO aktiv |

## Action plan

**Keep-as-is.** Green über alle Produktions-Szenarien. V0.2-Hybrid-Engine ist der letzte größere Sprint gewesen.

Maintenance:

1. **Very-large-Bench hinzufügen** (1 MB Document).
2. **Allow-list-heavy Config benchen** (z.B. 50+ custom-tags).
3. **Transform-small-case** (80 B) ist der einzige Non-Green-Punkt — upstream-sanitize-html gewinnt dort wegen JS-regex-fast-path. Nicht kritisch, aber dokumentieren.

## References

- Crate: `crates/sanitize-html`
- Bench (main): `crates/sanitize-html/__bench__/index.bench.ts`
- Bench (transforms): `crates/sanitize-html/__bench__/transforms.bench.ts`
- Lib: `crates/sanitize-html/src/lib.rs`
- Cargo: `crates/sanitize-html/Cargo.toml`
- `docs/packages.json` speedup: `"1.63–4.1× faster"`
