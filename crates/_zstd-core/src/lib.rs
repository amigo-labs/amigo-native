//! Shared zstd logic. Internal-only.
//!
//! The `zstd` crate (libzstd via zstd-sys) does not build for
//! `wasm32-unknown-unknown`. The WASM build substitutes `ruzstd`
//! (pure-Rust, decompress-only); `compress` and `train_dictionary`
//! return an error in the browser.

pub const DEFAULT_LEVEL: i32 = 3;
pub const DEFAULT_MAX_OUTPUT_SIZE: u64 = 256 * 1024 * 1024;

// =============================================================================
// Native (zstd / libzstd) build
// =============================================================================

#[cfg(not(target_arch = "wasm32"))]
mod native {
    use super::*;

    pub fn compress(input: &[u8], level: Option<i32>) -> Result<Vec<u8>, String> {
        let lvl = level.unwrap_or(DEFAULT_LEVEL);
        zstd::encode_all(input, lvl).map_err(|e| format!("zstd compress: {}", e))
    }

    pub fn decompress(input: &[u8]) -> Result<Vec<u8>, String> {
        zstd::decode_all(input).map_err(|e| format!("zstd decompress: {}", e))
    }

    pub fn train_dictionary(samples: &[&[u8]], dict_size: Option<u32>) -> Result<Vec<u8>, String> {
        let size = dict_size.map(|s| s as usize).unwrap_or(112_640);
        zstd::dict::from_samples(samples, size).map_err(|e| format!("zstd train dictionary: {}", e))
    }

    pub struct Compressor {
        inner: zstd::bulk::Compressor<'static>,
    }

    impl Compressor {
        pub fn new(level: Option<i32>, dictionary: Option<&[u8]>) -> Result<Self, String> {
            let lvl = level.unwrap_or(DEFAULT_LEVEL);
            let inner = match dictionary {
                Some(dict) => zstd::bulk::Compressor::with_dictionary(lvl, dict),
                None => zstd::bulk::Compressor::new(lvl),
            }
            .map_err(|e| format!("zstd compressor init: {}", e))?;
            Ok(Self { inner })
        }

        pub fn compress(&mut self, input: &[u8]) -> Result<Vec<u8>, String> {
            self.inner
                .compress(input)
                .map_err(|e| format!("zstd compress: {}", e))
        }
    }

    pub fn decompress_with_dictionary(
        input: &[u8],
        dictionary: Option<&[u8]>,
        max_output: u64,
    ) -> Result<Vec<u8>, String> {
        use std::io::Read;
        let decoder = match dictionary {
            Some(dict) => zstd::stream::read::Decoder::with_dictionary(input, dict),
            None => zstd::stream::read::Decoder::with_buffer(input),
        }
        .map_err(|e| format!("zstd decoder init: {}", e))?;
        let mut limited = decoder.take(max_output.saturating_add(1));
        let mut out = Vec::new();
        limited
            .read_to_end(&mut out)
            .map_err(|e| format!("zstd decompress: {}", e))?;
        if (out.len() as u64) > max_output {
            return Err(format!(
                "zstd decompress: output exceeds max_output_size of {} bytes (decompression bomb?)",
                max_output
            ));
        }
        Ok(out)
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub use native::{Compressor, compress, decompress, decompress_with_dictionary, train_dictionary};

// =============================================================================
// WASM (ruzstd, decompress-only) build
// =============================================================================

#[cfg(target_arch = "wasm32")]
mod wasm_impl {
    use super::*;
    use std::io::Read;

    pub fn compress(_input: &[u8], _level: Option<i32>) -> Result<Vec<u8>, String> {
        Err("zstd compress is not available in the WASM build (libzstd-only)".to_string())
    }

    pub fn decompress(input: &[u8]) -> Result<Vec<u8>, String> {
        let mut decoder = ruzstd::decoding::StreamingDecoder::new(input)
            .map_err(|e| format!("zstd decoder init: {:?}", e))?;
        let mut out = Vec::new();
        decoder
            .read_to_end(&mut out)
            .map_err(|e| format!("zstd decompress: {}", e))?;
        Ok(out)
    }

    pub fn train_dictionary(
        _samples: &[&[u8]],
        _dict_size: Option<u32>,
    ) -> Result<Vec<u8>, String> {
        Err("zstd train_dictionary is not available in the WASM build (libzstd-only)".to_string())
    }

    pub struct Compressor;

    impl Compressor {
        pub fn new(_level: Option<i32>, _dictionary: Option<&[u8]>) -> Result<Self, String> {
            Err("zstd compress is not available in the WASM build (libzstd-only)".to_string())
        }

        pub fn compress(&mut self, _input: &[u8]) -> Result<Vec<u8>, String> {
            Err("zstd compress is not available in the WASM build (libzstd-only)".to_string())
        }
    }

    pub fn decompress_with_dictionary(
        input: &[u8],
        dictionary: Option<&[u8]>,
        max_output: u64,
    ) -> Result<Vec<u8>, String> {
        if dictionary.is_some() {
            return Err(
                "zstd dictionary decompression is not available in the WASM build (libzstd-only)"
                    .to_string(),
            );
        }
        let out = decompress(input)?;
        if (out.len() as u64) > max_output {
            return Err(format!(
                "zstd decompress: output exceeds max_output_size of {} bytes (decompression bomb?)",
                max_output
            ));
        }
        Ok(out)
    }
}

#[cfg(target_arch = "wasm32")]
pub use wasm_impl::{
    Compressor, compress, decompress, decompress_with_dictionary, train_dictionary,
};
