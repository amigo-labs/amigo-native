use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::sync::Mutex;

// NAPI bindings over the `zstd` crate (wraps the reference libzstd C library).
// One-shot path is parity with `@mongodb-js/zstd`. The Compressor /
// Decompressor classes are the perf-review's required Green-path lever:
// reusable contexts + optional trained dictionaries amortize across many
// small calls. See docs/perf-review/zstd.md for the bcrypt-trap caveat.

const DEFAULT_LEVEL: i32 = 3;
// Hard ceiling on a single decompress() output. Decompression bombs would
// otherwise expand a few KB of input into many GB of memory. 256 MiB is
// well above the largest realistic single-frame zstd payload (BSON docs,
// log batches, RPC bodies); callers that need more set max_output_size
// explicitly when constructing the Decompressor.
const DEFAULT_MAX_OUTPUT_SIZE: u64 = 256 * 1024 * 1024;

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

// Reusable libzstd compression context held inside the Mutex so the same
// allocated `ZSTD_CCtx` (and its dictionary, if any) is preserved across
// every compress() / compressMany() call. This is the actual structural
// lever that makes the class API faster than the one-shot `compress`
// function for repeated small payloads — recreating the context per call
// would defeat the perf-review's Green-path reasoning.
#[napi]
pub struct Compressor {
    inner: Mutex<zstd::bulk::Compressor<'static>>,
}

#[napi]
impl Compressor {
    #[napi(constructor)]
    pub fn new(level: Option<i32>, dictionary: Option<Buffer>) -> Result<Self> {
        let lvl = level.unwrap_or(DEFAULT_LEVEL);
        let inner = match dictionary {
            Some(dict) => zstd::bulk::Compressor::with_dictionary(lvl, dict.as_ref()),
            None => zstd::bulk::Compressor::new(lvl),
        }
        .map_err(|e| Error::from_reason(format!("zstd compressor init: {}", e)))?;
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
            .map(Into::into)
            .map_err(|e| Error::from_reason(format!("zstd compress: {}", e)))
    }

    #[napi(js_name = "compressMany")]
    pub fn compress_many(&self, inputs: Vec<Buffer>) -> Result<Vec<Buffer>> {
        let mut c = self
            .inner
            .lock()
            .map_err(|_| Error::from_reason("zstd compressor mutex poisoned"))?;
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
    max_output_size: u64,
}

#[napi]
impl Decompressor {
    /// Build a decompressor.
    ///
    /// `max_output_size` caps the size of any single decompressed payload
    /// to defend against decompression bombs: untrusted zstd input can
    /// expand by 1000×+ on a few KB of compressed bytes, exhausting
    /// memory. The default is 256 MiB; pass `0` to disable the cap.
    #[napi(constructor)]
    pub fn new(dictionary: Option<Buffer>, max_output_size: Option<BigInt>) -> Self {
        let cap = max_output_size
            .map(|b| b.get_u64().1)
            .filter(|n| *n > 0)
            .unwrap_or(DEFAULT_MAX_OUTPUT_SIZE);
        Self {
            dictionary: dictionary.map(|d| d.as_ref().to_vec()),
            max_output_size: cap,
        }
    }

    fn decompress_one(&self, input: &[u8]) -> Result<Vec<u8>> {
        use std::io::Read;
        let decoder = match &self.dictionary {
            Some(dict) => zstd::stream::read::Decoder::with_dictionary(input, dict),
            None => zstd::stream::read::Decoder::with_buffer(input),
        }
        .map_err(|e| Error::from_reason(format!("zstd decoder init: {}", e)))?;
        // `take(cap + 1)` so we can detect overrun: read_to_end returning
        // exactly cap+1 means the source had more, and we error out.
        let cap = self.max_output_size;
        let mut limited = decoder.take(cap.saturating_add(1));
        let mut out = Vec::new();
        limited
            .read_to_end(&mut out)
            .map_err(|e| Error::from_reason(format!("zstd decompress: {}", e)))?;
        if (out.len() as u64) > cap {
            return Err(Error::from_reason(format!(
                "zstd decompress: output exceeds max_output_size of {} bytes (decompression bomb?)",
                cap
            )));
        }
        Ok(out)
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
