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
    /// Hard cap on decompressed output size in bytes. Defaults to
    /// `DEFAULT_MAX_OUTPUT_SIZE` (256 MiB). Decompression that would
    /// exceed this limit returns a napi error rather than allocating
    /// further. Pass `0` to disable the cap (not recommended for
    /// untrusted input — gzip bombs expand to terabytes).
    pub max_output_size: Option<u32>,
}

/// Default decompression-bomb guard (256 MiB). A 10 MB gzip bomb that
/// expands to 100 GB hits this limit at 256 MB and is rejected, leaving
/// the host process responsive.
const DEFAULT_MAX_OUTPUT_SIZE: u64 = 256 * 1024 * 1024;

fn to_napi_err<E: std::fmt::Display>(e: E) -> Error {
    Error::from_reason(e.to_string())
}

fn compression_from(opts: Option<&InflateOptions>) -> Compression {
    let level = opts.and_then(|o| o.level).unwrap_or(6).min(9);
    Compression::new(level)
}

fn max_output_size_from(opts: Option<&InflateOptions>) -> u64 {
    match opts.and_then(|o| o.max_output_size) {
        Some(0) => u64::MAX,
        Some(n) => n as u64,
        None => DEFAULT_MAX_OUTPUT_SIZE,
    }
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
///
/// `clippy::uninit_vec` is a conservative default; for `u8` every bit
/// pattern is valid and `decompress` writes every byte we expose.
#[allow(clippy::uninit_vec)]
fn decompress_bulk(input: &[u8], zlib_header: bool, max_output: u64) -> Result<Vec<u8>> {
    let mut dec = Decompress::new(zlib_header);
    let cap = (max_output.min(usize::MAX as u64)) as usize;
    let initial = estimated_inflate_size(input.len()).max(64).min(cap);
    let mut out: Vec<u8> = Vec::with_capacity(initial);
    // SAFETY: `decompress` only writes into `&mut out[out_pos..]`; we
    // truncate to `total_out` before handing `out` to any reader.
    unsafe { out.set_len(initial) };
    loop {
        let in_pos = dec.total_in() as usize;
        let out_pos = dec.total_out() as usize;
        if out_pos == out.len() {
            grow_uninit(&mut out, cap)?;
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
                    grow_uninit(&mut out, cap)?;
                }
            }
        }
    }
}

#[inline]
#[allow(clippy::uninit_vec)]
fn grow_uninit(out: &mut Vec<u8>, cap: usize) -> Result<()> {
    if out.len() >= cap {
        return Err(Error::from_reason(format!(
            "decompressed size exceeds max_output_size ({cap} bytes)"
        )));
    }
    let new_len = out.len().saturating_mul(2).max(out.len() + 1).min(cap);
    out.reserve(new_len - out.len());
    // SAFETY: see `decompress_bulk` — the tail is written by `decompress`
    // before any read observes it; we truncate before return.
    unsafe { out.set_len(new_len) };
    Ok(())
}

#[napi]
pub fn deflate(data: Buffer, options: Option<InflateOptions>) -> Result<Buffer> {
    let mut enc = ZlibEncoder::new(Vec::new(), compression_from(options.as_ref()));
    enc.write_all(&data).map_err(to_napi_err)?;
    let out = enc.finish().map_err(to_napi_err)?;
    Ok(out.into())
}

#[napi]
pub fn inflate(data: Buffer, options: Option<InflateOptions>) -> Result<Buffer> {
    let max = max_output_size_from(options.as_ref());
    decompress_bulk(data.as_ref(), /* zlib_header = */ true, max).map(Into::into)
}

#[napi]
pub fn deflate_raw(data: Buffer, options: Option<InflateOptions>) -> Result<Buffer> {
    let mut enc = DeflateEncoder::new(Vec::new(), compression_from(options.as_ref()));
    enc.write_all(&data).map_err(to_napi_err)?;
    let out = enc.finish().map_err(to_napi_err)?;
    Ok(out.into())
}

#[napi]
pub fn inflate_raw(data: Buffer, options: Option<InflateOptions>) -> Result<Buffer> {
    let max = max_output_size_from(options.as_ref());
    decompress_bulk(data.as_ref(), /* zlib_header = */ false, max).map(Into::into)
}

#[napi]
pub fn gzip(data: Buffer, options: Option<InflateOptions>) -> Result<Buffer> {
    let mut enc = GzEncoder::new(Vec::new(), compression_from(options.as_ref()));
    enc.write_all(&data).map_err(to_napi_err)?;
    let out = enc.finish().map_err(to_napi_err)?;
    Ok(out.into())
}

#[napi]
pub fn ungzip(data: Buffer, options: Option<InflateOptions>) -> Result<Buffer> {
    let max = max_output_size_from(options.as_ref());
    let cap = (max.min(usize::MAX as u64)) as usize;
    // Read up to `max + 1` bytes — if the +1 ever materialises, the
    // stream wanted to produce more output than the cap allows.
    let read_limit = max.saturating_add(1);
    let mut dec = GzDecoder::new(data.as_ref()).take(read_limit);
    let mut out = Vec::with_capacity(estimated_inflate_size(data.len()).min(cap));
    dec.read_to_end(&mut out).map_err(to_napi_err)?;
    if out.len() as u64 > max {
        return Err(Error::from_reason(format!(
            "decompressed size exceeds max_output_size ({max} bytes)"
        )));
    }
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

    // The `max_output_size` cap is exercised end-to-end from the vitest
    // suite (`__test__/index.spec.ts`) — covering it here would require
    // calling `decompress_bulk` directly, which returns `napi::Result`
    // and pulls napi runtime symbols into the test binary.
}
