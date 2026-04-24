# Candidate review: `core-js`

> **Status:** NO-GO (don't touch) · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-21

## Verdict

`core-js` ist eine **Polyfill-Library für JavaScript-Standards** (ECMAScript, Web APIs). Sie liefert JS-Implementierungen von `Promise`, `Array.prototype.flat`, `Object.fromEntries`, `String.prototype.replaceAll`, `globalThis`, etc. für alte Browser/Node-Versionen. Das ist **strukturell nicht Rust-portbar**:

1. Polyfills sind per Definition **JavaScript-Code** der in der JS-Runtime läuft — da sind keine FFI-Grenzen relevant.
2. Moderne Node.js (18+) hat alle diese APIs nativ. core-js ist nur für alte Browser-Bundles oder Legacy-Environments nötig.
3. Der Use-Case ist Browser-shimming. Wir sind Node-only.

Außerdem: Der core-js-Maintainer (Denis Pushkarev) war 2023 in einem Rechtsfall und die Library ist finanziell unterbesetzt. Aber das ist nicht der Ablehnungs-Grund — der Ablehnungs-Grund ist, dass Polyfills **strukturell nicht zu Rust passen**.

## JS package

- **npm:** [`core-js`](https://www.npmjs.com/package/core-js)
- **Downloads:** ~60M/Woche (transitiv durch jeden babel-compiled Bundle)

## Rust replacement

Nicht zutreffend. Polyfills sind Runtime-Shims für JS-Standards. Rust kann das **Konzept** nicht ersetzen.

## BACKLOG check

Eintrag in `BACKLOG.md` → "Deprecated / superseded": "Don't touch." Review bestätigt.

## Classification reasoning

1. **Shape-Mismatch.** Polyfills ergänzen die JS-Runtime-Surface. Das ist kein Compute-Problem, kein FFI-Problem — es ist "diese Node/Browser-Version hat Feature X nicht, core-js installiert es via Prototype-Patching".
2. **Modern-Node macht es obsolet.** Node 18+ hat alle Polyfill-Targets nativ.
3. **Browser-only Use-Case.** Wir sind Node. Zero Überschneidung.

## If NO-GO — BACKLOG entry

Archiviert 2026-04-21. Full review: `docs/perf-review/core-js.md`.
