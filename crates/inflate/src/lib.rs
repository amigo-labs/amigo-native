//! zlib / deflate / gzip — thin napi wrapper around `amigo-inflate-core`.

use amigo_inflate_core as core;
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi(object)]
#[derive(Default)]
pub struct InflateOptions {
    /// Compression level 0–9 (default 6, analogous to pako).
    pub level: Option<u32>,
    /// Hard cap on decompressed output size in bytes. Defaults to 256 MiB.
    /// Pass `0` to disable the cap (not recommended for untrusted input —
    /// gzip bombs expand to terabytes).
    pub max_output_size: Option<u32>,
}

fn level(o: &Option<InflateOptions>) -> Option<u32> {
    o.as_ref().and_then(|x| x.level)
}
fn max_out(o: &Option<InflateOptions>) -> Option<u32> {
    o.as_ref().and_then(|x| x.max_output_size)
}

#[napi]
pub fn deflate(data: Buffer, options: Option<InflateOptions>) -> Result<Buffer> {
    core::deflate(data.as_ref(), level(&options))
        .map(Buffer::from)
        .map_err(Error::from_reason)
}

#[napi]
pub fn inflate(data: Buffer, options: Option<InflateOptions>) -> Result<Buffer> {
    core::inflate(data.as_ref(), max_out(&options))
        .map(Buffer::from)
        .map_err(Error::from_reason)
}

#[napi]
pub fn deflate_raw(data: Buffer, options: Option<InflateOptions>) -> Result<Buffer> {
    core::deflate_raw(data.as_ref(), level(&options))
        .map(Buffer::from)
        .map_err(Error::from_reason)
}

#[napi]
pub fn inflate_raw(data: Buffer, options: Option<InflateOptions>) -> Result<Buffer> {
    core::inflate_raw(data.as_ref(), max_out(&options))
        .map(Buffer::from)
        .map_err(Error::from_reason)
}

#[napi]
pub fn gzip(data: Buffer, options: Option<InflateOptions>) -> Result<Buffer> {
    core::gzip(data.as_ref(), level(&options))
        .map(Buffer::from)
        .map_err(Error::from_reason)
}

#[napi]
pub fn ungzip(data: Buffer, options: Option<InflateOptions>) -> Result<Buffer> {
    core::ungzip(data.as_ref(), max_out(&options))
        .map(Buffer::from)
        .map_err(Error::from_reason)
}
