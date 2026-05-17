//! Character-encoding conversion — thin napi wrapper around
//! `amigo-encoding-core`.

use amigo_encoding_core as core;
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi]
pub fn encoding_exists(encoding: String) -> bool {
    core::label_exists(&encoding)
}

#[napi]
pub fn encode(input: String, encoding: String) -> Result<Buffer> {
    core::encode_str(&input, &encoding)
        .map(Buffer::from)
        .map_err(Error::from_reason)
}

#[napi]
pub fn decode(input: Buffer, encoding: String) -> Result<String> {
    core::decode_bytes(&input, &encoding).map_err(Error::from_reason)
}
