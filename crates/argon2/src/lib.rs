use argon2::password_hash::SaltString;
use argon2::password_hash::rand_core::OsRng;
use argon2::{Algorithm, Argon2, Params, PasswordHash, PasswordHasher, PasswordVerifier, Version};
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi(object)]
#[derive(Default)]
pub struct Argon2Options {
    pub memory_cost: Option<u32>,
    pub time_cost: Option<u32>,
    pub parallelism: Option<u32>,
    pub output_len: Option<u32>,
}

fn build_argon2(opts: &Argon2Options) -> Result<Argon2<'static>> {
    let params = Params::new(
        opts.memory_cost.unwrap_or(65536),
        opts.time_cost.unwrap_or(3),
        opts.parallelism.unwrap_or(4),
        Some(opts.output_len.unwrap_or(32) as usize),
    )
    .map_err(|e| Error::from_reason(e.to_string()))?;

    Ok(Argon2::new(Algorithm::Argon2id, Version::V0x13, params))
}

#[napi]
pub fn hash_sync(password: String, options: Option<Argon2Options>) -> Result<String> {
    let opts = options.unwrap_or_default();
    let argon2 = build_argon2(&opts)?;
    let salt = SaltString::generate(&mut OsRng);
    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| Error::from_reason(e.to_string()))?;
    Ok(hash.to_string())
}

#[napi]
pub fn verify_sync(hash: String, password: String) -> Result<bool> {
    let parsed = PasswordHash::new(&hash).map_err(|e| Error::from_reason(e.to_string()))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

pub struct HashTask {
    password: String,
    opts: Argon2Options,
}

#[napi]
impl Task for HashTask {
    type Output = String;
    type JsValue = String;

    fn compute(&mut self) -> Result<Self::Output> {
        hash_sync(self.password.clone(), Some(std::mem::take(&mut self.opts)))
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

#[napi]
pub fn hash(password: String, options: Option<Argon2Options>) -> AsyncTask<HashTask> {
    AsyncTask::new(HashTask {
        password,
        opts: options.unwrap_or_default(),
    })
}

pub struct VerifyTask {
    hash: String,
    password: String,
}

#[napi]
impl Task for VerifyTask {
    type Output = bool;
    type JsValue = bool;

    fn compute(&mut self) -> Result<Self::Output> {
        verify_sync(self.hash.clone(), self.password.clone())
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

#[napi]
pub fn verify(hash: String, password: String) -> AsyncTask<VerifyTask> {
    AsyncTask::new(VerifyTask { hash, password })
}
