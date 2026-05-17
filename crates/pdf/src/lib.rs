//! PDF generation — thin napi wrapper around `amigo-pdf-core`.

use amigo_pdf_core as core;
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi(object)]
#[derive(Clone)]
pub struct TextElement {
    pub kind: String,
    pub x: f64,
    pub y: f64,
    pub text: String,
    pub font_size: Option<f64>,
}

#[napi(object)]
#[derive(Clone)]
pub struct LineElement {
    pub kind: String,
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
    pub thickness: Option<f64>,
}

#[napi(object)]
#[derive(Clone)]
pub struct RectElement {
    pub kind: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub filled: Option<bool>,
}

#[napi(object)]
#[derive(Clone)]
pub struct PdfElement {
    pub kind: String,
    pub text: Option<TextElement>,
    pub line: Option<LineElement>,
    pub rect: Option<RectElement>,
}

#[napi(object)]
#[derive(Clone)]
pub struct Page {
    pub width: f64,
    pub height: f64,
    pub elements: Vec<PdfElement>,
}

#[napi(object)]
#[derive(Clone)]
pub struct Document {
    pub title: Option<String>,
    pub pages: Vec<Page>,
}

fn into_core(doc: Document) -> core::Document {
    core::Document {
        title: doc.title,
        pages: doc
            .pages
            .into_iter()
            .map(|p| core::Page {
                width: p.width,
                height: p.height,
                elements: p
                    .elements
                    .into_iter()
                    .map(|e| core::PdfElement {
                        kind: e.kind,
                        text: e.text.map(|t| core::TextElement {
                            kind: t.kind,
                            x: t.x,
                            y: t.y,
                            text: t.text,
                            font_size: t.font_size,
                        }),
                        line: e.line.map(|l| core::LineElement {
                            kind: l.kind,
                            x1: l.x1,
                            y1: l.y1,
                            x2: l.x2,
                            y2: l.y2,
                            thickness: l.thickness,
                        }),
                        rect: e.rect.map(|r| core::RectElement {
                            kind: r.kind,
                            x: r.x,
                            y: r.y,
                            width: r.width,
                            height: r.height,
                            filled: r.filled,
                        }),
                    })
                    .collect(),
            })
            .collect(),
    }
}

#[napi(js_name = "generate")]
pub fn generate(doc: Document) -> Result<Buffer> {
    core::render_document(into_core(doc))
        .map(Buffer::from)
        .map_err(Error::from_reason)
}

#[napi(js_name = "generateMany")]
pub fn generate_many(docs: Vec<Document>) -> Result<Vec<Buffer>> {
    let core_docs: Vec<core::Document> = docs.into_iter().map(into_core).collect();
    core::render_many(core_docs)
        .map(|v| v.into_iter().map(Buffer::from).collect())
        .map_err(Error::from_reason)
}
