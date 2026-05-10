# @amigo-labs/bcrypt — archived

> 🗄️ **Archived 2026-05-10.** Source removed from the tree after the
> re-review and post-mortem landed.

`@amigo-labs/bcrypt` runs Solar Designer's `crypt_blowfish` C source
through NAPI; the upstream `bcrypt` npm package runs the *same* C code
through `node-gyp`. Today's measurements show **1.01–1.03×** vs
`bcrypt`-npm at every cost — well below the 1.5× Red gate. The 2× Green
threshold is structurally unreachable when three implementations all
wrap the same canonical C. See
[post-mortem](../../docs/post-mortems/bcrypt.md) and
[perf-review](../../docs/perf-review/bcrypt.md) for the numbers.

**Migration:** `npm install bcrypt` for the binary-compatible drop-in
(same algorithm, same hash format), or `@amigo-labs/argon2` for new
projects that want memory-hard hashing.

**Source history:** last full tree at commit `a261556`
(`chore: release main`). The npm package `@amigo-labs/bcrypt` remains
at its last deprecated release; nothing new ships from this tree.
