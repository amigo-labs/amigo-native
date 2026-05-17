//! ZIP read/write — thin napi wrapper around `amigo-zip-core`.
//! The filesystem-source variant (`fromPath`) lives here only — WASM
//! has no `std::fs`, so the browser binding ships only the buffer source.

use amigo_zip_core as core;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::fs::File;
use std::io::Read;

#[napi(object)]
pub struct ZipEntryInfo {
    pub name: String,
    pub size: BigInt,
    pub compressed_size: BigInt,
    pub is_dir: bool,
    pub compression: String,
}

#[napi(object)]
pub struct ZipEntryData {
    pub name: String,
    pub data: Buffer,
}

enum Source {
    Buffer(Vec<u8>),
    File(std::path::PathBuf),
}

#[napi]
pub struct ZipReader {
    source: Source,
}

fn read_path_to_vec(p: &std::path::Path) -> Result<Vec<u8>> {
    let mut f = File::open(p).map_err(|e| Error::from_reason(e.to_string()))?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf)
        .map_err(|e| Error::from_reason(e.to_string()))?;
    Ok(buf)
}

fn to_napi_info(e: core::ZipEntryInfo) -> ZipEntryInfo {
    ZipEntryInfo {
        name: e.name,
        size: BigInt::from(e.size),
        compressed_size: BigInt::from(e.compressed_size),
        is_dir: e.is_dir,
        compression: e.compression,
    }
}

#[napi]
impl ZipReader {
    #[napi(factory)]
    pub fn from_buffer(buffer: Buffer) -> Self {
        Self {
            source: Source::Buffer(buffer.to_vec()),
        }
    }

    #[napi(factory)]
    pub fn from_path(path: String) -> Self {
        Self {
            source: Source::File(path.into()),
        }
    }

    fn buf(&self) -> Result<std::borrow::Cow<'_, [u8]>> {
        match &self.source {
            Source::Buffer(b) => Ok(std::borrow::Cow::Borrowed(b)),
            Source::File(p) => Ok(std::borrow::Cow::Owned(read_path_to_vec(p)?)),
        }
    }

    #[napi]
    pub fn entries(&self) -> Result<Vec<ZipEntryInfo>> {
        let buf = self.buf()?;
        core::entries_from_buffer(&buf)
            .map(|v| v.into_iter().map(to_napi_info).collect())
            .map_err(Error::from_reason)
    }

    #[napi]
    pub fn read(&self, name: String) -> Result<Buffer> {
        let buf = self.buf()?;
        core::read_entry_from_buffer(&buf, &name)
            .map(Buffer::from)
            .map_err(Error::from_reason)
    }

    #[napi(js_name = "extractAll")]
    pub fn extract_all(&self) -> Result<Vec<ZipEntryData>> {
        let buf = self.buf()?;
        let entries = core::extract_all_from_buffer(&buf).map_err(Error::from_reason)?;
        Ok(entries
            .into_iter()
            .map(|e| ZipEntryData {
                name: e.name,
                data: e.data.into(),
            })
            .collect())
    }
}

#[napi(object)]
#[derive(Default)]
pub struct AddOptions {
    pub compression: Option<String>,
    pub level: Option<i32>,
}

fn into_core_opts(o: Option<AddOptions>) -> core::AddOptions {
    let o = o.unwrap_or_default();
    core::AddOptions {
        compression: o.compression,
        level: o.level,
    }
}

#[napi]
pub struct ZipWriter {
    inner: core::Writer,
}

#[napi]
impl ZipWriter {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            inner: core::Writer::new(),
        }
    }

    #[napi]
    pub fn add(&mut self, name: String, data: Buffer, options: Option<AddOptions>) -> Result<()> {
        self.inner
            .add(&name, &data, &into_core_opts(options))
            .map_err(Error::from_reason)
    }

    #[napi]
    pub fn finalize(&mut self) -> Result<Buffer> {
        self.inner
            .finalize()
            .map(Buffer::from)
            .map_err(Error::from_reason)
    }
}

impl Default for ZipWriter {
    fn default() -> Self {
        Self::new()
    }
}
