# Perf-Review: `@amigo-labs/xml`

> **Status:** 🔴 Red *conditional — untested optimization path exists* · **Reviewed:** 2026-04-19 · **Version:** 0.2.0 (deprecated)

## Verdict

SAX- und Tree-API sind Red wie das Post-Mortem sagt — die Deprecation steht
für den heute exportierten Oberflächen-Satz. Aber eine Optimierung wurde
bereits eingebaut (`parseXmlToJson`, lib.rs:219-353) und nie gemessen; sie
könnte auf großen Dokumenten (≥ 100 KB, speziell 10 MB) die Red-Klassifikation
in Yellow/Green drehen. Bevor die 0.2.0-Deprecation nach `archived/` wandert,
ist ein Measurement-Gate fällig.

## Classification rationale

Nach den in `docs/data.json` gemessenen Werten ist das Paket auf jeder
Größenklasse langsamer als `sax` (0,43–0,74× sax). Das ist klar 🔴 Red.

Zusätzlicher Downgrade-Auslöser aus dem Skill-Regelwerk: **Benchmark-Gap.**
`parseXmlToJson` wurde in Commit `d1e2e46` („perf: optimize packages that
lost to node competitors") hinzugefügt, aber (a) nicht in `wrapper.js`
re-exportiert, (b) nicht in `__bench__/index.bench.ts` gebencht, (c) im
Post-Mortem als „not tried" gelistet. Die Entscheidungs-Grundlage der
Deprecation ist deswegen unvollständig. Die Klassifikation bleibt Red,
aber „conditional" — eine valide Messung kann sie kippen.

Der Grund, warum die Messung realistisch ≥ sax sein könnte, steckt im
FFI-Overhead-Baseline:

- `parseXml` zahlt auf 100 KB RSS ~5000 × 500–1000 ns = 2,5–5 ms reine
  Vec<Object>-Marshalling-Kosten. Gemessen: 9,1 ms total → FFI dominiert.
- `parseXmlToJson` kollabiert das auf **einen** String-Output. Per
  `BASELINE.md` ist String-Output ~0,35 ns/byte: 150 KB JSON ≈ 52 µs FFI.
  Plus `JSON.parse` JS-seitig ~1–2 ms. Erwartung: **~3–4 ms/call**,
  entspricht 250–300 Hz. `sax` liegt bei 257 Hz. Parity bis leichter Win.
- Bei 10 MB ist der Effekt viel größer: quick-xml parst ~30–50 ms,
  sax braucht 833 ms. `parseXmlToJson` plausibel 3–5× schneller als sax.

Die SAX-Callback-API bleibt strukturell tot — der `wrapper.js`-Pfad ruft
heute bereits intern `parseXml` und dispatcht in JS. Das ist der billigste
Emulationspfad und er verliert trotzdem. Dafür gibt es keinen Fix.

## Evidence

### Measured speedup (from docs/data.json)

| Szenario | `@amigo-labs/xml` | `sax` | Ratio |
|---|---:|---:|---:|
| small SVG 1 KB (parseXml) | 101 828 Hz | 136 714 Hz | 0,74× |
| small SVG 1 KB (sax API) | 93 817 Hz | 136 714 Hz | 0,69× |
| RSS 100 KB | 110 Hz | 257 Hz | 0,43× |
| SOAP 10 MB | **nicht gebenched** | 1,2 Hz | — |

`docs/packages.json` führt den Eintrag als `"speedup": "2.3× slower"`,
`"deprecated": true`. Das entspricht dem 100-KB-RSS-Verhältnis (1/0,43 ≈ 2,3).

### Realistic use-case

XML in 2026-ish Node-Workloads ist hauptsächlich: RSS/Atom-Feed-Reader,
SOAP-Legacy-APIs, SVG-Processing, Config-Parsing (`pom.xml`, `plist`).
Die mediane Payload ist 10–200 KB (RSS, SVG, einfache Configs). Große
Dokumente (SOAP-Batch-Responses, OpenStreetMap-Dumps) sind seltener aber
relevant.

Das 100-KB-RSS-Bucket aus dem Bench bildet den Median gut ab. Das 1-KB-
SVG-Bucket testet den Floor (Startup-Kosten). Das 10-MB-Bucket testet den
Tail — und dort fehlt die amigo-Messung ganz.

### Benchmark gaps

1. **`parseXmlToJson` ungebencht** in allen drei Größenklassen. Größter
   Gap — siehe „Phase-C optimization checklist" unten.
2. **10 MB SOAP amigo-Seite leer.** Selbst für `parseXml` existiert hier
   keine Messung. Das ist genau der Tail wo quick-xml seinen Vorteil
   ausspielen sollte.
3. **Buffer-Input-Variante fehlt** in der API (nicht nur im Bench). Bei
   10 MB kostet die UTF-16 → UTF-8-Konversion am Input ~35 ms.

### API surface

Zwei exportierte `#[napi]` Funktionen:

- `parse_xml(input: String, strict: Option<bool>) -> Result<Vec<XmlEvent>>`
  (lib.rs:60-185) — baut `Vec<XmlEvent>` mit Owned-Strings. Das ist der
  Kostentreiber laut Post-Mortem.
- `parse_xml_to_json(input: String, strict: Option<bool>) -> Result<String>`
  (lib.rs:219-353) — serialisiert Events direkt in einen einzigen JSON-
  String in Rust. Collapst N FFI-Crossings → 1. Exisitert im Binary, nicht
  im `wrapper.js`-Export, nicht im Bench.

`wrapper.js` bildet die `sax`-API nach, indem es intern `parse_xml` einmal
ruft und die Events in einem JS-Loop dispatcht. Das ist der billigste
Emulationsweg — Callbacks-aus-Rust-nach-JS wurden explizit vermieden.

### Bundle / binary size

Keine Auffälligkeiten. `Cargo.toml` nutzt Workspace-Profile (LTO, strip).
`quick-xml 0.36` default features, keine Feature-Verschwendung im
Standard-Pfad.

### FFI-overhead baseline

`docs/BASELINE.md` existiert (Node v22.22.2, napi-rs workspace). Relevant
für diese Review:

- `echoString` 100 KB ≈ 35 µs (≈ 0,35 ns/byte). Gilt für JSON-Output von
  `parseXmlToJson`.
- `sumArray` 100 k × u32 ≈ 4,3 ms (43 ns/element). Das ist die Untergrenze
  für Vec<XmlEvent>-Marshalling — Objekte mit Strings sind teurer, daher
  die 500–1000 ns/event-Schätzung.
- `echoBuffer` 10 MB ≈ 179 ns **flat**. Das ist der Grund warum Buffer-
  Input den 35-ms-UTF-16-Fix eliminieren würde.

## Phase-C optimization checklist

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimization (`String` → `&str`, `Vec<T>` → `&[T]`, Buffer-overload) | **applicable (gated)** | `input: String` zahlt UTF-16→UTF-8 am Ingress (~35 ms @ 10 MB). `Either<String, Buffer>` overload würde Datei-/Network-Caller gratis bedienen. Nur ziehen wenn C.2-Gate passed. |
| C.2 | Output-type minimization (`String` → `&str`, `Vec<T>` → Buffer) | **applicable (primary lever)** | `parseXml` → Vec<Object> ist der dominante Kostentreiber. `parseXmlToJson` (existiert) adressiert genau das. Weitere Optimierung: Rückgabe als `Buffer` statt `String` spart UTF-8→UTF-16 am Egress (~35 ms @ 10 MB JSON). |
| C.3 | Batch API | n/a | `parse*` ist bereits „ein Call pro Dokument". |
| C.4 | Stateful API (reusable setup via NAPI class) | n/a | quick-xml hat keinen nennenswerten Setup-Cost. Reader-Reuse bringt nichts. |
| C.5 | Parallelization (rayon über large inputs) | n/a | XML-Parse ist inhärent sequentiell (State-Machine über ein Dokument). |
| C.6 | Algorithm swap | **already done** | `quick-xml` ist State-of-the-Art für Rust. Kein bekanntes schnelleres Crate. |
| C.7 | Allocator tuning (arena, caller-provided output buffer) | **applicable (gated)** | `decode_attrs` (lib.rs:24-58) allokiert pro Element `HashMap<String,()>` für Duplikat-Erkennung. SmallVec<[&[u8];4]> + linearer Scan wäre allokationsfrei für die übliche ≤-4-Attrs-Realität. Nur ziehen wenn C.2-Gate passed. |
| C.8 | Bundle-size (LTO, features, panic=abort, strip) | already done | Workspace-Profile. Keine Action nötig. |

## Action plan

Measurement-Gate vor jedem Code-Change. Reihenfolge streng von billig nach
teuer.

### Schritt 1 — Messung aktivieren

1. `crates/xml/wrapper.js` um re-export erweitern:
   ```js
   module.exports = {
     parser: createParser,
     parseXml: native.parseXml,
     parseXmlToJson: native.parseXmlToJson,
   }
   ```
2. `crates/xml/__bench__/index.bench.ts` in allen drei `describe`-Blöcken
   einen Eintrag ergänzen:
   ```ts
   bench('@amigo-labs/xml (parseXmlToJson)', () => {
     JSON.parse(amigoParseXmlToJson(<input>))
   })
   ```
   Plus den fehlenden `@amigo-labs/xml (parseXml)` im 10-MB-SOAP-Block.
3. `npm run bench -w @amigo-labs/xml` → `docs/data.json` regeneriert.

### Schritt 2 — Decision gate

Aus den neuen Zahlen lesen:

- **Pass A:** 10 MB SOAP `parseXmlToJson` ≥ 2,0× sax **UND** 100 KB RSS
  `parseXmlToJson` ≥ 1,0× sax → Yellow/Green re-classification möglich.
- **Pass B:** Nur eine der beiden Bedingungen → Yellow, aber nicht
  deprecation-rückgängig-wert. Weiter zu Schritt 3.
- **Fail:** Keine der Bedingungen → Red bestätigt. Zu Schritt 4.

### Schritt 3 — Falls Pass A: Polish + un-deprecate

a. `parseXmlToJson` Return-Type zu `Buffer` wechseln (spart UTF-8→UTF-16
   Egress). JS-Seite: `JSON.parse(new TextDecoder().decode(buf))`.
b. `parse_xml` + `parse_xml_to_json` um `Either<String, Buffer>`-Input
   erweitern.
c. `decode_attrs` auf SmallVec umstellen (C.7).
d. `docs/packages.json` Eintrag korrigieren: `deprecated: false`,
   `speedup: "N× (JSON mode, ≥ 100 KB)"` mit echter Zahl.
e. `crates/xml/README.md` Deprecation-Warnung entfernen, `parseXmlToJson`
   als Haupt-API dokumentieren, SAX-Wrapper als Legacy-Kompatibilitäts-
   Pfad.
f. `docs/post-mortems/xml.md` → `docs/perf-review/xml.md` konsolidieren
   oder Post-Mortem als Historical-Note belassen mit Update-Header.
g. Version bump auf 0.3.0.

### Schritt 4 — Falls Fail: Clean up

a. `parse_xml_to_json` (lib.rs:219-353) ersatzlos entfernen — toter Code
   mit falschem Werbeanspruch.
b. `docs/post-mortems/xml.md:54-59` korrigieren: „not tried" ist falsch,
   besser: „implemented in d1e2e46, measured in [sprint], failed the
   100-KB/10-MB gate with the following numbers: …".
c. 3-Monats-Deprecation-Window weiterlaufen lassen, dann `archived/`.
d. BACKLOG-Eintrag unter *FFI overhead > gain* ergänzen, falls noch nicht
   vorhanden.

### Budget

- Schritt 1 + 2: ≤ 30 min (wrapper + bench + run).
- Schritt 3 (falls Pass A): ein fokussierter Sprint, 1 Tag.
- Schritt 4 (falls Fail): 1 h.

## References

- Crate: `crates/xml`
- Bench: `crates/xml/__bench__/index.bench.ts`
- Lib: `crates/xml/src/lib.rs`
- Cargo: `crates/xml/Cargo.toml`
- Wrapper: `crates/xml/wrapper.js`
- Post-Mortem: `docs/post-mortems/xml.md`
- FFI-Baseline: `docs/BASELINE.md`
- `docs/packages.json` speedup field: `"2.3× slower"` (`deprecated: true`)
- Implementation commit `parseXmlToJson`: `d1e2e46`
