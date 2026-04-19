//! JOSE primitives: JWK key generation + RFC 7638 thumbprints.
//!
//! v0.1 scope is intentionally narrow — key-format operations only. JWS sign/
//! verify is covered by `@amigo-labs/jwt`. JWE encrypt/decrypt is roadmap
//! (see README).

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::SigningKey;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use rsa::pkcs1::EncodeRsaPrivateKey;
use rsa::traits::{PrivateKeyParts, PublicKeyParts};
use rsa::{RsaPrivateKey, RsaPublicKey};
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

// ── RSA ───────────────────────────────────────────────────────────────────

fn rsa_to_jwk(private: &RsaPrivateKey) -> Result<JwkKeyPair> {
    let public: RsaPublicKey = private.to_public_key();

    let n = b64url(&public.n().to_bytes_be());
    let e = b64url(&public.e().to_bytes_be());
    let d = b64url(&private.d().to_bytes_be());
    let primes = private.primes();
    let p = b64url(&primes[0].to_bytes_be());
    let q = b64url(&primes[1].to_bytes_be());

    // CRT parameters — required by RFC 7518 §6.3.2 when present
    let dp = private
        .dp()
        .ok_or_else(|| Error::from_reason("missing dP"))?
        .to_bytes_be();
    let dq = private
        .dq()
        .ok_or_else(|| Error::from_reason("missing dQ"))?
        .to_bytes_be();
    let qi = private
        .crt_coefficient()
        .ok_or_else(|| Error::from_reason("missing qInv"))?
        .to_bytes_be();

    Ok(JwkKeyPair {
        public_jwk: json!({
            "kty": "RSA",
            "n": n,
            "e": e,
        }),
        private_jwk: json!({
            "kty": "RSA",
            "n": n,
            "e": e,
            "d": d,
            "p": p,
            "q": q,
            "dp": b64url(&dp),
            "dq": b64url(&dq),
            "qi": b64url(&qi),
        }),
    })
}

pub struct RsaGenTask {
    bits: u32,
}

#[napi]
impl Task for RsaGenTask {
    type Output = JwkKeyPair;
    type JsValue = JwkKeyPair;

    fn compute(&mut self) -> Result<Self::Output> {
        let mut rng = rand::thread_rng();
        let private = RsaPrivateKey::new(&mut rng, self.bits as usize)
            .map_err(|e| Error::from_reason(format!("RSA key generation failed: {e}")))?;
        // Force CRT computation
        let _ = private.to_pkcs1_der();
        rsa_to_jwk(&private)
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

/// Generate a fresh RSA key-pair as JWKs.
///
/// `bits` must be ≥ 2048. Generation is CPU-bound and runs on the libuv
/// thread-pool — typically 100ms–3s depending on key size.
#[napi]
pub fn generate_rsa_key_pair(bits: Option<u32>) -> Result<AsyncTask<RsaGenTask>> {
    let bits = bits.unwrap_or(2048);
    if bits < 2048 {
        return Err(Error::from_reason(
            "RSA key size must be at least 2048 bits",
        ));
    }
    Ok(AsyncTask::new(RsaGenTask { bits }))
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
