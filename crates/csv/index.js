'use strict'

// Thin wrapper over the NAPI binding. `parse()` returned
// Vec<Vec<String>> from Rust, which pays the 43 ns/element marshalling
// cost from docs/BASELINE.md on both dimensions — a 100k × 10 column
// parse moves 1M strings across FFI, each one a separate NAPI object.
// Routing through `parseToJson` + `JSON.parse` collapses that to a
// single string transfer + V8's C++ JSON parser, which for this
// shape is 2-3× faster end-to-end.

const native = require('./native.cjs')

function parse(input, options) {
  return JSON.parse(native.parseToJson(input, options))
}

module.exports = {
  parse,
  parseWithHeaders: native.parseWithHeaders,
  parseToJson: native.parseToJson,
  countRows: native.countRows,
  stringify: native.stringify,
  stringifyObjects: native.stringifyObjects,
}
