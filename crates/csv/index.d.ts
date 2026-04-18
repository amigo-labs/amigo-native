/* Hand-written wrapper type declarations. See ./index.js for routing:
 * `parse` is routed through native `parseToJson` + `JSON.parse` to
 * avoid Vec<Vec<String>> FFI marshalling cost (docs/BASELINE.md). */

export interface CsvOptions {
  delimiter?: number
  hasHeaders?: boolean
  quoteChar?: number
  escapeChar?: number
  comment?: number
  flexible?: boolean
  trimFields?: boolean
}

export declare function parse(input: Buffer, options?: CsvOptions): string[][]

export declare function parseWithHeaders(
  input: Buffer,
  options?: CsvOptions,
): Record<string, string>[]

export declare function parseToJson(input: Buffer, options?: CsvOptions): string

export declare function countRows(input: Buffer, options?: CsvOptions): number

export declare function stringify(rows: string[][], options?: CsvOptions): string

export declare function stringifyObjects(
  rows: Record<string, string>[],
  columns?: string[],
  options?: CsvOptions,
): string
