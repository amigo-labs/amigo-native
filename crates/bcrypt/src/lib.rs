use bcrypt::{DEFAULT_COST, hash as bcrypt_hash, verify as bcrypt_verify};
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi(object)]
#[derive(Default)]
pub struct BcryptOptions {
    pub cost: Option<u32>,
}

fn resolve_cost(opts: &BcryptOptions) -> u32 {
    opts.cost.unwrap_or(DEFAULT_COST)
}

#[napi]
pub fn hash_sync(password: String, options: Option<BcryptOptions>) -> Result<String> {
    let cost = resolve_cost(&options.unwrap_or_default());
    bcrypt_hash(password, cost).map_err(|e| Error::from_reason(e.to_string()))
}

#[napi]
pub fn verify_sync(hash: String, password: String) -> Result<bool> {
    bcrypt_verify(password, &hash).map_err(|e| Error::from_reason(e.to_string()))
}

pub struct HashTask {
    password: String,
    opts: BcryptOptions,
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
pub fn hash(password: String, options: Option<BcryptOptions>) -> AsyncTask<HashTask> {
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
