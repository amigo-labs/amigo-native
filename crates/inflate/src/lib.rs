use flate2::Compression;
use flate2::read::{DeflateDecoder, GzDecoder, ZlibDecoder};
use flate2::write::{DeflateEncoder, GzEncoder, ZlibEncoder};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::io::{Read, Write};

#[napi(object)]
#[derive(Default)]
pub struct InflateOptions {
    /// Compression level 0–9 (default 6, analogous to pako).
    pub level: Option<u32>,
}

fn to_napi_err<E: std::fmt::Display>(e: E) -> Error {
    Error::from_reason(e.to_string())
}

fn compression_from(opts: Option<InflateOptions>) -> Compression {
    let level = opts.and_then(|o| o.level).unwrap_or(6).min(9);
    Compression::new(level)
}

#[napi]
pub fn deflate(data: Buffer, options: Option<InflateOptions>) -> Result<Buffer> {
    let mut enc = ZlibEncoder::new(Vec::new(), compression_from(options));
    enc.write_all(&data).map_err(to_napi_err)?;
    let out = enc.finish().map_err(to_napi_err)?;
    Ok(out.into())
}

#[napi]
pub fn inflate(data: Buffer) -> Result<Buffer> {
    let mut dec = ZlibDecoder::new(data.as_ref());
    let mut out = Vec::new();
    dec.read_to_end(&mut out).map_err(to_napi_err)?;
    Ok(out.into())
}

#[napi]
pub fn deflate_raw(data: Buffer, options: Option<InflateOptions>) -> Result<Buffer> {
    let mut enc = DeflateEncoder::new(Vec::new(), compression_from(options));
    enc.write_all(&data).map_err(to_napi_err)?;
    let out = enc.finish().map_err(to_napi_err)?;
    Ok(out.into())
}

#[napi]
pub fn inflate_raw(data: Buffer) -> Result<Buffer> {
    let mut dec = DeflateDecoder::new(data.as_ref());
    let mut out = Vec::new();
    dec.read_to_end(&mut out).map_err(to_napi_err)?;
    Ok(out.into())
}

#[napi]
pub fn gzip(data: Buffer, options: Option<InflateOptions>) -> Result<Buffer> {
    let mut enc = GzEncoder::new(Vec::new(), compression_from(options));
    enc.write_all(&data).map_err(to_napi_err)?;
    let out = enc.finish().map_err(to_napi_err)?;
    Ok(out.into())
}

#[napi]
pub fn ungzip(data: Buffer) -> Result<Buffer> {
    let mut dec = GzDecoder::new(data.as_ref());
    let mut out = Vec::new();
    dec.read_to_end(&mut out).map_err(to_napi_err)?;
    Ok(out.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roundtrip_zlib(data: &[u8]) {
        let enc = {
            let mut e = ZlibEncoder::new(Vec::new(), Compression::new(6));
            e.write_all(data).unwrap();
            e.finish().unwrap()
        };
        let dec = {
            let mut d = ZlibDecoder::new(enc.as_slice());
            let mut out = Vec::new();
            d.read_to_end(&mut out).unwrap();
            out
        };
        assert_eq!(dec, data);
    }

    #[test]
    fn roundtrip_empty() {
        roundtrip_zlib(b"");
    }

    #[test]
    fn roundtrip_small() {
        roundtrip_zlib(b"hello world");
    }

    #[test]
    fn roundtrip_large() {
        let data: Vec<u8> = (0..1_000_000).map(|i| (i % 251) as u8).collect();
        roundtrip_zlib(&data);
    }
}
