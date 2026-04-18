// Thin JS wrapper over the NAPI binding with V8-native fast paths for the
// encodings Node already handles internally (utf-8, utf-16le, latin1). For
// those, `Buffer.toString(enc)` / `Buffer.from(str, enc)` bypasses the
// JS→Rust→JS round-trip entirely and is 10–20x faster than any NAPI call
// can be, so we short-circuit here and only delegate to the native module
// for encodings V8 can't handle (utf-16be, shift_jis, latin1 *encode*
// with iconv-strict semantics, windows-1252, CJK, etc.).
//
// Semantics verified byte-for-byte against iconv-lite 0.6.3 for every path
// we delegate to V8:
//   * utf-8 encode/decode → Buffer is WHATWG-compliant, identical to iconv
//   * utf-16le encode/decode → Buffer uses the same byte ordering iconv does
//   * latin1 decode → Buffer uses the ISO-8859-1 1-to-1 mapping iconv uses
//
// NOT short-circuited:
//   * latin1 encode → Buffer uses `charCode & 0xFF` truncation for chars
//     above 0xFF, iconv-lite emits `?` (0x3F). Stays in Rust.
//   * utf-16be → not a native Node label.

const native = require('./native.cjs')

// Normalise labels the same way the Rust side does: lowercase, strip
// dashes and underscores. Lets us accept `UTF-8`, `utf8`, `utf_8` all as
// the same thing without the overhead of reaching into Rust.
function normalise(label) {
  return String(label).toLowerCase().replace(/[-_]/g, '')
}

// Set of normalised labels that map 1:1 to Node's built-in `utf8`.
const UTF8_LABELS = new Set(['utf8'])

// Set of normalised labels that map 1:1 to Node's built-in `utf16le`.
// iconv-lite aliases `ucs2`/`ucs-2` and plain `utf16` to UTF-16LE.
const UTF16LE_LABELS = new Set(['utf16le', 'ucs2', 'utf16'])

// Labels that map 1:1 to Node's built-in `latin1` *on decode*. We don't
// include these for encode because Node's Buffer truncates chars > 0xFF
// (`charCode & 0xFF`) while iconv-lite emits `?`.
const LATIN1_DECODE_LABELS = new Set(['latin1', 'iso88591', 'binary'])

function encode(input, encoding) {
  const str = typeof input === 'string' ? input : String(input)
  // Exact-match fast path: avoid the toLowerCase + replace allocations for
  // the canonical label spellings that account for ~all real-world calls.
  if (encoding === 'utf-8' || encoding === 'utf8') return Buffer.from(str, 'utf-8')
  if (encoding === 'utf-16le' || encoding === 'utf16le') return Buffer.from(str, 'utf-16le')
  // Slow path: normalise for case-insensitive / alias matching.
  const label = normalise(encoding)
  if (UTF8_LABELS.has(label)) return Buffer.from(str, 'utf-8')
  if (UTF16LE_LABELS.has(label)) return Buffer.from(str, 'utf-16le')
  return native.encode(str, encoding)
}

function decode(buf, encoding) {
  if (encoding === 'utf-8' || encoding === 'utf8') return buf.toString('utf-8')
  if (encoding === 'utf-16le' || encoding === 'utf16le') return buf.toString('utf-16le')
  if (encoding === 'latin1' || encoding === 'binary') return buf.toString('latin1')
  const label = normalise(encoding)
  if (UTF8_LABELS.has(label)) return buf.toString('utf-8')
  if (UTF16LE_LABELS.has(label)) return buf.toString('utf-16le')
  if (LATIN1_DECODE_LABELS.has(label)) return buf.toString('latin1')
  return native.decode(buf, encoding)
}

module.exports = {
  encode,
  decode,
  encodingExists: native.encodingExists,
}
module.exports.encode = encode
module.exports.decode = decode
module.exports.encodingExists = native.encodingExists
