//! Shared PDF text + metadata extraction. Internal-only; uses
//! `pdf-extract` for text and `lopdf` for the document tree.

use lopdf::{Document, Object};
use std::collections::HashMap;

#[derive(Clone, Default, Debug)]
pub struct PdfParseOptions {
    pub max: Option<u32>,
    pub password: Option<String>,
}

#[derive(Debug, Clone)]
pub struct PdfParseResult {
    pub text: String,
    pub numpages: u32,
    pub info: HashMap<String, String>,
    pub metadata: Option<String>,
    pub version: String,
}

fn object_to_string(o: &Object) -> Option<String> {
    match o {
        Object::String(bytes, _) => Some(String::from_utf8_lossy(bytes).to_string()),
        Object::Name(bytes) => Some(String::from_utf8_lossy(bytes).to_string()),
        Object::Integer(n) => Some(n.to_string()),
        Object::Real(n) => Some(n.to_string()),
        Object::Boolean(b) => Some(b.to_string()),
        _ => None,
    }
}

fn extract_info(doc: &Document) -> HashMap<String, String> {
    let mut out = HashMap::new();
    if let Ok(trailer_info) = doc.trailer.get(b"Info")
        && let Ok(info_ref) = trailer_info.as_reference()
        && let Ok(info_obj) = doc.get_object(info_ref)
        && let Ok(dict) = info_obj.as_dict()
    {
        for (key, value) in dict.iter() {
            let k = String::from_utf8_lossy(key).to_string();
            if let Some(v) = object_to_string(value) {
                out.insert(k, v);
            }
        }
    }
    out
}

fn extract_metadata(doc: &Document) -> Option<String> {
    let catalog_ref = doc.trailer.get(b"Root").ok()?.as_reference().ok()?;
    let catalog = doc.get_object(catalog_ref).ok()?;
    let catalog_dict = catalog.as_dict().ok()?;
    let meta_ref = catalog_dict.get(b"Metadata").ok()?.as_reference().ok()?;
    let meta = doc.get_object(meta_ref).ok()?;
    let stream = meta.as_stream().ok()?;
    let bytes = stream.get_plain_content().ok()?;
    Some(String::from_utf8_lossy(&bytes).to_string())
}

pub fn parse(buf: &[u8], options: &PdfParseOptions) -> Result<PdfParseResult, String> {
    let text =
        std::panic::catch_unwind(|| pdf_extract::extract_text_from_mem(buf).unwrap_or_default())
            .unwrap_or_default();

    let text = if let Some(max) = options.max {
        let mut out = String::new();
        for (i, page) in text.split('\x0c').enumerate() {
            if i >= max as usize {
                break;
            }
            if i > 0 {
                out.push('\x0c');
            }
            out.push_str(page);
        }
        out
    } else {
        text
    };

    let (numpages, info, metadata, version) = match Document::load_mem(buf) {
        Ok(mut doc) => {
            if !options.password.as_deref().unwrap_or("").is_empty() {
                let _ = doc.decrypt(options.password.as_deref().unwrap_or(""));
            }
            let numpages = doc.get_pages().len() as u32;
            let info = extract_info(&doc);
            let metadata = extract_metadata(&doc);
            let version = doc.version.clone();
            (numpages, info, metadata, version)
        }
        Err(_) => (0, HashMap::new(), None, String::from("unknown")),
    };

    Ok(PdfParseResult {
        text,
        numpages,
        info,
        metadata,
        version,
    })
}
