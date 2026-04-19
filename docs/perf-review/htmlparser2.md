# Candidate review: `htmlparser2`

> **Status:** NO-GO · **Predicted:** 🔴 Red · **Reviewed:** 2026-04-19

## Verdict

`htmlparser2` ist SAX-style: der Caller übergibt Callbacks (`onopentag`, `ontext`, …). Jeder Token → Callback über FFI-Boundary. Event-getriebene Parser sind der Anti-Shape für NAPI.

## JS package

- **npm:** `htmlparser2`
- **Downloads:** ~62M/Woche
- **Exports / API surface:** `Parser` mit Callback-Handler, `DomHandler`, `DomUtils`, Streaming-API
- **Typical input:** HTML-Stream oder -Dokument, 1 KB – 5 MB
- **Typical output:** Event-Stream (SAX) oder Tree (via `DomHandler`)
- **Realistic median use-case:** Streaming-Scraper / cheerio-Backend, 100–500 KB HTML

## Rust replacement

- **Candidate crate(s):** `html5ever` (Tokenizer-Layer), `html5gum`
- **Maintenance / license:** beide aktiv, MIT/Apache
- **Known gotchas / divergences:** `htmlparser2` toleriert XML-Mode + HTML-Mode in einem Parser; kein direktes Rust-Äquivalent für XML-HTML-Dual

## BACKLOG check

BACKLOG bündelt mit `parse5` — bestätigt. Für `htmlparser2` ist der Callback-Aspekt härter als der Adapter-Aspekt bei `parse5`.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | Tokenize 100 KB ~ 1 ms in JS, Rust ~200 µs → 5× Potenzial |
| Input size distribution | Bytes-in, okay |
| Output size distribution | **Callback pro Token**: typisch ~50K Tokens bei 100 KB HTML |
| Reusable setup (stateful potential) | Parser-Instanz als Class — möglich, aber der Callback-Kost bleibt |
| Batch-usage realism | Streaming hebt batching auf — pro Chunk dieselbe FFI-Last |
| FFI-share estimate vs. Rust work | Callbacks dominieren: 50K × ~2 µs Rust→JS→Rust = 100 ms — 100× langsamer als der JS-Baseline-Parse |

## Classification reasoning

Das ist der `handlebars`-Shape verstärkt: Parser emittiert Events, Caller entscheidet. Ohne Callbacks ist `htmlparser2` nicht `htmlparser2`, sondern ein Tree-Builder — und dann sind wir zurück beim `parse5`-Shape (Tree-Materialisierung). Einzige sinnvolle API wäre: "Rust parst, tokenisiert, sammelt im Rust-State ein typisiertes Event-Array, liefert es am Ende als eine große `Buffer`/`JsArray` zurück". Das wäre eine andere API als `htmlparser2`, mit anderer Semantik (kein echter Stream), und braucht die 2×-Schwelle nur bei sehr großen Dokumenten (~MB-Bereich). Für den Median-Use-Case (cheerio auf Scrape-Responses) verpufft der Win.

## If NO-GO — BACKLOG entry

```markdown
- **htmlparser2** (62M). SAX-style callback API is the anti-shape for NAPI — ~2µs per Rust→JS→Rust callback × tens of thousands of tokens per document erases any tokenizer win. A batched "parse-and-return-token-array" API isn't `htmlparser2` anymore.
```

Section in `BACKLOG.md`: **Parity too expensive**
