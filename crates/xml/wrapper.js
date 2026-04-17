'use strict'

const native = require('./index.js')

function createParser(strict = true, _options = {}) {
  const handlers = {
    onopentag: null,
    onclosetag: null,
    ontext: null,
    oncdata: null,
    oncomment: null,
    onerror: null,
    onend: null,
    onprocessinginstruction: null,
    ondoctype: null,
  }

  let buffer = ''
  let closed = false

  const parser = {
    ...handlers,
    write(chunk) {
      if (closed) throw new Error('parser is closed')
      buffer += String(chunk)
      return parser
    },
    close() {
      if (closed) return parser
      closed = true
      try {
        const events = native.parseXml(buffer, strict)
        for (const ev of events) {
          switch (ev.kind) {
            case 'opentag':
              if (parser.onopentag) {
                const attrs = {}
                for (const a of ev.attrs ?? []) attrs[a.name] = a.value
                parser.onopentag({
                  name: ev.name,
                  attributes: attrs,
                  isSelfClosing: !!ev.selfClosing,
                })
              }
              break
            case 'closetag':
              if (parser.onclosetag) parser.onclosetag(ev.name)
              break
            case 'text':
              if (parser.ontext && ev.text && ev.text.length > 0) parser.ontext(ev.text)
              break
            case 'cdata':
              if (parser.oncdata) parser.oncdata(ev.text)
              break
            case 'comment':
              if (parser.oncomment) parser.oncomment(ev.text)
              break
            case 'processinginstruction':
              if (parser.onprocessinginstruction) parser.onprocessinginstruction(ev.text)
              break
            case 'doctype':
              if (parser.ondoctype) parser.ondoctype(ev.text)
              break
          }
        }
        if (parser.onend) parser.onend()
      } catch (err) {
        if (parser.onerror) parser.onerror(err)
        else throw err
      }
      return parser
    },
  }

  return parser
}

module.exports = {
  parser: createParser,
  parseXml: native.parseXml,
}
module.exports.default = module.exports
