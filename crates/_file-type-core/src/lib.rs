//! Shared magic-byte file-type detection via the `infer` crate.

#[derive(Debug, Clone)]
pub struct FileTypeResult {
    pub ext: String,
    pub mime: String,
}

pub fn classify(data: &[u8]) -> Option<FileTypeResult> {
    infer::get(data).map(|t| FileTypeResult {
        ext: t.extension().to_string(),
        mime: t.mime_type().to_string(),
    })
}

/// Magic-byte detection reads only the head of the buffer. `infer` checks
/// signatures that fit well within 4 KB.
pub const MAX_MAGIC_PREFIX: usize = 4096;

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &[u8] = &[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    ];
    const JPEG: &[u8] = &[0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46];

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
    fn rejects_text() {
        assert!(classify(b"hello world, this is plain text").is_none());
    }
}
