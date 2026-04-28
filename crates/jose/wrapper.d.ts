/** A JSON Web Key per RFC 7517. The shape varies by `kty` (OKP/EC/RSA/oct);
 * the library treats it as opaque key material and only inspects the canonical
 * required fields when computing thumbprints. */
export type Jwk = Record<string, unknown>

/** A JWK key-pair — both public and private representations of the same key. */
export interface JwkKeyPair {
  publicJwk: Jwk
  privateJwk: Jwk
}

/**
 * Generate a fresh Ed25519 key-pair as JWKs (RFC 8037 OKP form).
 *
 * Synchronous: Ed25519 key generation is microsecond-scale.
 */
export declare function generateEd25519KeyPair(): JwkKeyPair

/**
 * Compute the SHA-256 JWK thumbprint per RFC 7638.
 *
 * The thumbprint is a stable, kid-independent identifier for the key. The
 * caller passes either a public or private JWK; only the canonical required
 * fields are hashed (no `kid`, no `alg`, no private-key components).
 */
export declare function jwkThumbprint(jwk: Jwk): string
