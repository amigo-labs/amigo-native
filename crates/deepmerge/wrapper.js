'use strict'

const native = require('./index.js')

const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype'])

function isPlainObject(v) {
  if (v === null || typeof v !== 'object') return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

function clone(v) {
  if (Array.isArray(v)) return v.map(clone)
  if (isPlainObject(v)) {
    const out = {}
    for (const k of Object.keys(v)) {
      if (FORBIDDEN.has(k)) continue
      out[k] = clone(v[k])
    }
    return out
  }
  return v
}

function mergeImpl(target, source, options) {
  if (Array.isArray(target) && Array.isArray(source)) {
    if (options.arrayMerge === 'overwrite') return clone(source)
    return [...target.map(clone), ...source.map(clone)]
  }

  if (isPlainObject(target) && isPlainObject(source)) {
    const out = {}
    for (const k of Object.keys(target)) {
      if (FORBIDDEN.has(k)) continue
      out[k] = clone(target[k])
    }
    for (const k of Object.keys(source)) {
      if (FORBIDDEN.has(k)) continue
      if (k in out) {
        out[k] = mergeImpl(out[k], source[k], options)
      } else {
        out[k] = clone(source[k])
      }
    }
    return out
  }

  return clone(source)
}

function merge(target, source, options = {}) {
  return mergeImpl(target, source, options)
}

merge.all = function all(values, options = {}) {
  if (!Array.isArray(values)) throw new TypeError('merge.all expects an array')
  let acc = {}
  for (const v of values) acc = mergeImpl(acc, v, options)
  return acc
}

merge.mergeJson = native.mergeJson
merge.mergeAllJson = native.mergeAllJson

module.exports = merge
module.exports.default = merge
