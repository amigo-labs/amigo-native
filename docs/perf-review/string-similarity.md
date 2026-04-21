# Candidate review: `string-similarity` / `leven` / `fastest-levenshtein`

> **Status:** NO-GO · **Predicted:** 🔴 Red · **Reviewed:** 2026-04-21

## Verdict

Drei Pakete, identische Lehre: **kurz-String-dominante Levenshtein/Dice-Coefficient-Berechnungen**, und wir haben diese Lehre bereits gemessen in `docs/post-mortems/levenshtein.md` (0,13× auf 10k-chars nach Phase-C-Spike, archiviert 2026-04-19). Der hier geplante Port würde identische Traps treffen: UTF-16↔UTF-8-Konversion an beiden Input-Strings kostet pro Call mehr als die eigentliche Distance-Berechnung. `fastest-levenshtein` ist besonders tödlich, weil es selbst in JS ~1 µs für kurze Strings braucht — FFI-Floor alleine ist 10–20 % Overhead davon, und die eigentliche Rust-SIMD-Beschleunigung (`triple_accel`) bringt darüber keinen Wind.

## JS package

- **npm:**
  - [`string-similarity`](https://www.npmjs.com/package/string-similarity) (~10M/Woche) — Dice-Coefficient auf Bigrams
  - [`leven`](https://www.npmjs.com/package/leven) (~300k/Woche) — Levenshtein, pure JS
  - [`fastest-levenshtein`](https://www.npmjs.com/package/fastest-levenshtein) (~2M/Woche) — Levenshtein, hand-optimized JS
- **Downloads:** ~12M/Woche kombiniert (BACKLOG-Zahl "~10M" bestätigt als konservativ)
- **Exports / API surface:**
  - `string-similarity`: `compareTwoStrings(s1, s2) → number` (Dice, 0..1), `findBestMatch(main, candidates) → {bestMatch, ratings}`
  - `leven(s1, s2) → number` (Levenshtein edit distance)
  - `fastest-levenshtein.distance(s1, s2) → number`, `.closest(str, arr) → string`
- **Typical input:** Zwei Strings. **Korpus ist short-string-dominant:** Fuzzy-Match gegen Suchergebnisse (8–30 Zeichen), Typo-Korrektur (5–20 Zeichen), Namen-Match (10–40 Zeichen). Längere Strings sind Ausnahme.
- **Typical output:** Number (edit distance oder similarity score 0..1).
- **Realistic median use-case:** **Fuzzy-Suche in Autosuggest** (User tippt, gegen bekannte Terme matchen), **Typo-Tolerance in CLI-Tools** ("Did you mean X?"), **Name-Matching** in Recordslinkage. Fast immer **Hot-Loop gegen Array von Kandidaten**: `candidates.map(c => distance(input, c))`. Median-Input-Länge <20 Zeichen.

## Rust replacement

- **Candidate crate(s):** `triple_accel` (SIMD-Levenshtein), `strsim` (ohne SIMD), `rapidfuzz` (Python-port, Fuzzy-Match-Suite)
- **Maintenance / license:** Alle MIT, aktiv
- **Known gotchas / divergences:** Keine Semantik-Divergenzen — Levenshtein/Dice sind mathematisch eindeutig

## BACKLOG check

Vorhandener Eintrag in `BACKLOG.md` → "Ruled out — AI-category": "Short-string dominant corpus — repeats the `levenshtein` failure exactly (see `docs/perf-review/levenshtein.md`)." Review formalisiert und archiviert.

Abgrenzung:
- Gegen `docs/perf-review/levenshtein.md` + `docs/post-mortems/levenshtein.md` (archived 🔴, **gemessen**): dieselbe Paket-Kategorie, und wir haben die Mess-Daten: 0,13× auf 10k-chars nach Phase-C-Spike. Der Post-Mortem ist der Präzedenzfall.
- Gegen `docs/perf-review/deep-equal.md` (archived 🔴): architektonisch identisch (two-small-strings-in, scalar-out).

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Trivial bis klein.** Levenshtein 10-char-Strings: ~100 ns JS, ~50 ns Rust. Plus FFI-Floor 109 ns + 2× UTF-Konv ~100 ns = **Rust-Call ≥260 ns**. Speedup 0,4×. |
| Input size distribution | **Kritisch klein.** Median <20 Zeichen. UTF-Konv ist dominanter Kostenpunkt relativ zum Compute. Gemessen in `levenshtein`-Post-Mortem. |
| Output size distribution | 1 × number. Negligible. |
| Reusable setup (stateful potential) | Null. |
| Batch-usage realism | **Hoch für `findBestMatch`-Shape** — ein Query gegen N Kandidaten kann als `findBestMatch(query, candidates: string[]) → {idx, score}` via ein-Crossing gebaut werden. ABER: (a) das ist die Form die in `string-similarity` bereits existiert und `@amigo-labs/levenshtein` hat das nach C-Spike getestet → 1,5× Gate bei 10k verfehlt → archived. Nicht zu reproduzieren. |
| FFI-share estimate vs. Rust work | >100 % auf short-strings. Gemessen. |

## Classification reasoning

Wir haben diese Lehre **gemessen**, nicht nur vorhergesagt:

1. **`@amigo-labs/levenshtein` war genau dieser Port.** 0,13× auf 10k-chars, 0,60× auf 10-chars, 1,10× auf 100-chars (nur 1 Messung über 1×, Rest Red). Deprecated in 0.2.0, archiviert 2026-04-19. Full Post-Mortem: `docs/post-mortems/levenshtein.md`.

2. **`fastest-levenshtein` war schon unsere Baseline** — der Name sagt es. Pure JS, hochoptimiert. Der Abstand zu Rust-SIMD-`triple_accel` ist messbar klein nach FFI-Overhead.

3. **`string-similarity`'s Dice-Coefficient** ist minimal komplexer (Bigram-Set-Intersection), aber dieselbe Größenordnung von Compute. Gleiche FFI-Mathematik.

4. **Batch-API als Rettung wurde versucht.** Spike auf Buffer-Input (`lev_bytes(a: Buffer, b: Buffer)`) dokumentiert in `docs/perf-review/levenshtein.md` unter "Gate ≥1,5× bei 10k chars verfehlt". Keine Headroom.

**Shape-Matching:**
- 🔁 Wie `@amigo-labs/levenshtein` archived — **genau dieselbe Kategorie**
- 🔁 Wie `compute-cosine-similarity` (Two-Inputs-One-Scalar-Out, FFI-drowns-Compute)
- 🔁 Wie `deep-equal` archived

**Benchmark-Gap-Flag:** Kein Spike nötig — der `levenshtein`-Spike ist der Präzedenzfall.

## If NO-GO — BACKLOG entry

Archiviert 2026-04-21. Full review: `docs/perf-review/string-similarity.md`. Präzedenz: `docs/post-mortems/levenshtein.md`.
