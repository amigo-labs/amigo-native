# Candidate review: `jsdom`

> **Status:** NO-GO (permanent) · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-19

## Verdict

`jsdom` ist eine komplette Browser-DOM + Fetch + XHR + Worker + Canvas + CSSOM-Implementierung in JS. Kein Rust-Crate existiert dafür, und die Oberfläche ist strukturell unvereinbar mit NAPI-Klassen: alles ist Object-Graph-Traversal mit JS-Callback-Semantik.

## JS package

- **npm:** `jsdom`
- **Downloads:** ~76M/Woche
- **Exports / API surface:** `JSDOM`, `window`, `document`, vollständige DOM-Level-4 + HTML-Spec-Surface, `ResourceLoader`, `VirtualConsole`, teilweise Web-APIs (Fetch, XHR, Canvas-2D via `canvas`-Optional, Web-Workers-Stub)
- **Typical input:** HTML-Dokument + optional Resource-Loader
- **Typical output:** `window`/`document`-Objekt mit vollem DOM-API-Zugriff
- **Realistic median use-case:** Test-Environment (`vitest`/`jest` mit `jsdom`), SSR-Hilfe für Libraries, Scraping mit JS-Execution

## Rust replacement

- **Candidate crate(s):** keine. `html5ever` parst, aber kein Rust-Crate implementiert `window`, Event-Loop, DOM-Mutations-APIs, CSSOM, Computed-Styles
- **Maintenance / license:** n/a
- **Known gotchas / divergences:** `jsdom` braucht JS-Engine (V8) für Script-Execution — selbst wenn DOM in Rust wäre, müsste alles zurück nach V8

## BACKLOG check

BACKLOG: *Scope too large* — bestätigt, Klassifikation hochgestuft auf Black (strukturell inkompatibel).

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | Jedes Attribut, jeder Selector, jede Event-Dispatch = FFI-Kreuzung |
| Input size distribution | Irrelevant — Shape ist fundamental inkompatibel |
| Output size distribution | DOM-Tree mit zehntausenden Properties |
| Reusable setup (stateful potential) | Hoch, aber der Caller-Code ruft `document.querySelector` → `.innerHTML = …` in Hot-Loops |
| Batch-usage realism | Null |
| FFI-share estimate vs. Rust work | 100% FFI für typische Test-Workloads |

## Classification reasoning

`jsdom`s Nutzer rufen `document.querySelector('div').textContent = 'x'` — das sind drei Property-Accesses, eine Setter-Invocation, ein DOM-Mutation-Observer-Callback. Jeder einzelne dieser Schritte wäre eine FFI-Kreuzung. Selbst wenn der gesamte DOM-Core in Rust wäre, würde jeder Test-Case tausende FFI-Kreuzungen pro Millisekunde auslösen. Das ist das Lookup-Workload-Black-Szenario aus der Klassifikationstabelle. Hinzu kommt: Script-Execution (ein großer Teil von `jsdom`) braucht V8; das kann Rust nicht leisten. Permanenter NO-GO.

## If NO-GO — BACKLOG entry

```markdown
- **jsdom** (76M). Browser-API surface is gigantic AND its usage shape is pure lookup/mutation workload on an object graph — the Black-classification anti-shape. No amount of Rust DOM implementation can outperform V8 on `element.textContent = x`. Permanent NO-GO.
```

Section in `BACKLOG.md`: **Scope too large**
