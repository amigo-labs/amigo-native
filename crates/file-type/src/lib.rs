//! Magic-byte file-type detection — thin napi wrapper around
//! `amigo-file-type-core`.

use amigo_file_type_core as core;
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi(object)]
pub struct FileTypeResult {
    pub ext: String,
    pub mime: String,
}

fn to_napi(r: core::FileTypeResult) -> FileTypeResult {
    FileTypeResult {
        ext: r.ext,
        mime: r.mime,
    }
}

#[napi(js_name = "fileTypeFromBufferSync")]
pub fn file_type_from_buffer_sync(buffer: Buffer) -> Option<FileTypeResult> {
    core::classify(&buffer).map(to_napi)
}

pub struct FileTypeTask {
    buffer: Vec<u8>,
}

#[napi]
impl Task for FileTypeTask {
    type Output = Option<core::FileTypeResult>;
    type JsValue = Option<FileTypeResult>;

    fn compute(&mut self) -> Result<Self::Output> {
        Ok(core::classify(&self.buffer))
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output.map(to_napi))
    }
}

/// Magic-byte detection reads only the head of the buffer. We bound the
/// copy at 4 KB so 10 MB inputs don't pay a full memcpy before the
/// worker thread even starts.
#[napi]
pub fn file_type_from_buffer(buffer: Buffer) -> AsyncTask<FileTypeTask> {
    let slice = buffer.as_ref();
    let head = &slice[..slice.len().min(core::MAX_MAGIC_PREFIX)];
    AsyncTask::new(FileTypeTask {
        buffer: head.to_vec(),
    })
}
