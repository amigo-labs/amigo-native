//! PDF generation via printpdf. Document-as-data API —
//! caller builds a spec object, one NAPI call returns a Buffer.
//! See docs/perf-review/pdfkit.md: we explicitly do **not** expose
//! the fluent chain-API anti-pattern.
//!
//! v0.1 scope: labels / tickets / simple reports.
//! - text with a built-in Helvetica face (no custom font loading yet)
//! - lines / rectangles
//! - multi-page support
//! - multiple documents in one FFI call (`generateMany`)

use napi::bindgen_prelude::*;
use napi_derive::napi;
use printpdf::{BuiltinFont, Mm, PdfDocument};

#[napi(object)]
#[derive(Clone)]
pub struct TextElement {
    pub kind: String, // "text"
    pub x: f64,       // mm
    pub y: f64,       // mm
    pub text: String,
    pub font_size: Option<f64>,
}

#[napi(object)]
#[derive(Clone)]
pub struct LineElement {
    pub kind: String, // "line"
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
    pub thickness: Option<f64>,
}

#[napi(object)]
#[derive(Clone)]
pub struct RectElement {
    pub kind: String, // "rect"
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
    pub width: f64,    // mm
    pub height: f64,   // mm
    pub elements: Vec<PdfElement>,
}

#[napi(object)]
#[derive(Clone)]
pub struct Document {
    pub title: Option<String>,
    pub pages: Vec<Page>,
}

fn mm(v: f64) -> Mm {
    Mm(v as f32)
}

fn render_document(doc: Document) -> Result<Buffer> {
    let title = doc.title.unwrap_or_else(|| "amigo-pdf".to_string());
    let first_page = doc.pages.first().ok_or_else(|| {
        Error::from_reason("document must have at least one page")
    })?;
    let (pdf, page1_idx, layer1_idx) = PdfDocument::new(
        &title,
        mm(first_page.width),
        mm(first_page.height),
        "Layer 1",
    );
    let font = pdf
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| Error::from_reason(format!("font: {e}")))?;

    for (page_idx, page) in doc.pages.iter().enumerate() {
        let (p_idx, l_idx) = if page_idx == 0 {
            (page1_idx, layer1_idx)
        } else {
            pdf.add_page(mm(page.width), mm(page.height), "Layer 1")
        };
        let layer = pdf.get_page(p_idx).get_layer(l_idx);

        for el in &page.elements {
            match el.kind.as_str() {
                "text" => {
                    if let Some(t) = &el.text {
                        let size = t.font_size.unwrap_or(12.0) as f32;
                        layer.use_text(&t.text, size, mm(t.x), mm(t.y), &font);
                    }
                }
                "line" => {
                    if let Some(l) = &el.line {
                        use printpdf::{Line, Point};
                        let thickness = l.thickness.unwrap_or(0.5) as f32;
                        layer.set_outline_thickness(thickness);
                        let line = Line {
                            points: vec![
                                (Point::new(mm(l.x1), mm(l.y1)), false),
                                (Point::new(mm(l.x2), mm(l.y2)), false),
                            ],
                            is_closed: false,
                        };
                        layer.add_line(line);
                    }
                }
                "rect" => {
                    if let Some(r) = &el.rect {
                        use printpdf::{Line, Point};
                        let rect = Line {
                            points: vec![
                                (Point::new(mm(r.x), mm(r.y)), false),
                                (Point::new(mm(r.x + r.width), mm(r.y)), false),
                                (
                                    Point::new(mm(r.x + r.width), mm(r.y + r.height)),
                                    false,
                                ),
                                (Point::new(mm(r.x), mm(r.y + r.height)), false),
                            ],
                            is_closed: true,
                        };
                        if r.filled.unwrap_or(false) {
                            layer.add_polygon(printpdf::Polygon {
                                rings: vec![rect.points.clone()],
                                mode: printpdf::path::PaintMode::Fill,
                                winding_order: printpdf::path::WindingOrder::NonZero,
                            });
                        } else {
                            layer.add_line(rect);
                        }
                    }
                }
                _ => {}
            }
        }
    }

    let bytes = pdf
        .save_to_bytes()
        .map_err(|e| Error::from_reason(format!("save: {e}")))?;
    Ok(bytes.into())
}

/// Generate a PDF from a document spec. Single FFI crossing.
#[napi(js_name = "generate")]
pub fn generate(doc: Document) -> Result<Buffer> {
    render_document(doc)
}

/// Batch-generate N documents. One FFI crossing for the whole
/// label-printing job.
#[napi(js_name = "generateMany")]
pub fn generate_many(docs: Vec<Document>) -> Result<Vec<Buffer>> {
    docs.into_iter().map(render_document).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn label(text: &str) -> Document {
        Document {
            title: Some("label".into()),
            pages: vec![Page {
                width: 100.0,
                height: 50.0,
                elements: vec![PdfElement {
                    kind: "text".into(),
                    text: Some(TextElement {
                        kind: "text".into(),
                        x: 10.0,
                        y: 25.0,
                        text: text.into(),
                        font_size: Some(12.0),
                    }),
                    line: None,
                    rect: None,
                }],
            }],
        }
    }

    #[test]
    fn simple_label_generates_pdf_bytes() {
        let bytes = generate(label("Hello")).unwrap();
        assert!(bytes.starts_with(b"%PDF-"));
        assert!(bytes.len() > 100);
    }

    #[test]
    fn multi_page_document() {
        let doc = Document {
            title: None,
            pages: vec![
                Page {
                    width: 100.0,
                    height: 50.0,
                    elements: vec![],
                },
                Page {
                    width: 100.0,
                    height: 50.0,
                    elements: vec![],
                },
            ],
        };
        let bytes = generate(doc).unwrap();
        assert!(bytes.starts_with(b"%PDF-"));
    }

    #[test]
    fn empty_pages_error() {
        let doc = Document {
            title: None,
            pages: vec![],
        };
        assert!(generate(doc).is_err());
    }

    #[test]
    fn batch_generates_all() {
        let out = generate_many(vec![label("A"), label("B"), label("C")]).unwrap();
        assert_eq!(out.len(), 3);
        for buf in out {
            assert!(buf.starts_with(b"%PDF-"));
        }
    }

    #[test]
    fn line_element() {
        let doc = Document {
            title: None,
            pages: vec![Page {
                width: 100.0,
                height: 50.0,
                elements: vec![PdfElement {
                    kind: "line".into(),
                    text: None,
                    line: Some(LineElement {
                        kind: "line".into(),
                        x1: 10.0,
                        y1: 10.0,
                        x2: 90.0,
                        y2: 40.0,
                        thickness: None,
                    }),
                    rect: None,
                }],
            }],
        };
        let bytes = generate(doc).unwrap();
        assert!(bytes.len() > 100);
    }
}
