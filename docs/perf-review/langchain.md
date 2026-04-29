# Candidate review: `langchain` / `langchain-core`

> **Status:** NO-GO · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-21

## Verdict

`langchain` is an **orchestration framework**, not a compute engine. The value lies in abstractions (Runnable, Chain, Agent, RetrievalQAChain, AgentExecutor, callbacks, memory, output parsers) that combine user JS code and orchestrate it over network I/O (LLM calls, vector DBs, tool APIs). **No meaningful compute lives here.** All hot paths are either:

1. **Network I/O** (LLM provider calls, vector-DB queries, tool APIs) — dominates, as in `docs/perf-review/openai.md`.
2. **User callback execution** (agent tool selection, chain step transformations) — running JS code across the FFI boundary is the `remark` / `cheerio` callback antipattern.
3. **Spec surface** (Runnable / chain interface) changes weekly and is driven by the Python project. The parity tail is unbounded.

## JS package

- **npm:**
  - [`langchain`](https://www.npmjs.com/package/langchain) (~2M/week)
  - [`@langchain/core`](https://www.npmjs.com/package/@langchain/core) (~2M/week, plus many sub-packages: `@langchain/openai`, `@langchain/anthropic`, `@langchain/community`, ...)
- **Downloads:** ~4M/week combined (BACKLOG figure confirmed)
- **Exports / API surface (enormous):**
  - `Runnable` interface with `.invoke`, `.batch`, `.stream`, `.pipe`, `.withConfig`, `.withRetry`, `.withFallbacks`, `.bind`
  - `PromptTemplate`, `ChatPromptTemplate`, `FewShotPromptTemplate`
  - Chain types: `LLMChain`, `ConversationChain`, `RetrievalQAChain`, `MapReduceChain`, `StuffDocumentsChain`
  - Agents: `AgentExecutor`, `createReactAgent`, `createStructuredChatAgent`, `createToolCallingAgent`
  - `OutputParser` family (string, JSON, structured, Pydantic-equivalent, ...)
  - `Memory` family (buffer, summary, vector, entity, ...)
  - `Callback` system for tracing / observability
  - Plus: integrations for ~50+ LLM providers, ~40+ vector stores, ~50+ tool APIs, ~30+ document loaders
- **Typical input:** User messages, prompt variables, documents, tools — all in JS-object form
- **Typical output:** LLM responses, agent actions, intermediate steps — all in JS-object form
- **Realistic median use case:** **RAG-app orchestration** — user query → embedding lookup (API call) → prompt-template fill → LLM call (API call) → output parse → response. Or **agent loop**: LLM call → tool-call extract → user code for tool execution → back to LLM. **Every step** is either network or user callback.

## Rust replacement

- **Candidate crate(s):** `rig` (Rust LLM framework from Playgrounds), `llm-chain` — exist, but **different** API, not drop-in parity. No Rust implementation of the langchain Python API.
- **Maintenance / license:** Irrelevant — drop-in port is not possible.
- **Known gotchas / divergences:** **The entire surface** is divergence area.

## BACKLOG check

Existing entry in `BACKLOG.md` → "Ruled out — AI-category": "Callback-graph orchestration with unbounded async surface — parity tail never ends." Review formalises and archives.

Boundary:
- vs. `docs/perf-review/remark.md` (🔴 parity): langchain IS this category, but on prompt level instead of Markdown level. Identical lesson.
- vs. `docs/perf-review/openai.md` (⚫ Black): langchain calls these HTTP clients internally. One tier above.
- vs. `docs/perf-review/cheerio.md` (🔴 parity): chain-API antipattern on app level rather than DOM level.
- vs. `@langchain/textsplitters` (🟡 GO, `docs/perf-review/langchain__textsplitters.md`): sub-package, **isolated** (no callbacks, no chains — pure text transformation). It's the only part of the langchain ecosystem that is portable.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **None algorithmically.** What "happens" is orchestration: promise resolution, object traversal, template-string fill, callback invocation. All V8-native fast. |
| Input size distribution | Variable, but irrelevant — no compute-dominated hot path. |
| Output size distribution | Variable. |
| Reusable setup (stateful potential) | Chain construction could be "compiled" — but the `.invoke` call itself remains orchestration-over-network. |
| Batch usage realism | `.batch()` already exists in the langchain API. Batch execution is N parallel network calls, not Rust-accelerable. |
| FFI-share estimate vs. Rust work | **Not definable** — there is no "Rust work" without callbacks-into-JS, and no clear hot path. |

## Classification reasoning

1. **No compute surface.** langchain dispatches work to other systems (LLMs, vector DBs, tools). Nothing that runs faster in Rust than in JS.

2. **Callback graph over FFI = antipattern.** Every `Runnable.invoke` may call user code (OutputParser, callback, retrieval filter, memory load, tool handler). Routing those functions across FFI = unbounded crossings per chain execution.

3. **Spec surface is unstable.** Python langchain ships every 2–4 days. JS langchain mirrors. Our port would never reach v1 — permanent chase.

4. **The `@langchain/textsplitters` cut.** The only sub-isolated component of the ecosystem is text splitting (pure string transformation, no callbacks). We've reviewed it separately and classified it as GO Yellow. Everything else in langchain is either network orchestration or callback graph.

**Shape matching:**
- 🔁 Like `remark` (plugin-graph orchestration)
- 🔁 Like `openai` / `anthropic-ai` / `cohere-ai` (wrapped I/O)
- 🔁 Like `cheerio` (chain API on a different level)
- ✅ Sole exception: text-splitters sub-module → its own GO path

**Benchmark-gap flag:** Absurd by construction.

## If NO-GO — BACKLOG entry

Archived 2026-04-21. Full review: `docs/perf-review/langchain.md`. The portable sub-scope (text-splitters) lives under `docs/perf-review/langchain__textsplitters.md` as a separate GO candidate.
