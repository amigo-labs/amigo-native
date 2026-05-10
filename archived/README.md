# Archived packages

Tombstones for packages whose deprecation window has closed. Source was
removed after the respective post-mortems landed — the git history still
has every line. Each directory here keeps only a `README.md` pointing to
the post-mortem, the perf-review, and the commit SHA of the last full
tree so the code can be restored if a future investigation needs it.

| Package | Tombstone | Last full-tree commit |
|---|---|---|
| `@amigo-labs/bcrypt` | [bcrypt/](bcrypt/) | `a261556` |
| `@amigo-labs/deep-equal` | [deep-equal/](deep-equal/) | `5b92e44` |
| `@amigo-labs/levenshtein` | [levenshtein/](levenshtein/) | `3a308be` |
| `@amigo-labs/nanoid` | [nanoid/](nanoid/) | `c95b3e6` |
| `@amigo-labs/tiktoken` | [tiktoken/](tiktoken/) | `fa68ce5` |
| `@amigo-labs/xml` | [xml/](xml/) | `cdade50` (never published) |

Everything here is out of CI, out of the pnpm/cargo workspace, and out of
the bench surface. The npm packages remain at their last deprecated
release; nothing new ships from this tree.

For the why, see `docs/post-mortems/<pkg>.md` and `docs/perf-review/<pkg>.md`.
