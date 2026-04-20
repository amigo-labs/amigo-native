# Candidate review: `chart.js`

> **Status:** NO-GO (permanent) · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-20

## Verdict

`chart.js` ist eine **Browser-Rendering-Bibliothek** für Canvas-2D mit Plugin-Callbacks, Animations-Loop und Event-Handler-Surface. Der typische Nutzer ruft es in Browsern auf — dort gibt es kein NAPI. Der Server-Side-Pfad (`chartjs-node-canvas`) liegt bereits auf `node-canvas` (Skia/Cairo, nativ C++); ein Rust-Port würde eine bereits native Baseline re-wrappen. Die API-Surface (9+ Chart-Typen, Plugin-Lifecycle, Scales, Tooltips, Animationen) ist strukturell ein `jsdom`/`ejs`-Hybrid — riesiger Scope **und** JS-Callback-Pflicht pro Frame.

## JS package

- **npm:** [`chart.js`](https://www.npmjs.com/package/chart.js)
- **Downloads:** ~5 M/Woche (Q1 2026, aller Majors zusammengerechnet; v4.x dominant)
- **Exports / API surface:** `Chart`-Class (stateful, per Canvas-`ctx` instanziiert), `registerables`, Controller pro Chart-Typ (Line/Bar/Radar/Pie/Doughnut/PolarArea/Bubble/Scatter), Plugin-System mit ~20 Lifecycle-Hooks (`beforeDraw`, `afterRender`, `beforeEvent`, …), Scales (linear/log/time/category), Animations-Engine, Interaction-Layer (Hover/Click/Tooltips), Legend-Renderer
- **Typical input:** Canvas-`CanvasRenderingContext2D` + großes Config-Objekt (`{ type, data: { datasets, labels }, options: { scales, plugins, animation, … } }`)
- **Typical output:** Rendering-Nebeneffekt auf `<canvas>` + `Chart`-Instance mit `.update()`/`.destroy()`/`.resize()`/Event-API
- **Realistic median use-case:** **Browser-interaktive Dashboards** — einmal `new Chart(ctx, cfg)`, dann Mutations-Loop (`chart.data.datasets[0].data.push(x); chart.update()`), Hover-Events, Responsive-Resize. Nicht-Browser-Nutzung (Node/SSR) ist <5% des Traffics und läuft standardmäßig über `chartjs-node-canvas` (Wrapper um `node-canvas`, der selbst nativ C++/Skia ist)

## Rust replacement

- **Candidate crate(s):** keine mit `chart.js`-kompatibler API. Existierende Rust-Chart-Crates verfolgen andere Philosophien:
  - `plotters` (aktiv, MIT, ~2k⭐) — Builder-API, rendert PNG/SVG/Bitmap, kein interaktives Rendering, keine Plugin-Surface
  - `poloto` (SVG-only, statisch)
  - `charming` (Rust-Binding zu Apache ECharts — JS-Engine erforderlich, schiebt das Problem nur weiter)
  - `textplots` (irrelevant)
- **Maintenance / license:** `plotters` ist die einzige ernsthafte Option, aber strukturell inkompatibel mit der `chart.js`-Nutzung (keine stateful Mutation, keine Plugins, keine Browser-Events)
- **Known gotchas / divergences:** `chart.js` ist primär **interaktiv**. Jede sinnvolle Nutzung involviert DOM-Events, RAF-gesteuerte Animationen, und Plugin-Callbacks — alles Features, die ein Rust-Crate nicht bereitstellen kann, ohne pro Frame N FFI-Crossings nach V8 auszulösen

## BACKLOG check

Kein bestehender `chart.js`- oder `chartjs`-Eintrag in `BACKLOG.md`. Keine Chart-/Visualisierungs-Bibliothek bisher bewertet. Kein Eintrag in `docs/packages.json`. Dieses Review ist der erste dokumentierte Ausschluss dieser Kategorie.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Zwei Pfade, beide problematisch.** Browser: irrelevant — NAPI existiert dort nicht. Server-Side Static-Render: substantiell (Layout + Canvas-Draw ~1–10 ms), aber der konkurrierende Pfad (`chartjs-node-canvas` → `node-canvas` → Skia) ist bereits nativ |
| Input size distribution | Config-Objekt ~1–50 KB JSON, Datasets können groß sein (10k+ Punkte). JSON-Serialisierung pro `update()` wäre zusätzlicher Overhead |
| Output size distribution | Browser: n/a (Canvas-Nebeneffekt). Server: PNG/SVG 10 KB – 5 MB — `Buffer`-Return wäre flach (siehe `docs/BASELINE.md`), aber der Rest der Gleichung kippt nicht auf Green |
| Reusable setup (stateful potential) | **Hoch** (`Chart`-Instance lebt lange), aber genau das ist die Falle: `update()`/Mutations-Callbacks pro Frame = N FFI-Crossings. `jsdom`-Shape (Object-Mutation-Hot-Loop) |
| Batch-usage realism | Null. Charts werden stateful mutiert, nicht gebatcht |
| FFI-share estimate vs. Rust work | Browser-Use: 100% (NAPI nicht verfügbar). Server-Static: ~20–40% gegen Rust-Draw, aber Konkurrent ist `node-canvas` (C++), nicht reines JS — Gewinn gegen echte Baseline marginal bis negativ. Plugin-/Animation-Pfade: >80% FFI für Callback-Roundtrips |

## Classification reasoning

Drei Probleme, jedes einzeln Black-würdig, zusammen permanent unportierbar:

1. **Falsches Runtime.** Chart.js' dominanter Use-Case ist der Browser. NAPI-Binaries laden nicht im Browser. >95% der Nutzerbasis ist für einen Port strukturell nicht adressierbar. Selbst die besten Rust-Optimierungen produzieren Null Wert im Primär-Use-Case. Das ist derselbe Fehler, den `docs/post-mortems/xml.md` unter "wrong baseline" beschreibt — nur eine Stufe davor: hier ist die Runtime falsch, nicht die Baseline.

2. **Konkurrent ist bereits nativ.** Für den Server-Side-Niche-Pfad (`chartjs-node-canvas`) ist die JS-Baseline gar nicht JS — es ist `node-canvas`, ein C++-Skia-Binding. Ein Rust-Port gegen eine native Baseline zu messen wiederholt den Fehler aus `docs/perf-review/gpt-tokenizer.md` (Rust vs. V8-tuned JS), nur extremer: wir würden Rust/Skia gegen C++/Skia messen. Kein erwartbarer Win.

3. **Plugin- und Animations-Callbacks erzwingen JS-Engine-Kopplung.** Chart.js' Plugin-API (`beforeDraw`, `afterRender`, Tooltip-Generatoren als Callbacks) hat exakt dieselbe Shape wie `ejs`' Expression-Eval: user-supplied JS, pro Frame (60fps = 60 Callbacks/sec minimum) über FFI zurück in V8. Das ist die `docs/perf-review/ejs.md`-Falle. Selbst wenn Plugins "optional" gemacht würden, sind die Standard-Tooltip-/Legend-Formatter bereits Callbacks — der Median-User trifft den Worst-Case.

Bonus-Problem: **Scope ist groß wie jsdom** — 9 Chart-Typ-Controller, Scales-Hierarchie, Animations-Engine, Hit-Testing, Responsive-Layout. Parity-Investment in Monaten, nicht Tagen.

Reference-Patterns: **jsdom** (Browser-Runtime, Object-Mutation) + **ejs** (Callback-pro-Expression) + **gpt-tokenizer-Lehre** (Rust gewinnt nicht gegen bereits-native Konkurrenz). Kein Overlap mit Green-Shapes (`commonmark`/`inflate`/`pdfkit-neu`) — dort ist ein Spec-Objekt → ein `Buffer`-Return mit substantieller One-Shot-Compute. Chart.js ist das Gegenteil: long-lived Instance, viele kleine State-Mutationen, Callback-heavy Rendering.

**Kein "neues Paket"-Ausweg wie bei `pdfkit`.** Der `pdfkit`-Review zeigt, dass eine document-as-data-Reframing einen Chain-API-Drop-in retten kann. Für Chart.js funktioniert das nicht: (a) Der äquivalente Pfad — "plain Spec-Objekt → PNG/SVG-Buffer" — ist exakt das, was `plotters` nativ in Rust bietet, ohne NAPI-Wrapper. Jeder Rust-Node-User kann `plotters` direkt über sein eigenes Rust-Projekt anbinden; wir fügen keinen Wert hinzu. (b) Der interaktive Pfad (der eigentliche `chart.js`-Use-Case) ist per Definition Browser-gebunden und damit NAPI-unerreichbar. Es gibt keine Mittelebene, auf der ein amigo-Paket sinnvoll landet.

**Benchmark-Gap-Flag:** Nicht relevant — die Klassifikation hängt nicht an Messwerten, sondern an Runtime/Shape-Argumenten. Benchmarks würden nur die strukturelle Ablehnung numerisch bestätigen.

## If NO-GO — BACKLOG entry

```markdown
- **chart.js** (~5M). Browser-first Canvas-2D-Charting-Library mit Plugin-Callbacks und Animations-Loop. Drei strukturelle Blocker: (1) dominanter Use-Case ist der Browser, wo NAPI nicht lädt — >95% der Nutzerbasis unerreichbar; (2) der Server-Side-Niche (`chartjs-node-canvas`) konkurriert gegen `node-canvas`/Skia, also bereits native C++-Baseline; (3) Plugin-/Animations-Callbacks erzwingen per-Frame FFI-Roundtrips nach V8 (`ejs`-Falle). Kein "neues Paket"-Reframing rettet das — der äquivalente Pfad (Spec → PNG/SVG-Buffer) ist bereits durch `plotters` direkt bedient, ohne NAPI-Wrapper. Keine Rust-Chart-Crate hat `chart.js`-kompatible API. Permanent NO-GO. Gleicher Ausschluss gilt analog für `chartjs-node-canvas`, `react-chartjs-2`, `chartkick` und verwandte Visualisierungs-Wrappers. Siehe `docs/perf-review/chartjs.md`.
```

Section in `BACKLOG.md`: **Scope too large** (primär) — sekundäre Zuordnung zu **Needs a JS engine** wegen Plugin-/Animation-Callbacks wäre ebenfalls korrekt.
