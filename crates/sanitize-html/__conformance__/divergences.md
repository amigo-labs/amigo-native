# Divergences — sanitize-html

The primary user-facing list (including Hybrid-Engine and attribute-set
details) is in [`../DIFFERENCES.md`](../DIFFERENCES.md). This file tracks
case-level divergences found by the vendored upstream test suite at
[`upstream/test.js`](./upstream/test.js).

## should not be faked out by double `<`

- **Input:** `<<img src="javascript:evil"/>foo`
- **Upstream (`sanitize-html`):** drops the malformed half and emits
  `""` — effectively collapsing the trailing content too.
- **@amigo-labs/sanitize-html:** preserves `"foo"` as text.
- **Why:** upstream parses via `htmlparser2`, whose malformed-tag
  recovery differs from our Rust tokenizer (`html5ever`'s spec-compliant
  recovery). Replicating the byte-for-byte collapse would require porting
  `htmlparser2`'s error-recovery tree.
- **Risk:** none — our output is strictly more conservative (keeps
  harmless text), not less (no script execution path).

<!--
Template for a new divergence:

## <short title>

- **Input:** `...`
- **Upstream (`sanitize-html`):** `...`
- **@amigo-labs/sanitize-html:** `...`
- **Why:** <one or two sentences>
- **Risk:** <none / low / high>
-->
