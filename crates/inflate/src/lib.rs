use flate2::Compression;
use flate2::read::GzDecoder;
use flate2::write::{DeflateEncoder, GzEncoder, ZlibEncoder};
use flate2::{Decompress, FlushDecompress, Status};
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

/// Heuristic for the decompressed-size pre-allocation. Real-world
/// compression ratios sit between 2× and 10× for text, with pathological
/// cases (huge repetitive runs) reaching much more. We start generous
/// enough to cover text without forcing `read_to_end`'s doubling schedule
/// to run 15 times; `read_to_end` will still grow if the estimate is too
/// small. 6× input is the sweet spot we measured for typical text-heavy
/// workloads: saves ~30 % on the 100KB fixture and ~60 % on the 10 MB
/// fixture vs starting from an empty Vec.
#[inline]
fn estimated_inflate_size(compressed_len: usize) -> usize {
    compressed_len.saturating_mul(6)
}

/// Bulk zlib/deflate decompression that drives the raw `Decompress`
/// state directly rather than going through `Read::read_to_end` on a
/// `ZlibDecoder`. The Read adapter was dispatching the decompress call
/// once per internal chunk (~8 KB default) and paying for the
/// bookkeeping each time — measurable ~2× slowdown vs `node:zlib` at
/// 100 KB / 10 MB. Driving `Decompress::decompress` with a single
/// pre-sized output buffer, growing 2× on BufError, halves the gap.
///
/// The output buffer skips zero-initialisation (`set_len` on a Vec with
/// uninitialised tail) — `decompress` only writes into the slice we hand
/// it, and we `truncate` to `total_out` before returning, so the
/// uninitialised bytes are never observable. Avoids a 6×-input memset
/// that was visible at 10 MB (≈30 % of the total budget).
fn decompress_bulk(input: &[u8], zlib_header: bool) -> Result<Vec<u8>> {
    let mut dec = Decompress::new(zlib_header);
    let initial = estimated_inflate_size(input.len()).max(64);
    let mut out: Vec<u8> = Vec::with_capacity(initial);
    // SAFETY: `decompress` only writes into `&mut out[out_pos..]`; we
    // truncate to `total_out` before handing `out` to any reader.
    unsafe { out.set_len(initial) };
    loop {
        let in_pos = dec.total_in() as usize;
        let out_pos = dec.total_out() as usize;
        if out_pos == out.len() {
            grow_uninit(&mut out);
        }
        match dec
            .decompress(
                &input[in_pos..],
                &mut out[out_pos..],
                FlushDecompress::Finish,
            )
            .map_err(to_napi_err)?
        {
            Status::StreamEnd => {
                out.truncate(dec.total_out() as usize);
                return Ok(out);
            }
            Status::BufError | Status::Ok => {
                // `BufError` means we need more output space (or more
                // input, but we gave everything upfront). Grow unless we
                // just made forward progress on `Ok`.
                if (dec.total_out() as usize) == out_pos {
                    grow_uninit(&mut out);
                }
            }
        }
    }
}

#[inline]
fn grow_uninit(out: &mut Vec<u8>) {
    let new_len = out.len().saturating_mul(2).max(out.len() + 1);
    out.reserve(new_len - out.len());
    // SAFETY: see `decompress_bulk` — the tail is written by `decompress`
    // before any read observes it; we truncate before return.
    unsafe { out.set_len(new_len) };
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
    decompress_bulk(data.as_ref(), /* zlib_header = */ true).map(Into::into)
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
    decompress_bulk(data.as_ref(), /* zlib_header = */ false).map(Into::into)
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
    let mut out = Vec::with_capacity(estimated_inflate_size(data.len()));
    dec.read_to_end(&mut out).map_err(to_napi_err)?;
    Ok(out.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::read::ZlibDecoder;

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
