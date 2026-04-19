# Candidate review: `tiktoken`

> **Status:** SHIPPED v0.1 · **Predicted:** 🟢 Green vs. pure-JS / 🟡 Yellow vs. WASM · **Measured:** 🟢 Green vs. WASM + js-tiktoken / 🔴 Red vs. gpt-tokenizer · **Reviewed:** 2026-04-19

## Verdict

`tiktoken-rs` ist ein sauberer Rust-Port des OpenAI-BPE-Tokenizers mit identischer Algorithm-Parität, API-Shape ist die "kanonische Green-Form" (ein Call pro Prompt, substantieller Compute, String-in/Uint32-raus). Gegen `js-tiktoken` (pure JS) sind 2,8× an 1 MB-Inputs extern gemessen — klares Green. Gegen `tiktoken` npm (WASM) sind 1,2-1,3× realistisch — strukturell nicht Green, weil WASM den gleichen Rust-Kern läuft und wir nur die FFI-Qualität gewinnen. **GO mit Positionierung als pure-JS-Killer, nicht als WASM-Killer**; der Schlüsselrisiko ist die kleine Input-Bucket, die vor Commit unbedingt gebenched werden muss.

## JS package

- **npm:** `tiktoken` (Autor: Dariusz Bolik, @dqbd) — WASM-Binding der Original-Python/Rust-Implementierung
- **Downloads:** ~15 M weekly (Q1 2026 Schätzung, BACKLOG)
- **Exports / API surface:**
  - `get_encoding(name)` → `Tiktoken` — Encoder per Name (`cl100k_base`, `o200k_base`, `p50k_base`, …)
  - `encoding_for_model(model)` → `Tiktoken` — Lookup per Model-ID
  - `tik.encode(text, allowed_special?)` → `Uint32Array`
  - `tik.decode(tokens)` → `Uint8Array` (dann `TextDecoder` in JS)
  - `tik.free()` — explizites WASM-Memory-Cleanup
- **Typical input:** UTF-8-Text. Spannbreite: 10 Byte Chat-Snippet bis 100 KB+ RAG-Dokument
- **Typical output:** `Uint32Array` mit Token-IDs. Pro Token ca. 4 Zeichen Text → Output-Größe ~25 % der Input-Länge
- **Realistic median use-case:** **RAG-Pipeline-Preprocessing.** Chunk ein Dokument (5-50 KB), encode zum Zählen/Schneiden, decode selten. Sekundärer Use-Case: **Cost-Gate vor API-Call**: `countTokens(prompt)` auf ~200-2000 Token Chat-Messages. Niemals in einem Hot-Loop mit 10-Byte-Strings

## Rust replacement

- **Candidate crate(s):** `tiktoken-rs 0.11.0` (Arnaud Gourlay + Roger Zurawicki)
- **Maintenance / license:** Aktiv gepflegt (Release 2026-04-08), MIT, 381 Stars, 31 Releases
- **Known gotchas / divergences:**
  - Encoder-Funktionen geben `Vec<u32>` — sauber auf `Uint32Array` mapbar (kein `BigInt` wie bei xxhash)
  - Singleton-Pattern für wiederholte Calls vorgesehen (BPE-Table ist ~10-50 MB RAM pro Encoding) — **muss** als NAPI-Class laufen, nicht als freie Funktion
  - Special Tokens sind per-Encoding konfigurierbar; API muss `allowed_special` / `disallowed_special` durchreichen (Parität mit tiktoken npm)
  - `o200k_harmony` (gpt-oss) ist in tiktoken-rs 0.11 vorhanden — neueres Encoding, in älteren js-tiktoken-Versionen evtl. nicht. Parity-Check pro Encoding nötig

## BACKLOG check

> **tiktoken** / **js-tiktoken** (~15M / ~3M). BPE tokenization over documents via `tiktoken-rs`. Batch-encode is the canonical green shape — one call per prompt, compute dominates.

User hat explizit `rust-check` angefordert → Backlog-Konsens wird hier **verfeinert**: "Green" war an pure-JS (`js-tiktoken`) gedacht; gegen WASM-`tiktoken` ist Yellow realistisch.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Medium:** 1 MB Text ≈ 360 ms (tiktoken-rs Referenz, externer Bench). 1 KB ≈ 0,5 ms. 100 Byte ≈ ~5-20 µs. Für Chat-Messages (200-2 k Tokens, ~1-8 KB) liegt echter Compute bei 0,5-4 ms — FFI-Share **unter 1 %** |
| Input size distribution | UTF-8-String. Pro 100 KB ~35 µs FFI-String-Konversion (BASELINE.md). Bei Median-Input 1-10 KB also ~0,3-3,5 µs Konversion |
| Output size distribution | `Vec<u32>` via `Uint32Array` — **unbedingt als TypedArray zurückgeben, nicht als `Vec<u32>`-JS-Array.** 1000-Element-`Vec<u32>` kostet ~43 µs (BASELINE.md §4); derselbe Inhalt als `Uint32Array`-Buffer ~180 ns konstant |
| Reusable setup (stateful potential) | **Massiv.** BPE-Encoder-State ist 10-50 MB Merge-Tabelle plus kompiliertes Regex. Per-Call-Load ist unakzeptabel → **NAPI-Class-API pflichtig** (analog `hnswlib-node`-Pattern aus BACKLOG) |
| Batch-usage realism | **Optional.** Primärer Pattern ist "ein Call pro Prompt", schon FFI-günstig. Batch-API (`encodeMany(texts: string[])`) macht bei RAG-Chunk-Arrays Sinn — Nice-to-have, nicht pflicht |
| FFI-share estimate vs. Rust work | <1 % bei Median (Chat-Message oder RAG-Chunk); ~5-20 % bei Cost-Gate auf 10-Byte-Strings; <0,1 % bei Large-Dokumenten |

## Classification reasoning

Dies ist ein zweigleisiger Fall, den eine einzelne Tier-Klassifikation nicht sauber abbildet.

**Gegen `js-tiktoken` (pure-JS, ~3 M weekly): 🟢 Green**
- Externer Bench: 359 ms (Rust) vs. 1006 ms (pure-JS) auf 1 MB → **2,80×** — über Green-Gate
- Auf Medium (Chat-Snippet, ~1 KB): 0,54 ms Rust vs. 0,96 ms pure-JS → **1,78×** — knapp unter Green, nahe am Gate
- Auf Small (<100 Byte): unbestimmt, muss gebenched werden. FFI-Floor 109 ns + String-Marshal macht den Unterschied
- Pure-JS hat eine nicht-triviale V8-Hot-Loop für Merge-Steps; Rust gewinnt über `fancy-regex` + `fxhash` + ohne GC-Pressure

**Gegen `tiktoken` npm (WASM, ~15 M weekly): 🟡 Yellow**
- Externer Bench: 360 ms vs. 452 ms auf 1 MB → **1,25×**. Strukturell begrenzt weil WASM denselben Rust-Kern tokenizer läuft
- Auf Medium: 0,54 ms vs. 0,78 ms → **1,44×**
- Wir gewinnen nur FFI-Qualität (napi-rs vs. WASM-Bridge) und Compile-Flags. Das sind ~10-25 %, nie 2×

**Klassische Referenzpatterns:**
- **Wie** `argon2`/`bcrypt`/`sanitize-html`: substanzielle Compute pro Call, bytes/string-in, array/string-out, amortisierter Setup-State. Check.
- **Nicht** wie `mime`/`deep-equal`/`levenshtein`: kein ns-skaliger Hot-Loop, kein trivial-per-call-Work
- **Achtung** wie `xxhash-batch`: falls Output als `Vec<u32>`-JS-Array (nicht `Uint32Array`) returned wird, kippt es ins FFI-Marshalling-Debakel. **Strikt `Uint32Array` returnen.**

**Einziger echter Small-Input-Fallstrick:** Wenn der median Use-Case "zähle Tokens in einem 10-Byte-Prompt" ist (z. B. Cost-Gate vor API-Call mit nur Benutzer-Input), landen wir im Bereich wo FFI vergleichbar zur Compute ist. Pure-JS-Tokenizer rechnet das in ~1-2 µs; Rust via NAPI vermutlich ~1-3 µs. Nicht katastrophal, aber kein Gewinn. **Pflicht: 10-Byte- und 100-Byte-Bucket vor Commit benchen, nicht erst nach Port.**

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/tiktoken`
- **Primary API sketch:**
  ```ts
  export type Encoding =
    | 'cl100k_base'      // gpt-3.5, gpt-4
    | 'o200k_base'       // gpt-4o, o1/o3/o4, gpt-5
    | 'o200k_harmony'    // gpt-oss
    | 'p50k_base' | 'p50k_edit' | 'r50k_base' | 'gpt2'

  export declare class Tiktoken {
    static getEncoding(name: Encoding): Tiktoken
    static encodingForModel(model: string): Tiktoken

    encode(text: string, allowedSpecial?: string[] | null): Uint32Array
    decode(tokens: Uint32Array): string
    countTokens(text: string): number  // fast-path, skip alloc of Uint32Array
    encodeMany(texts: string[]): Uint32Array[]  // batch over RAG-chunks
  }
  ```
  → **NAPI-Class ist nicht verhandelbar.** Freie Funktion pro Call würde BPE-Table pro Call neu laden = unbrauchbar.
  → `Uint32Array` ist strikt (nicht `number[]`) — sonst FFI-Marshalling-Debakel (BASELINE §4).
  → `countTokens` als Fast-Path: returned nur die Länge, vermeidet Uint32Array-Allokation wenn der Caller nur budgetieren will. Green-Gate-kritisch für den Cost-Gate-Use-Case.

- **Must-have benchmark scenarios:**
  - **Small:** `countTokens("Hello world")` (10 B) — FFI-Floor-Exposé
  - **Medium:** `encode(chatMessage)` mit 500 Token Input (~2 KB) — häufigster realer Call
  - **Large:** `encode(ragDocument)` mit 5 k / 25 k Token (~20 KB / 100 KB) — Chunking-Use-Case
  - **Round-trip:** `decode(encode(x))` auf Medium — Parität + Decode-Perf
  - **Batch:** `encodeMany(100 × chat_message)` vs. Loop in JS — Batch-API-Rechtfertigung
  - **Baseline-Pflicht:** **beide** JS-Pakete — `tiktoken` (WASM) **und** `js-tiktoken` (pure JS). Die zwei haben verschiedene Zielnutzergruppen und ergeben verschiedene Speedup-Stories
  - **Encoding-Load-Time:** einmalig `getEncoding("cl100k_base")` — verifizieren dass BPE-Table-Load im Class-Constructor bleibt, nicht pro encode()

- **Acceptance thresholds (Green gate):**
  - ≥2,0× vs. `js-tiktoken` bei Medium und Large (Hauptzielbaseline)
  - ≥1,0× vs. `js-tiktoken` bei Small (Floor-Check)
  - ≥1,2× vs. `tiktoken` (WASM) bei Medium und Large (Yellow akzeptabel hier)
  - ≥0,9× vs. `tiktoken` (WASM) bei Small (darf leicht verlieren, aber kein Faktor-2-Einbruch)
  - 100 % Parity: `encode` / `decode` Round-Trip über 1000 Random-Strings pro Encoding
  - Cross-Verify: Outputs bit-identisch zu `tiktoken` npm auf Fixture-Korpus

- **Risks:**
  1. **Small-Input-Regime unklar** — der kritische Punkt. Wenn Nutzer typischerweise 10-Byte-Strings tokenizen (Cost-Gate-Pattern), verlieren wir vermutlich gegen pure-JS (V8 JITs die BPE-Schleife für kurze Inputs gut). Muss vor Commit gemessen werden, sonst Yellow-Fallback
  2. **WASM ist "good enough"** — User von `tiktoken` npm sehen <1,3× und wechseln evtl. nicht. Gewinn primär: prebuild-Binaries statt WASM-Bundle (~1 MB im Node-Modules-Tree weniger), keine WASM-Init-Latenz beim Startup. Positionierung wichtig
  3. **BPE-Table-Bundle-Size** — `tiktoken-rs` bundelt die Merge-Tabellen statisch in die Binary. Pro Encoding ~2-5 MB → Gesamtbinary könnte ~20 MB werden bei allen 7 Encodings. Mitigation: Features pro Encoding gated, default `cl100k_base + o200k_base`, Rest opt-in via `features = ["p50k", "gpt2"]`
  4. **`free()`-Semantik** — `tiktoken` npm zwingt User zu `.free()` wegen WASM-Memory. Bei NAPI ist das durch GC abgedeckt — kleine API-Asymmetrie, aber Parity-OK (no-op `free()` für Migration)
  5. **Encoding-Download-Pattern** — Einige User nutzen `tiktoken`'s `load()`-API um Encodings from URL zu laden (Browser/Offline-Szenario). Bei native Rust ist das nicht relevant (Node-Context), aber API-Lücke markieren
  6. **o200k_harmony** ist neu (Q1 2026, gpt-oss). Parity gegen `js-tiktoken` nur falls dort implementiert — evtl. nur gegen `tiktoken` WASM testbar

## If NO-GO — BACKLOG entry

N/A — GO empfohlen mit qualifizierter Klassifikation (Green vs. pure-JS, Yellow vs. WASM).

## Phase-B Messung (2026-04-19, linux-x64, Node v22)

Implementiert in `crates/tiktoken/` gegen `tiktoken-rs 0.11`. Drei Baselines, drei Größen-Buckets (`cl100k_base`, ops/sec, höher = besser):

| Szenario | @amigo-labs/tiktoken | tiktoken (WASM) | js-tiktoken | gpt-tokenizer |
|---|---:|---:|---:|---:|
| encode 10 B (small) | **164 256 hz** | 7 006 hz | 73 907 hz | 586 445 hz |
| encode ~2 KB (medium) | **5 999 hz** | 1 445 hz | 1 698 hz | 14 855 hz |
| encode ~90 KB (large) | **126 hz** | 38 hz | 28 hz | 269 hz |
| 100 × 10 B (RAG batch) | **1 471 hz** | 67 hz | — | 4 364 hz |

Speedup-Matrix (>1 = wir schneller):

| Szenario | vs. WASM | vs. js-tiktoken | vs. gpt-tokenizer |
|---|---:|---:|---:|
| Small | **23,4×** ✅ | **2,22×** ✅ | **0,28×** ❌ |
| Medium | **4,15×** ✅ | **3,53×** ✅ | **0,40×** ❌ |
| Large | **3,32×** ✅ | **4,48×** ✅ | **0,47×** ❌ |

**Vorhersage vs. Realität:**
- Gegen `tiktoken` (WASM): vorhergesagt Yellow (~1,25×), gemessen **Green** (3–23×). Vorhersage war zu pessimistisch — der externe Benchmark ([maxim-saplin/tiktoken-bench](https://github.com/maxim-saplin/tiktoken-bench)) hat WASM gegen Python/Rust-Native gemessen, nicht gegen napi-rs. Der napi-rs-Pfad ist deutlich günstiger als WASM-Bridge + wasm-bindgen-Marshalling.
- Gegen `js-tiktoken`: vorhergesagt 2,8× Green, gemessen **2-4,5× Green**. On-target.
- Gegen `gpt-tokenizer`: **nicht antizipiert** — vorhergesagt in `gpt-tokenizer.md` als "pure-JS ~2,8× slower" analog zu js-tiktoken. Gemessen **gpt-tokenizer ist 2-3× schneller als wir**.

**Warum `gpt-tokenizer` uns schlägt:**
- LRU-Merge-Cache in der BPE-Schleife — wiederholte Bigram-Paare innerhalb eines Textes werden cached
- V8-JIT optimiert den heißen Merge-Loop extrem aggressiv (inline caches für die `Map`-lookups)
- Pure JS hat keine FFI-Fixkosten — selbst unsere 109 ns Floor schlagen durch

**Warum `js-tiktoken` *nicht* so schnell ist (obwohl auch pure-JS):**
- Kein LRU-Cache
- Weniger monomorphe Hot-Path-Struktur
- Auf dem 1-MB-externen-Bench 3× langsamer als Rust — das deckt sich mit unseren Messungen

**Endklassifikation: 🟡 Yellow (mixed).** Grüner Win gegen `tiktoken` + `js-tiktoken` (18 M weekly DL kombiniert); Red gegen `gpt-tokenizer` (1 M weekly). Positionierung im README: "drop-in für tiktoken und js-tiktoken; **kein** Ersatz für gpt-tokenizer". 88 Tests grün (12 Unit + 70 Parität + 6 Fuzz).

**Optionen für Phase C:**
- **C.6 Algorithm:** LRU-Merge-Cache in `tiktoken-rs` upstream einbringen oder als lokaler Wrapper — realistisches 1,5-2× Upside im Medium-Bucket
- **C.2 Output-Type:** `encodeOrdinary` könnte als `Buffer` mit LE-u32 statt `Uint32Array` zurückgeben (BASELINE §3: ~180 ns flat vs. Uint32Array-Alloc). Vermutlich <10 % Gain
- **Yellow halten:** positionieren als "tiktoken-WASM-Killer" (15 M weekly), gpt-tokenizer-User ignorieren (1 M weekly). Defensive Empfehlung

**Empfehlung:** Yellow shippen, Phase-C nur wenn upstream tiktoken-rs den LRU-Cache akzeptiert. Die WASM-User-Migration ist der primäre ROI.
