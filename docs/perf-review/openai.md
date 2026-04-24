# Candidate review: `openai` / `@anthropic-ai/sdk` / `cohere-ai`

> **Status:** NO-GO · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-21

## Verdict

Alle drei Pakete sind **HTTP-Clients** — sie serialisieren JSON, schicken Requests an REST-APIs, deserialisieren Streaming-Responses. **Null Compute-Surface außerhalb von I/O**. Der Hot-Path ist `fetch` / `https.request` → Netzwerk → Parse JSON → Callback/Stream. Netzwerk-Latency dominiert (50 ms – mehrere Sekunden) um Größenordnungen über jedem FFI-Overhead. Ein Rust-Port würde vielleicht 10–50 µs JSON-Parse-Zeit sparen auf 500 ms Netzwerk-Roundtrip = **0,01 % Gewinn**. Perfektes Black-Shape.

## JS package

- **npm:**
  - [`openai`](https://www.npmjs.com/package/openai) (~20M/Woche)
  - [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) (~3M/Woche)
  - [`cohere-ai`](https://www.npmjs.com/package/cohere-ai) (~200k/Woche)
- **Downloads:** ~30M/Woche kombiniert (BACKLOG-Zahl bestätigt)
- **Exports / API surface:**
  - Alle drei haben **Resource-Client-Pattern**: `client.chat.completions.create({...})`, `client.messages.create({...})`, `client.embeddings.create({...})`
  - Streaming-Variante mit async-Iterators: `for await (const chunk of stream)`
  - Retries, Rate-Limiting, Error-Normalization
  - Typed-Responses über TypeScript-generated-types
- **Typical input:** Request-Objekt (Model-Name, Messages-Array, Params). JSON-Serialisierung einmal pro Request.
- **Typical output:** Response-Objekt (Content, Token-Usage, Metadata). JSON-Parse einmal pro Response (oder pro Stream-Chunk).
- **Realistic median use-case:** **LLM-Request-Pattern** — ein App-Server macht N Chat/Completion-Calls pro Request, jeder Call ist 200 ms – 30 s Netzwerk-IO. Streaming-Variante: Chunk kommt alle ~50 ms, 10–1000 Chunks pro Response.

## Rust replacement

- **Candidate crate(s):**
  - `async-openai`, `anthropic-sdk-rust`, `cohere-rust` — existieren, würden wir re-wrappen
  - Oder direkt `reqwest` + manuell Typed-Request/Response-Structs — trivial, 500-1000 LOC pro Provider
- **Maintenance / license:** Egal — kein messbarer Gewinn
- **Known gotchas / divergences:** API-Spec-Updates pro Provider: OpenAI released alle 2–4 Wochen API-Änderungen, Anthropic ähnlich. Ein Drop-in-Port müsste laufend nachziehen. Maintenance-Tail ist das eigentliche Problem.

## BACKLOG check

Vorhandener Eintrag in `BACKLOG.md` → "Ruled out — AI-category": "HTTP + JSON clients — zero compute surface, pure I/O." Review formalisiert und archiviert.

Abgrenzung:
- Gegen `docs/perf-review/tough-cookie.md` (NO-GO, Parity too expensive): HTTP-adjacent, aber tough-cookie hat **stateful Jar-Semantik** mit Compute. openai/anthropic sind reiner Wire-Protocol.
- Gegen `request` (Deprecated npm — wurde formal abgekündigt): HTTP-Client, dieselbe I/O-dominanz.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Null im Rust-Sinn.** Was "passiert" ist: JSON-stringify (~10–50 µs für ~10 KB Payload), HTTPS-Request-Open (~50–500 ms TLS-Handshake erstmal, gecached danach), Netzwerk-RTT (~50–30 000 ms), JSON-parse (~20–100 µs pro Response). |
| Input size distribution | Request-Body 1–50 KB. |
| Output size distribution | Response-Body 1–500 KB (oder unbegrenzt im Streaming-Fall). |
| Reusable setup (stateful potential) | HTTP-Connection-Pool-Reuse ist Standard, beide Libs machen das bereits. Keine Rust-spezifische Verbesserung. |
| Batch-usage realism | OpenAI hat Batch-API (separate REST-Endpoint, `batches.create`). Das ist Netzwerk-Feature, nicht Client-Feature. |
| FFI-share estimate vs. Rust work | Irrelevant — der "Rust-Work" ist Mikrosekunden-JSON-Ops auf Sekunden-Netzwerk-Latency. 99,99 % IO-Zeit. |

## Classification reasoning

1. **Netzwerk-Latency dominiert.** Selbst der schnellste LLM-Provider-Call (OpenAI GPT-4o-mini, simple prompt) ist 200–500 ms End-to-End. Ein Rust-Port der JSON-Parsing um 50 µs beschleunigt = 0,01 % Gewinn, unmessbar.

2. **Keine Compute-Surface.** JSON-stringify/parse ist V8-native (extrem schnell auf kleinen Payloads). `simd-json` in Rust bringt auf 10 KB Payload <100 µs Gewinn. Irrelevant vor Netzwerk.

3. **Maintenance-Tail ist kostenlos-teuer.** OpenAI API Added `tools`, `parallel_tool_calls`, `reasoning_effort`, `response_format`, `service_tier`, etc. in kurzer Abfolge. Anthropic fügt `cache_control`, `thinking`, `system`-Array-Variants hinzu. Unser Port müsste laufend nachziehen oder User würden auf Features verzichten. Aufwand ohne Gewinn.

4. **TypeScript-Types sind der primäre Value.** Die SDK-Libs liefern Typed-API-Surfaces. Wir würden das auch tun müssen, aber das geht TypeScript-seitig — keine Rust-Hilfe.

**Shape-Matching:**
- 🔁 Wie `request` / `node-fetch`-Äquivalent (pure HTTP-I/O, no compute)
- 🔁 Wie `langchain` (spec-driven parity surface)
- ❌ Nicht wie `@amigo-labs/jwt` (das hat echten Crypto-Compute)

**Benchmark-Gap-Flag:** Absurdes Concept — der Bench würde Netzwerk-Latency messen.

## If NO-GO — BACKLOG entry

Archiviert 2026-04-21. Full review: `docs/perf-review/openai.md`. Gilt analog für alle HTTP-Client-SDKs (Anthropic, Cohere, Mistral, Gemini, etc.) und allgemein für Netzwerk-I/O-Pakete.
