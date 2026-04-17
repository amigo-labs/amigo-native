/**
 * Deep structural equality with fast-deep-equal/es6 semantics.
 *
 * Handles: plain objects (own keys), Array, Map, Set, Date, RegExp, typed
 * arrays, plus primitives. NaN !== NaN (matches fast-deep-equal).
 */
declare function equal(a: unknown, b: unknown): boolean

declare namespace equal {
  /** JSON-safe fast-path backed by Rust. Use this only if you know both
   *  inputs are pure JSON values (no Date, RegExp, Map, Set). */
  function deepEqualJson(a: unknown, b: unknown): boolean
}

export = equal
