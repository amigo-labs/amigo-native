# @amigo-labs/jwt

> JWT sign, verify, and decode via the `jsonwebtoken` Rust crate. Drop-in for [`jsonwebtoken`](https://www.npmjs.com/package/jsonwebtoken), compiled via NAPI-RS.

## Install

```bash
npm install @amigo-labs/jwt
```

## Usage

```ts
import { sign, verify, signSync, verifySync, decodeToken } from '@amigo-labs/jwt'

const secret = Buffer.from('super-secret')

const token = await sign({ sub: 'user-42' }, secret, {
  algorithm: 'HS256',
  expiresIn: '1h', // or a number of seconds: `expiresIn: 3600`
})

const { payload, header } = await verify(token, secret)

// No signature check — inspect structure only
const peek = decodeToken(token)
```

Supported algorithms: `HS256`, `HS384`, `HS512`, `RS256`, `RS384`, `RS512`, `ES256`, `ES384`, `PS256`, `PS384`, `PS512`.

## Parity

Tests in [`__conformance__/`](./__conformance__) run the upstream `jsonwebtoken` test suite against this implementation. See [`divergences.md`](./__conformance__/divergences.md) for documented differences.
