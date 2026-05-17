//! Zstd compression/decompression — thin napi wrapper around
//! `amigo-zstd-core`.

use amigo_zstd_core as core;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::sync::Mutex;

#[napi]
pub fn compress(input: Buffer, level: Option<i32>) -> Result<Buffer> {
    core::compress(input.as_ref(), level)
        .map(Buffer::from)
        .map_err(Error::from_reason)
}

#[napi]
pub fn decompress(input: Buffer) -> Result<Buffer> {
    core::decompress(input.as_ref())
        .map(Buffer::from)
        .map_err(Error::from_reason)
}

#[napi(js_name = "trainDictionary")]
pub fn train_dictionary(samples: Vec<Buffer>, dict_size: Option<u32>) -> Result<Buffer> {
    let bufs: Vec<&[u8]> = samples.iter().map(|b| b.as_ref()).collect();
    core::train_dictionary(&bufs, dict_size)
        .map(Buffer::from)
        .map_err(Error::from_reason)
}

#[napi]
pub struct Compressor {
    inner: Mutex<core::Compressor>,
}

#[napi]
impl Compressor {
    #[napi(constructor)]
    pub fn new(level: Option<i32>, dictionary: Option<Buffer>) -> Result<Self> {
        let dict_ref = dictionary.as_ref().map(|d| d.as_ref());
        let inner = core::Compressor::new(level, dict_ref).map_err(Error::from_reason)?;
        Ok(Self {
            inner: Mutex::new(inner),
        })
    }

    #[napi]
    pub fn compress(&self, input: Buffer) -> Result<Buffer> {
        let mut c = self
            .inner
            .lock()
            .map_err(|_| Error::from_reason("zstd compressor mutex poisoned"))?;
        c.compress(input.as_ref())
            .map(Buffer::from)
            .map_err(Error::from_reason)
    }

    #[napi(js_name = "compressMany")]
    pub fn compress_many(&self, inputs: Vec<Buffer>) -> Result<Vec<Buffer>> {
        let mut c = self
            .inner
            .lock()
            .map_err(|_| Error::from_reason("zstd compressor mutex poisoned"))?;
        let mut out: Vec<Buffer> = Vec::with_capacity(inputs.len());
        for input in &inputs {
            let v = c.compress(input.as_ref()).map_err(Error::from_reason)?;
            out.push(v.into());
        }
        Ok(out)
    }
}

#[napi]
pub struct Decompressor {
    dictionary: Option<Vec<u8>>,
    max_output_size: u64,
}

#[napi]
impl Decompressor {
    #[napi(constructor)]
    pub fn new(dictionary: Option<Buffer>, max_output_size: Option<BigInt>) -> Self {
        let cap = max_output_size
            .map(|b| b.get_u64().1)
            .filter(|n| *n > 0)
            .unwrap_or(core::DEFAULT_MAX_OUTPUT_SIZE);
        Self {
            dictionary: dictionary.map(|d| d.as_ref().to_vec()),
            max_output_size: cap,
        }
    }

    fn decompress_one(&self, input: &[u8]) -> Result<Vec<u8>> {
        core::decompress_with_dictionary(input, self.dictionary.as_deref(), self.max_output_size)
            .map_err(Error::from_reason)
    }

    #[napi]
    pub fn decompress(&self, input: Buffer) -> Result<Buffer> {
        Ok(self.decompress_one(input.as_ref())?.into())
    }

    #[napi(js_name = "decompressMany")]
    pub fn decompress_many(&self, inputs: Vec<Buffer>) -> Result<Vec<Buffer>> {
        inputs
            .iter()
            .map(|b| self.decompress_one(b.as_ref()).map(Into::into))
            .collect()
    }
}
