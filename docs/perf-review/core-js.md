# Candidate review: `core-js`

> **Status:** NO-GO (don't touch) · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-21

## Verdict

`core-js` is a **polyfill library for JavaScript standards** (ECMAScript, Web APIs). It ships JS implementations of `Promise`, `Array.prototype.flat`, `Object.fromEntries`, `String.prototype.replaceAll`, `globalThis` and friends for old browsers / Node versions. That is **structurally not Rust-portable**:

1. Polyfills are by definition **JavaScript code** that runs inside the JS runtime — there is no FFI boundary to put on the hot path.
2. Modern Node.js (18+) has every one of these APIs natively. core-js is only needed for old browser bundles or legacy environments.
3. The use case is browser shimming. We are Node-only.

In addition: the core-js maintainer (Denis Pushkarev) was caught up in a legal case in 2023 and the library is financially under-resourced. But that is not the rejection reason — the rejection reason is that polyfills **don't structurally fit Rust**.

## JS package

- **npm:** [`core-js`](https://www.npmjs.com/package/core-js)
- **Downloads:** ~60M/week (transitive through every babel-compiled bundle)

## Rust replacement

Not applicable. Polyfills are runtime shims for JS standards. Rust cannot replace the **concept**.

## BACKLOG check

Entry in `BACKLOG.md` → "Deprecated / superseded": "Don't touch." Review confirms.

## Classification reasoning

1. **Shape mismatch.** Polyfills extend the JS runtime surface. That's not a compute problem, not an FFI problem — it's "this Node/browser version doesn't have feature X, core-js installs it via prototype patching".
2. **Modern Node makes it obsolete.** Node 18+ has every polyfill target natively.
3. **Browser-only use case.** We are Node. Zero overlap.

## If NO-GO — BACKLOG entry

Archived 2026-04-21. Full review: `docs/perf-review/core-js.md`.
