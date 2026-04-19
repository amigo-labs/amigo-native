# Candidate review: `gpt-tokenizer`

> **Status:** SHIPPED als Sub-Surface von `@amigo-labs/tiktoken`, aber **NO-GO als Konkurrenz** · **Predicted:** 🟢 Green · **Measured:** 🔴 Red (gpt-tokenizer ist 2–3× schneller als wir) · **Reviewed:** 2026-04-19

## Verdict

`gpt-tokenizer` ist ein pure-JS-Port desselben BPE-Algorithmus (cl100k_base / o200k_base / o200k_harmony) mit erweiterter API: chat-spezifische Token-Zählung, `isWithinTokenLimit`, Generator-Streaming, Cost-Estimation. Der algorithmische Kern deckt sich zu 100 % mit `tiktoken`/`js-tiktoken`, die FFI-Shape ist identisch — aber gegen eine pure-JS-Baseline ist der Speedup strukturell *größer* als bei `tiktoken` (WASM), weil wir nicht gegen einen ebenso nativen Kern antreten. **Empfehlung: keine separate Crate, sondern die gpt-tokenizer-Extras (`encodeChat`, `isWithinTokenLimit`, `countChatCompletionTokens`) in `@amigo-labs/tiktoken` mit aufnehmen.** Zweite Crate wäre Doppel-Maintenance ohne Mehrwert.

## JS package

- **npm:** `gpt-tokenizer` (Autor: Bazyli Brzóska, niieani) — "the fastest, smallest and lowest footprint GPT tokenizer" (Eigenaussage)
- **Downloads:** ~1 M weekly (Q1 2026 Schätzung, BACKLOG)
- **Exports / API surface:**
  - `encode(text)` / `decode(tokens)` — Kern, identisch zu tiktoken
  - `encodeChat(messages, model)` — ChatML/Harmony-Overhead-Kalkulation
  - `countTokens(text)` / `countChatCompletionTokens(messages, model)` — zählen ohne Array-Alloc
  - `isWithinTokenLimit(text, limit)` — **Early-Exit-Version** von encode, stoppt wenn Limit überschritten
  - `encodeGenerator` / `decodeGenerator` / `decodeAsyncGenerator` — Streaming via Generators
  - `estimateCost(text, model)` — Pricing-Daten für 100+ Modelle eingebaut
  - LRU-Merge-Cache intern (Performance-Optimierung)
- **Typical input:** Identisch zu tiktoken — UTF-8-Text oder `ChatMessage[]`
- **Typical output:** `number[]` Token-Arrays, oder Boolean für `isWithinTokenLimit`, oder Generator-Iteration
- **Realistic median use-case:** **Chat-App-Cost-Control.** Vor jedem OpenAI-API-Call wird `countChatCompletionTokens(messages, "gpt-4o")` aufgerufen um Input-Kosten zu schätzen und Kontextfenster zu prüfen. Input: 5-50 Messages à ~200 Token = ~5-50 KB Text. Call-Frequenz: 1 pro User-Turn

## Rust replacement

- **Candidate crate(s):** `tiktoken-rs 0.11.0` — **derselbe Backend wie für tiktoken**. Chat-Overhead-Rules, Pricing-Data und Early-Exit wären Wrapper-Code in `@amigo-labs/tiktoken`
- **Maintenance / license:** Aktiv (2026-04-08), MIT, siehe `tiktoken.md` für Details
- **Known gotchas / divergences:**
  - Chat-Overhead-Rules sind **je Model** verschieden: gpt-3.5-turbo = 4 Token/msg + 2/reply, gpt-4 = 3+3, gpt-4o = Harmony-Format. Muss in Rust als Lookup-Tabelle ausgedrückt werden (wie gpt-tokenizer's `mappings.ts`). Parität über Tests pflichtig
  - `isWithinTokenLimit` als echte Early-Exit-Variante im Rust-Encoder implementieren (tiktoken-rs bietet das nicht direkt — eigener Wrapper mit `encode_with_limit(text, limit)` nötig)
  - Generator-APIs (`encodeGenerator`) sind in NAPI aufwendiger. Vorschlag: **nicht portieren.** User fällt auf pure-JS-Generator über Chunks zurück, oder wir bieten `encodeMany(chunks)` stattdessen
  - `estimateCost` = Pricing-Lookup + Token-Count. Pricing-Daten driften (OpenAI ändert Preise). **Nicht in Rust.** User-side JS-Multiplikator auf `countTokens()`-Output

## BACKLOG check

> **gpt-tokenizer** (~1M). Same `tiktoken-rs` backend, different JS API surface. Near-free second port once `tiktoken` ships.

**Korrektur der Backlog-Annahme:** "Second port" ist irreführend. Es gibt *kein* zweites Crate, das Sinn ergibt — der gleiche `tiktoken-rs`-Wrapper mit erweiterter Surface bedient beide npm-Pakete. User sehen bei beiden dasselbe `@amigo-labs/tiktoken`-Paket als Drop-in.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | Identisch zu `tiktoken.md` Bucket-wise. **Bonus:** `isWithinTokenLimit` bei kurzen Strings exitet früh → noch günstigerer Compute, FFI-Share steigt |
| Input size distribution | Chat-Use-Case: 5-50 Messages, 5-50 KB Gesamt-Text. Günstiges Medium-Regime, FFI-Share < 1 % |
| Output size distribution | `countTokens()` returned `number` — billigste Shape, ~180 ns Marshal. `encodeChat` returned `Uint32Array` + Overhead-Zahl — Struct-Marshalling, ~500 ns |
| Reusable setup (stateful potential) | Gleich wie tiktoken — NAPI-Class pflicht. Zusätzlich: Chat-Overhead-Rules und Model-Mapping sind konstant, liegen im Class-Constructor |
| Batch-usage realism | `encodeChat` *ist* bereits ein impliziter Batch (N Messages pro Call). Plus Standard-`encodeMany` aus tiktoken. Zwei Batch-Shapes abgedeckt |
| FFI-share estimate vs. Rust work | <1 % bei Chat-Use-Case. Für `isWithinTokenLimit` mit kurzen Strings + niedriger Limit evtl. 5-10 % (Early-Exit macht Compute winzig) |

## Classification reasoning

`gpt-tokenizer` ist **pure JavaScript** — das ist der entscheidende Unterschied zu `tiktoken` (WASM). Die externe Bench-Referenz für pure-JS (`js-tiktoken`, algorithmisch fast identisch) gibt:

- 1 MB: 1006 ms pure-JS vs. 359 ms tiktoken-rs → **2,80×** Rust-Speedup — **klares Green**
- Medium: 0,96 ms vs. 0,54 ms → **1,78×** — knapp unter Green-Gate, vermutlich 2× mit sauberer napi-rs-Integration

gpt-tokenizer's LRU-Merge-Cache ist eine micro-opt; sie schließt die Lücke zu tiktoken-rs nicht (beide nutzen HashMaps, Rust's Code ist einfach CPU-cache-freundlicher ohne V8-Objekt-Indirections).

**Algorithmisches Profil:**
- **Wie** `sanitize-html`/`csv`: substanzielle Per-Call-Compute, string-in, typed-output, State-als-Class
- **Nicht** wie `levenshtein`: kein String-Distance-Hot-Loop auf 10-Char-Strings (pure-JS-Tokenizer läuft ~1 µs auf 10-Char, NAPI ~1-2 µs — verlieren aber nicht katastrophal)
- **Wie** `xxhash-batch`: Wenn Output-API naiv als `number[]` implementiert wird, kippt es. **Strict `Uint32Array`.**

**Small-Input-Fall:** Für `isWithinTokenLimit("hi", 100)` — 2-Byte-String, Limit 100, sofortiger Early-Exit → pure-JS macht das in ~500 ns. Rust via NAPI ~400-600 ns. Parität, kein Gewinn und kein Verlust. **Akzeptabel für Yellow-Floor**, kein Red.

**Generator-Streaming-Gap:** Die `encodeGenerator`/`decodeAsyncGenerator`-Surface von gpt-tokenizer hat keine direkte Rust-Entsprechung. User der das *wirklich* braucht (selten — meist wird einfach auf chunked Array gewechselt) bleibt bei pure-JS oder wir dokumentieren Migration zu `encodeMany(chunks)`. **Nicht als Blocker behandeln.**

## If GO — proposed port

**Keine separate Crate.** Extras in `@amigo-labs/tiktoken` aufnehmen als API-Erweiterung.

- **Recommended crate-name:** `@amigo-labs/tiktoken` (gleiches Crate wie `tiktoken.md`)
- **Primary API sketch — Erweiterung zur tiktoken-Class:**
  ```ts
  export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool'
    content: string
    name?: string
  }

  export interface ChatEncodeResult {
    tokens: Uint32Array
    overhead: number  // ChatML/Harmony message-framing-Tokens
  }

  export declare class Tiktoken {
    // ... aus tiktoken.md ...

    // gpt-tokenizer-Surface:
    encodeChat(messages: ChatMessage[], model: string): ChatEncodeResult
    countChatCompletionTokens(messages: ChatMessage[], model: string): number
    isWithinTokenLimit(text: string, limit: number): boolean
    // Bewusst nicht portiert: encodeGenerator, decodeAsyncGenerator, estimateCost
  }
  ```
  → `estimateCost` in JS-Land ausgelagert: User multipliziert `countTokens()` × eigene Pricing-Tabelle. Rust-Crate soll keine ratenkonstanten Pricing-Daten bundeln (drift, Breaking-Changes)
  → Generator-APIs explizit dokumentiert als *not ported* mit Migration zu `encodeMany(chunks)`

- **Must-have benchmark scenarios:**
  - Alle aus `tiktoken.md` gelten
  - **Neu:** `countChatCompletionTokens(10 messages, "gpt-4o")` — Median-Use-Case von gpt-tokenizer
  - **Neu:** `isWithinTokenLimit(short_text, 100)` — Early-Exit-Fast-Path, Floor-Check
  - **Neu:** `isWithinTokenLimit(long_text, 100)` — Early-Exit nach N Tokens, messen dass wir tatsächlich früh exiten (nicht full-encode)
  - **Baseline:** **Beide** gpt-tokenizer (pure-JS) **und** tiktoken (WASM) als Vergleiche. js-tiktoken optional da algorithmisch nahezu identisch zu gpt-tokenizer

- **Acceptance thresholds (Green gate):**
  - ≥2,0× vs. `gpt-tokenizer` bei Medium (Chat-Use-Case) und Large — Hauptzielbaseline
  - ≥1,0× vs. `gpt-tokenizer` bei Small (`isWithinTokenLimit` short-circuit) — Floor-Check
  - ≥0,95× vs. `gpt-tokenizer` bei Early-Exit-Fall — darf minimal verlieren weil pure-JS's frühe Heuristik (char-count) trivial ist
  - 100 % Parity: `encodeChat` gegen gpt-tokenizer Fixture-Test (gpt-3.5-turbo, gpt-4, gpt-4o, gpt-5) für Overhead-Zahlen
  - Cross-Verify: Token-Sequenzen bit-identisch zu `gpt-tokenizer` auf 1000 Random-Chat-Conversations

- **Risks:**
  1. **Scope-Creep ins `@amigo-labs/tiktoken` Crate.** +~300 LoC für Chat-Overhead-Rules + Model-Mapping. Akzeptabel weil der Nutzen (1 M weekly DL bedient) hoch ist — aber API-Surface wird breit. Mitigation: `encodeChat` etc. in eigene Datei `src/chat.rs`, Tests getrennt
  2. **Model-Overhead-Rules-Drift:** OpenAI addiert neue Modelle. `gpt-tokenizer` updatet seine Mappings in Minor-Releases. Wir müssen nachziehen → evtl. Quartal-Review als Standing-Task
  3. **`isWithinTokenLimit`-Early-Exit-Implementierung:** `tiktoken-rs` hat keine native Early-Exit-API. Wir müssen den Encoder-Loop manuell mit Counter wrappen. Parität-Test pflichtig, dass wir nicht weiter tokenizen als nötig (sonst wird die Fast-Path-Behauptung falsch)
  4. **Generator-API-Gap:** Nutzer, die auf `encodeGenerator` angewiesen sind (Streaming-LLM-Decoder-UIs), haben keinen 1:1-Pfad. Migration-Doc pflicht. Vermutlich <5 % der User — akzeptabel
  5. **Pricing-Daten-Auslagerung:** `gpt-tokenizer`-User die `estimateCost()` nutzen müssen eigene Pricing-Logik halten. Migration-Beispiel im README: ~10 LoC. Kein Blocker
  6. **Zwei-Wege-Positionierung:** README muss klarstellen dass das Crate sowohl `tiktoken`- als auch `gpt-tokenizer`-User bedient. Speedup-Zahlen pro Baseline ausweisen, nicht mitteln

## If NO-GO — BACKLOG entry

N/A — GO empfohlen als API-Erweiterung von `@amigo-labs/tiktoken`, nicht als separates Crate.

## Phase-B Messung (2026-04-19, linux-x64, Node v22)

Vorhersage war falsch. `gpt-tokenizer` benutzt **nicht** dasselbe Performance-Profil wie `js-tiktoken`. Gemessen gegen `@amigo-labs/tiktoken` (gleiche Binary wie der tiktoken-Perf-Review), `cl100k_base`:

| Szenario | @amigo-labs/tiktoken | gpt-tokenizer | Verhältnis |
|---|---:|---:|---:|
| encode 10 B (small) | 164 256 hz | **586 445 hz** | 0,28× (3,57× langsamer) |
| encode ~2 KB (medium) | 5 999 hz | **14 855 hz** | 0,40× (2,48× langsamer) |
| encode ~90 KB (large) | 126 hz | **269 hz** | 0,47× (2,13× langsamer) |
| 100 × 10 B (RAG batch) | 1 471 hz | **4 364 hz** | 0,34× (2,97× langsamer) |

**Wir verlieren an jedem Messpunkt.** Der predicted Green (2,8× schneller) war auf Basis des `js-tiktoken`-Benchmarks geschätzt. `gpt-tokenizer` ist aber **8-9× schneller als `js-tiktoken`** — dieselbe Messung gegen `js-tiktoken` hätte uns Green gegeben.

**Warum gpt-tokenizer so viel schneller ist als js-tiktoken:**
- **LRU-Merge-Cache** (explizit dokumentiertes Feature). Wiederholte Bigram-Paare innerhalb eines einzigen `encode()`-Calls werden aus Cache bedient statt neu berechnet. Bei natural-language-Texten mit redundanten Wort-Paaren ist der Hit-Rate sehr hoch.
- **V8-optimierter Hot-Path.** gpt-tokenizer's Autor (niieani) hat den BPE-Merge-Loop bewusst für V8's JIT geschrieben: monomorphe Objekte, keine Polymorphie, stabile `Map`-Shapes.
- **Kein FFI.** Selbst unsere 109 ns NAPI-Floor zahlt pro Call; gpt-tokenizer hat 0 ns Floor.

**Warum unser Native-Rust nicht hilft:**
- `tiktoken-rs` hat keinen LRU-Merge-Cache. Der BPE-Merge-Loop läuft O(n²) über die Chunks statt mit Cache-amortisiert.
- V8's JIT ist für BPE-Lookups kompetitiv mit Rust's `rustc_hash` — die Cache-Locality-Vorteile von Rust werden durch den Cache-Miss-Penalty aufgefressen
- Wir sind weder gegen C++-Bindings (argon2-Pattern) noch gegen Text-Processing-Spezialisten (sanitize-html-Pattern) angetreten, sondern gegen einen **handoptimierten pure-JS-Konkurrenten** mit Domain-spezifischer Caching-Strategie. Das ist ein ganz anderes Rennen.

**Endklassifikation: 🔴 Red gegen gpt-tokenizer** — ohne Optimierung nicht einholbar.

**Was wir trotzdem shippen:**
- `encodeChat` / `countChatCompletionTokens` / `isWithinTokenLimit` als Sub-Surface des `@amigo-labs/tiktoken`-Crates — konsistente API, aber primär für die `tiktoken` npm-User (die diese API auch vermissen) relevant, nicht als Migration für gpt-tokenizer-Nutzer
- **README-Text:** expliziter Hinweis "nicht schneller als gpt-tokenizer" — keine falschen Versprechen

**Phase-C-Option für zukünftige Review:**
- **C.6 Algorithm-Swap:** LRU-Merge-Cache in `tiktoken-rs` upstream einbringen (PR an zurawiki/tiktoken-rs). Realistischer 1,5-2× Gewinn, nähert uns an gpt-tokenizer an, erreicht es aber vermutlich nicht (FFI-Floor bleibt)
- **Re-Review in 6 Monaten** falls `tiktoken-rs` Caching aufnimmt oder gpt-tokenizer strukturell langsamer wird

**BACKLOG-Empfehlung:** Eintrag aus "Under investigation — Predicted Green" entfernen und in "Ported then deprecated — measured Red/Black" verlagern — Unterkategorie "konkurriert mit über-optimiertem pure-JS". Sorgt dafür dass künftige Candidate-Scans den Post-Mortem lesen bevor sie über einen eigenen gpt-tokenizer-Port nachdenken.
