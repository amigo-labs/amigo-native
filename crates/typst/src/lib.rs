//! Typst document compilation. Bytes-in (Typst source + optional JSON
//! data), bytes-out (PDF). One FFI crossing per `compile()` call.
//!
//! Font strategy: bundled Libertinus Serif / Mono / New Computer
//! Modern from `typst-assets`. ~15 MB/target binary-size penalty
//! acknowledged per docs/perf-review/typst.md.
//!
//! Package resolution (`#import "@preview/..."`) is **offline-only**
//! in v0.1 — imports are rejected with a clear error. Supply-chain
//! risk isn't worth the opt-in in a library context.

use ecow::EcoString;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::collections::HashMap;
use std::sync::OnceLock;
use typst::diag::{FileError, FileResult, SourceDiagnostic};
use typst::foundations::{Bytes, Datetime, Dict, Value};
use typst::layout::PagedDocument;
use typst::syntax::{FileId, Source, VirtualPath};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, World};

#[napi(object)]
#[derive(Default)]
pub struct CompileOptions {
    /// Optional JSON-serializable object injected as `sys.inputs`.
    pub data: Option<HashMap<String, String>>,
    /// Additional font TTF / OTF buffers to register.
    pub fonts: Option<Vec<Buffer>>,
}

#[napi(object)]
pub struct Diagnostic {
    pub severity: String,
    pub message: String,
}

#[napi(object)]
pub struct CompileResult {
    pub pdf: Buffer,
    pub warnings: Vec<Diagnostic>,
}

// ───── shared font set ─────────────────────────────────────────────

fn bundled_fonts() -> &'static [Font] {
    static FONTS: OnceLock<Vec<Font>> = OnceLock::new();
    FONTS.get_or_init(|| {
        let mut out = Vec::new();
        for data in typst_assets::fonts() {
            let buffer = Bytes::new(data);
            for font in Font::iter(buffer) {
                out.push(font);
            }
        }
        out
    })
}

// ───── World impl ──────────────────────────────────────────────────

struct AmigoWorld {
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fonts: Vec<Font>,
    main_id: FileId,
    source: Source,
}

impl AmigoWorld {
    fn build(source: String, data: Dict, extra_fonts: Vec<Vec<u8>>) -> Self {
        // Merge bundled fonts + caller-provided fonts.
        let mut all_fonts: Vec<Font> = bundled_fonts().to_vec();
        for bytes in extra_fonts {
            let buf = Bytes::new(bytes);
            for font in Font::iter(buf) {
                all_fonts.push(font);
            }
        }
        let book = FontBook::from_fonts(all_fonts.iter());

        let main_path = VirtualPath::new("main.typ");
        let main_id = FileId::new(None, main_path);
        let source = Source::new(main_id, source);

        // Library with `sys.inputs` populated from `data`.
        let library = Library::builder().with_inputs(data).build();

        AmigoWorld {
            library: LazyHash::new(library),
            book: LazyHash::new(book),
            fonts: all_fonts,
            main_id,
            source,
        }
    }
}

impl World for AmigoWorld {
    fn library(&self) -> &LazyHash<Library> {
        &self.library
    }
    fn book(&self) -> &LazyHash<FontBook> {
        &self.book
    }
    fn main(&self) -> FileId {
        self.main_id
    }
    fn source(&self, id: FileId) -> FileResult<Source> {
        if id == self.main_id {
            Ok(self.source.clone())
        } else {
            // All other imports fail — package resolution is offline-only
            // in v0.1, so @preview/... isn't reachable.
            let path = id.vpath().as_rooted_path().to_path_buf();
            Err(FileError::NotFound(path))
        }
    }
    fn file(&self, id: FileId) -> FileResult<Bytes> {
        let path = id.vpath().as_rooted_path().to_path_buf();
        Err(FileError::NotFound(path))
    }
    fn font(&self, index: usize) -> Option<Font> {
        self.fonts.get(index).cloned()
    }
    fn today(&self, offset: Option<i64>) -> Option<Datetime> {
        let _ = offset;
        let now = chrono::Utc::now();
        Datetime::from_ymd(now.year_ce().1 as i32, now.month() as u8, now.day() as u8)
    }
}

use chrono::Datelike;

// ───── public API ──────────────────────────────────────────────────

fn data_to_dict(data: Option<HashMap<String, String>>) -> Dict {
    let mut dict = Dict::new();
    if let Some(m) = data {
        for (k, v) in m {
            dict.insert(EcoString::from(k).into(), Value::Str(v.into()));
        }
    }
    dict
}

fn format_diagnostics(diags: &[SourceDiagnostic]) -> Vec<Diagnostic> {
    diags
        .iter()
        .map(|d| Diagnostic {
            severity: format!("{:?}", d.severity).to_lowercase(),
            message: d.message.to_string(),
        })
        .collect()
}

#[napi(js_name = "compile")]
pub fn compile(source: String, options: Option<CompileOptions>) -> Result<CompileResult> {
    let opts = options.unwrap_or_default();
    let fonts_extra: Vec<Vec<u8>> = opts
        .fonts
        .unwrap_or_default()
        .into_iter()
        .map(|b| b.to_vec())
        .collect();
    let dict = data_to_dict(opts.data);

    let world = AmigoWorld::build(source, dict, fonts_extra);

    let result = typst::compile::<PagedDocument>(&world);
    let document = result
        .output
        .map_err(|e| Error::from_reason(format!("compile: {}", format_eco(&e))))?;

    let pdf_opts = typst_pdf::PdfOptions::default();
    let pdf_bytes = typst_pdf::pdf(&document, &pdf_opts)
        .map_err(|e| Error::from_reason(format!("pdf: {}", format_eco(&e))))?;

    Ok(CompileResult {
        pdf: pdf_bytes.into(),
        warnings: format_diagnostics(&result.warnings),
    })
}

fn format_eco(errs: &ecow::EcoVec<SourceDiagnostic>) -> String {
    errs.iter()
        .map(|d| d.message.to_string())
        .collect::<Vec<_>>()
        .join("; ")
}

#[napi(js_name = "compileMany")]
pub fn compile_many(
    sources: Vec<String>,
    options: Option<CompileOptions>,
) -> Result<Vec<CompileResult>> {
    // Shared data, but fonts only applied to the first document — subsequent
    // documents reuse the bundled set (fast-follow: cache the world).
    let shared_data = options.and_then(|o| o.data);
    sources
        .into_iter()
        .map(|s| {
            compile(
                s,
                Some(CompileOptions {
                    data: shared_data.clone(),
                    fonts: None,
                }),
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compiles_hello_world() {
        let result = compile("Hello World".to_string(), None).unwrap();
        assert!(result.pdf.starts_with(b"%PDF-"));
    }

    #[test]
    fn compile_with_inputs() {
        let source = r#"
#let name = sys.inputs.at("name", default: "World")
Hello #name
"#
        .to_string();
        let mut data = HashMap::new();
        data.insert("name".to_string(), "Amigo".to_string());
        let result = compile(
            source,
            Some(CompileOptions {
                data: Some(data),
                fonts: None,
            }),
        )
        .unwrap();
        assert!(result.pdf.starts_with(b"%PDF-"));
    }

    #[test]
    fn syntax_error_is_reported() {
        let result = compile("#let x = ".to_string(), None);
        assert!(result.is_err());
    }

    #[test]
    fn preview_import_is_rejected() {
        let source = r#"#import "@preview/example:0.1.0": *"#.to_string();
        let result = compile(source, None);
        assert!(result.is_err());
    }

    #[test]
    fn batch_compile() {
        let out = compile_many(vec!["A".to_string(), "B".to_string()], None).unwrap();
        assert_eq!(out.len(), 2);
        for r in out {
            assert!(r.pdf.starts_with(b"%PDF-"));
        }
    }
}
