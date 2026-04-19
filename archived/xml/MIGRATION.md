# Migration — `sax` → `@amigo-labs/xml`

`@amigo-labs/xml` provides a sax.js-style event parser backed by
[`quick-xml`](https://crates.io/crates/quick-xml).

## Summary

- **Well-formed XML**: event stream parity (type + name + payload order) with
  sax.js for the core event set (`onopentag`, `onclosetag`, `ontext`, `oncdata`,
  `oncomment`, `onprocessinginstruction`, `ondoctype`, `onerror`, `onend`).
- **Malformed XML**: quick-xml is stricter than sax.js' non-strict mode. Recovery
  behaviour is known to differ and is catalogued in `__parity__/divergences.md`.
- **Streaming**: we use a *collect-then-emit* model — Rust parses the full buffer
  and the JS wrapper then dispatches to callbacks. `parser.write()` buffers the
  chunk; events arrive during `parser.close()`. This is fast for any document
  that fits in memory but not true-streaming.

## API mapping

| sax                                  | amigo                                |
|:-------------------------------------|:-------------------------------------|
| `sax.parser(strict, opts)`           | `parser(strict, opts)`               |
| `parser.onopentag = (tag) => …`      | same                                 |
| `parser.onclosetag = (name) => …`    | same                                 |
| `parser.ontext = (text) => …`        | same                                 |
| `parser.oncdata = (text) => …`       | same                                 |
| `parser.oncomment = (text) => …`     | same                                 |
| `parser.onerror = (err) => …`        | same                                 |
| `parser.onend = () => …`             | same                                 |
| `parser.write(chunk).close()`        | same                                 |

## Unsupported in v1

- **`sax.createStream`**: we do not implement a Node stream. Collect into a
  buffer and call `parser`. For true-streaming on multi-GB documents, stay on
  sax.js.
- **Normalise / lowercase / XML-namespace options**: element names are passed
  through unchanged. Namespace-aware parsing can be layered on top.
- **Custom parser options** (`position`, `strictEntities`, …): not exposed.

## Divergences

See `__parity__/divergences.md` after running the parity suite.
