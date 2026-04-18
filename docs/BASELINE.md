# FFI-Overhead-Baseline

> Was kostet ein `@amigo-labs/*`-Call, bevor irgendeine eigentliche
> Arbeit passiert? Diese Zahlen sind der Referenzwert für jede andere
> Perf-Diskussion in diesem Repo. Ein Package das pro Call weniger
> echtes Work macht als diese Tabelle zeigt, kann die Alternative in JS
> strukturell nicht schlagen — egal wie schnell der Rust-Code selbst
> ist.

## Messaufbau

- Crate: `crates/_ffi-bench/` (nicht publiziert, `publish = false`)
- Harness: `vitest bench` (`npm run bench` im Crate)
- Release-Profil: `lto = true, codegen-units = 1, strip = "symbols", panic = "abort"`
- Node: v22.22.2 auf linux/x64 (glibc)

Alle fünf Primitive machen pro Call **keine** eigentliche Arbeit — sie
messen nur, was die N-API-Grenze an Fixkosten produziert.

## Messung

| Primitive | Ops/s | Per-Call | Interpretation |
|---|---:|---:|---|
| `noop()` | 9,15 M | **109 ns** | Der **harte Floor**. Jeder NAPI-Call zahlt das, Punkt. |
| `echoString(s) → String`, 10 B | 4,28 M | ~234 ns | +125 ns: zwei Mini-UTF-16/UTF-8-Konvertierungen. |
| `echoString` 1 KB | 1,28 M | ~780 ns | +670 ns ≈ 0,6 ns/byte Mehrkosten. |
| `echoString` 100 KB | 28,8 k | ~34,7 µs | ~0,35 ns/byte, skaliert praktisch linear. |
| `echoBuffer(b) → Buffer`, 1 KB | 5,56 M | ~180 ns | Nur +70 ns auf noop. |
| `echoBuffer` 100 KB | 5,75 M | ~174 ns | **Flat**. |
| `echoBuffer` 10 MB | 5,58 M | ~179 ns | **Flat auch bei 10 MB** — Buffer ist eine V8-Handle, kein memcpy. |
| `sumArray(xs: Vec<u32>)`, 10 Elemente | 1,44 M | ~694 ns | ~58 ns pro u32 oben auf den Fixkosten. |
| `sumArray` 1000 Elemente | 23,0 k | ~43,4 µs | **~43 ns pro u32** für Array-Marshalling. |
| `sumArray` 100 000 Elemente | 233 | ~4,29 ms | ~43 ns pro u32 — skaliert linear. |

## Was das heißt

### 1. Der Floor ist 109 ns

Für jedes Package im Repo gilt: **eine Rust-Funktion, die gerufen und
ein Ergebnis zurückgibt, kostet mindestens 109 ns**. Wenn die JS-
Alternative für denselben Input < 109 ns braucht — zum Beispiel weil
sie nur auf einem vorberechneten Buffer arbeitet — hat Rust keine
Chance. Bei `nanoid` war genau das der Befund: nanoid@5 braucht ~260
ns pro Call; ein Rust-Binding kostete ~1500 ns (siehe Phase B unten
für die Messung). Deswegen wurde `nanoid` auf pure-JS umgestellt.

### 2. Strings kosten je 100 KB etwa 35 µs

Jedes `fn foo(s: String) -> String` zahlt an beiden Enden der FFI die
UTF-16 ↔ UTF-8-Konvertierung. Bei großen Texten frisst das genug
Zeit, dass jeder Algorithmus der weniger als ~0,5 ns/byte echten
Compute macht, vom Konvertieren selbst überholt wird. Beobachtung:
`encoding`'s UTF-8-encode-10MB war vor dem Fix 2,1× langsamer als
`iconv-lite`, weil wir 10 MB zweimal durch den FFI-Konvertierer
schickten (Input + Output) und noch einen `.into_owned()` obendrauf.

**Faustregel:** Wenn der Rust-Code pro Byte weniger macht als ~1 ns
echten Compute, entweder
- den String-Input durch einen `Buffer`-Input ersetzen (Zero-Copy,
  Caller hält die Bytes), oder
- das Package in pure JS neu schreiben (wie `nanoid`), oder
- erst gar nicht portieren.

### 3. Buffer ist essentiell flat — das ist die schnelle Lane

`echoBuffer` ist **flach auf ~180 ns von 1 KB bis 10 MB**. Das ist der
entscheidende Unterschied: N-API-Buffer sind V8-Handles, die beim
Crossing nur eine Referenz hin und her reichen — keine Kopie. **10 MB
kosten exakt so viel wie 1 KB**: 180 ns.

Konsequenz für jedes neue Package: **Bytes-in-Bytes-out ist immer der
billigste Pfad.** Wenn der Output eines Algorithmus ein Binärblob ist
(Hash, komprimierte Daten, Bildpixel, UTF-8-Bytes), zurückgeben als
`Buffer`, niemals als `String` oder `Vec<u8>`.

### 4. `Vec<T>`-Arrays sind teuer — 43 ns pro Element

`sumArray(Vec<u32>)` kostet ~43 ns pro Element. Ein Array von 1000
u32 frisst 43 µs an reinem Marshalling — **das gleiche Datenvolumen
als Buffer reingereicht kostet 180 ns**. Faktor **240× teurer**.

Konsequenz: wenn eine Package-Funktion eine Liste von Zahlen oder
Bytes verarbeitet, soll sie `Buffer` bzw. `Uint8Array` annehmen, nie
`Vec<T>` von Primitives. Für u16/u32/f64 entsprechend `TypedArray`.

Beispiel aus dem Repo: `xxhash batch 1000 × 64 bytes` war 4,8 bis 5,7×
langsamer als xxhash-wasm. Vermutung (zu verifizieren): Die Batch-API
gibt Hashes als `Vec<BigInt>` zurück. Das sind 1000 BigInt-
Konstruktionen + Array-Marshalling = ein großer Teil der Laufzeit. Ein
zurückgegebener `Buffer` (1000 × 8 Bytes = 8 KB) wäre ~180 ns
konstant.

### 5. Was kriegt man für diese Fixkosten "zurück"?

Damit ein Rust-Port sich lohnt, muss die Differenz zwischen
**(Rust-Work + FFI-Overhead)** und **(JS-Work)** signifikant werden.
Daumenregel:

- JS-Work < 1 µs pro Call → Rust-Port lohnt sich nur mit Batch-API
  oder wenn der Rust-Algorithmus dramatisch (10×+) schneller ist.
- JS-Work 1–10 µs → 2× Speedup realistisch, wenn Rust-Algorithmus
  messbar schneller ist und die FFI keine Vec-Marshalling-Falle hat.
- JS-Work > 10 µs → FFI-Overhead unter 10 %, voller Rust-Gewinn
  geht durch.

Diese Zahlen hängen an deiner Hardware + Node-Version, aber die
Größenordnungen bleiben stabil. Aktualisieren, wenn sich die Toolchain
ändert (Node-Major-Bump, V8-Major-Bump, napi-rs-Major-Bump).

## Reproducing

```bash
cd /home/user/amigo-native
# Build the bench binary (only needed once per toolchain change)
cd crates/_ffi-bench && npx napi build --platform --release
# Run the benchmarks
npm run bench
```
