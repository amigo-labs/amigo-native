//! Shared PDF generation via printpdf. Internal-only.

use printpdf::{
    BuiltinFont, Line, LinePoint, Mm, Op, PaintMode, PdfDocument, PdfFontHandle, PdfPage,
    PdfSaveOptions, Point, Polygon, PolygonRing, Pt, TextItem, WindingOrder,
};

#[derive(Clone, Debug)]
pub struct TextElement {
    pub kind: String,
    pub x: f64,
    pub y: f64,
    pub text: String,
    pub font_size: Option<f64>,
}

#[derive(Clone, Debug)]
pub struct LineElement {
    pub kind: String,
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
    pub thickness: Option<f64>,
}

#[derive(Clone, Debug)]
pub struct RectElement {
    pub kind: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub filled: Option<bool>,
}

#[derive(Clone, Debug)]
pub struct PdfElement {
    pub kind: String,
    pub text: Option<TextElement>,
    pub line: Option<LineElement>,
    pub rect: Option<RectElement>,
}

#[derive(Clone, Debug)]
pub struct Page {
    pub width: f64,
    pub height: f64,
    pub elements: Vec<PdfElement>,
}

#[derive(Clone, Debug)]
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

pub fn render_document(doc: Document) -> Result<Vec<u8>, String> {
    if doc.pages.is_empty() {
        return Err("document must have at least one page".to_string());
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
    Ok(pdf.save(&PdfSaveOptions::default(), &mut Vec::new()))
}

pub fn render_many(docs: Vec<Document>) -> Result<Vec<Vec<u8>>, String> {
    docs.into_iter().map(render_document).collect()
}
