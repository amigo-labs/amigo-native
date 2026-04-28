use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::fs::File;
use std::io::{Cursor, Read, Write};
use zip::CompressionMethod;
use zip::ZipArchive;
use zip::write::{SimpleFileOptions, ZipWriter as InnerZipWriter};

fn to_err<E: std::fmt::Display>(e: E) -> Error {
    Error::from_reason(e.to_string())
}

/// Cap the per-entry pre-allocation independent of what the ZIP central
/// directory claims. A crafted archive can advertise a 100 GB entry to
/// trigger an `OOM` on `Vec::with_capacity` *before* any decompressed
/// bytes are read. Real entries that exceed this still decompress fine
/// — `Vec::read_to_end` grows past the initial capacity as needed.
const MAX_PREALLOC_PER_ENTRY: usize = 256 * 1024 * 1024;

fn prealloc_size(claimed: u64) -> usize {
    claimed.min(MAX_PREALLOC_PER_ENTRY as u64) as usize
}

#[napi(object)]
pub struct ZipEntryInfo {
    pub name: String,
    /// Uncompressed size in bytes. Exposed as `BigInt` because legitimate
    /// ZIP entries can exceed 4 GiB (zip64). JS callers must use
    /// `Number(entry.size)` if they want a plain number.
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

fn entries_from<R: Read + std::io::Seek>(r: R) -> Result<Vec<ZipEntryInfo>> {
    let mut ar = ZipArchive::new(r).map_err(to_err)?;
    let mut out = Vec::new();
    for i in 0..ar.len() {
        let f = ar.by_index(i).map_err(to_err)?;
        out.push(ZipEntryInfo {
            name: f.name().to_string(),
            size: BigInt::from(f.size()),
            compressed_size: BigInt::from(f.compressed_size()),
            is_dir: f.is_dir(),
            compression: format!("{:?}", f.compression()),
        });
    }
    Ok(out)
}

fn read_from<R: Read + std::io::Seek>(r: R, name: &str) -> Result<Vec<u8>> {
    let mut ar = ZipArchive::new(r).map_err(to_err)?;
    let mut f = ar.by_name(name).map_err(to_err)?;
    let mut out = Vec::with_capacity(prealloc_size(f.size()));
    f.read_to_end(&mut out).map_err(to_err)?;
    Ok(out)
}

#[napi]
impl ZipReader {
    /// Accepts either a Buffer or a filesystem path.
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

    #[napi]
    pub fn entries(&self) -> Result<Vec<ZipEntryInfo>> {
        match &self.source {
            Source::Buffer(b) => entries_from(Cursor::new(b.as_slice())),
            Source::File(p) => entries_from(File::open(p).map_err(to_err)?),
        }
    }

    #[napi]
    pub fn read(&self, name: String) -> Result<Buffer> {
        let bytes = match &self.source {
            Source::Buffer(b) => read_from(Cursor::new(b.as_slice()), &name)?,
            Source::File(p) => read_from(File::open(p).map_err(to_err)?, &name)?,
        };
        Ok(bytes.into())
    }

    /// One-shot: parse the archive once and return every (non-directory)
    /// entry's uncompressed bytes along with its name. Replaces the
    /// `for (e of entries()) read(e.name)` pattern, which re-parsed the
    /// central directory on every iteration — O(N²) on number of
    /// entries. This is O(N) and the one call users want for
    /// "unzip to memory".
    #[napi(js_name = "extractAll")]
    pub fn extract_all(&self) -> Result<Vec<ZipEntryData>> {
        match &self.source {
            Source::Buffer(b) => extract_all_from(Cursor::new(b.as_slice())),
            Source::File(p) => extract_all_from(File::open(p).map_err(to_err)?),
        }
    }
}

fn extract_all_from<R: Read + std::io::Seek>(r: R) -> Result<Vec<ZipEntryData>> {
    let mut ar = ZipArchive::new(r).map_err(to_err)?;
    let mut out = Vec::with_capacity(ar.len());
    for i in 0..ar.len() {
        let mut f = ar.by_index(i).map_err(to_err)?;
        if f.is_dir() {
            continue;
        }
        let mut bytes = Vec::with_capacity(prealloc_size(f.size()));
        f.read_to_end(&mut bytes).map_err(to_err)?;
        out.push(ZipEntryData {
            name: f.name().to_string(),
            data: bytes.into(),
        });
    }
    Ok(out)
}

#[napi(object)]
#[derive(Default)]
pub struct AddOptions {
    /// Compression method: "deflate" (default) or "stored".
    pub compression: Option<String>,
    /// Deflate level 0-9 (default 6).
    pub level: Option<i32>,
}

#[napi]
pub struct ZipWriter {
    inner: Option<InnerZipWriter<Cursor<Vec<u8>>>>,
}

#[napi]
impl ZipWriter {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            inner: Some(InnerZipWriter::new(Cursor::new(Vec::new()))),
        }
    }

    #[napi]
    pub fn add(&mut self, name: String, data: Buffer, options: Option<AddOptions>) -> Result<()> {
        let w = self
            .inner
            .as_mut()
            .ok_or_else(|| Error::from_reason("writer already finalized"))?;
        let opts = options.unwrap_or_default();
        let compression = match opts.compression.as_deref() {
            Some("stored") | Some("Stored") => CompressionMethod::Stored,
            _ => CompressionMethod::Deflated,
        };
        let mut fo = SimpleFileOptions::default().compression_method(compression);
        if let Some(l) = opts.level {
            fo = fo.compression_level(Some(l.into()));
        }
        w.start_file(&name, fo).map_err(to_err)?;
        w.write_all(&data).map_err(to_err)?;
        Ok(())
    }

    #[napi]
    pub fn finalize(&mut self) -> Result<Buffer> {
        let w = self
            .inner
            .take()
            .ok_or_else(|| Error::from_reason("writer already finalized"))?;
        let cursor = w.finish().map_err(to_err)?;
        Ok(cursor.into_inner().into())
    }
}

impl Default for ZipWriter {
    fn default() -> Self {
        Self::new()
    }
}

// Rust unit tests intentionally omitted: helper fns return napi::Result
// which cannot link into a test binary. The vitest suite in
// __test__/index.spec.ts covers roundtrip behaviour.
