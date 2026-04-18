# Perf-Review

> Ehrliche Klassifizierung der 15 publizierten `@amigo-labs/*`-Packages
> gegen ihre jeweiligen JS-Alternativen. Entscheidungsgrundlage:
> `npm run bench` Zahlen aus `bench-results.json` (gemessen
> 2026-04-18, Node v22.22.2 linux/x64) und der FFI-Overhead-Baseline in
> `docs/BASELINE.md` (noop = 109 ns, echoString 100KB = 34,7 µs, Buffer
> echo konstant ~180 ns).

## Verdikt-Legende

- 🟢 **Green** — mindestens 2× schneller als bestes JS-Alternative auf
  mittleren/großen Inputs, nie langsamer als 1× auf realistischem
  Minimum. Package hat klare Daseinsberechtigung.
- 🟡 **Yellow** — gemischte Ergebnisse oder nur grenzwertig schneller.
  Ein Optimierungs-Sprint (Phase C) entscheidet über Upgrade zu Green
  oder Downgrade zu Red.
- 🔴 **Red** — verliert meistens oder auf realistischem Median gegen
  JS-Alternative. Kandidat zum Deprecaten (Phase D) außer ein
  radikaler Rewrite bringt messbare Wende.
- ⚫ **Black** — strukturell falsche Entscheidung. NAPI kann den
  Use-Case nicht gewinnen.

## Ergebnis-Übersicht

| Package | Verdikt | Range (amigo vs best JS) | Kommentar |
|---|---|---|---|
| **slugify** | 🟢 | **3,0× – 6,0×** | Unicode-normalize + transliterate ist echtes Work, FFI-Overhead klein relativ zu. Keep as-is. |
| **deepmerge** | 🟢 | **3,3× – 5,9×** | Object-Merging-Allokationen in Rust meaningful schneller als in JS. |
| **file-type** | 🟢 | **16× – 1265×** | Upstream ist async API die für synchron blockieren muss; unser sync-Path ist trivial. |
| **jwt** | 🟢 | **1,4× – 4,8×** | Alle 6 Szenarien (HS256/RS256/ES256 sign/verify) schneller. Crypto ist Compute-bound. |
| **sanitize-html** | 🟢 | **1,44× – 3,94×** | Small-case 1,44× ist grenzwertig aber nicht unter 1; scaled sauber auf 3,94× bei 100 KB. Hybrid-Engine (Tokenizer + Strict-Fallback) bereits implementiert. |
| **argon2** | 🟡 | 1,37× (einziges Szenario) | Schwach oberhalb Parität. Noch keine RS256-/ES256-Style-Variationen gebenched. **Sprint**: zweite Config messen; evtl. Batch-API. |
| **csv** | 🟡 | `parseToJson` 1,59× – 1,78× ✓; plain `parse` **0,71× – 1,08×** ✗ | Zwei Entry-Points mit wildly unterschiedlicher Perf. Plain-`parse` verliert auf großen Inputs gegen `papaparse`. **Sprint**: `parse` entweder fixen oder deprecaten zugunsten von `parseToJson`. |
| **encoding** | 🟡 | latin1 decode 10MB **14,7×** ✓; shift_jis decode 0,65× ✗ | Mixed. UTF-8 / UTF-16LE / Latin-1 laufen alle über V8-Fast-Paths (Parität bis sehr schnell). Shift_JIS + CJK-Familie geht durch Rust und verliert. **Sprint**: Profilieren wo Shift_JIS-Decoder Zeit frisst. Wenn nicht fixbar → Shift_JIS aus der Package-Surface raus oder Black-dokumentieren. |
| **inflate** | 🟡 | deflate 100KB-10MB **4,1× – 6,4×** ✓; inflate 100KB-10MB **0,29× – 0,40×** ✗ | Completely mixed: Kompression (deflate) dramatisch schneller, Dekompression (inflate) dramatisch langsamer als `node:zlib`. Das ist **im selben Package** — inkohärent für User. **Sprint**: Untersuchen warum inflate so viel schlechter ist als node:zlib (derselbe zlib-rs-Backend sollte gleich sein). Vermutung: Output-Buffer-Alloc-Strategie oder fehlendes Streaming. |
| **nanoid** | 🟡 | 0,76× – 1,10× | Bereits von Rust auf pure-JS umgestellt (`794396b`). Kann strukturell nicht besser werden als nanoid@5 weil beide gegen dieselbe `crypto.getRandomValues`/`randomFillSync`-Primitive laufen. An Parität; 0,76×-Abstand zu `crypto.randomUUID` bei batch ist erwartbar (randomUUID ist weniger Work pro ID). **Sprint-Ziel**: Entscheiden ob das Package überhaupt noch notwendig ist (→ ggf. Black). |
| **xxhash** | 🟡 | xxh3 1MB **2,54×** ✓; batch 1000×64B **0,15× – 0,32×** ✗ | Große-Buffer ist echter Gewinn; Batch-API ist katastrophal (5-6× langsamer als xxhash-wasm-loop). Das ist das **klassische Array-Marshalling-Antipattern** aus `docs/BASELINE.md`: `Vec<BigInt>` auszugeben kostet 43 ns pro Element allein für den FFI-Transport. **Sprint**: Batch-API muss Ergebnisse als `Buffer` (8KB für 1000 × u64) zurückgeben. |
| **zip** | 🟡 | 4 von 5 Szenarien Green (2,8× – 3,7×); extract-all 0,56× ✗ | Ein Einzel-Ausreißer (extract 100 kleine Files). **Sprint**: Profilieren warum adm-zip bei vielen kleinen Files gewinnt; Per-Entry-Allokations-Muster vermutlich. |
| **deep-equal** | 🔴 | 0,96× – 1,30× | Niemals meaningful schneller. `fast-deep-equal` ist winziges pures JS das V8 perfekt JITtet. Deep-equal-Arbeit pro Call ist unter 1 µs (flat 7-key: 500 ns) → FFI-Floor von 109 ns frisst 20 % des Budgets, Rust-Gewinn zu klein. **Kill** oder radikaler Rewrite (Batch-API mit 1000 Vergleichen auf einmal) wenn ein Use-Case das hergibt. |
| **levenshtein** | 🔴 | 10 chars 0,60×; 100 chars 1,10×; 1000 chars 0,25×; **10000 chars 0,13×** | Verliert **dramatisch** auf langen Strings (7 ops/s vs 54 ops/s bei 10k chars). Grund: jede 10KB-String-Konvertierung über FFI kostet ~3 µs allein, `fast-levenshtein` arbeitet direkt auf V8-Strings ohne Konvertierung. Je länger der String, desto schlimmer unser Handicap. **Kill** — oder restructure zu Buffer-Input (`lev_bytes(a: Buffer, b: Buffer)`) aber das wäre eine fundamental andere API. |
| **xml** | 🔴 | 0,44× – 0,68× | Verliert auf **jedem** Szenario gegen `sax` (JS-only streaming parser). SOAP 10MB wurde vom Benchmark gar nicht gemessen (nur sax lief); vermutlich noch schlimmer. Unser `parseXml` alloziert ein komplettes DOM; `sax` streamt Events. **Kill** oder kompletter Redesign auf Streaming-API, aber dann ist es nicht mehr "das bessere xml2js" sondern "eine Alternative zu sax". |

## Post-Klassifizierung: Zusammenfassung

**Green (5 Packages):** slugify, deepmerge, file-type, jwt, sanitize-html. Diese sind Begründung fürs ganze Portfolio. Keep.

**Yellow (7 Packages, Sprint-Kandidaten):** argon2, csv, encoding, inflate, nanoid, xxhash, zip. Jedes kriegt einen Sprint in Phase C.

**Red (3 Packages, Kill-Kandidaten):** deep-equal, levenshtein, xml. Jedes kriegt Post-Mortem + Deprecation-Path in Phase D, es sei denn ein radikaler Rewrite ist vertretbar.

Kein klarer Black-Kandidat unter den aktuellen Packages — die Red-Drei sind Red wegen Implementierungs-Problemen und Ausrichtungs-Fehlern, nicht weil NAPI strukturell kein Gewinn-Pattern hat.

## Priorität für die Sprints

Empfohlene Reihenfolge (kleinster Aufwand × größter Effekt zuerst):

### Tier 1 — einfache Fixes, klare Gewinne

1. **xxhash batch** (Yellow → Green): `Vec<BigInt>` durch `Buffer` ersetzen. Bekanntes Pattern aus `nanoid`/`encoding`. ~1 Tag.
2. **inflate** (Yellow): Warum ist `inflate()` bei 100KB/10MB 2,5× langsamer als `node:zlib`, obwohl wir `zlib-rs` benutzen? Vermutung: Output-Buffer-Alloc oder `Vec<u8>` statt `Buffer`. Profilieren. ~1 Tag.
3. **zip extract-all** (Yellow → Green): Einzelne Regression. 100 kleine Files zu extrahieren sollte 100 × `Buffer` zurückgeben. Vermutung: Zip-Entries werden einzeln durch FFI gereicht. Batch-Output. ~1 Tag.

### Tier 2 — mittel

4. **encoding shift_jis** (Yellow): Profilieren; evtl. ist `encoding_rs`s Shift_JIS-Decoder selbst lahm. Alternativen: `encoding` (rust) statt `encoding_rs`, oder Lookup-Tabelle. ~1-2 Tage.
5. **csv plain-`parse`** (Yellow): Warum ist `parse` langsamer als `parseToJson`? Vermutung: `Vec<Vec<String>>` Marshalling-Kosten. Lösung: API vereinigen oder Buffer-basiert. ~1-2 Tage.
6. **argon2** (Yellow): Mehr Szenarien messen, Konfigs variieren. Wenn durchgehend 1,4×, bleibt es Yellow → ggf. Demotion zu Red. Sonst zu Green. ~0,5 Tage.

### Tier 3 — Kill-Entscheidungen

7. **nanoid**: Entscheiden ob das Package existenzberechtigt ist. Pure-JS-Version matcht nanoid@5 aber schlägt es nicht nennenswert. Kann man argumentieren: "es ist der Same-API-Drop-in mit Zero-Dependencies und stabiler Maintenance". Oder Kill. → **Produkt-Entscheidung, keine technische.**
8. **deep-equal** Kill: Post-Mortem + Deprecation.
9. **levenshtein** Kill: Post-Mortem + Deprecation. ODER: Buffer-Input-Variante für Byte-Level-Distanz als neues Package `@amigo-labs/levenshtein-bytes`, separater Use-Case.
10. **xml** Kill: Post-Mortem + Deprecation. Oder Redesign als Streaming-Parser — aber das ist ein eigenes Projekt.

## Was NICHT in diesem Review steht

- **Bundle-Size-Analyse.** Ist in `BENCHMARKS.md` schon dokumentiert. Relevante Auffälligkeit: `slugify` 966KB für 21KB-JS-Alternative — das ist ein separater Trade-off (drei Größenordnungen schneller bei drei Größenordnungen Bundle).
- **Security-Review.** Hier ging es rein um Perf. Crypto-Packages (`argon2`, `jwt`) sollten einen eigenen Security-Audit haben.
- **Memory-Behavior bei Dauerläufen.** Alle Zahlen sind Throughput unter vitest-Warmup. Heap-Wachstum nicht gemessen.

## Reproduzierbarkeit

```bash
cd /home/user/amigo-native
# Build all native bindings first
for p in crates/*/; do
  [ -f "$p/Cargo.toml" ] && (cd "$p" && npx napi build --platform --release)
done
# Run full benchmark suite
node scripts/run-benchmarks.mjs
# → bench-results.json  (66 suites)
```

Dieses Dokument sollte nach jedem größeren Toolchain-Bump (Node-Major,
napi-rs-Major, V8-Major) neu gemacht werden. Green-Packages können zu
Yellow werden wenn V8 seinerseits schneller wird.
