# @amigo-labs/jose

[![npm version](https://img.shields.io/npm/v/@amigo-labs/jose)](https://www.npmjs.com/package/@amigo-labs/jose)
[![npm downloads](https://img.shields.io/npm/dm/@amigo-labs/jose)](https://www.npmjs.com/package/@amigo-labs/jose)
[![license](https://img.shields.io/npm/l/@amigo-labs/jose)](https://github.com/amigo-labs/amigo-native/blob/main/LICENSE)

JOSE key-format primitives powered by Rust via [NAPI-RS](https://napi.rs). Native JWK key generation and RFC 7638 thumbprints, drop-in for the [`jose`](https://www.npmjs.com/package/jose) npm package's key-handling subset.

> **v0.1 scope.** This release covers JWK key-pair generation and thumbprints. JWS sign/verify is provided by [`@amigo-labs/jwt`](https://www.npmjs.com/package/@amigo-labs/jwt). JWE encrypt/decrypt is roadmap for v0.2 — contributions welcome.

## Installation

```bash
npm install @amigo-labs/jose
```

## Usage

```ts
import {
  generateRsaKeyPair,
  generateEd25519KeyPair,
  jwkThumbprint,
} from "@amigo-labs/jose";

// Generate an RSA key-pair (async — RSA generation is slow)
const { publicJwk, privateJwk } = await generateRsaKeyPair(2048);

// Generate an Ed25519 key-pair (sync — microseconds)
const ed = generateEd25519KeyPair();

// RFC 7638 SHA-256 thumbprint (kid-independent stable identifier)
const kid = jwkThumbprint(publicJwk);
```

## API

### `generateRsaKeyPair(bits?: number): Promise<JwkKeyPair>`

Generates a fresh RSA key-pair and returns it as JWK objects (public + private). `bits` defaults to 2048 and must be ≥ 2048.

### `generateEd25519KeyPair(): JwkKeyPair`

Generates a fresh Ed25519 key-pair as JWKs (RFC 8037 `OKP` form, `crv: "Ed25519"`). Synchronous — Ed25519 generation is microsecond-scale.

### `jwkThumbprint(jwk: object): string`

Computes the SHA-256 JWK thumbprint per RFC 7638. Returns a base64url-encoded string. Accepts public or private JWKs of `kty` `RSA`, `EC`, `OKP`, or `oct`; only the canonical required members are hashed.

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
