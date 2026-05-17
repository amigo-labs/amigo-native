//! Shared ZIP read/write logic via the `zip` crate. Internal-only;
//! takes/returns plain `&[u8]` and `Vec<u8>` so both napi (Buffer) and
//! WASM (Uint8Array) bindings can wrap it.

use std::io::{Cursor, Read, Write};
use zip::CompressionMethod;
use zip::ZipArchive;
use zip::write::{SimpleFileOptions, ZipWriter};

#[derive(Debug, Clone)]
pub struct ZipEntryInfo {
    pub name: String,
    pub size: u64,
    pub compressed_size: u64,
    pub is_dir: bool,
    pub compression: String,
}

#[derive(Debug, Clone)]
pub struct ZipEntryData {
    pub name: String,
    pub data: Vec<u8>,
}

/// Cap the per-entry pre-allocation independent of what the ZIP central
/// directory claims. A crafted archive can advertise a 100 GB entry to
/// trigger an OOM before any decompressed bytes are read.
const MAX_PREALLOC_PER_ENTRY: usize = 256 * 1024 * 1024;

fn prealloc_size(claimed: u64) -> usize {
    claimed.min(MAX_PREALLOC_PER_ENTRY as u64) as usize
}

pub fn entries_from_buffer(buf: &[u8]) -> Result<Vec<ZipEntryInfo>, String> {
    let mut ar = ZipArchive::new(Cursor::new(buf)).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for i in 0..ar.len() {
        let f = ar.by_index(i).map_err(|e| e.to_string())?;
        out.push(ZipEntryInfo {
            name: f.name().to_string(),
            size: f.size(),
            compressed_size: f.compressed_size(),
            is_dir: f.is_dir(),
            compression: format!("{:?}", f.compression()),
        });
    }
    Ok(out)
}

pub fn read_entry_from_buffer(buf: &[u8], name: &str) -> Result<Vec<u8>, String> {
    let mut ar = ZipArchive::new(Cursor::new(buf)).map_err(|e| e.to_string())?;
    let mut f = ar.by_name(name).map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(prealloc_size(f.size()));
    f.read_to_end(&mut out).map_err(|e| e.to_string())?;
    Ok(out)
}

pub fn extract_all_from_buffer(buf: &[u8]) -> Result<Vec<ZipEntryData>, String> {
    let mut ar = ZipArchive::new(Cursor::new(buf)).map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(ar.len());
    for i in 0..ar.len() {
        let mut f = ar.by_index(i).map_err(|e| e.to_string())?;
        if f.is_dir() {
            continue;
        }
        let mut bytes = Vec::with_capacity(prealloc_size(f.size()));
        f.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        out.push(ZipEntryData {
            name: f.name().to_string(),
            data: bytes,
        });
    }
    Ok(out)
}

#[derive(Default, Debug, Clone)]
pub struct AddOptions {
    /// "deflate" (default) or "stored".
    pub compression: Option<String>,
    /// Deflate level 0–9 (default 6).
    pub level: Option<i32>,
}

pub struct Writer {
    inner: Option<ZipWriter<Cursor<Vec<u8>>>>,
}

impl Default for Writer {
    fn default() -> Self {
        Self::new()
    }
}

impl Writer {
    pub fn new() -> Self {
        Self {
            inner: Some(ZipWriter::new(Cursor::new(Vec::new()))),
        }
    }

    pub fn add(&mut self, name: &str, data: &[u8], opts: &AddOptions) -> Result<(), String> {
        let w = self
            .inner
            .as_mut()
            .ok_or_else(|| "writer already finalized".to_string())?;
        let compression = match opts.compression.as_deref() {
            Some("stored") | Some("Stored") => CompressionMethod::Stored,
            _ => CompressionMethod::Deflated,
        };
        let mut fo = SimpleFileOptions::default().compression_method(compression);
        if let Some(l) = opts.level {
            fo = fo.compression_level(Some(l.into()));
        }
        w.start_file(name, fo).map_err(|e| e.to_string())?;
        w.write_all(data).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn finalize(&mut self) -> Result<Vec<u8>, String> {
        let w = self
            .inner
            .take()
            .ok_or_else(|| "writer already finalized".to_string())?;
        let cursor = w.finish().map_err(|e| e.to_string())?;
        Ok(cursor.into_inner())
    }
}
