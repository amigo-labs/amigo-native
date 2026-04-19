# Candidate review: `parse5`

> **Status:** NO-GO · **Predicted:** 🟡 Yellow (Perf) / 🔴 Red (Scope) · **Reviewed:** 2026-04-19

## Verdict

`html5ever` kann schnell HTML parsen — aber `parse5` ist nicht nur ein Parser, sondern ein Tree-Adapter-Framework. Parity zu `parse5-htmlparser2-tree-adapter`, `parse5-serializer`, Error-Recovery und dem WHATWG-Testsuite-Verhalten ist mehr Oberfläche als Perf-Gewinn rechtfertigt.

## JS package

- **npm:** `parse5`
- **Downloads:** ~130M/Woche
- **Exports / API surface:** `parse`, `parseFragment`, `serialize`, Tree-Adapter (default + htmlparser2-kompat), Location-Tracking, Custom Document-Types
- **Typical input:** HTML-Dokument 5 KB – 5 MB
- **Typical output:** Tree (Document/Element/TextNode) über Adapter-API
- **Realistic median use-case:** Web-Scraper parst Response (~50 KB), traversiert danach über `parse5-querystring` / cheerio

## Rust replacement

- **Candidate crate(s):** `html5ever` + `markup5ever`
- **Maintenance / license:** aktiv (Servo-Team), Apache/MIT
- **Known gotchas / divergences:** `html5ever` liefert RcDom; Tree-Traversal über NAPI-Boundary wäre pro Node eine FFI-Kreuzung (`deep-equal`-Shape). Location-Tracking anders

## BACKLOG check

BACKLOG: *Parity too expensive* (kombiniert mit `htmlparser2`) — bestätigt.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | HTML-Parse ist CPU-intensiv: 100 KB HTML ~2 ms in JS, `html5ever` ~500 µs → 4× Potenzial |
| Input size distribution | Bytes-in, `Buffer`-overload → FFI-Input billig |
| Output size distribution | **Tree-Materialisierung ist der Killer**: 100 KB HTML → ~10K Nodes → jede Node als JS-Object kostet NAPI-Calls für jedes Field |
| Reusable setup (stateful potential) | Niedrig — Parser ist stateless pro Call |
| Batch-usage realism | Niedrig (ein Dokument pro Call) |
| FFI-share estimate vs. Rust work | Output dominiert ab ~1K Nodes; 4×-Parse-Win verpufft vollständig |

## Classification reasoning

Der Parse-Schritt wäre ein klarer Win. Aber niemand parst HTML und wirft das Tree weg. Tree-Materialisierung über NAPI ist exakt der `deep-equal`-Shape: pro Node ~5–10 FFI-Kreuzungen für Tag, Attribute, Children-Array. Bei 10K Nodes = 50–100K Kreuzungen × 109 ns Floor = 5–10 ms — mehr als das JS-Baseline-Parse komplett braucht. Alternative: Tree im Rust halten, Zugriff on-demand (cheerio-Wrapper-Pattern) — aber dann ist das kein `parse5`-Drop-in. Zweiter Killer: `parse5` hat zwei Adapter-APIs (default + htmlparser2-kompat) + `serialize` + `parseFragment`; das ist ein eigenes Crate-Ökosystem, kein einzelnes Paket.

## If NO-GO — BACKLOG entry

```markdown
- **parse5** (130M). `html5ever` parses fast, but the tree materialization over NAPI (per-node property FFI) matches the `deep-equal` shape — the parse win is erased by output construction. Plus two adapter APIs + serializer + fragment parser = multiple crates, not one package.
```

Section in `BACKLOG.md`: **Parity too expensive**
