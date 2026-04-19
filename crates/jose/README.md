# @amigo-labs/jose

[![npm version](https://img.shields.io/npm/v/@amigo-labs/jose)](https://www.npmjs.com/package/@amigo-labs/jose)
[![npm downloads](https://img.shields.io/npm/dm/@amigo-labs/jose)](https://www.npmjs.com/package/@amigo-labs/jose)
[![license](https://img.shields.io/npm/l/@amigo-labs/jose)](https://github.com/amigo-labs/amigo-native/blob/main/LICENSE)

JOSE key-format primitives powered by Rust via [NAPI-RS](https://napi.rs). Native Ed25519 JWK generation and RFC 7638 thumbprints — a fast companion to the [`jose`](https://www.npmjs.com/package/jose) npm package's key-handling subset.

> **v0.1 scope.** Ed25519 key-pair generation and JWK thumbprints only. JWS sign/verify is provided by [`@amigo-labs/jwt`](https://www.npmjs.com/package/@amigo-labs/jwt). JWE encrypt/decrypt is roadmap for v0.2. **RSA key generation is not exposed** because Node's built-in `crypto.generateKeyPair('rsa')` (OpenSSL via the libuv thread-pool) is ~2.6× faster than any pure-Rust `rsa` crate we can link — see the "Notes on RSA" section below.

## Installation

```bash
npm install @amigo-labs/jose
```

## Usage

```ts
import { generateEd25519KeyPair, jwkThumbprint } from "@amigo-labs/jose";

// Generate an Ed25519 key-pair (sync — microseconds)
const { publicJwk, privateJwk } = generateEd25519KeyPair();

// RFC 7638 SHA-256 thumbprint (kid-independent stable identifier).
// Works on RSA, EC, OKP, or oct JWKs — public or private.
const kid = jwkThumbprint(publicJwk);
```

## API

### `generateEd25519KeyPair(): JwkKeyPair`

Generates a fresh Ed25519 key-pair as JWKs (RFC 8037 `OKP` form, `crv: "Ed25519"`). Synchronous — Ed25519 generation is microsecond-scale.

### `jwkThumbprint(jwk: object): string`

Computes the SHA-256 JWK thumbprint per RFC 7638. Returns a base64url-encoded string. Accepts public or private JWKs of `kty` `RSA`, `EC`, `OKP`, or `oct`; only the canonical required members are hashed.

## Performance

Measured on linux-x64, Node v22.22.2, vs [`jose`](https://www.npmjs.com/package/jose) (panva):

| Operation | @amigo-labs/jose | jose (pure JS) | Speedup |
| --- | ---: | ---: | --- |
| jwkThumbprint (Ed25519) | 399 k hz | 247 k hz | **1.62×** |
| jwkThumbprint (RSA-2048) | 369 k hz | 168 k hz | **2.19×** |
| generateEd25519KeyPair + exportJWK | 46.4 k hz | 6.66 k hz | **6.97×** |

## Notes on RSA

`generateRsaKeyPair` is **deliberately not exposed**. Node ships `crypto.generateKeyPair('rsa', …)` built-in, which uses OpenSSL's heavily-optimized BIGNUM prime-search via the libuv thread-pool. Pure-Rust `rsa` crates cannot match that throughput — measurement showed ~2.6× slower. If you need RSA keys, generate them via Node built-in and pass the resulting JWK to `jwkThumbprint`:

```ts
import { generateKeyPair } from "node:crypto";
import { promisify } from "node:util";
import { jwkThumbprint } from "@amigo-labs/jose";

const { publicKey, privateKey } = await promisify(generateKeyPair)("rsa", {
  modulusLength: 2048,
});
const jwk = publicKey.export({ format: "jwk" });
const kid = jwkThumbprint(jwk); // 2.19× faster than panva/jose's thumbprint
```

## Roadmap

- v0.2: JWE encrypt / decrypt (`A256GCM`, `dir`, `RSA-OAEP-256`, `ECDH-ES+A256KW`)
- v0.2: JWS as a stateful `JoseKey` class (key-parse-once, sign/verify hot path)
- v0.3: PEM ↔ JWK conversion utilities
- v0.3: P-256 / P-384 / P-521 EC key generation

## Supported Platforms

| Platform | Architecture |
| --- | --- |
| Linux | x64 (glibc), x64 (musl), arm64 |
| macOS | x64, arm64 |
| Windows | x64 |

## License

MIT
