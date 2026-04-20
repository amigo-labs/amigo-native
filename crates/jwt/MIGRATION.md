# Migration — `jsonwebtoken` → `@amigo-labs/jwt`

Drop-in for the sign/verify/decode entry points of
[`jsonwebtoken`](https://www.npmjs.com/package/jsonwebtoken) v9.

## Supported algorithms

HS256 / HS384 / HS512, RS256 / RS384 / RS512, ES256 / ES384,
PS256 / PS384 / PS512, EdDSA.

Cross-validated bidirectionally against `jsonwebtoken` in `__parity__/`.

## API mapping

| jsonwebtoken                      | amigo                                   |
|:----------------------------------|:----------------------------------------|
| `jwt.sign(payload, secret, opts)` | `sign(payload, secret, opts)` (Promise) or `signSync` |
| `jwt.sign(…, callback)`           | callback-style also supported           |
| `jwt.verify(tok, secret, opts)`   | `verify(tok, secret, opts)` (Promise) or `verifySync` |
| `jwt.verify(…, callback)`         | callback-style also supported           |
| `jwt.decode(tok)`                 | `decode(tok)`                           |
| `jwt.decode(tok, { complete: true })` | `decode(tok, { complete: true })`   |

## Options

Supported: `algorithm`, `algorithms`, `expiresIn`, `notBefore`, `audience`,
`issuer`, `subject`, `jwtid`, `header`, `clockTolerance`,
`ignoreExpiration`, `ignoreNotBefore`.

`expiresIn` and `notBefore` accept either:

- a **number** — seconds from now (e.g. `3600` for 1 hour), or
- a **string** parsed the same way as `jsonwebtoken` / the [`ms`](https://www.npmjs.com/package/ms)
  package: `"1s"`, `"2m"`, `"1h"`, `"1d"`, `"2 weeks"`, `"1.5 hours"`. A
  unit-less string like `"1500"` is treated as milliseconds (so `1500` →
  `1` second). Unknown units raise an error.

Not supported in v1:
- **`audience` as array or regex**: single string only.
- **`jwksRsa` / JWK key sets**: plain PEM keys only. Pair with a JWK-to-PEM
  converter if you need rotation.
- **Custom `keyid` resolver**: not exposed.

## Security behaviour

- `alg=none` tokens are explicitly rejected. Always. Even with `algorithms: ['none']`.
- Algorithm mix-match (RS256 signed, HS256 verified) is rejected by the crate's
  `Validation::algorithms` check.
- Expired tokens reject with a clear error.
