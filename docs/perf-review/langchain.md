# Candidate review: `langchain` / `langchain-core`

> **Status:** NO-GO · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-21

## Verdict

`langchain` ist **Orchestrations-Framework**, nicht Compute-Engine. Der Wert liegt in Abstraktionen (Runnable, Chain, Agent, RetrievalQAChain, AgentExecutor, Callbacks, Memory, OutputParsers) die Benutzer-JS-Code kombinieren und über Netzwerk-I/O (LLM-Calls, Vector-DBs, Tool-APIs) orchestrieren. **Kein nennenswerter Compute lebt hier.** Alle Hot-Paths sind entweder:

1. **Netzwerk-I/O** (LLM-Provider-Calls, Vector-DB-Queries, Tool-APIs) — dominiert, wie in `docs/perf-review/openai.md`.
2. **User-Callback-Ausführung** (Agent-Tool-Auswahl, Chain-Step-Transformations) — JS-Code-Execution über die FFI-Grenze ist der `remark`/`cheerio`-Callback-Antipattern.
3. **Spec-Surface** (Runnable/Chain-Interface) ändert sich wöchentlich und wird in Python getrieben. Parity-Tail ist unbegrenzt.

## JS package

- **npm:**
  - [`langchain`](https://www.npmjs.com/package/langchain) (~2M/Woche)
  - [`@langchain/core`](https://www.npmjs.com/package/@langchain/core) (~2M/Woche, plus viele Sub-Pakete: `@langchain/openai`, `@langchain/anthropic`, `@langchain/community`, ...)
- **Downloads:** ~4M/Woche kombiniert (BACKLOG-Zahl bestätigt)
- **Exports / API surface (enorm):**
  - `Runnable` Interface mit `.invoke`, `.batch`, `.stream`, `.pipe`, `.withConfig`, `.withRetry`, `.withFallbacks`, `.bind`
  - `PromptTemplate`, `ChatPromptTemplate`, `FewShotPromptTemplate`
  - Chain-Types: `LLMChain`, `ConversationChain`, `RetrievalQAChain`, `MapReduceChain`, `StuffDocumentsChain`
  - Agents: `AgentExecutor`, `createReactAgent`, `createStructuredChatAgent`, `createToolCallingAgent`
  - `OutputParser`-Familie (String, JSON, Structured, Pydantic-equivalent, ...)
  - `Memory`-Familie (Buffer, Summary, Vector, Entity, ...)
  - `Callback`-System für Tracing/Observability
  - Plus: Integrations für ~50+ LLM-Provider, ~40+ Vector-Stores, ~50+ Tool-APIs, ~30+ Document-Loaders
- **Typical input:** User-Messages, Prompt-Variables, Documents, Tools — alles in JS-Objekt-Form
- **Typical output:** LLM-Responses, Agent-Actions, Intermediate-Steps — alles in JS-Objekt-Form
- **Realistic median use-case:** **RAG-App-Orchestration** — User-Query → Embedding-Lookup (API-Call) → Prompt-Template-Fill → LLM-Call (API-Call) → Output-Parse → Response. Oder **Agent-Loop**: LLM-Call → Tool-Call-Extract → User-Code für Tool-Execution → Zurück zu LLM. **Jede Schritt** ist entweder Netzwerk oder User-Callback.

## Rust replacement

- **Candidate crate(s):** `rig` (Rust-LLM-Framework von Playgrounds), `llm-chain` — existieren, aber **andere** API, nicht Drop-in-Parity. Keine Rust-Implementation der langchain-Python-API.
- **Maintenance / license:** Irrelevant — Drop-in-Port ist nicht möglich.
- **Known gotchas / divergences:** **Gesamte Surface** ist Divergenz-Fläche.

## BACKLOG check

Vorhandener Eintrag in `BACKLOG.md` → "Ruled out — AI-category": "Callback-graph orchestration with unbounded async surface — parity tail never ends." Review formalisiert und archiviert.

Abgrenzung:
- Gegen `docs/perf-review/remark.md` (🔴 Parity): langchain IS diese Kategorie, aber auf Prompt-Level statt Markdown-Level. Identische Lehre.
- Gegen `docs/perf-review/openai.md` (⚫ Black): langchain ruft diese HTTP-Clients intern. Ein Tier oberhalb.
- Gegen `docs/perf-review/cheerio.md` (🔴 Parity): Chain-API-Antipattern auf App-Level statt DOM-Level.
- Gegen `@langchain/textsplitters` (🟡 GO, `docs/perf-review/langchain__textsplitters.md`): sub-paket, **isolated** (keine Callbacks, keine Chains — pure Text-Transformation). Das ist der einzige Teil des langchain-Ökosystems, der portbar ist.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Null algorithmisch.** Was "passiert" ist Orchestrierung: Promise-Resolution, Object-Traversal, Template-String-Fill, Callback-Invocation. Alles V8-native-schnell. |
| Input size distribution | Variabel, aber irrelevant — kein Compute-dominierter Hot-Path. |
| Output size distribution | Variabel. |
| Reusable setup (stateful potential) | Chain-Construction könnte "compiled" werden — aber der `.invoke`-Call selbst bleibt Orchestration-over-Network. |
| Batch-usage realism | `.batch()` existiert bereits im langchain-API. Batch-Execution ist N parallele Netzwerk-Calls, nicht Rust-beschleunigbar. |
| FFI-share estimate vs. Rust work | **Nicht definierbar** — es gibt keinen "Rust Work" ohne Callback-in-JS und keinen klaren Hot-Path. |

## Classification reasoning

1. **Keine Compute-Surface.** langchain dispatcht Arbeit an andere Systeme (LLMs, Vektor-DBs, Tools). Nichts, was schneller in Rust läuft als in JS.

2. **Callback-Graph über FFI = Antipattern.** Jeder `Runnable.invoke` kann User-Code aufrufen (OutputParser, Callback, Retrieval-Filter, Memory-Load, Tool-Handler). Diese Funktionen über FFI zu reichen = unbegrenzt viele Crossings pro Chain-Execution.

3. **Spec-Surface ist instabil.** Python-langchain released alle 2–4 Tage. JS-langchain mirrors. Unser Port wäre nie bei v1 — permanent chase.

4. **Der `@langchain/textsplitters`-Cut.** Die einzige sub-isolierte Komponente des Ökosystems ist Text-Splitting (pure String-Transformation, keine Callbacks). Die haben wir separately reviewed und als GO Yellow klassifiziert. Alles andere in langchain ist entweder Netzwerk-Orchestration oder Callback-Graph.

**Shape-Matching:**
- 🔁 Wie `remark` (Plugin-Graph-Orchestration)
- 🔁 Wie `openai` / `anthropic-ai` / `cohere-ai` (wrapped I/O)
- 🔁 Wie `cheerio` (Chain-API auf anderem Level)
- ✅ Einzige Ausnahme: Text-Splitting-Sub-Modul → eigener GO-Pfad

**Benchmark-Gap-Flag:** Absurdes Concept.

## If NO-GO — BACKLOG entry

Archiviert 2026-04-21. Full review: `docs/perf-review/langchain.md`. Der portable Sub-Scope (Text-Splitters) lebt unter `docs/perf-review/langchain__textsplitters.md` als separater GO-Kandidat.
