use amigo_pdf_core as core;
use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
struct TextElementJs {
    kind: String,
    x: f64,
    y: f64,
    text: String,
    #[serde(rename = "fontSize")]
    font_size: Option<f64>,
}

#[derive(Deserialize)]
struct LineElementJs {
    kind: String,
    x1: f64,
    y1: f64,
    x2: f64,
    y2: f64,
    thickness: Option<f64>,
}

#[derive(Deserialize)]
struct RectElementJs {
    kind: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    filled: Option<bool>,
}

#[derive(Deserialize)]
struct PdfElementJs {
    kind: String,
    text: Option<TextElementJs>,
    line: Option<LineElementJs>,
    rect: Option<RectElementJs>,
}

#[derive(Deserialize)]
struct PageJs {
    width: f64,
    height: f64,
    elements: Vec<PdfElementJs>,
}

#[derive(Deserialize)]
struct DocumentJs {
    title: Option<String>,
    pages: Vec<PageJs>,
}

impl From<DocumentJs> for core::Document {
    fn from(doc: DocumentJs) -> Self {
        Self {
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
}

#[wasm_bindgen(js_name = "generate")]
pub fn generate(doc: JsValue) -> Result<Vec<u8>, JsError> {
    let d: DocumentJs =
        serde_wasm_bindgen::from_value(doc).map_err(|e| JsError::new(&e.to_string()))?;
    core::render_document(d.into()).map_err(|e| JsError::new(&e))
}

#[wasm_bindgen(js_name = "generateMany")]
pub fn generate_many(docs: JsValue) -> Result<JsValue, JsError> {
    let ds: Vec<DocumentJs> =
        serde_wasm_bindgen::from_value(docs).map_err(|e| JsError::new(&e.to_string()))?;
    let core_docs: Vec<core::Document> = ds.into_iter().map(Into::into).collect();
    let bytes_vec = core::render_many(core_docs).map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&bytes_vec).map_err(|e| JsError::new(&e.to_string()))
}
