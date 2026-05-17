//! Shared zlib/deflate/gzip compression + decompression via `flate2`
//! (with `zlib-rs` backend — pure-Rust, no C dep). Internal-only.

use flate2::Compression;
use flate2::read::GzDecoder;
use flate2::write::{DeflateEncoder, GzEncoder, ZlibEncoder};
use flate2::{Decompress, FlushDecompress, Status};
use std::io::{Read, Write};

/// Default decompression-bomb guard (256 MiB).
pub const DEFAULT_MAX_OUTPUT_SIZE: u64 = 256 * 1024 * 1024;

pub fn compression(level: Option<u32>) -> Compression {
    Compression::new(level.unwrap_or(6).min(9))
}

pub fn resolve_max(max: Option<u32>) -> u64 {
    match max {
        Some(0) => u64::MAX,
        Some(n) => n as u64,
        None => DEFAULT_MAX_OUTPUT_SIZE,
    }
}

#[inline]
fn estimated_inflate_size(compressed_len: usize) -> usize {
    compressed_len.saturating_mul(6)
}

#[allow(clippy::uninit_vec)]
fn decompress_bulk(input: &[u8], zlib_header: bool, max_output: u64) -> Result<Vec<u8>, String> {
    let mut dec = Decompress::new(zlib_header);
    let cap = (max_output.min(usize::MAX as u64)) as usize;
    let initial = estimated_inflate_size(input.len()).max(64).min(cap);
    let mut out: Vec<u8> = Vec::with_capacity(initial);
    // SAFETY: `decompress` only writes into `&mut out[out_pos..]`; we
    // truncate to `total_out` before any reader observes `out`.
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
            .map_err(|e| e.to_string())?
        {
            Status::StreamEnd => {
                out.truncate(dec.total_out() as usize);
                return Ok(out);
            }
            Status::BufError | Status::Ok => {
                if (dec.total_out() as usize) == out_pos {
                    grow_uninit(&mut out, cap)?;
                }
            }
        }
    }
}

#[inline]
#[allow(clippy::uninit_vec)]
fn grow_uninit(out: &mut Vec<u8>, cap: usize) -> Result<(), String> {
    if out.len() >= cap {
        return Err(format!(
            "decompressed size exceeds max_output_size ({cap} bytes)"
        ));
    }
    let new_len = out.len().saturating_mul(2).max(out.len() + 1).min(cap);
    out.reserve(new_len - out.len());
    // SAFETY: see `decompress_bulk`.
    unsafe { out.set_len(new_len) };
    Ok(())
}

pub fn deflate(data: &[u8], level: Option<u32>) -> Result<Vec<u8>, String> {
    let mut enc = ZlibEncoder::new(Vec::new(), compression(level));
    enc.write_all(data).map_err(|e| e.to_string())?;
    enc.finish().map_err(|e| e.to_string())
}

pub fn inflate(data: &[u8], max_output_size: Option<u32>) -> Result<Vec<u8>, String> {
    decompress_bulk(data, true, resolve_max(max_output_size))
}

pub fn deflate_raw(data: &[u8], level: Option<u32>) -> Result<Vec<u8>, String> {
    let mut enc = DeflateEncoder::new(Vec::new(), compression(level));
    enc.write_all(data).map_err(|e| e.to_string())?;
    enc.finish().map_err(|e| e.to_string())
}

pub fn inflate_raw(data: &[u8], max_output_size: Option<u32>) -> Result<Vec<u8>, String> {
    decompress_bulk(data, false, resolve_max(max_output_size))
}

pub fn gzip(data: &[u8], level: Option<u32>) -> Result<Vec<u8>, String> {
    let mut enc = GzEncoder::new(Vec::new(), compression(level));
    enc.write_all(data).map_err(|e| e.to_string())?;
    enc.finish().map_err(|e| e.to_string())
}

pub fn ungzip(data: &[u8], max_output_size: Option<u32>) -> Result<Vec<u8>, String> {
    let max = resolve_max(max_output_size);
    let cap = (max.min(usize::MAX as u64)) as usize;
    let read_limit = max.saturating_add(1);
    let mut dec = GzDecoder::new(data).take(read_limit);
    let mut out = Vec::with_capacity(estimated_inflate_size(data.len()).min(cap));
    dec.read_to_end(&mut out).map_err(|e| e.to_string())?;
    if out.len() as u64 > max {
        return Err(format!(
            "decompressed size exceeds max_output_size ({max} bytes)"
        ));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_empty() {
        let enc = deflate(b"", None).unwrap();
        let dec = inflate(&enc, None).unwrap();
        assert_eq!(dec, b"");
    }

    #[test]
    fn roundtrip_small() {
        let enc = deflate(b"hello world", None).unwrap();
        let dec = inflate(&enc, None).unwrap();
        assert_eq!(dec, b"hello world");
    }

    #[test]
    fn gzip_roundtrip() {
        let enc = gzip(b"some text", None).unwrap();
        let dec = ungzip(&enc, None).unwrap();
        assert_eq!(dec, b"some text");
    }

    #[test]
    fn max_output_size_caps_decompression() {
        let big: Vec<u8> = vec![b'a'; 10_000];
        let enc = deflate(&big, None).unwrap();
        let err = inflate(&enc, Some(100)).unwrap_err();
        assert!(err.contains("max_output_size"));
    }
}
