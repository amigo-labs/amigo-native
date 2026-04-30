//! bcrypt password hashing — backed by Solar Designer's `crypt_blowfish` C
//! implementation (vendored, public domain). See `csrc/NOTICE.md`.

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int, c_ulong};

const DEFAULT_COST: u32 = 12;
const MIN_COST: u32 = 4;
const MAX_COST: u32 = 31;

// `$2b$XX$22-char-salt22-char-hash31-char` = 60 ASCII bytes. The output
// buffer must be sized to hold setting + hash + NUL. Upstream documents
// 7+22+31+1+1 = 62; we use 64 for alignment headroom.
const HASH_BUF_LEN: usize = 64;
// `$2b$XX$22-char-salt` setting string + NUL = 7 + 22 + 1 = 30. Round to 32.
const SETTING_BUF_LEN: usize = 32;
// Raw salt bytes input to gensalt.
const SALT_BYTES: usize = 16;

unsafe extern "C" {
    fn _crypt_blowfish_rn(
        key: *const c_char,
        setting: *const c_char,
        output: *mut c_char,
        size: c_int,
    ) -> *mut c_char;

    fn _crypt_gensalt_blowfish_rn(
        prefix: *const c_char,
        count: c_ulong,
        input: *const c_char,
        size: c_int,
        output: *mut c_char,
        output_size: c_int,
    ) -> *mut c_char;
}

#[napi(object)]
#[derive(Default)]
pub struct BcryptOptions {
    pub cost: Option<u32>,
}

fn validate_cost(cost: u32) -> Result<()> {
    if !(MIN_COST..=MAX_COST).contains(&cost) {
        return Err(Error::from_reason(format!(
            "bcrypt cost must be between {MIN_COST} and {MAX_COST}, got {cost}"
        )));
    }
    Ok(())
}

fn gensalt(cost: u32) -> Result<CString> {
    let mut entropy = [0u8; SALT_BYTES];
    getrandom::getrandom(&mut entropy)
        .map_err(|e| Error::from_reason(format!("failed to read OS entropy: {e}")))?;

    let prefix = b"$2b\0";
    let mut out = [0i8; SETTING_BUF_LEN];
    let ptr = unsafe {
        _crypt_gensalt_blowfish_rn(
            prefix.as_ptr() as *const c_char,
            cost as c_ulong,
            entropy.as_ptr() as *const c_char,
            SALT_BYTES as c_int,
            out.as_mut_ptr(),
            SETTING_BUF_LEN as c_int,
        )
    };
    if ptr.is_null() {
        return Err(Error::from_reason("bcrypt gensalt failed"));
    }
    let setting = unsafe { CStr::from_ptr(out.as_ptr()) }.to_owned();
    Ok(setting)
}

fn bf_crypt(password: &str, setting: &CStr) -> Result<String> {
    // Truncate password at first NUL since C strings are NUL-terminated. The
    // bcrypt spec also truncates at 72 bytes; the C code enforces that.
    let key = CString::new(password.as_bytes())
        .map_err(|_| Error::from_reason("password contains internal NUL byte"))?;

    let mut out = [0i8; HASH_BUF_LEN];
    let ptr = unsafe {
        _crypt_blowfish_rn(
            key.as_ptr(),
            setting.as_ptr(),
            out.as_mut_ptr(),
            HASH_BUF_LEN as c_int,
        )
    };
    if ptr.is_null() || out[0] == b'*' as i8 {
        // crypt_blowfish writes a leading '*' to the output buffer on failure
        // (DES tradition) instead of segfaulting with a NULL.
        return Err(Error::from_reason("bcrypt hash computation failed"));
    }
    let cs = unsafe { CStr::from_ptr(out.as_ptr()) };
    cs.to_str()
        .map(str::to_owned)
        .map_err(|e| Error::from_reason(format!("bcrypt produced non-UTF-8 output: {e}")))
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

fn parse_setting(hash: &str) -> Result<CString> {
    // The "setting" portion of a bcrypt hash is the prefix `$2X$cost$22-char-salt`
    // — exactly 29 characters. crypt_blowfish parses it from the full hash too,
    // but feeding only the setting avoids any ambiguity.
    let bytes = hash.as_bytes();
    if bytes.len() < 29 || bytes[0] != b'$' {
        return Err(Error::from_reason("invalid bcrypt hash format"));
    }
    CString::new(&bytes[..29.min(bytes.len())])
        .map_err(|_| Error::from_reason("invalid bcrypt hash format"))
}

fn verify_inner(password: &str, hash: &str) -> Result<bool> {
    let setting = parse_setting(hash)?;
    let recomputed = bf_crypt(password, &setting)?;
    Ok(constant_time_eq(recomputed.as_bytes(), hash.as_bytes()))
}

// ── Sync API ──────────────────────────────────────────────────────────────

#[napi]
pub fn hash_sync(password: String, options: Option<BcryptOptions>) -> Result<String> {
    let cost = options.unwrap_or_default().cost.unwrap_or(DEFAULT_COST);
    validate_cost(cost)?;
    let setting = gensalt(cost)?;
    bf_crypt(&password, &setting)
}

#[napi]
pub fn verify_sync(hash: String, password: String) -> Result<bool> {
    verify_inner(&password, &hash)
}

// ── Async API ─────────────────────────────────────────────────────────────

pub struct HashTask {
    password: String,
    cost: u32,
}

#[napi]
impl Task for HashTask {
    type Output = String;
    type JsValue = String;

    fn compute(&mut self) -> Result<Self::Output> {
        let setting = gensalt(self.cost)?;
        bf_crypt(&self.password, &setting)
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

#[napi]
pub fn hash(password: String, options: Option<BcryptOptions>) -> Result<AsyncTask<HashTask>> {
    let cost = options.unwrap_or_default().cost.unwrap_or(DEFAULT_COST);
    validate_cost(cost)?;
    Ok(AsyncTask::new(HashTask { password, cost }))
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
        verify_inner(&self.password, &self.hash)
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

#[napi]
pub fn verify(hash: String, password: String) -> AsyncTask<VerifyTask> {
    AsyncTask::new(VerifyTask { hash, password })
}
