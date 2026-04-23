# Candidate review: `ws`

> **Status:** NO-GO · **Predicted:** 🔴 Red (integration) / ⚫ Black (shape) · **Reviewed:** 2026-04-19

## Verdict

`ws` is socket + protocol + event emitter, deeply intertwined with Node's `net`/`tls`. Rust WebSocket crates (`tungstenite`, `fastwebsockets`) are fast — but threading them into Node's libuv event loop without a performance regression is a bespoke-framework task, not a NAPI binding.

## JS package

- **npm:** `ws`
- **Downloads:** ~204M/week
- **Exports / API surface:** `WebSocket` (client), `WebSocketServer`, event emitter (`open`, `message`, `close`, `error`, `ping`, `pong`), per-message deflate, fragmentation, binary+text modes
- **Typical input:** TCP stream → frames → messages; per message 10 B – 1 MB
- **Typical output:** events per frame/message
- **Realistic median use-case:** WebSocket server with event handlers on all messages

## Rust replacement

- **Candidate crate(s):** `tungstenite` (sync), `tokio-tungstenite`, `fastwebsockets` (Deno team)
- **Maintenance / license:** active, MIT/Apache
- **Known gotchas / divergences:** `ws` uses Node's `net.Socket` directly. Rust would have to either run a separate `tokio` runtime alongside libuv (resource duplication, event-loop integration) or access the JS socket via NAPI — which sends every frame individually across the FFI

## BACKLOG check

BACKLOG: *Scope too large* — confirmed.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | Frame decode + mask XOR + optional deflate; per 1 KB frame ~1–10 µs |
| Input size distribution | Streaming, frames arbitrary |
| Output size distribution | Event with payload buffer |
| Reusable setup (stateful potential) | Connection state = NAPI class — unavoidable |
| Batch-usage realism | High in the protocol, but every message has to go to the JS handler = FFI callback |
| FFI-share estimate vs. Rust work | **Callback per message**: exactly the `htmlparser2` shape |

## Classification reasoning

Two independent killers:
1. **Event-loop integration**: `ws` borrows Node's `net.Socket`. Rust can't easily read from/write to this loop. The alternative is its own `tokio` runtime = a second thread pool, sync cost between loops, doubled socket buffers.
2. **Message-callback shape**: the user interface is `ws.on('message', (data) => …)`. Every message = FFI callback. On a chat server with 10K msg/s × 2 µs FFI = 20 ms/s of pure overhead.

`fastwebsockets` wins ~3–5× over `ws` in benchmarks **as a direct Rust client**, because no FFI. In a Rust-over-NAPI mix, that win would be lost at the message boundary. Post-mortem pattern: C.1 input-type doesn't help (Buffer is already zero-copy with `ws`), C.4 stateful is already how it works, C.3 batch is not feasible as a drop-in.

## If NO-GO — BACKLOG entry

```markdown
- **ws** (204M). Integrating a WebSocket implementation into the NAPI event loop is hard: either run a second `tokio` runtime next to libuv (resource duplication, cross-loop sync) or callback-per-message over FFI (htmlparser2-shape — erases the win). Use native Node or Deno for WS.
```

Section in `BACKLOG.md`: **Scope too large**
