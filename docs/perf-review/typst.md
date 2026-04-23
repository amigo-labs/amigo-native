# Candidate review: `typst`

> **Status:** GO (als neues Paket, kein Drop-in) · **Predicted:** 🟢 Green · **Reviewed:** 2026-04-20
> **Shipped:** v0.1 on branch `claude/crate-performance-audit-6KLOJ` (2026-04-23). Benchmarks pending full bench suite.


## Verdict

`typst` als Library ist ein Lehrbuch-Green-Shape, strukturell analog zu `commonmark` und `inflate`: **Markup-String + optionale JSON-Daten in → PDF-Bytes out, ein FFI-Crossing pro Dokument**. Die teure Arbeit (Parsing, Layout, Font-Resolution, PDF-Emission via `krilla`) läuft komplett Rust-seitig. Kein Callback-Boundary, kein Object-Traversal über die Grenze, kein Chain-API-Trap wie bei `pdfkit`.

Dies ist ein **neues Paket**, kein Drop-in. Die JS-Alternativen für mehrseitige Business-Reports mit Tabellen (Rechnungen, Statements, Dashboards) sind Puppeteer (Chromium-Prozess) oder `pdfmake` / `html-pdf-node` — ersteres hat hunderte MB Overhead und startet einen Browser pro Request, letzteres ist pures JS ohne ernsthafte Typesetting-Engine. Gegen beide ist ≥2× trivial erreichbar, gegen Puppeteer eher 10–50×.

Parity ist kein Ziel: Typst ist ein eigenes Markup-Sprachen-Ökosystem — das ist das Produkt, nicht der Kompromiss.

## JS package

- **npm:** kein direkter Drop-in-Kandidat — dieses Paket ist ein **neues Produkt**. Vergleichs-Alternativen in JS für Business-Report-Generation:
  - `puppeteer` (~5M/Woche) — HTML→PDF via Chromium, höchste Fidelity aber massiver Prozess-Overhead
  - `pdfmake` (~400k/Woche) — pure-JS document-as-data-API, mit Tabellen + Page-Breaks
  - `html-pdf-node` / `html-pdf-chrome` (~150k/Woche) — Wrapper um Chromium/Puppeteer
  - `jsreport` / `carbone` — höhere Abstraktion, verwenden intern oft LibreOffice oder Puppeteer
- **Downloads:** n/a (Neuling; `typst-js` npm-Paket mit ~5k/Woche ist ein WASM-Build von Typst-CLI, nicht als Lib konsumierbar)
- **Exports / API surface:** klein gehalten — `compile(source, data?) → Buffer`, stateful `TypstCompiler`-Class für wiederholte Calls mit geteiltem Font- und Package-Cache
- **Typical input:** Typst-Source 2–50 KB + optionales JSON-Data-Objekt 100 B – 500 KB (Rechnungs-Positionen, Report-Kennzahlen)
- **Typical output:** PDF-Bytes 20 KB – 5 MB, je nach Seitenzahl und eingebetteten Assets
- **Realistic median use-case:** Server-seitige Rechnungs-/Statement-Generation, 10–500 Dokumente pro Request, jedes 2–20 Seiten, Templates werden einmal geschrieben und viele Male mit variablen Daten gerendert

## Rust replacement

- **Candidate crate(s):** `typst` (primär — die Core-Library des Typst-Ökosystems, enthält Parser, Compiler, Layout-Engine) zusammen mit `typst-pdf` (PDF-Export über `krilla`) und `typst-kit` (Font- und Package-Resolution-Helpers für Library-Einbettung).
- **Maintenance / license:** Sehr aktiv (typst GmbH, breites OSS-Umfeld), Apache-2.0, saubere Library-Trennung ab 0.11+. Keine bekannten ABI-Bruch-Probleme pro Release in der `typst`-Crate selbst, API zwischen Major-Versionen stabiler als bei `krilla` oder `pdf-writer` solo.
- **Known gotchas / divergences:**
  - **Font-Strategie muss explizit entschieden sein** — typst löst Fonts nicht out-of-the-box: Entweder bundlen wir einen Default-Set (Libertinus + Fira + New Computer Modern, ~15–20 MB), oder wir akzeptieren Caller-provided TTF-Buffers, oder wir resolven von Disk. Die Wahl prägt Binary-Size und Portabilität.
  - **Package-Resolution** (`#import "@preview/…"`) geht online gegen den Typst-Package-Index. Default muss **offline-only** sein (Supply-Chain-Risiko, Sandboxing) — opt-in später, falls überhaupt.
  - **Cold-Start:** erster `compile()`-Call lädt Fonts, parst Core-Library, kostet 50–200 ms. Nur via `TypstCompiler`-Class amortisierbar.
  - **Binary-Size:** Typst bringt substantielle Deps mit (Rust-Regex-Engine, ICU-Teile, `krilla`, Font-Parser). Release-Build mit `lto` + `strip` geschätzt ~15–25 MB pro Plattform-Target — das verdoppelt ungefähr das aktuelle größte Paket im Repo. Muss explizit gegen die Policy gehalten werden.
  - **Kein Pixel-Parity-Ziel** gegen Puppeteer/LibreOffice — wie bei `commonmark` gegen `marked`: eigene Positionierung als spec-konformer Typst-Renderer.

## BACKLOG check

Kein bestehender `typst`-Eintrag in `BACKLOG.md`. Der einzige PDF-Bezug in `BACKLOG.md:12` ist `pdf-parse` (Text-Extraction via `pdf-extract` / `lopdf`) — das ist der Read-Pfad, nicht der Write-Pfad. Kein Overlap.

Abgrenzung zu bestehenden Reviews:
- `docs/perf-review/pdfkit.md` (2026-04-20) empfiehlt `printpdf` für den **Label-/Ticket-Use-Case** (~2–20 KB, High-Volume-Batch, triviales Layout). Die dortige Analyse schließt explizit Text-Wrapping und Tabellen vom v1-Scope aus. Der vorliegende typst-Review adressiert den komplementären Use-Case — mehrseitige Dokumente mit Tabellen, berechneten Summen, richtiger Typografie. Die beiden Pakete kollidieren nicht; sie decken unterschiedliche Shapes.
- `docs/post-mortems/xml.md` ist die Warnung gegen Object-Traversal über die FFI-Grenze — typst vermeidet das per Design (Bytes-in, Bytes-out).

Kein Eintrag in `docs/packages.json`.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Substantiell.** 10-seitige Rechnung mit Tabelle ~8–25 ms Rust-Compute (Parse + Layout + PDF-Emit). 50-seitiger Report mit Math/Charts ~80–300 ms. Relative zur FFI-Fixkostenbasis (~110 ns) ist das um Größenordnungen Headroom. |
| Input size distribution | Typst-Source 2–50 KB + JSON-Daten 0.1–500 KB. Via `Buffer` Input (wie `renderBytes` in `commonmark`) ist FFI-Input-Kost ~flat 180 ns unabhängig von der Größe (siehe `docs/BASELINE.md:28–30`). Für String-Input bis 50 KB wäre es ~20 µs UTF-16→UTF-8 — vernachlässigbar gegenüber Compute. |
| Output size distribution | PDF-Bytes 20 KB – 5 MB. `Buffer`-Return ist flat ~180 ns bis 10 MB (BASELINE.md:30) — Output-FFI-Kost ist ein Rauschen im Budget. |
| Reusable setup (stateful potential) | **Hoch.** Font-Parsing + Package-Cache kostet 50–200 ms cold pro Font-Set. Ein `TypstCompiler`-NAPI-Class cached Fonts, geparste Core-Library-Module, und (wenn aktiviert) geladene Packages. Bei 500 Rechnungen mit gleichem Template + gleichem Font-Set ist das der Unterschied zwischen 25 s und 4 s Gesamt-Wall-Clock. |
| Batch-usage realism | **Hoch.** Rechnungslauf, Monats-Statement-Batch, Report-Generation für Dashboard — der Default ist Batch, nicht Einzel-Request. `compileMany(jobs)` über `rayon::par_iter` kollabiert die FFI-Crossings und nutzt mehrere Cores — siehe `crates/commonmark/src/lib.rs:183–194` als Referenz-Pattern. |
| FFI-share estimate vs. Rust work | <1% bei 10+-seitigen Reports (einmal FFI-in, 10+ ms Rust-Compute, einmal FFI-out). Selbst bei 2-seitigen Rechnungen <5%. Die Compute-Seite dominiert strukturell. |

## Classification reasoning

Der Shape matcht exakt die bestehenden Green-Packages `commonmark`, `inflate`, `zip`, `sanitize-html`: **Bytes-in, substantielle Compute, Bytes-out, kein Callback-Boundary, kein Object-Traversal**. Die Rust-Seite macht genug echte Arbeit pro Byte, dass die FFI-Fixkosten unsichtbar werden. Per `docs/BASELINE.md:25–33` ist der relevante Floor (109 ns noop, 180 ns Buffer-Return, ~35 µs pro 100 KB String-Input) um drei Größenordnungen kleiner als die erwartete Compute-Zeit (mehrere ms pro Dokument) — struktureller Headroom ist also vorhanden.

Die eigentliche Green-Bedingung ist der kleinste realistische Input: **eine 1-seitige Rechnung, kein Batch, Cold-Start inklusive**. Cold wird das ~100–200 ms (Font-Load dominiert) — hier verliert typst gegen `pdfmake` (~30–50 ms für ein einfaches Dokument in pure-JS). Hot, mit `TypstCompiler`-Class, läuft dieselbe Rechnung in ~5–10 ms — dann 3–6× schneller als `pdfmake` bei besserer Typografie. Der 2×-Kleinster-Input-Gate hält **nur** im Hot-Path. Das muss in der Dokumentation transparent sein — es ist dieselbe Nuance wie bei `commonmark`'s `Renderer`-Class.

Gegen Puppeteer/`html-pdf-node` gewinnt typst bei jedem Input strukturell, weil diese einen Browser-Prozess starten oder einen persistenten behalten (Memory-Overhead ~100–300 MB pro Worker). Für serverseitige Rechnungs-Generation ist das ein harter Kostenvorteil, nicht nur Wall-Clock.

Ein `Parser-`/`handlebars-Shape-Trap` existiert nicht: typst hat keine Callback-Erweiterungspunkte über die FFI. Daten kommen als JSON (ein Blob, ein Marshal), Template-Module kommen als Strings (ein Blob, ein Marshal). Keine `--include-helper=function`-Escape-Hatches.

**Benchmark-Gap-Flag:** Prediction ist qualitativ. Vor Green-Gate müssen die vier Szenarien unten gemessen werden — ohne Zahlen bleibt das Paket auf 🟡 Yellow, wie bei `pdfkit.md`.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/typst`
- **Primary API sketch:**
  ```ts
  type FontSpec = { name?: string; data: Buffer };
  type CompileOptions = {
    /** Typst source as UTF-8 string or Buffer. */
    source: string | Buffer;
    /** JSON-serializable data injected into the template as sys.inputs. */
    data?: Record<string, unknown>;
    /** Additional in-memory source files addressable by #import "path". */
    virtualFiles?: Record<string, string | Buffer>;
  };

  /** One-shot convenience — allocates fonts per call, fine for low volume. */
  export function compile(opts: CompileOptions): Buffer;

  /** Reusable compiler — the Green path for batch / server workloads. */
  export class TypstCompiler {
    constructor(opts: {
      /** User-provided fonts. If omitted, ships a bundled default set. */
      fonts?: FontSpec[];
      /** Filesystem root for #include resolution. Default: no disk access. */
      root?: string;
      /** Allow @preview/ package resolution. Default: false (offline only). */
      allowPackages?: boolean;
    });
    compile(opts: CompileOptions): Buffer;
    compileMany(jobs: CompileOptions[]): Buffer[];
  }
  ```
  Explizit **nicht** Puppeteer- oder `pdfmake`-kompatibel. Die Eingabesprache *ist* Typst-Markup — das ist bewusstes Produktangebot.

- **Must-have benchmark scenarios:**
  - **small-cold:** 1-seitige Rechnung, einmaliger `compile()`-Call, gegen `pdfmake` + `puppeteer`. Cold-Start-Kosten transparent ausweisen.
  - **small-hot:** 1-seitige Rechnung via `TypstCompiler.compile()` nach Warm-up, gegen dieselbe Baseline. Das ist der eigentliche Green-Gate.
  - **batch-500:** `compileMany` mit 500 Rechnungen, identisches Template, variable Daten. Gegen Puppeteer (Worker-Pool mit 4 Workers) und `pdfmake` (Single-Thread). Der Hauptgewinn-Case.
  - **long-report:** 50-seitiger Geschäftsbericht mit Tabellen, Charts (als SVG/PNG), Titelseite, Inhaltsverzeichnis. Gegen Puppeteer-mit-ChartJS-HTML. Prüft Layout-Skalierung.
  - **realistic median:** 5-seitiges Monats-Statement mit 50-Zeilen-Tabelle, einem eingebetteten Chart und berechneten Summen.

- **Acceptance thresholds (Green gate):**
  - small-hot ≥ **2×** `pdfmake`
  - batch-500 ≥ **5×** `pdfmake` und ≥ **10×** `puppeteer` (wall-clock inkl. Prozess-Startup bei Puppeteer)
  - long-report ≥ **2×** `puppeteer` (hier ist Puppeteer mit HTML+Chart-Libs durchaus schnell — das Ziel ist konservativ)
  - small-cold darf schlechter sein als `pdfmake` — muss aber dokumentiert werden, und der `compile()`-Standalone-Path sollte im README explizit als "für One-Shot-Usage, Warm-Path nutzt `TypstCompiler`" positioniert sein
  - Cold-Start-Kosten (erster `TypstCompiler.compile()` inkl. Font-Load) müssen ausgewiesen werden — Transparenz-Anforderung analog `pdfkit.md`.

- **Risks:**
  - **Binary-Size-Explosion.** Typst + fonts + krilla + pdf-writer ergeben geschätzt 15–25 MB pro NAPI-Target. Sechs Targets = 90–150 MB npm-Artefakt-Gesamtgröße. Muss gegen Repo-Policy gehalten werden. Mitigation: optional ein `@amigo-labs/typst-fonts`-Peer-Paket für die Default-Fonts, `@amigo-labs/typst` selbst bleibt fontfrei.
  - **Font-Resolution-Komplexität.** Drei plausible Strategien (bundled / user-TTFs / disk-resolve) und alle drei werden von verschiedenen User-Klassen gewollt. v1 muss eine wählen und die anderen dokumentiert zurückstellen, sonst läuft das API-Design in drei Richtungen gleichzeitig auseinander.
  - **Typst-API-Churn.** Die Library-API von `typst` + `typst-pdf` + `typst-kit` ist ab 0.11 vergleichsweise stabil, aber nicht 1.0. Major-Upgrades alle ~6 Monate, manche mit API-Shifts. Wir committen uns auf ein Version-Pin und aktive Wartung des Upgrades.
  - **User-Erwartungshaltung "LaTeX-in-JS".** Typst ist nicht LaTeX, kennt nicht jede LaTeX-Konvention. Wird Support-Issues erzeugen, die nur mit "Das ist Typst, nicht LaTeX — siehe typst.app" beantwortbar sind. README muss das Upfront machen.
  - **Baseline-Nuancierung:** `docs/BASELINE.md` misst kein Typst-Compute. FFI-Share-Schätzung oben ist aus Crate-eigenen Benchmarks der Typst-Community abgeleitet, nicht in unserem Harness gemessen. Nach Port sollte der `_ffi-bench`-Harness um einen `compilePdfJob`-Case erweitert werden.

## If NO-GO — BACKLOG entry

Falls das Binary-Size-Budget (90–150 MB Gesamt für sechs Targets) als Showstopper bewertet wird, oder falls der Use-Case als zu schmal für ein eigenes Paket eingestuft wird:

```markdown
- **typst (als Library)** (nicht auf npm, ~5k/Woche als WASM-Build). Evaluiert in `docs/perf-review/typst.md`. FFI-Shape ist Lehrbuch-Green (bytes-in, bytes-out, keine Callbacks), Compute-Gewinn gegen Puppeteer/pdfmake substantiell (prognostiziert 5–50× je Use-Case). Zurückgestellt wegen Binary-Size (~15–25 MB pro Plattform × 6 Targets = 90–150 MB npm-Artefakt) und Scope-Frage: Business-Report-Generation ist ein enges Vertical, das einen signifikanten Teil der Repo-Download-Größe beansprucht. Re-Evaluation, sobald Typst ein schlankeres Embedding-Profil bietet oder das Binary-Size-Budget des Repos erweitert wird.
```

Section in `BACKLOG.md`: **Parity too expensive** (passt nicht — ist kein Parity-Problem) → eher neue Sektion oder **Scope too large**.
