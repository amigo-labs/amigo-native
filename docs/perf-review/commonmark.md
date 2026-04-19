# Candidate review: `commonmark`

> **Status:** GO (als neues Paket, kein Drop-in für `marked`) · **Predicted:** 🟢 Green · **Reviewed:** 2026-04-19

## Verdict

`pulldown-cmark` ist ein Lehrbuch-Green-Shape: bytes-in / bytes-out, substantielle Compute-Arbeit pro Byte, kein Object-Traversal, kein Callback-Boundary-Problem. Als *neues* Paket mit ehrlicher Positionierung (CommonMark+GFM spec-strict, nicht `marked`-kompatibel) umgeht es die Parity-Falle, die `marked` selbst blockiert.

## JS package

- **npm:** kein direkter Kandidat als Drop-in-Ziel — dieses Paket ist ein **neues Produkt**. Vergleichs-Alternativen in JS: `marked` (~30M/Woche), `markdown-it` (~25M/Woche), `commonmark.js` (~2M/Woche)
- **Downloads:** n/a (Neuling)
- **Exports / API surface:** klein gehalten — `render(md: string, opts?): string`, evtl. `parse(md) → token-array` für Streaming-/Walk-Use-Cases
- **Typical input:** Markdown-Dokument 1 KB – 1 MB
- **Typical output:** HTML-String
- **Realistic median use-case:** Site-Builder (Astro/Docusaurus-artige Tools) rendert 500–5000 Docs pro Build; CLI-README-Viewer; AI-Chat-UIs, die Markdown-Antworten serverseitig rendern

## Rust replacement

- **Candidate crate(s):** `pulldown-cmark` (primär — minimal, schnell, CommonMark-konform, GFM-Extensions via Feature-Flags), `comrak` (feature-reicher, mehr GFM-Parity mit GitHub, größerer Bundle)
- **Maintenance / license:** `pulldown-cmark` aktiv (raphlinus + Mitwirkende), MIT; `comrak` aktiv, BSD-2
- **Known gotchas / divergences:** CommonMark 0.30 spec als Baseline — wenn wir das sauber kommunizieren, ist "Divergence" kein Bug, sondern ein Feature

## BACKLOG check

Kein bestehender BACKLOG-Eintrag. `marked` ist dort als Drop-in-NO-GO geführt — dieses Paket ist explizit **kein** `marked`-Ersatz, sondern ein eigenständiges Angebot.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | Substantiell: 100 KB Markdown ~500 µs – 1 ms in `pulldown-cmark`, JS-Baseline `marked` ~5 ms → 5–10× Kopfraum |
| Input size distribution | 1 KB – 1 MB, `Buffer`-input möglich → FFI-Input-Kosten vernachlässigbar |
| Output size distribution | HTML-String ~1.5× Input-Größe; 0.35 ns/Byte FFI-Output-Kost = bei 150 KB Output ~50 µs — tolerabel |
| Reusable setup (stateful potential) | Niedrig — Options sind klein, kein teures Setup |
| Batch-usage realism | Hoch: Site-Builder rendert hunderte Docs pro Build; `renderMany(docs: string[])`-API ist sinnvoll |
| FFI-share estimate vs. Rust work | <15% bei ≥10 KB Dokumenten; bei 1 KB ~40% aber Speedup immer noch ≥2× |

## Classification reasoning

Der Shape matcht exakt `sanitize-html` und `inflate` aus dem Repo: bytes-in, substantielle Compute, bytes-out. Kein `deep-equal`-Shape (kein Object-Traversal), kein `handlebars`-Shape (keine Callbacks), kein `mime`-Shape (kein FFI-Trap). `pulldown-cmark` ist zudem ein Pull-Parser, streamt intern — Memory-Footprint ist gut.

Die einzige Bedingung für Green statt Yellow: der kleinste realistische Input muss sauber performen. Bei 1 KB Markdown ist JS-`marked` ~50 µs, `pulldown-cmark` über FFI läuft auf geschätzt ~15–20 µs — über 2×. Bei 100 KB wird es 8–10×. Der 2×-Kleinster-Input-Gate hält.

GFM-Parity mit `pulldown-cmark` ist gut: Tables, Strikethrough, Task-Lists, Footnotes, Autolinks via Feature-Flags. Das ist nicht `marked`-kompatibel, aber es ist **spec-kompatibel** — und ein spec-kompatibles CommonMark/GFM ist eine ehrliche, verteidigbare Position.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/commonmark`
- **Primary API sketch:**
  ```ts
  export interface CommonMarkOptions {
    gfm?: boolean;                // default true (tables, strike, task-lists, autolinks)
    footnotes?: boolean;          // default false
    smartPunctuation?: boolean;   // default false
    unsafeHtml?: boolean;         // default false — filter raw HTML
    headingIds?: boolean;         // default true — slugify headings
  }

  export function render(markdown: string | Buffer, opts?: CommonMarkOptions): string;

  // Batch-API für Site-Builder
  export function renderMany(docs: Array<string | Buffer>, opts?: CommonMarkOptions): string[];

  // Optional: stateful Renderer-Class für wiederholte Calls mit gleichem Opts-Set
  export class Renderer {
    constructor(opts?: CommonMarkOptions);
    render(markdown: string | Buffer): string;
  }
  ```

- **Must-have benchmark scenarios:**
  - **small**: 1 KB Markdown (typischer Blog-Absatz) vs. `marked`, `markdown-it`
  - **medium**: 50 KB (langer Blog-Post / README) vs. gleiche
  - **large**: 500 KB (Docusaurus-API-Referenz) vs. gleiche
  - **batch**: `renderMany(500 × 10KB-docs)` — Site-Build-Shape
  - **realistic median**: AI-Chat-Response-Shape, 2–5 KB mit Code-Blocks + Inline-Formatting

- **Acceptance thresholds (Green gate):**
  - ≥2× vs. `marked` bei 1 KB
  - ≥5× bei 50 KB
  - ≥8× bei 500 KB
  - `renderMany`-Overhead pro Item ≤15% vs. Einzelaufruf (sonst kein Batch-Gain)

- **Risks:**
  - **Feature-Request-Drift**: Nutzer wollen `marked`-Plugins oder `markdown-it`-Plugins portiert — klare Doku "spec-only, keine Plugin-API v1"
  - **Heading-IDs / Slug-Verhalten**: `github-slugger` ist der De-facto-Standard in JS; müssen wir entweder `slug`/`slugify` reusen (wir haben `@amigo-labs/slugify`) oder ein neues `headingSlugger` einführen
  - **HTML-Sanitizing-Interaktion**: `unsafeHtml: false` muss klar dokumentiert sein; Nutzer, die rohes HTML brauchen, werden es anschalten und dann einen XSS-Vorfall haben → README-Warnung, Link auf `@amigo-labs/sanitize-html` als empfohlene Kette
  - **GFM-Edge-Cases vs. GitHub**: `pulldown-cmark`s GFM ≈ GitHubs GFM, aber nicht byte-identisch. Für die meisten Nutzer irrelevant, für GitHub-Rendering-Klone problematisch — in README dokumentieren

## If NO-GO — BACKLOG entry

n/a — Empfehlung ist GO.
