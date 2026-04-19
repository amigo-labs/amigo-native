# Perf-Review: `@amigo-labs/xml`

> **Status:** 🗄️ Archived (never published) · **Reviewed:** 2026-04-19 · **Version:** 0.2.0 (final)

## Verdict

Archiviert ohne Deprecation-Window — das Paket war nie auf npm und
brauchte deswegen keine 3-Monats-Warn-Phase. Crate liegt jetzt unter
`archived/xml/`, aus Cargo/pnpm-Workspace raus, aus
`docs/packages.json` / `docs/data.json` / `scripts/measure-size.mjs`
entfernt. Der Grund bleibt derselbe: `parseXmlToJson` ist ein realer
Hebel (1,9–3,1× schneller als das alte `parseXml`, gewinnt den 1 KB
Bucket 1,55× gegen `sax`), aber am median 100 KB-RSS 0,78× und am
10 MB-SOAP 0,72× `sax`. Post-Mortem-Text („not tried") war falsch und
wurde mit den echten Zahlen aus dieser Messung ersetzt.

## Classification rationale

**Pass A-Gate (aus dem 2026-04-19-Plan) verfehlt.** Schwelle war:
10 MB ≥ 2× sax UND 100 KB ≥ 1× sax. Reale Messung nach Export +
Bench-Ergänzung:

- 10 MB: 1,42 Hz amigo vs. 1,98 Hz sax → **0,72×** (verfehlt, Faktor 2
  fehlt)
- 100 KB: 354 Hz amigo vs. 455 Hz sax → **0,78×** (verfehlt, 28 %
  fehlen)
- 1 KB: 279 k Hz amigo vs. 180 k Hz sax → **1,55×** (bestanden, aber
  einzeln nicht entscheidend)

**Pass B (partial):** Das 100-KB-Gap ist eng genug dass C.1/C.2 Buffer-
I/O es potentiell kippen könnten (prognostisch ~1,1× sax). Das 10-MB-
Gap ist zu groß — die Analyse ergibt dass dort **JSON.parse auf der JS-
Seite** (~15 MB JSON zurück) der Hauptkostentreiber ist, nicht mehr FFI.
Das ist strukturell: jeder Rust-Port der Events als JSON zurück gibt
wird an V8's JSON-Decoder für den ganzen Output limitiert.

## Evidence

### Measured speedup (freshly re-benched 2026-04-19)

Node v22.x, Linux x64 glibc, vitest 3.2.4, release build (workspace LTO).

| Szenario | parseXml | **parseXmlToJson** | SAX-API | sax | vs. sax (best amigo) |
|---|---:|---:|---:|---:|---:|
| small SVG 1 KB | 143 885 Hz | **279 093 Hz** | 142 554 Hz | 179 724 Hz | **1,55×** ✓ |
| RSS 100 KB | 146 Hz | **354 Hz** | — | 455 Hz | 0,78× ✗ |
| SOAP 10 MB | 0,462 Hz | **1,42 Hz** | — | 1,98 Hz | 0,72× ✗ |

Vergleich zur alten `docs/data.json`-Zahl: `parseXml` 100 KB war
110 Hz, jetzt 146 Hz — Varianz innerhalb der Runs (±2,66 % rme), aber
Größenordnung konsistent.

Innerhalb unserer eigenen Varianten ist `parseXmlToJson` der klare
Sieger:

- vs. `parseXml`: 1,94× (1 KB), 2,43× (100 KB), **3,07× (10 MB)**
- vs. SAX-API: 1,96× (1 KB, andere Größen nicht ausgeführt)

Das ist das signifikanteste Single-Lever-Ergebnis den dieser Crate je
hatte — aber eben nur relativ zur eigenen Baseline.

### Realistic use-case

100 KB RSS ist der Median-Anwendungsfall (Feed-Reader, Config-Parser,
einfache SOAP-Responses). Das ist der Bucket den wir verlieren. 1 KB
SVG-Parsing kommt im Web-Dev-Kontext vor (Inline-Icons, einfache
Grafiken), aber dort rechtfertigt der Gewinn kaum einen nativen
Binary-Dependency-Aufschlag. 10 MB ist der Tail (Dumps, Batch-APIs) —
dort haben wir strukturell JSON-Parse-Overhead.

### Benchmark gaps

Alle vorherigen Gaps sind jetzt gefüllt:

- ✅ `parseXmlToJson` in allen drei Größenklassen gemessen
- ✅ 10 MB SOAP amigo-Seite gemessen (`parseXml` UND `parseXmlToJson`)

Verbleibender potentieller Gap: **Buffer-Input/Output-Variante fehlt
immer noch** (nicht nur Bench, sondern API). Prognose: würde 100 KB
plausibel auf ~1,1× `sax` heben, 10 MB bliebe verloren wegen
JSON.parse.

### API surface

Jetzt drei exportierte Pfade:

- `parseXml(input, strict?) → XmlEvent[]` — Tree-of-Events, teuer wegen
  `Vec<Object>`-Marshalling. Mittel- bis Langfristig Kandidat für Dead-
  Code.
- `parseXmlToJson(input, strict?) → string` — einzige realistische
  Performance-API. 1 FFI-Crossing, JSON.parse JS-seitig. Frisch in
  `wrapper.js` exportiert (vorher nur in `index.js`).
- `parser()` (wrapper.js) — `sax`-kompatibles Callback-API. Ruft intern
  `parseXml` einmal + dispatcht in JS. Strukturell unrettbar da wir
  aber auch nicht direkt auf Rust-Callbacks gehen wollen.

### Bundle / binary size

Aus `docs/data.json`: `@amigo-labs/xml` Install-Size 434 KB vs.
`sax` 56 KB. **7,7× größer** — für einen Bucket der wir median verlieren
ist das zusätzlicher Argumenten für die Deprecation.

### FFI-overhead baseline

Prediction aus `docs/BASELINE.md` war: parseXmlToJson sollte bei 100 KB
~250-300 Hz liefern (parity mit sax). Reale Messung: **354 Hz.**
Prediction hat die JS-seitige JSON.parse-Kosten unterschätzt bei 10 MB,
aber bei 100 KB war die Schätzung sogar pessimistisch. Baseline-Modell
ist für kleine/mittlere Eingaben brauchbar, unterschätzt bei 10 MB+ den
JS-side JSON.parse-Anteil.

## Phase-C optimization checklist (updated mit Messdaten)

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimization (Buffer-overload) | **gated (marginal)** | 100 KB: ~0,35 ms/call sparbar (~12 %). 10 MB: ~35 ms (~5 %). Nur in Kombination mit C.2 sinnvoll, und selbst dann nicht deprecation-umkehrend. |
| C.2 | Output-type (parseXmlToJson → Buffer) | **gated (marginal)** | 100 KB: ~0,5 ms sparbar (~18 %). Zusammen mit C.1 plausibel 1,05–1,15× sax @ 100 KB — Grenzfall. 10 MB: JSON.parse JS-side dominiert → Buffer-out ändert nichts. |
| C.3 | Batch API | n/a | parse_xml* ist bereits 1-call-per-doc. |
| C.4 | Stateful API | n/a | quick-xml hat keinen nennenswerten Setup-Cost. |
| C.5 | Parallelization | n/a | XML-Parse ist sequentiell. |
| C.6 | Algorithm swap | already done | quick-xml ist State-of-the-Art. |
| C.7 | Allocator tuning (SmallVec in decode_attrs) | **gated (small)** | Micro-Optimierung. ~2–5 % plausibel, verändert Klassifikation nicht. |
| C.8 | Bundle-size | already done | Workspace-Profile. Binary-Install-Size (434 KB) lässt sich nicht unter `sax`'s 56 KB drücken. |

**Zusätzlicher Hebel, nicht in der Standard-Liste:**
- **Filter-/Query-API** (z. B. `extractTextByPath(xml, "//title") → Buffer`)
  würde JSON.parse ganz umgehen und wäre bei 10 MB plausibel 5–10×
  sax. Aber das ist ein anderes Produkt. Nicht im Scope von XML-Parse-
  Deprecation.

## Action taken (2026-04-19)

Durchgezogen, da das Paket nie publiziert wurde und keine Migrations-
Phase nötig ist:

1. `crates/xml/` → `archived/xml/` (Git-Rename erhalten).
2. `archived/xml/package.json` bekommt `"private": true`, `deprecated`-
   Feld entfernt, description auf archive-hint geändert.
3. `archived/xml/README.md` komplett umgeschrieben zu Archive-Header +
   historical-Usage-Beispiel.
4. Cargo-Workspace (`Cargo.toml`) und pnpm-Workspace (`pnpm-workspace.yaml`)
   zeigen auf `crates/*` — Move aus `crates/` entfernt xml automatisch,
   keine Edits nötig. Verifiziert mit `cargo metadata`: amigo-xml nicht
   mehr Member.
5. `docs/packages.json` — xml-Eintrag entfernt.
6. `docs/data.json` — beide xml-Blöcke (benchmarks + install-size)
   entfernt.
7. `scripts/measure-size.mjs` — xml-Eintrag entfernt.
8. `docs/post-mortems/xml.md` — „not tried" durch die realen Zahlen
   aus dieser Review ersetzt, Status auf „archived 2026-04-19 (never
   published to npm)" gesetzt, Deprecation-Plan durch Archival-Sektion
   ersetzt.
9. `docs/perf-review.md` Ergebnis-Tabelle — xml-Zeile auf
   🗄️ **ARCHIVED** mit parseXml/parseXmlToJson-Range aktualisiert.

## Nicht durchgeführt — begründet verworfen

- **Buffer-I/O-Sprint (C.1/C.2):** Hätte 100 KB plausibel auf 1,05–1,15×
  `sax` gehoben, aber 10 MB bleibt JSON.parse-dominiert und der
  Bundle-Size-Gap (7,7×) bleibt. Aufwand für einen Grenzfall-Win am
  Median nicht gerechtfertigt.
- **Filter-/Query-API:** Wäre ein anderes Produkt. Falls in Zukunft ein
  konkreter Use-Case das rechtfertigt: BACKLOG-Eintrag unter einem
  neuen „XML-Extraction"-Scope, nicht eine Wiederbelebung des
  General-Purpose-Parsers.

## References

- Archived crate: `archived/xml/` (was `crates/xml/`)
- Bench (historical): `archived/xml/__bench__/index.bench.ts`
- Lib (historical): `archived/xml/src/lib.rs`
- Post-Mortem (updated with measured numbers): `docs/post-mortems/xml.md`
- FFI-Baseline: `docs/BASELINE.md`
- Implementation commit `parseXmlToJson`: `d1e2e46`
- Re-bench + archive commits: this PR
