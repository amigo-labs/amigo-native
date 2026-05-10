# @amigo-labs/tiktoken — archived

> 🗄️ **Archived 2026-05-10.** Source removed from the tree after the
> re-review and post-mortem landed.

The package delivered a real **2.2× – 23.4×** win against the named
upstream replacements (`tiktoken` WASM, `js-tiktoken`), but lost
**0.27× – 0.32×** at every measured size against `gpt-tokenizer` — the
realistic-median competitor for OpenAI BPE tokenization on Node.js in
2026. The portfolio thesis ("always faster than the JS alternative on
realistic inputs") cannot be defended when a faster JS alternative
ships under a popular name. See
[post-mortem](../../docs/post-mortems/tiktoken.md) and
[perf-review](../../docs/perf-review/tiktoken.md) for the numbers.

**Migration:** `npm install gpt-tokenizer`. The upstream API differs
slightly (function-style rather than encoder-class-style); the post-mortem
has the swap recipe.

**Source history:** last full tree at commit `fa68ce5`
(`chore: release main`). The npm package `@amigo-labs/tiktoken` remains
at its last deprecated release; nothing new ships from this tree.
