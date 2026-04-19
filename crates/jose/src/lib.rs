//! JOSE primitives: Ed25519 JWK key generation + RFC 7638 thumbprints.
//!
//! v0.1 scope is intentionally narrow — key-format operations only where the
//! Rust stack has a measurable advantage. JWS sign/verify is covered by
//! `@amigo-labs/jwt`. JWE encrypt/decrypt is roadmap (see README).
//!
//! **RSA key generation is not exposed** — Node's built-in
//! `crypto.generateKeyPair('rsa', ...)` uses OpenSSL's BIGNUM math via the
//! libuv thread-pool, which is ~2.6× faster than any pure-Rust `rsa`-crate
//! we can link. If you need RSA keys, generate via Node built-in and pass
//! the resulting JWK to `jwkThumbprint`.

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::SigningKey;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

/// A JWK key-pair — both public and private representations of the same key.
#[napi(object)]
pub struct JwkKeyPair {
    pub public_jwk: serde_json::Value,
    pub private_jwk: serde_json::Value,
}

fn b64url(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

// ── Ed25519 ───────────────────────────────────────────────────────────────

/// Generate a fresh Ed25519 key-pair as JWKs (RFC 8037 OKP form).
///
/// Synchronous: Ed25519 key generation is microsecond-scale.
#[napi]
pub fn generate_ed25519_key_pair() -> Result<JwkKeyPair> {
    let mut rng = rand::thread_rng();
    let signing = SigningKey::generate(&mut rng);
    let verifying = signing.verifying_key();

    let x = b64url(verifying.as_bytes());
    let d = b64url(signing.to_bytes().as_ref());

    Ok(JwkKeyPair {
        public_jwk: json!({
            "kty": "OKP",
            "crv": "Ed25519",
            "x": x,
        }),
        private_jwk: json!({
            "kty": "OKP",
            "crv": "Ed25519",
            "x": x,
            "d": d,
        }),
    })
}

// ── JWK Thumbprint (RFC 7638) ─────────────────────────────────────────────

/// Compute the SHA-256 JWK thumbprint per RFC 7638.
///
/// The thumbprint is a stable, kid-independent identifier for the key. The
/// caller passes either a public or private JWK; only the canonical required
/// fields are hashed (no `kid`, no `alg`, no private-key components).
#[napi]
pub fn jwk_thumbprint(jwk: serde_json::Value) -> Result<String> {
    let canonical = canonicalize_jwk(&jwk)?;
    let mut hasher = Sha256::new();
    hasher.update(canonical.as_bytes());
    Ok(b64url(&hasher.finalize()))
}

fn canonicalize_jwk(jwk: &Value) -> Result<String> {
    let obj = jwk
        .as_object()
        .ok_or_else(|| Error::from_reason("JWK must be an object"))?;
    let kty = obj
        .get("kty")
        .and_then(Value::as_str)
        .ok_or_else(|| Error::from_reason("JWK missing required field: kty"))?;

    // RFC 7638 §3.2 lists the required members per key type, in
    // lexicographic order, no whitespace, no other members.
    let canonical = match kty {
        "RSA" => {
            let e = required_str(obj, "e")?;
            let n = required_str(obj, "n")?;
            format!(r#"{{"e":"{e}","kty":"RSA","n":"{n}"}}"#)
        }
        "EC" => {
            let crv = required_str(obj, "crv")?;
            let x = required_str(obj, "x")?;
            let y = required_str(obj, "y")?;
            format!(r#"{{"crv":"{crv}","kty":"EC","x":"{x}","y":"{y}"}}"#)
        }
        "OKP" => {
            let crv = required_str(obj, "crv")?;
            let x = required_str(obj, "x")?;
            format!(r#"{{"crv":"{crv}","kty":"OKP","x":"{x}"}}"#)
        }
        "oct" => {
            let k = required_str(obj, "k")?;
            format!(r#"{{"k":"{k}","kty":"oct"}}"#)
        }
        other => {
            return Err(Error::from_reason(format!("unsupported JWK kty: {other}")));
        }
    };
    Ok(canonical)
}

fn required_str<'a>(obj: &'a serde_json::Map<String, Value>, field: &str) -> Result<&'a str> {
    obj.get(field)
        .and_then(Value::as_str)
        .ok_or_else(|| Error::from_reason(format!("JWK missing required field: {field}")))
}
