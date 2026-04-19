use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi(object)]
pub struct FileTypeResult {
    pub ext: String,
    pub mime: String,
}

fn classify(data: &[u8]) -> Option<FileTypeResult> {
    infer::get(data).map(|t| FileTypeResult {
        ext: t.extension().to_string(),
        mime: t.mime_type().to_string(),
    })
}

#[napi(js_name = "fileTypeFromBufferSync")]
pub fn file_type_from_buffer_sync(buffer: Buffer) -> Option<FileTypeResult> {
    classify(&buffer)
}

pub struct FileTypeTask {
    buffer: Vec<u8>,
}

#[napi]
impl Task for FileTypeTask {
    type Output = Option<FileTypeResult>;
    type JsValue = Option<FileTypeResult>;

    fn compute(&mut self) -> Result<Self::Output> {
        Ok(classify(&self.buffer))
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

/// Magic-byte detection reads only the head of the buffer. `infer` checks
/// signatures that fit well within 4 KB — keeping a 4 KB head-copy avoids
/// a full `to_vec()` of a 10 MB MP4 before the async task even starts
/// (1–3 ms memcpy that the task itself doesn't need). Since the `Buffer`
/// isn't `Send`, we still need a copy to move into the worker thread;
/// we just bound its size.
const MAX_MAGIC_PREFIX: usize = 4096;

#[napi]
pub fn file_type_from_buffer(buffer: Buffer) -> AsyncTask<FileTypeTask> {
    let slice = buffer.as_ref();
    let head = &slice[..slice.len().min(MAX_MAGIC_PREFIX)];
    AsyncTask::new(FileTypeTask {
        buffer: head.to_vec(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &[u8] = &[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    ];
    const JPEG: &[u8] = &[0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46];
    const PDF: &[u8] = &[0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E];
    const GIF: &[u8] = &[0x47, 0x49, 0x46, 0x38, 0x39, 0x61];

    #[test]
    fn detects_png() {
        let r = classify(PNG).unwrap();
        assert_eq!(r.ext, "png");
        assert_eq!(r.mime, "image/png");
    }

    #[test]
    fn detects_jpeg() {
        let r = classify(JPEG).unwrap();
        assert_eq!(r.ext, "jpg");
        assert_eq!(r.mime, "image/jpeg");
    }

    #[test]
    fn detects_pdf() {
        let r = classify(PDF).unwrap();
        assert_eq!(r.ext, "pdf");
        assert_eq!(r.mime, "application/pdf");
    }

    #[test]
    fn detects_gif() {
        let r = classify(GIF).unwrap();
        assert_eq!(r.ext, "gif");
        assert_eq!(r.mime, "image/gif");
    }

    #[test]
    fn rejects_text() {
        assert!(classify(b"hello world, this is plain text").is_none());
    }
}
