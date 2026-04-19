/* Hand-written wrapper type declarations. See ./index.js for the fast-
 * path routing (utf-8 / utf-16le / latin1-decode go through V8 directly,
 * everything else delegates to the NAPI binding in ./native.cjs). */

export declare function decode(input: Buffer, encoding: string): string

export declare function encode(input: string, encoding: string): Buffer

export declare function encodingExists(encoding: string): boolean
