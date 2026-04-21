# Candidate review: `semver`

> **Status:** NO-GO · **Predicted:** 🔴 Red leaning ⚫ Black · **Reviewed:** 2026-04-21

## Verdict

`semver` ist das **Lehrbuch-Beispiel** für den FFI-Floor-Trap auf Massendurchsatz-Utilities: pro-Call-Compute ist Mikrosekunden-klein, V8 JITtet den Parser auf Near-Native-Geschwindigkeit, und Users rufen es scattered-single-call in Hot-Paths (npm/pnpm/yarn-Resolver, Dependency-Walker, Version-Validation-in-Middleware). Die 109-ns-FFI-Floor plus UTF-16↔UTF-8-Konversion an beiden Enden der Grenze sind **in derselben Größenordnung wie die gesamte Rust-Arbeit**. Rust-`semver` crate ist isoliert ~2–3× schneller als V8-`semver`, aber durch FFI betrachtet wird das zu 0,8×–1,2× — exakt die `mime`/`dotenv`-Kategorie. Batch-APIs (`satisfiesMany(versions, ranges)`) wären theoretisch der einzige Hebel, aber Usage-Muster im Ökosystem sind **nie** batch (jedes npm/pnpm/yarn-Binding ist single-call-per-Version-Entscheidung). Klassischer strukturell-Black-Shape.

## JS package

- **npm:** [`semver`](https://www.npmjs.com/package/semver)
- **Downloads:** ~150M/Woche (Q1 2026, effektiv jedes npm-nutzende Node-Projekt pulled es transitiv)
- **Exports / API surface:**
  - `parse(version) → SemVer | null`, `valid(version) → string | null`, `clean(version) → string | null`
  - `inc(version, release, identifier?)`, `diff(v1, v2)`, `major/minor/patch(version)`, `prerelease(version)`, `build(version)`
  - `compare(v1, v2)`, `rcompare`, `compareLoose`, `gt`, `lt`, `eq`, `neq`, `gte`, `lte`, `cmp`
  - `satisfies(version, range, opts?)`, `maxSatisfying`, `minSatisfying`, `minVersion`, `validRange`
  - `Range`-Klasse (compilierter Range-Ausdruck), `SemVer`-Klasse (geparsed Version)
  - `coerce(str)`, `subset(sub, dom)` (Range-Teilmengen-Check)
- **Typical input:**
  - Version-String: `"1.2.3"`, `"^2.0.0-alpha.1+build.42"` — typisch 5–30 Zeichen
  - Range-String: `"^1.0.0 || ~2.5.0"`, `">=1.2.3 <2.0.0 || =3.0.0"` — typisch 5–80 Zeichen
- **Typical output:** `boolean`, `string`, oder kleines Objekt. Nichts groß, aber **sehr häufig** gerufen.
- **Realistic median use-case:** **Package-Resolver-Inner-Loop.** `pnpm install` löst für ein typisches 500-Deps-Projekt Zehntausende `satisfies()`-Calls auf (jede transitive-Dep-Version gegen jede Range). Zweiter Case: **Validation-Middleware** (`if (semver.satisfies(clientVersion, '>=2.0.0'))` in API-Gateways — einzelne Calls, aber Latency-sensitiv). Dritter Case: **Version-Sortierung** in CI-Tools. In keinem Case ist Batch-Pattern natürlich — User wollen einfach `semver.satisfies(a, b)` schreiben.

## Rust replacement

- **Candidate crate(s):**
  - [`semver`](https://crates.io/crates/semver) (Rust) — Cargo's eigene Implementation. Exzellent maintained, MIT/Apache, SIMD-freier aber extrem engführend geschriebener Parser.
  - [`node-semver`](https://crates.io/crates/node-semver) — npm-Semver-Parity-Variante (im Gegensatz zu Cargo-Semver, das sich Details erlaubt). Maintenance-Status zu verifizieren.
  - Drop-in-Perspektive: `semver` npm entspricht node-semver-Dialekt (z.B. Wildcards, `x`-Placeholder, Caret-Edge-Cases mit pre-releases). Cargo-`semver` folgt strikt SemVer-2.0-Spec.
- **Maintenance / license:** `semver` Rust MIT/Apache, dhwthompson & dtolnay, impeccable. `node-semver` crate weniger aktiv, Parity-Aufwand gegen npm-`semver` nicht trivial.
- **Known gotchas / divergences:**
  - **node-semver-Dialekt vs. Cargo-semver** — npm erlaubt `1.x`, `1.*`, `>=1.2.3-beta.0 <1.3.0`, `~1.2`, etc. Einige Edge-Cases (z.B. Pre-Release-Semantik in Caret-Ranges: `^1.0.0-beta.1` matcht `1.0.0-beta.2` aber NICHT `2.0.0-beta.0`) sind node-semver-spezifisch. Full-Parity = das `node-semver` crate nutzen oder eigenen Parser schreiben.
  - **`opts.loose`, `opts.includePrerelease`, `opts.rtl`** — npm-`semver` hat ~5 Modifier-Optionen die Range-Semantik subtil ändern. Parität auf allen ist Detail-Arbeit.
  - **Performance-Paradox** — Rust-`semver`-Crate ist in isoliertem Microbench ~2–3× schneller als V8-Äquivalent. Durch FFI betrachtet ist es ~1×.

## BACKLOG check

Vorhandener Eintrag in `BACKLOG.md` (Section "FFI overhead > gain"): ergänzt 2026-04-21, begründet mit "per-call work is microseconds, 109 ns FFI floor plus UTF-conversion eats any gain." Review bestätigt diese Einordnung vollständig — kein Umdenken nötig, nur formalisiert mit Zahlen.

Abgrenzung:
- Gegen `docs/perf-review/mime.md` (⚫ Black): strukturell identisch — Hashmap-Lookup-style + FFI-Floor dominiert. Minimale Unterschied: `semver` macht echten Parse (Tokenize + numerischer Vergleich), `mime` ist pure Hashmap. Aber beide sind FFI-floor-dominiert.
- Gegen `docs/perf-review/deep-equal.md` (🔴 Red): ähnliche Lehre — V8 ist auf kurze Ops superb optimiert, wir haben keine Headroom.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Kritisch klein.** `semver.satisfies("1.2.3", "^1.0.0")` ≈ 500 ns – 1,5 µs in V8 (JITted regex + string compare). Rust isoliert: ~200–500 ns. **Rust-Gewinn pro Call: ~300 ns – 1 µs.** |
| Input size distribution | Version-Strings 5–30 B, Range-Strings 5–80 B. UTF-Konv an beiden Enden: ~30–100 ns. Zusätzlicher Fix-Overhead. |
| Output size distribution | `boolean` zurück: ~50 ns. Für `parse()` → SemVer-Objekt wäre Output-Marshalling 200–400 ns (Objekt mit major/minor/patch/prerelease/build). Dominiert bei Parse-Calls. |
| Reusable setup (stateful potential) | **Existent.** `new Range("^1.0.0")` einmal kompilieren + wiederverwenden ist ein existierender Speed-Hebel in npm-`semver` selbst. Rust-NAPI-Class `CompiledRange` würde das replizieren. Aber Users nutzen das **selten** — die idiomatische Form ist `semver.satisfies(v, "^1.0.0")` mit String. Class-Variante würde User zu API-Umschreibung zwingen. |
| Batch-usage realism | **Niedrig.** Kein npm/pnpm/yarn-internal-Code batcht Ranges. Es gibt keine sozialisierte `satisfiesMany`-Nutzung. Falls wir eine einführen, müssten User ihren Code umstellen — und das nur für 2–3× Speedup. |
| FFI-share estimate vs. Rust work | **~50–80 % FFI-Share.** Rust-Work ~300 ns, FFI + UTF-Konv ~250–400 ns. In-Single-Call-Nutzung ist das Ende. |

## Classification reasoning

`semver` ist der **archetypische Short-Work-Hot-Call-Fall** aus `docs/BASELINE.md:37–45`:

1. **V8 JITtet semver perfekt.** npm-`semver` ist kompakt, monomorphes JavaScript — exakt der Code, für den V8's TurboFan-Pass den besten Code generiert. Keine langsamen Objects, keine Polymorphie, viele heiß-gerufene Funktionen. Eigene interne Cache (`Range`-Compile wird gemerkt). JS-Baseline ist deshalb **nicht lahm** — im Mikrobench ~500 ns – 1,5 µs auf moderner Hardware.

2. **Rust-Gewinn hat keine Headroom.** Rust parst schneller (bessere Zero-Copy, keine GC), aber der Abstand ist ~300 ns – 1 µs. Nach FFI-Floor (109 ns) + 2× UTF-Konv (≈ 100 ns auf 10-Byte-String) = ~210 ns Fixkosten, bleibt netto ~90 ns – 700 ns Gewinn. Auf einen 500-ns-Baseline-Call: 0,9×–2,4×. Im Median ≈ 1,2×. Darunter kippt viel auf <1× (UTF-Konv-spike bei längeren Strings).

3. **Batch-API als Rettung unrealistisch.** Die Call-Stelle im Resolver-Inner-Loop ist nicht batch-fähig: "welche Version von lodash erfüllt diese 12 Ranges?" ist die Frage, die pro Knoten im Dep-Graph gestellt wird — diese Ranges werden nacheinander aus Parent-Package-JSONs gelesen und lokal geprüft. Es gibt keinen Punkt im Control-Flow, an dem 1000 Ranges gleichzeitig zum Matching bereit liegen.

4. **Pattern-match zu bestehenden NO-GOs**:
   - `mime` (~180M, Hashmap-Lookup) — identischer FFI-Floor-Trap
   - `dotenv` (~91M, 50-Zeilen-JS-Parser) — identisch
   - `deep-equal` (shipped, deprecated 0.2.0) — identisch: kurze V8-native-Ops, FFI hatte keine Headroom

5. **Adoption allein kompensiert nicht.** 150M downloads/Woche ist riesig, aber portfolio-Kriterium ist Perf-Gewinn × Adoption. Bei ~1× Perf ist das Produkt null. Nur das Label "by `@amigo-labs/*`" ist kein Value-Add ohne messbaren Win.

**Shape-Matching:**
- 🔁 Wie `mime` (Lookup + String-Parse, beides FFI-floor-territory)
- 🔁 Wie `dotenv` (V8-optimized small parser)
- 🔁 Wie `deep-equal` (shipped Red, measured 0,96×–1,30× → deprecated)
- ❌ Nicht wie `commonmark` / `inflate` (substantieller Compute-Per-Call)
- ❌ Nicht wie `tiktoken` (Stateful-Class holt amortisierte FFI — aber semver hat keine vergleichbare Stateful-Nutzung im Ökosystem)

**Benchmark-Gap-Flag:** Ohne Spike. Falls jemand ein 1-Tag-Spike läuft und 1,5× auf realistic median `satisfies()`-Call misst, wäre Yellow knapp möglich — aber unwahrscheinlich. Publizierte Rust-vs-Node-Microbenches (Cargo-Team intern, Community-Posts) deuten konsistent auf 0,9×–1,3× via NAPI.

## If GO — proposed port

Nicht empfohlen. Section existiert nur zur Vollständigkeit.

Falls jemand dennoch einen Spike versuchen will: `satisfiesMany(versions: string[], range: string) → Uint8Array` (flat-Buffer-Output) auf 1000-Version-Batch wäre die einzige realistische Green-Pfad — Messung müsste ≥2,5× vs. semver-Loop ergeben. Kein anderer Shape hat Gewinnchance.

## If NO-GO — BACKLOG entry

```markdown
- **semver** (~150M). Per-call work is microseconds of V8-JIT'd parse + range-compare. Rust `semver` crate is faster per-se (~2–3× isolated) but 109 ns FFI floor plus UTF-conversion eats the gain on typical `satisfies()` calls — realistic end-to-end speedup ~1.2×. Package-manager resolvers use scattered-single-call pattern; batch API would be useful but has no ecosystem uptake. Same trap as `mime`/`dotenv`/`deep-equal`. Full review: `docs/perf-review/semver.md`.
```

Section in `BACKLOG.md`: **FFI overhead > gain** — existierender Eintrag wird durch die obige Zeile ersetzt (der initial-pass-Entry steht bereits dort, Review formalisiert ihn mit Zahlen).
