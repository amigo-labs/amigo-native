'use strict'

const native = require('./index.js')

function nanoid(size) {
  return native.nanoid(size)
}

function customAlphabet(alphabet, defaultSize = 21) {
  if (typeof alphabet !== 'string' || alphabet.length === 0) {
    throw new TypeError('customAlphabet: alphabet must be a non-empty string')
  }
  return function (size) {
    return native.nanoidCustom(alphabet, size === undefined ? defaultSize : size)
  }
}

module.exports = {
  nanoid,
  nanoidCustom: native.nanoidCustom,
  customAlphabet,
}
module.exports.default = module.exports
