# Candidate review: `svgo`

> **Status:** GO (Drop-in-orientiert mit Scope-Begrenzung) · **Predicted:** 🟢 Green · **Reviewed:** 2026-04-20

## Verdict

`svgo` ist ein **SVG-Optimizer**: Parser → AST-Plugin-Pipeline → Serializer. Shape ist identisch zum bereits Green-shipped `sanitize-html` (und zu `commonmark`): Bytes-in / Bytes-out, substantielle Compute pro Byte, keine Callback-Grenze wenn die Plugin-Liste als statisches Config-Objekt (nicht als JS-Callbacks) übergeben wird. Rust hat bereits einen aktiv entwickelten und gegen `svgo` gebenchmarkten Konkurrenten: **`oxvg`** (Oxc-Team). Die Entscheidung ist hier nicht "ist Rust schnell genug", sondern "können wir oxvg/usvg sauber NAPI-wrappen mit genug Plugin-Parity".

## JS package

- **npm:** [`svgo`](https://www.npmjs.com/package/svgo) (~10 M/Woche, Q1 2026)
- **Exports:** `optimize(svgString, config?) → { data, info }`, Plugin-Registry (`preset-default` mit ~30 Plugins, custom Plugins möglich), CLI
- **Typical input:** SVG-String 0.5–500 KB (Icons: ~1–5 KB; Illustrations: 10–100 KB; exportierter Chart-Output oder Figma-SVG: bis MBs)
- **Typical output:** minifizierter SVG-String, meist 30–70% kleiner als Input
- **Realistic median use-case:** **Build-Time-Optimierung** von Icon-Sets und statischen SVG-Assets in Webpack/Vite/Rollup-Pipelines; **Runtime-Optimierung** in CMS/Editor-Uploads. Typisch: 100–10.000 SVGs pro Build, jedes 1–20 KB

## Rust replacement

- **Candidate crate(s):**
  - **`oxvg`** (primär) — vom Oxc-Team (Bun/Oxlint), aktiv gepflegt, MIT, benchmarkt explizit gegen svgo, >30 Plugin-Parity als Ziel. Q1 2026 noch pre-1.0 aber produktiv gereift.
  - `usvg` (sekundär, Baseline) — von resvg-Team, parst SVG → intermediate representation, fokussiert auf Rendering nicht Optimization. Nicht drop-in-tauglich, aber hochwertiger SVG-Parser falls oxvg-Parser nicht reicht.
  - `svgcleaner` (obsolet, archiviert 2020) — nicht verwenden
- **Maintenance / license:** `oxvg` MIT, aktiv, monatliche Releases. Supply-Chain-Risiko niedrig (Oxc-Ökosystem, gleicher Vendor wie Oxlint).
- **Known gotchas / divergences:**
  - Plugin-Parity: svgo hat ~30 Core-Plugins (preset-default) + Ökosystem-Plugins. oxvg deckt die wichtigsten ab (removeComments, removeMetadata, removeEmptyAttrs, cleanupNumericValues, mergePaths, convertColors, removeHiddenElems, etc.) aber nicht 100%. v1-Scope auf `preset-default` begrenzen.
  - Custom-JS-Plugins: svgo erlaubt User-JS-Plugins (`fn visit(node) { ... }`). Das ist die **`ejs`-Falle** — wenn ein User-Plugin pro Node einen JS-Callback triggert, bricht der Green-Plan. v1 **nicht anbieten**; Config-Plugins (Built-ins mit Optionen) sind ausreichend für >95% der Nutzer.
  - Output-Byte-Parity: oxvg's Serializer schreibt marginal anders (Attribut-Ordering, Whitespace). Build-Tools mit Hash-basiertem Caching (vite's asset-hash) müssen re-hashen. Dokumentieren, nicht fixen.

## BACKLOG check

Kein Eintrag in `BACKLOG.md`. Kein `docs/packages.json`-Entry. Shape-Nachbar ist `sanitize-html` (shipped Green).

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call work | Substantiell. Icon (~2 KB): 0.5–2 ms in svgo. Medium-SVG (~30 KB): 5–20 ms. Large-Export (~500 KB): 50–300 ms. Pro-Byte-Compute ist hoch (Parser + ~30 Plugin-Passes + Serializer). |
| Input size | SVG-String 0.5 KB – 5 MB. Als `Buffer` oder UTF-8 `String` — beide flach via `docs/BASELINE.md` (<200 ns bis ~1 MB). |
| Output size | Output meist 30–70% kleiner als Input. `String`/`Buffer`-Return flach. |
| Stateful potential | **Hoch.** Plugin-Config + Compiled-Plugin-Chain könnte in `SvgOptimizer`-Klasse leben. Bei Build-Tools (10k Icons pro Build) spart das den Config-Parse pro Call. |
| Batch realism | **Sehr hoch.** Build-Tools rufen `optimize()` in Schleife über alle SVG-Assets — `optimizeMany(svgs: string[], config)` kollabiert N FFI-Crossings zu einem und erlaubt Rayon-Parallelisierung über Workers. |
| FFI-share | Single: ~5% bei Median-SVG (~10 ms Rust-Work, ~0.5 ms Input-Marshal). Batch-1000-Icons: <0.5%. |

## Classification reasoning

`svgo` trifft den gleichen Green-Shape-Template-Satz wie `sanitize-html` / `commonmark`:

- ✅ **Bytes-in, Bytes-out** — kein Graph-Traversal über die FFI-Grenze
- ✅ **Substantielle Compute pro Byte** — Parser + Plugin-Pipeline ist nicht trivial
- ✅ **Keine Callback-Surface** (solange Custom-JS-Plugins ausgeschlossen bleiben)
- ✅ **Stateful + Batch-natürlich** — Build-Tool-Use-Case liefert perfekte Amortisation
- ✅ **Native Konkurrenz ist schwach** — svgo selbst ist pure-JS, keine nativen Bindings bisher gemainstreamed
- ✅ **Rust-Äquivalent existiert und ist aktiv** — oxvg ist nicht hypothetisch

Der einzige strukturelle Fallstrick ist die **Custom-JS-Plugin-API**. svgo's public Contract erlaubt User-Code als Plugins (`{ name, fn(root) { ... } }`). Das ist der `ejs`-Killer — wenn wir das anbieten, triggert jede Node-Visit-Callback einen FFI-Roundtrip. v1 **darf das nicht exponieren**. Migration-Pfad für Power-User: entweder sie bleiben auf svgo, oder wir exponieren später `svgo-compat`-Plugin, das svgo als Fallback für custom-Plugin-Fälle lädt (analog zum `canvg`-Pattern für chart.js-Kompat).

**Shape-Match:**
- ✅ Wie `sanitize-html` (shipped Green): Parser + Transform + Serializer, bytes-in/bytes-out
- ✅ Wie `commonmark`: Parser + Pipeline + Serializer, Batch-amortisierbar
- ❌ **Nicht** wie `mime` / `deep-equal` (kein Short-Input-Hot-Loop, kein Trivial-Compute)
- ❌ **Nicht** wie `chart.js` (keine Runtime-Abhängigkeit, keine Animations-Callbacks)

**Benchmark-Gap-Flag:** Green-Prediction braucht oxvg-Parity-Verifikation vor Shipping. Falls oxvg wichtige Plugins noch nicht hat (z.B. `mergePaths` oder `convertPathData` — die teuersten und gewinnträchtigsten), muss entweder auf oxvg-PRs gewartet oder custom-Port gebaut werden. Vor Port-Start: Cross-Check der oxvg-Plugin-Matrix gegen svgo's `preset-default`.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/svgo` (Drop-in-orientiert, weil oxvg bereits diesen Contract anvisiert — Naming unterstützt Migration-Positionierung)
- **Primary API sketch:**
  ```ts
  type SvgoPlugin =
    | 'removeComments'
    | 'removeMetadata'
    | 'removeEmptyAttrs'
    | 'cleanupNumericValues'
    | 'mergePaths'
    | 'convertColors'
    | 'removeHiddenElems'
    | 'convertPathData'
    | 'collapseGroups'
    | { name: SvgoPlugin; params?: Record<string, unknown> };

  type SvgoConfig = {
    plugins?: SvgoPlugin[];        // default: preset-default-äquivalent
    multipass?: boolean;           // default: false
    floatPrecision?: number;       // default: 3
  };

  type SvgoResult = {
    data: string;                  // optimierter SVG
    info: { inputBytes: number; outputBytes: number; savedPercent: number };
  };

  export function optimize(svg: string | Buffer, config?: SvgoConfig): SvgoResult;
  export function optimizeMany(
    svgs: Array<string | Buffer>,
    config?: SvgoConfig
  ): SvgoResult[];        // intern mit Rayon über N Cores parallelisiert

  export class SvgOptimizer {
    constructor(config?: SvgoConfig);
    optimize(svg: string | Buffer): SvgoResult;
    optimizeMany(svgs: Array<string | Buffer>): SvgoResult[];
  }
  ```
  **Nicht** angeboten: Custom-Function-Plugins. Dokumentiert als expliziter v1-Scope-Cut.
- **Must-have benchmark scenarios:**
  - **Icon (2 KB):** 2-KB-Figma-Export-Icon, preset-default. Green-Gate: ≥ 2×.
  - **Medium (30 KB):** Illustrations-SVG. Green-Gate: ≥ 3×.
  - **Large (500 KB):** komplexes Chart-/Diagramm-SVG mit hunderten Paths. Green-Gate: ≥ 3×.
  - **Batch-1000-Icons:** `optimizeMany(1000 × 2-KB-Icon)`. Green-Gate: ≥ 5× (Rayon-Parallelisierung über Cores).
  - **Stateful-Reuse (100 Optimize-Calls auf gleicher `SvgOptimizer`-Instance):** misst Config-Cache-Hebel. Green-Gate: ≥ 1.1× Fresh-Instance-Baseline (moderat, nur Config-Parse-Ersparnis).
- **Green gate:** alle fünf Szenarien + Plugin-Parity-Matrix für `preset-default` zu ≥95%.
- **Risks:**
  - **Plugin-Parity-Tail:** svgo's Plugin-Set ist das Produkt von 10 Jahren Community-Iteration. oxvg hat ~25 der 30 Core-Plugins. Die fehlenden 5 sind meist Edge-Case-Optimierungen (`reusePaths`, `sortAttrs`), die Gewinn < 2% bringen — können als "v1 not supported, pass through unchanged" dokumentiert werden.
  - **Custom-Plugin-Surface:** Manche Enterprise-User haben eigene svgo-Plugins. Migration-Path: sie bleiben auf svgo, oder wir shippen `@amigo-labs/svgo` mit explizitem `externalPlugins: false`-Contract und sie entscheiden sich bewusst.
  - **Output-Byte-Parity:** oxvg's Serializer optimiert anders als svgo's. Build-Tools mit Hash-basiertem Caching sehen einen einmaligen Cache-Invalidation-Spike beim Migration. Dokumentieren als Breaking-Change in v1.
  - **oxvg-Maturity:** Q1 2026 pre-1.0. Falls oxvg nicht stabil genug ist für amigo's Release-Cadence, Option B: direkt auf `usvg`-Parser aufbauen und eigene Plugin-Pipeline schreiben (~2000 Zeilen Rust). Scope-Entscheidung vor Port-Start.
  - **Baseline-Nuance:** SVG-String-Input ist UTF-8 — `String`-Argument triggert V8-UTF-16→UTF-8-Conversion. Für große SVGs (>100 KB) messbar. `Buffer`-Overload als primärer API-Pfad, `String` als Convenience-Shim. `docs/BASELINE.md:echoBuffer` deckt das.

## If NO-GO — BACKLOG entry

Nicht einschlägig — Prediction ist Green mit hoher Konfidenz (`sanitize-html`-Präzedenzfall). Falls Review nach Measurement doch Yellow wird:

```markdown
- **svgo** (~10M/Woche). SVG-Optimizer. Shape-Green, aber oxvg-Plugin-Parity zu `preset-default` nicht ausreichend (<95% der Optimierungen angewendet, Output-Bytes nennenswert größer als svgo). Port eingefroren bis oxvg-1.0 oder Custom-Pipeline-Budget verfügbar. Siehe `docs/perf-review/svgo.md`.
```

Section: **Parity too expensive**.
