export interface DeepmergeOptions {
  /** 'concat' (default, matches `deepmerge`) or 'overwrite'. */
  arrayMerge?: 'concat' | 'overwrite'
}

declare function merge<T>(target: T, source: Partial<T>, options?: DeepmergeOptions): T

declare namespace merge {
  function all<T>(values: Array<Partial<T>>, options?: DeepmergeOptions): T
  /** JSON-safe Rust fast-path. Use when both inputs are plain JSON values. */
  function mergeJson(target: unknown, source: unknown, options?: DeepmergeOptions): unknown
  function mergeAllJson(values: unknown[], options?: DeepmergeOptions): unknown
}

export = merge
