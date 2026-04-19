# @amigo-labs/tiktoken

[![npm version](https://img.shields.io/npm/v/@amigo-labs/tiktoken)](https://www.npmjs.com/package/@amigo-labs/tiktoken)
[![npm downloads](https://img.shields.io/npm/dm/@amigo-labs/tiktoken)](https://www.npmjs.com/package/@amigo-labs/tiktoken)
[![license](https://img.shields.io/npm/l/@amigo-labs/tiktoken)](https://github.com/amigo-labs/amigo-native/blob/main/LICENSE)

Fast BPE tokenization for OpenAI models, powered by Rust via [NAPI-RS](https://napi.rs). A native Node.js binding to the [tiktoken-rs](https://crates.io/crates/tiktoken-rs) crate.

Drop-in replacement for [`tiktoken`](https://www.npmjs.com/package/tiktoken) (the WASM package) and [`js-tiktoken`](https://www.npmjs.com/package/js-tiktoken) (pure-JS). **Not** a replacement for [`gpt-tokenizer`](https://www.npmjs.com/package/gpt-tokenizer) — see [Positioning](#positioning) below.

## Installation

```bash
npm install @amigo-labs/tiktoken
```

## Usage

```ts
import { Tiktoken } from '@amigo-labs/tiktoken'

// Load an encoder by name
const enc = Tiktoken.getEncoding('cl100k_base')

// Or by model
const gpt4o = Tiktoken.encodingForModel('gpt-4o')

// Encode / decode
const tokens = enc.encode('Hello, world!')  // Uint32Array
const text = enc.decode(tokens)              // string

// Fast count without allocating the Uint32Array
const count = enc.countTokens('Hello, world!')

// Budget gating
if (!enc.isWithinTokenLimit(prompt, 4096)) throw new Error('Too long')

// RAG batch encoding — amortises NAPI calls over many chunks
const chunks = enc.encodeMany(['chunk 1', 'chunk 2', '...'])

// Chat-completion token count (ChatML framing included)
const billedTokens = gpt4o.countChatCompletionTokens(
  [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'Hi!' },
  ],
  'gpt-4o',
)
```

## Supported encodings

| Encoding | Models |
|---|---|
| `cl100k_base` | `gpt-3.5-turbo`, `gpt-4`, `text-embedding-*` |
| `o200k_base` | `gpt-4o`, `o1`, `o3`, `o4`, `gpt-5` |
| `o200k_harmony` | `gpt-oss` open-weight models |
| `p50k_base` | `text-davinci-002/003`, code models |
| `p50k_edit` | Edit models |
| `r50k_base`, `gpt2` | `gpt-3` |

Model → encoding mapping via `Tiktoken.encodingForModel('gpt-4o')` matches the upstream Python `tiktoken.encoding_for_model`.

## API

### `Tiktoken.getEncoding(name): Tiktoken`

Loads a BPE encoder by name. The underlying merge table is lazily initialised once per process and reused across all calls.

### `Tiktoken.encodingForModel(model): Tiktoken`

Resolves a model name to its encoding and loads it.

### `encode(text): Uint32Array`

Encode with all special tokens interpreted (`<|endoftext|>` etc. become their IDs). Matches `tiktoken` npm's `encode(text, "all")` and upstream Python's `encode_with_all_special_tokens`.

### `encodeOrdinary(text): Uint32Array`

Encode with special tokens treated as literal text. Matches `tiktoken` npm's `encode_ordinary`.

### `decode(tokens: Uint32Array): string`

Decode token IDs back to the original text. Returns UTF-8; throws if the token sequence doesn't produce valid UTF-8.

### `countTokens(text): number`

Same result as `encodeOrdinary(text).length` but without allocating the `Uint32Array`.

### `isWithinTokenLimit(text, limit): boolean`

Returns `countTokens(text) <= limit`. Currently performs a full encode — there's no early-exit fast path because `tiktoken-rs` doesn't expose one. Drop-in for `gpt-tokenizer`'s API of the same name.

### `encodeMany(texts): Uint32Array[]`

Batch-encode an array of texts. Amortises NAPI call overhead when encoding many small chunks (e.g. RAG document chunking).

### `encodeChat(messages, model): { tokens, count }`

Returns the concatenated content tokens plus the full ChatML-framed count. The `count` field is what OpenAI bills.

### `countChatCompletionTokens(messages, model): number`

Full ChatML token count including per-message framing and the assistant-reply priming tokens. Matches `gpt-tokenizer`'s method of the same name.

## Positioning

Benchmarks (Node 22, Linux x64, `cl100k_base`):

| Scenario | @amigo-labs/tiktoken | tiktoken (WASM) | js-tiktoken | gpt-tokenizer |
|---|---:|---:|---:|---:|
| encode 10 B | **164 k hz** | 7 k hz | 74 k hz | 586 k hz |
| encode ~2 KB | **6.0 k hz** | 1.4 k hz | 1.7 k hz | 14.9 k hz |
| encode ~90 KB | **126 hz** | 38 hz | 28 hz | 269 hz |
| encode loop 100 × 10 B | **1.47 k hz** | 67 hz | — | 4.4 k hz |

**Against `tiktoken` (WASM) and `js-tiktoken`: clear win** — 3-23× faster across all sizes. If you use either of these, switch.

**Against `gpt-tokenizer`: we lose** — 2-3× slower across the board. `gpt-tokenizer`'s LRU merge cache plus V8 JIT optimisations beat our FFI'd Rust core on this workload. If you use `gpt-tokenizer`, stay.

Two things we still offer over `gpt-tokenizer`:
- Zero runtime dependencies (gpt-tokenizer bundles pricing tables and encoding rules)
- Prebuilt binaries, no pure-JS parse step at startup

Two things we don't offer:
- Generator / streaming APIs (`encodeGenerator`, `decodeAsyncGenerator`)
- Built-in `estimateCost` (pricing drifts; compute it yourself with `countTokens()`)

## Supported Platforms

| Platform | Architecture |
| --- | --- |
| Linux | x64 (glibc), x64 (musl), arm64 |
| macOS | x64, arm64 |
| Windows | x64 |

## License

MIT
