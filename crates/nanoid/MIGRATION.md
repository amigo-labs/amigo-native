# Migration — `nanoid` → `@amigo-labs/nanoid`

Drop-in for the standard `nanoid` and `customAlphabet` exports from
[`nanoid`](https://www.npmjs.com/package/nanoid) v5.

## Summary

- `nanoid(size?)` and `customAlphabet(alphabet, defaultSize?)` are byte-structurally
  equivalent to upstream (length, alphabet, uniform distribution).
- The `nanoid/non-secure` fast export is **transparently upgraded** to the secure
  path. If you intentionally want the non-secure (Math.random) variant, stay on
  upstream; we do not expose it.

## API mapping

| upstream                       | amigo                                  |
|:-------------------------------|:---------------------------------------|
| `nanoid(size?)`                | `nanoid(size?)`                        |
| `customAlphabet(a, size?)`     | `customAlphabet(a, size?)`             |
| *(not upstream)*               | `nanoidCustom(a, size?)` (one-shot)    |
| `nanoid/non-secure`            | *not exposed* — use the secure default |
| `urlAlphabet`                  | *not exposed* — inline the string if needed |

## Unsupported

- **`nanoid/non-secure`**: intentional; the secure path is the safe default.
- **`urlAlphabet` constant**: inline `"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"`
  if you need the default alphabet as a string for your own purposes.
