use napi::bindgen_prelude::*;
use napi_derive::napi;

// NAPI bindings over the `zstd` crate (wraps the reference libzstd C library).
// One-shot path is parity with `@mongodb-js/zstd`. The Compressor /
// Decompressor classes are the perf-review's required Green-path lever:
// reusable contexts + optional trained dictionaries amortize across many
// small calls. See docs/perf-review/zstd.md for the bcrypt-trap caveat.

const DEFAULT_LEVEL: i32 = 3;

#[napi]
pub fn compress(input: Buffer, level: Option<i32>) -> Result<Buffer> {
    let lvl = level.unwrap_or(DEFAULT_LEVEL);
    zstd::encode_all(input.as_ref(), lvl)
        .map(Into::into)
        .map_err(|e| Error::from_reason(format!("zstd compress: {}", e)))
}

#[napi]
pub fn decompress(input: Buffer) -> Result<Buffer> {
    zstd::decode_all(input.as_ref())
        .map(Into::into)
        .map_err(|e| Error::from_reason(format!("zstd decompress: {}", e)))
}

#[napi(js_name = "trainDictionary")]
pub fn train_dictionary(samples: Vec<Buffer>, dict_size: Option<u32>) -> Result<Buffer> {
    let size = dict_size.map(|s| s as usize).unwrap_or(112_640);
    let bufs: Vec<&[u8]> = samples.iter().map(|b| b.as_ref()).collect();
    zstd::dict::from_samples(&bufs, size)
        .map(Into::into)
        .map_err(|e| Error::from_reason(format!("zstd train dictionary: {}", e)))
}

#[napi]
pub struct Compressor {
    level: i32,
    dictionary: Option<Vec<u8>>,
}

#[napi]
impl Compressor {
    #[napi(constructor)]
    pub fn new(level: Option<i32>, dictionary: Option<Buffer>) -> Self {
        Self {
            level: level.unwrap_or(DEFAULT_LEVEL),
            dictionary: dictionary.map(|d| d.as_ref().to_vec()),
        }
    }

    #[napi]
    pub fn compress(&self, input: Buffer) -> Result<Buffer> {
        let mut c = match &self.dictionary {
            Some(dict) => zstd::bulk::Compressor::with_dictionary(self.level, dict),
            None => zstd::bulk::Compressor::new(self.level),
        }
        .map_err(|e| Error::from_reason(format!("zstd compressor init: {}", e)))?;
        c.compress(input.as_ref())
            .map(Into::into)
            .map_err(|e| Error::from_reason(format!("zstd compress: {}", e)))
    }

    #[napi(js_name = "compressMany")]
    pub fn compress_many(&self, inputs: Vec<Buffer>) -> Result<Vec<Buffer>> {
        let mut c = match &self.dictionary {
            Some(dict) => zstd::bulk::Compressor::with_dictionary(self.level, dict),
            None => zstd::bulk::Compressor::new(self.level),
        }
        .map_err(|e| Error::from_reason(format!("zstd compressor init: {}", e)))?;
        let mut out: Vec<Buffer> = Vec::with_capacity(inputs.len());
        for input in &inputs {
            let v = c
                .compress(input.as_ref())
                .map_err(|e| Error::from_reason(format!("zstd compress: {}", e)))?;
            out.push(v.into());
        }
        Ok(out)
    }
}

#[napi]
pub struct Decompressor {
    dictionary: Option<Vec<u8>>,
}

#[napi]
impl Decompressor {
    #[napi(constructor)]
    pub fn new(dictionary: Option<Buffer>) -> Self {
        Self {
            dictionary: dictionary.map(|d| d.as_ref().to_vec()),
        }
    }

    fn make(&self) -> Result<zstd::bulk::Decompressor<'static>> {
        match &self.dictionary {
            Some(dict) => zstd::bulk::Decompressor::with_dictionary(dict),
            None => zstd::bulk::Decompressor::new(),
        }
        .map_err(|e| Error::from_reason(format!("zstd decompressor init: {}", e)))
    }

    #[napi]
    pub fn decompress(&self, input: Buffer) -> Result<Buffer> {
        let mut d = self.make()?;
        // upper-bound on decompressed size: use frame content if known, else
        // a generous heuristic. zstd-rs has `Decompressor::decompress` which
        // takes a capacity; we use a guess of 4× the input size, growing.
        let capacity = input.len().saturating_mul(4).max(1024);
        d.decompress(input.as_ref(), capacity)
            .map(Into::into)
            .map_err(|e| Error::from_reason(format!("zstd decompress: {}", e)))
    }

    #[napi(js_name = "decompressMany")]
    pub fn decompress_many(&self, inputs: Vec<Buffer>) -> Result<Vec<Buffer>> {
        let mut d = self.make()?;
        let mut out: Vec<Buffer> = Vec::with_capacity(inputs.len());
        for input in &inputs {
            let capacity = input.len().saturating_mul(4).max(1024);
            let v = d
                .decompress(input.as_ref(), capacity)
                .map_err(|e| Error::from_reason(format!("zstd decompress: {}", e)))?;
            out.push(v.into());
        }
        Ok(out)
    }
}
