'use strict'

const native = require('./index.js')

function toSecretBuffer(secret) {
  if (Buffer.isBuffer(secret)) return secret
  if (typeof secret === 'string') return Buffer.from(secret, 'utf-8')
  if (secret instanceof Uint8Array) return Buffer.from(secret)
  throw new TypeError('secret must be a string, Buffer, or Uint8Array')
}

function normalizeSignOptions(options) {
  const opts = {}
  if (!options) return opts
  if (options.algorithm) opts.algorithm = options.algorithm
  if (options.audience !== undefined) opts.audience = String(options.audience)
  if (options.issuer !== undefined) opts.issuer = String(options.issuer)
  if (options.subject !== undefined) opts.subject = String(options.subject)
  if (options.jwtid !== undefined) opts.jwtid = String(options.jwtid)
  if (options.expiresIn !== undefined) opts.expiresIn = options.expiresIn
  if (options.notBefore !== undefined) opts.notBefore = options.notBefore
  if (options.header && typeof options.header === 'object') opts.header = options.header
  return opts
}

function normalizeVerifyOptions(options) {
  const opts = {}
  if (!options) return opts
  if (options.algorithms) opts.algorithms = options.algorithms
  if (options.audience !== undefined) opts.audience = String(options.audience)
  if (options.issuer !== undefined) opts.issuer = String(options.issuer)
  if (options.subject !== undefined) opts.subject = String(options.subject)
  if (options.clockTolerance !== undefined) opts.clockTolerance = options.clockTolerance
  if (options.ignoreExpiration !== undefined) opts.ignoreExpiration = !!options.ignoreExpiration
  if (options.ignoreNotBefore !== undefined) opts.ignoreNotBefore = !!options.ignoreNotBefore
  return opts
}

function sign(payload, secret, options, callback) {
  if (typeof options === 'function') {
    callback = options
    options = undefined
  }
  const p = native.sign(payload, toSecretBuffer(secret), normalizeSignOptions(options))
  if (callback) {
    p.then((token) => callback(null, token)).catch((err) => callback(err))
    return
  }
  return p
}

function signSync(payload, secret, options) {
  return native.signSync(payload, toSecretBuffer(secret), normalizeSignOptions(options))
}

function verify(token, secret, options, callback) {
  if (typeof options === 'function') {
    callback = options
    options = undefined
  }
  const p = native
    .verify(token, toSecretBuffer(secret), normalizeVerifyOptions(options))
    .then((r) => r.payload)
  if (callback) {
    p.then((payload) => callback(null, payload)).catch((err) => callback(err))
    return
  }
  return p
}

function verifySync(token, secret, options) {
  const r = native.verifySync(token, toSecretBuffer(secret), normalizeVerifyOptions(options))
  return r.payload
}

function decodeToken(token, options) {
  const r = native.decodeToken(token)
  if (options && options.complete) return { header: r.header, payload: r.payload, signature: token.split('.')[2] }
  return r.payload
}

module.exports = {
  sign,
  signSync,
  verify,
  verifySync,
  decode: decodeToken,
}
module.exports.default = module.exports
