export interface XmlAttr {
  name: string
  value: string
}

export interface XmlEvent {
  kind:
    | 'opentag'
    | 'closetag'
    | 'text'
    | 'cdata'
    | 'comment'
    | 'processinginstruction'
    | 'doctype'
  name?: string
  text?: string
  attrs?: XmlAttr[]
  selfClosing?: boolean
}

/** Parse an entire XML string and return the ordered event list. */
export declare function parseXml(input: string, strict?: boolean): XmlEvent[]

/** Parse XML and return a JSON-encoded event array as a single string. One
 *  FFI crossing for the full document — callers `JSON.parse()` the result.
 *  Event shape: `{t,n,a,c,v}` (compact keys). */
export declare function parseXmlToJson(input: string, strict?: boolean): string

export interface SaxTag {
  name: string
  attributes: Record<string, string>
  isSelfClosing: boolean
}

export interface SaxParser {
  onopentag: ((tag: SaxTag) => void) | null
  onclosetag: ((name: string) => void) | null
  ontext: ((text: string) => void) | null
  oncdata: ((text: string) => void) | null
  oncomment: ((text: string) => void) | null
  onprocessinginstruction: ((text: string) => void) | null
  ondoctype: ((text: string) => void) | null
  onerror: ((err: Error) => void) | null
  onend: (() => void) | null
  write(chunk: string): SaxParser
  close(): SaxParser
}

/** sax.js-compatible parser factory. Buffers input across `write()` calls and
 *  dispatches events to the handler callbacks during `close()`. */
export declare function parser(strict?: boolean, options?: Record<string, unknown>): SaxParser
