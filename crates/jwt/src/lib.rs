use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use jsonwebtoken::{
    Algorithm, DecodingKey, EncodingKey, Header, TokenData, Validation, decode, encode,
};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde_json::Value;

fn parse_alg(s: &str) -> Result<Algorithm> {
    match s {
        "HS256" => Ok(Algorithm::HS256),
        "HS384" => Ok(Algorithm::HS384),
        "HS512" => Ok(Algorithm::HS512),
        "RS256" => Ok(Algorithm::RS256),
        "RS384" => Ok(Algorithm::RS384),
        "RS512" => Ok(Algorithm::RS512),
        "ES256" => Ok(Algorithm::ES256),
        "ES384" => Ok(Algorithm::ES384),
        "PS256" => Ok(Algorithm::PS256),
        "PS384" => Ok(Algorithm::PS384),
        "PS512" => Ok(Algorithm::PS512),
        "EdDSA" => Ok(Algorithm::EdDSA),
        other => Err(Error::from_reason(format!(
            "unsupported algorithm: {other}"
        ))),
    }
}

fn to_err<E: std::fmt::Display>(e: E) -> Error {
    Error::from_reason(e.to_string())
}

fn to_encoding_key(alg: Algorithm, secret: &[u8]) -> Result<EncodingKey> {
    Ok(match alg {
        Algorithm::HS256 | Algorithm::HS384 | Algorithm::HS512 => EncodingKey::from_secret(secret),
        Algorithm::RS256 | Algorithm::RS384 | Algorithm::RS512 => {
            EncodingKey::from_rsa_pem(secret).map_err(to_err)?
        }
        Algorithm::ES256 | Algorithm::ES384 => EncodingKey::from_ec_pem(secret).map_err(to_err)?,
        Algorithm::PS256 | Algorithm::PS384 | Algorithm::PS512 => {
            EncodingKey::from_rsa_pem(secret).map_err(to_err)?
        }
        Algorithm::EdDSA => EncodingKey::from_ed_pem(secret).map_err(to_err)?,
    })
}

fn to_decoding_key(alg: Algorithm, secret: &[u8]) -> Result<DecodingKey> {
    Ok(match alg {
        Algorithm::HS256 | Algorithm::HS384 | Algorithm::HS512 => DecodingKey::from_secret(secret),
        Algorithm::RS256 | Algorithm::RS384 | Algorithm::RS512 => {
            DecodingKey::from_rsa_pem(secret).map_err(to_err)?
        }
        Algorithm::ES256 | Algorithm::ES384 => DecodingKey::from_ec_pem(secret).map_err(to_err)?,
        Algorithm::PS256 | Algorithm::PS384 | Algorithm::PS512 => {
            DecodingKey::from_rsa_pem(secret).map_err(to_err)?
        }
        Algorithm::EdDSA => DecodingKey::from_ed_pem(secret).map_err(to_err)?,
    })
}

#[napi(object)]
#[derive(Default)]
pub struct SignOptions {
    /// "HS256" (default), "HS384", "HS512", "RS256", etc.
    pub algorithm: Option<String>,
    /// Seconds from now until token expires. Maps to `exp` claim.
    pub expires_in: Option<i64>,
    /// Seconds from now when the token becomes valid. Maps to `nbf` claim.
    pub not_before: Option<i64>,
    pub audience: Option<String>,
    pub issuer: Option<String>,
    pub subject: Option<String>,
    pub jwtid: Option<String>,
    /// Additional raw header fields as JSON.
    pub header: Option<Value>,
}

#[napi(object)]
#[derive(Default)]
pub struct VerifyOptions {
    /// Allowed algorithms. Defaults to [HS256].
    pub algorithms: Option<Vec<String>>,
    pub audience: Option<String>,
    pub issuer: Option<String>,
    pub subject: Option<String>,
    /// Clock skew tolerance in seconds (default 0).
    pub clock_tolerance: Option<u32>,
    /// If false, skip `exp` check.
    pub ignore_expiration: Option<bool>,
    /// If false, skip `nbf` check.
    pub ignore_not_before: Option<bool>,
}

fn current_timestamp() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[napi]
pub fn sign_sync(payload: Value, secret: Buffer, options: Option<SignOptions>) -> Result<String> {
    let opts = options.unwrap_or_default();
    let alg_str = opts
        .algorithm
        .clone()
        .unwrap_or_else(|| "HS256".to_string());
    let alg = parse_alg(&alg_str)?;

    // Merge in the timed claims
    let mut claims = match payload {
        Value::Object(m) => m,
        _ => return Err(Error::from_reason("payload must be an object")),
    };

    let now = current_timestamp();
    if let Some(exp_in) = opts.expires_in {
        claims.insert("exp".into(), Value::Number((now + exp_in).into()));
    }
    if let Some(nbf_in) = opts.not_before {
        claims.insert("nbf".into(), Value::Number((now + nbf_in).into()));
    }
    if let Some(a) = opts.audience {
        claims.insert("aud".into(), Value::String(a));
    }
    if let Some(i) = opts.issuer {
        claims.insert("iss".into(), Value::String(i));
    }
    if let Some(s) = opts.subject {
        claims.insert("sub".into(), Value::String(s));
    }
    if let Some(j) = opts.jwtid {
        claims.insert("jti".into(), Value::String(j));
    }

    let mut header = Header::new(alg);
    if let Some(Value::Object(h)) = opts.header {
        if let Some(Value::String(typ)) = h.get("typ") {
            header.typ = Some(typ.clone());
        }
        if let Some(Value::String(kid)) = h.get("kid") {
            header.kid = Some(kid.clone());
        }
        if let Some(Value::String(cty)) = h.get("cty") {
            header.cty = Some(cty.clone());
        }
    }

    let key = to_encoding_key(alg, &secret)?;
    encode(&header, &Value::Object(claims), &key).map_err(to_err)
}

#[napi(object)]
pub struct VerifyResult {
    pub payload: Value,
    pub header: Value,
}

#[napi]
pub fn verify_sync(
    token: String,
    secret: Buffer,
    options: Option<VerifyOptions>,
) -> Result<VerifyResult> {
    let opts = options.unwrap_or_default();

    // Determine algorithm list and parse header to get the alg
    let algs: Vec<Algorithm> = match opts.algorithms {
        Some(list) => list
            .iter()
            .map(|s| parse_alg(s))
            .collect::<Result<Vec<_>>>()?,
        None => vec![Algorithm::HS256],
    };

    // Explicitly reject the alg=none attack.
    let header = jsonwebtoken::decode_header(&token).map_err(to_err)?;
    let alg_str = format!("{:?}", header.alg);
    if alg_str == "None" {
        return Err(Error::from_reason("alg=none is not accepted"));
    }

    let mut validation = Validation::new(header.alg);
    // Match jsonwebtoken-node: `exp` is optional — only validated if present.
    validation.required_spec_claims.clear();
    validation.algorithms = algs;
    if let Some(a) = opts.audience {
        validation.set_audience(&[a]);
    }
    if let Some(i) = opts.issuer {
        validation.set_issuer(&[i]);
    }
    if let Some(s) = opts.subject {
        validation.sub = Some(s);
    }
    if let Some(t) = opts.clock_tolerance {
        validation.leeway = t as u64;
    }
    if matches!(opts.ignore_expiration, Some(true)) {
        validation.validate_exp = false;
    }
    validation.validate_nbf = !matches!(opts.ignore_not_before, Some(true));

    let key = to_decoding_key(header.alg, &secret)?;
    let data: TokenData<Value> = decode::<Value>(&token, &key, &validation).map_err(to_err)?;

    // Explicit exp/nbf validation as a backstop, matching jsonwebtoken-node semantics.
    // jsonwebtoken-rust 9.3 silently accepts tokens when payload is `Value` — the
    // library's internal validate() path only runs on a strongly-typed struct.
    let leeway = opts.clock_tolerance.unwrap_or(0) as i64;
    let now = current_timestamp();
    if !matches!(opts.ignore_expiration, Some(true))
        && let Some(exp) = data.claims.get("exp").and_then(Value::as_i64)
        && exp < now - leeway
    {
        return Err(Error::from_reason("jwt expired"));
    }
    if !matches!(opts.ignore_not_before, Some(true))
        && let Some(nbf) = data.claims.get("nbf").and_then(Value::as_i64)
        && nbf > now + leeway
    {
        return Err(Error::from_reason("jwt not active"));
    }

    Ok(VerifyResult {
        payload: data.claims,
        header: serde_json::to_value(&data.header).map_err(to_err)?,
    })
}

#[napi]
pub fn decode_token(token: String) -> Result<VerifyResult> {
    // Inspection without signature verification.
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() < 2 {
        return Err(Error::from_reason("invalid token"));
    }
    let header_bytes = URL_SAFE_NO_PAD.decode(parts[0]).map_err(to_err)?;
    let payload_bytes = URL_SAFE_NO_PAD.decode(parts[1]).map_err(to_err)?;
    let header: Value = serde_json::from_slice(&header_bytes).map_err(to_err)?;
    let payload: Value = serde_json::from_slice(&payload_bytes).map_err(to_err)?;
    Ok(VerifyResult { payload, header })
}

// Async variants built via AsyncTask so the API mirrors jsonwebtoken's
// callback-style functions but exposes Promises.

pub struct SignTask {
    payload: Value,
    secret: Vec<u8>,
    options: Option<SignOptions>,
}

#[napi]
impl Task for SignTask {
    type Output = String;
    type JsValue = String;

    fn compute(&mut self) -> Result<Self::Output> {
        sign_sync(
            self.payload.clone(),
            self.secret.clone().into(),
            std::mem::take(&mut self.options),
        )
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

#[napi]
pub fn sign(payload: Value, secret: Buffer, options: Option<SignOptions>) -> AsyncTask<SignTask> {
    AsyncTask::new(SignTask {
        payload,
        secret: secret.to_vec(),
        options,
    })
}

pub struct VerifyTask {
    token: String,
    secret: Vec<u8>,
    options: Option<VerifyOptions>,
}

#[napi]
impl Task for VerifyTask {
    type Output = VerifyResult;
    type JsValue = VerifyResult;

    fn compute(&mut self) -> Result<Self::Output> {
        verify_sync(
            self.token.clone(),
            self.secret.clone().into(),
            std::mem::take(&mut self.options),
        )
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

#[napi]
pub fn verify(
    token: String,
    secret: Buffer,
    options: Option<VerifyOptions>,
) -> AsyncTask<VerifyTask> {
    AsyncTask::new(VerifyTask {
        token,
        secret: secret.to_vec(),
        options,
    })
}
