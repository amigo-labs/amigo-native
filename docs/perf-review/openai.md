# Candidate review: `openai` / `@anthropic-ai/sdk` / `cohere-ai`

> **Status:** NO-GO · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-21

## Verdict

All three packages are **HTTP clients** — they serialise JSON, send requests to REST APIs, deserialise streaming responses. **Zero compute surface outside I/O.** The hot path is `fetch` / `https.request` → network → parse JSON → callback / stream. Network latency dominates (50 ms – several seconds) by orders of magnitude over any FFI overhead. A Rust port might save 10–50 µs of JSON-parse time on a 500 ms network round-trip = **0.01 % gain**. A perfect Black shape.

## JS package

- **npm:**
  - [`openai`](https://www.npmjs.com/package/openai) (~20M/week)
  - [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) (~3M/week)
  - [`cohere-ai`](https://www.npmjs.com/package/cohere-ai) (~200k/week)
- **Downloads:** ~30M/week combined (BACKLOG figure confirmed)
- **Exports / API surface:**
  - All three follow a **resource-client pattern**: `client.chat.completions.create({...})`, `client.messages.create({...})`, `client.embeddings.create({...})`
  - Streaming variant with async iterators: `for await (const chunk of stream)`
  - Retries, rate-limiting, error normalisation
  - Typed responses via TypeScript-generated types
- **Typical input:** Request object (model name, messages array, params). One JSON serialisation per request.
- **Typical output:** Response object (content, token usage, metadata). One JSON parse per response (or per stream chunk).
- **Realistic median use case:** **LLM request pattern** — an app server makes N chat/completion calls per request, each call is 200 ms – 30 s of network I/O. Streaming variant: chunks every ~50 ms, 10–1000 chunks per response.

## Rust replacement

- **Candidate crate(s):**
  - `async-openai`, `anthropic-sdk-rust`, `cohere-rust` — exist, we'd be re-wrapping them
  - Or directly `reqwest` + hand-rolled typed request/response structs — trivial, 500–1000 LOC per provider
- **Maintenance / license:** Doesn't matter — no measurable gain
- **Known gotchas / divergences:** API-spec updates per provider: OpenAI ships API changes every 2–4 weeks, Anthropic similarly. A drop-in port would have to chase them constantly. The maintenance tail is the actual problem.

## BACKLOG check

Existing entry in `BACKLOG.md` → "Ruled out — AI-category": "HTTP + JSON clients — zero compute surface, pure I/O." Review formalises and archives.

Boundary:
- vs. `docs/perf-review/tough-cookie.md` (NO-GO, parity too expensive): HTTP-adjacent, but tough-cookie has **stateful jar semantics** with compute. openai/anthropic are pure wire-protocol.
- vs. `request` (deprecated npm — formally archived): HTTP client, same I/O dominance.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Zero in the Rust sense.** What "happens" is: JSON.stringify (~10–50 µs for a ~10 KB payload), HTTPS request open (~50–500 ms TLS handshake first, cached afterwards), network RTT (~50–30 000 ms), JSON.parse (~20–100 µs per response). |
| Input size distribution | Request body 1–50 KB. |
| Output size distribution | Response body 1–500 KB (or unbounded in streaming). |
| Reusable setup (stateful potential) | HTTP connection-pool reuse is standard, both libs already do it. No Rust-specific improvement. |
| Batch usage realism | OpenAI has a Batch API (separate REST endpoint, `batches.create`). That's a network feature, not a client feature. |
| FFI-share estimate vs. Rust work | Irrelevant — the "Rust work" is microsecond-scale JSON ops on second-scale network latency. 99.99 % I/O time. |

## Classification reasoning

1. **Network latency dominates.** Even the fastest LLM-provider call (OpenAI GPT-4o-mini, simple prompt) is 200–500 ms end-to-end. A Rust port that speeds up JSON parsing by 50 µs = 0.01 % gain, unmeasurable.

2. **No compute surface.** JSON.stringify/parse is V8-native (extremely fast on small payloads). `simd-json` in Rust delivers <100 µs on 10 KB payloads. Irrelevant against the network.

3. **The maintenance tail is free-but-expensive.** The OpenAI API added `tools`, `parallel_tool_calls`, `reasoning_effort`, `response_format`, `service_tier` and friends in short order. Anthropic adds `cache_control`, `thinking`, `system`-array variants. Our port would have to chase or users would lose features. Effort with no gain.

4. **TypeScript types are the primary value.** The SDK libs ship typed API surfaces. We would have to do the same, but that lives on the TypeScript side — no Rust help available.

**Shape matching:**
- 🔁 Like `request` / `node-fetch` equivalents (pure HTTP I/O, no compute)
- 🔁 Like `langchain` (spec-driven parity surface)
- ❌ Not like `@amigo-labs/jwt` (which has real crypto compute)

**Benchmark-gap flag:** Absurd by construction — the bench would measure network latency.

## If NO-GO — BACKLOG entry

Archived 2026-04-21. Full review: `docs/perf-review/openai.md`. Applies analogously to all HTTP-client SDKs (Anthropic, Cohere, Mistral, Gemini, etc.) and to network-I/O packages in general.
