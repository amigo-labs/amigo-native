# Candidate review: `ws`

> **Status:** NO-GO · **Predicted:** 🔴 Red (Integration) / ⚫ Black (Shape) · **Reviewed:** 2026-04-19

## Verdict

`ws` ist Socket + Protocol + Event-Emitter, tief verzahnt mit Node's `net`/`tls`. Rust-WebSocket-Crates (`tungstenite`, `fastwebsockets`) sind schnell — aber sie in Nodes libuv-Event-Loop zu fädeln ohne Performance-Regression ist eine Eigen-Framework-Aufgabe, nicht ein NAPI-Binding.

## JS package

- **npm:** `ws`
- **Downloads:** ~204M/Woche
- **Exports / API surface:** `WebSocket` (Client), `WebSocketServer`, Event-Emitter (`open`, `message`, `close`, `error`, `ping`, `pong`), Per-Message-Deflate, Fragmentation, Binary+Text-Modi
- **Typical input:** TCP-Stream → Frames → Messages; pro-Message 10 B – 1 MB
- **Typical output:** Events pro Frame/Message
- **Realistic median use-case:** WebSocket-Server mit Event-Handlern auf allen Nachrichten

## Rust replacement

- **Candidate crate(s):** `tungstenite` (sync), `tokio-tungstenite`, `fastwebsockets` (Deno-Team)
- **Maintenance / license:** aktiv, MIT/Apache
- **Known gotchas / divergences:** `ws` nutzt Nodes `net.Socket` direkt. Rust müsste entweder ein separates `tokio`-Runtime neben libuv fahren (Ressourcen-Duplication, Event-Loop-Integration) oder über NAPI auf den JS-Socket zugreifen — was jeden Frame einzeln über FFI schickt

## BACKLOG check

BACKLOG: *Scope too large* — bestätigt.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | Frame-Decode + Mask-XOR + optional Deflate; pro 1 KB Frame ~1–10 µs |
| Input size distribution | Streaming, Frames beliebig |
| Output size distribution | Event mit Payload-Buffer |
| Reusable setup (stateful potential) | Connection-State = NAPI-Class — unumgänglich |
| Batch-usage realism | Hoch im Protokoll, aber jede Message muss an JS-Handler = FFI-Callback |
| FFI-share estimate vs. Rust work | **Callback pro Message**: genau der `htmlparser2`-Shape |

## Classification reasoning

Zwei unabhängige Killer:
1. **Event-Loop-Integration**: `ws` leiht sich Nodes `net.Socket`. Rust kann nicht ohne Weiteres in diese Loop hineinlesen/-schreiben. Alternative ist eigene `tokio`-Runtime = zweiter Thread-Pool, Sync-Kosten zwischen Loops, doppelte Socket-Buffer.
2. **Message-Callback-Shape**: Das Nutzerinterface ist `ws.on('message', (data) => …)`. Jede Message = FFI-Callback. Bei einem Chat-Server mit 10K msg/s × 2 µs FFI = 20 ms/s nur für Overhead.

`fastwebsockets` gewinnt gegenüber `ws` ~3–5× im Benchmark **bei direktem Rust-Client**, weil kein FFI. Im Rust-über-NAPI-Mix würde dieser Win an der Message-Grenze verloren. Post-Mortem-Muster: C.1-Input-Type hilft nicht (Buffer ist schon Zero-Copy bei `ws`), C.4-Stateful ist schon so, C.3-Batch ist nicht drop-in-machbar.

## If NO-GO — BACKLOG entry

```markdown
- **ws** (204M). Integrating a WebSocket implementation into the NAPI event loop is hard: either run a second `tokio` runtime next to libuv (resource duplication, cross-loop sync) or callback-per-message over FFI (htmlparser2-shape — erases the win). Use native Node or Deno for WS.
```

Section in `BACKLOG.md`: **Scope too large**
