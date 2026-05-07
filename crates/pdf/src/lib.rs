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
use printpdf::{
    BuiltinFont, Line, LinePoint, Mm, Op, PaintMode, PdfDocument, PdfFontHandle, PdfPage,
    PdfSaveOptions, Point, Polygon, PolygonRing, Pt, TextItem, WindingOrder,
};

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
    pub width: f64,  // mm
    pub height: f64, // mm
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

fn lp(x: f64, y: f64) -> LinePoint {
    LinePoint {
        p: Point::new(mm(x), mm(y)),
        bezier: false,
    }
}

fn render_document(doc: Document) -> Result<Buffer> {
    if doc.pages.is_empty() {
        return Err(Error::from_reason("document must have at least one page"));
    }
    let title = doc.title.unwrap_or_else(|| "amigo-pdf".to_string());
    let mut pdf = PdfDocument::new(&title);
    let helvetica = PdfFontHandle::Builtin(BuiltinFont::Helvetica);

    let mut pages: Vec<PdfPage> = Vec::with_capacity(doc.pages.len());
    for page in &doc.pages {
        let mut ops: Vec<Op> = Vec::with_capacity(page.elements.len() * 4);
        for el in &page.elements {
            match el.kind.as_str() {
                "text" => {
                    if let Some(t) = &el.text {
                        let size = Pt(t.font_size.unwrap_or(12.0) as f32);
                        ops.push(Op::StartTextSection);
                        ops.push(Op::SetFont {
                            font: helvetica.clone(),
                            size,
                        });
                        ops.push(Op::SetTextCursor {
                            pos: Point::new(mm(t.x), mm(t.y)),
                        });
                        ops.push(Op::ShowText {
                            items: vec![TextItem::Text(t.text.clone())],
                        });
                        ops.push(Op::EndTextSection);
                    }
                }
                "line" => {
                    if let Some(l) = &el.line {
                        let thickness = Pt(l.thickness.unwrap_or(0.5) as f32);
                        ops.push(Op::SetOutlineThickness { pt: thickness });
                        ops.push(Op::DrawLine {
                            line: Line {
                                points: vec![lp(l.x1, l.y1), lp(l.x2, l.y2)],
                                is_closed: false,
                            },
                        });
                    }
                }
                "rect" => {
                    if let Some(r) = &el.rect {
                        let points = vec![
                            lp(r.x, r.y),
                            lp(r.x + r.width, r.y),
                            lp(r.x + r.width, r.y + r.height),
                            lp(r.x, r.y + r.height),
                        ];
                        let mode = if r.filled.unwrap_or(false) {
                            PaintMode::Fill
                        } else {
                            PaintMode::Stroke
                        };
                        ops.push(Op::DrawPolygon {
                            polygon: Polygon {
                                rings: vec![PolygonRing { points }],
                                mode,
                                winding_order: WindingOrder::NonZero,
                            },
                        });
                    }
                }
                _ => {}
            }
        }
        pages.push(PdfPage::new(mm(page.width), mm(page.height), ops));
    }

    pdf.with_pages(pages);
    let bytes = pdf.save(&PdfSaveOptions::default(), &mut Vec::new());
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
