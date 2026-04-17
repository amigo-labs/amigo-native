/**
 * Crypto-safe URL-friendly ID. Returns a string of length `size` (default 21)
 * drawn uniformly from `A-Za-z0-9_-`.
 */
export declare function nanoid(size?: number): string

/**
 * Generate an ID from a custom alphabet in a single call. Prefer
 * `customAlphabet` if you reuse the same alphabet across many calls.
 */
export declare function nanoidCustom(alphabet: string, size?: number): string

/**
 * Return a factory that produces IDs of length `defaultSize` (default 21)
 * from `alphabet`. Equivalent to `nanoid`'s `customAlphabet`.
 */
export declare function customAlphabet(
  alphabet: string,
  defaultSize?: number,
): (size?: number) => string
