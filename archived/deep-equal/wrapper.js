'use strict'

const native = require('./index.js')

const hasOwn = Object.prototype.hasOwnProperty

// JS-side deep equal covering the Date/RegExp/Map/Set/typed-array cases that
// JSON can't represent. Semantics match fast-deep-equal/es6.
function equal(a, b) {
  if (a === b) return true

  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (a.constructor !== b.constructor) return false

    if (Array.isArray(a)) {
      const n = a.length
      if (n !== b.length) return false
      for (let i = 0; i < n; i++) if (!equal(a[i], b[i])) return false
      return true
    }

    if (a instanceof Map) {
      if (a.size !== b.size) return false
      for (const [k, v] of a) {
        if (!b.has(k) || !equal(v, b.get(k))) return false
      }
      return true
    }

    if (a instanceof Set) {
      if (a.size !== b.size) return false
      for (const v of a) if (!b.has(v)) return false
      return true
    }

    if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
      if (a.length !== b.length) return false
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
      return true
    }

    if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags
    if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf()
    if (a.toString !== Object.prototype.toString) return a.toString() === b.toString()

    const keys = Object.keys(a)
    const n = keys.length
    if (n !== Object.keys(b).length) return false
    for (let i = 0; i < n; i++) if (!hasOwn.call(b, keys[i])) return false
    for (let i = 0; i < n; i++) {
      const k = keys[i]
      if (!equal(a[k], b[k])) return false
    }
    return true
  }

  // Final NaN-NaN case: fast-deep-equal treats NaN === NaN as true via the
  // `a !== a && b !== b` idiom.
  // eslint-disable-next-line no-self-compare
  return a !== a && b !== b
}

module.exports = equal
module.exports.default = equal
module.exports.equal = equal
module.exports.deepEqualJson = native.deepEqualJson
