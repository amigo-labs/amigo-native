//! Shared Typst compile logic. Internal-only.
//!
//! Heavy build (~5 MB gzipped on WASM thanks to typst-assets fonts).
//! Bundle-size warn-only per expansion-2026 D2; in the browser pair
//! with `await import(...)` so the payload code-splits.

use ecow::EcoString;
use std::collections::HashMap;
use std::sync::OnceLock;
use typst::diag::{FileError, FileResult, SourceDiagnostic};
use typst::foundations::{Bytes, Datetime, Dict, Value};
use typst::layout::PagedDocument;
use typst::syntax::{FileId, Source, VirtualPath};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};

#[derive(Default, Clone, Debug)]
pub struct CompileOptions {
    pub data: Option<HashMap<String, String>>,
    pub fonts: Option<Vec<Vec<u8>>>,
}

#[derive(Debug, Clone)]
pub struct Diagnostic {
    pub severity: String,
    pub message: String,
}

#[derive(Debug, Clone)]
pub struct CompileResult {
    pub pdf: Vec<u8>,
    pub warnings: Vec<Diagnostic>,
}

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

struct AmigoWorld {
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fonts: Vec<Font>,
    main_id: FileId,
    source: Source,
}

impl AmigoWorld {
    fn build(source: String, data: Dict, extra_fonts: Vec<Vec<u8>>) -> Self {
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

use chrono::Datelike;

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

fn format_eco(errs: &ecow::EcoVec<SourceDiagnostic>) -> String {
    errs.iter()
        .map(|d| d.message.to_string())
        .collect::<Vec<_>>()
        .join("; ")
}

pub fn compile(source: String, opts: CompileOptions) -> Result<CompileResult, String> {
    let fonts_extra: Vec<Vec<u8>> = opts.fonts.unwrap_or_default();
    let dict = data_to_dict(opts.data);

    let world = AmigoWorld::build(source, dict, fonts_extra);

    let result = typst::compile::<PagedDocument>(&world);
    let document = result
        .output
        .map_err(|e| format!("compile: {}", format_eco(&e)))?;

    let pdf_opts = typst_pdf::PdfOptions::default();
    let pdf_bytes =
        typst_pdf::pdf(&document, &pdf_opts).map_err(|e| format!("pdf: {}", format_eco(&e)))?;

    Ok(CompileResult {
        pdf: pdf_bytes,
        warnings: format_diagnostics(&result.warnings),
    })
}

pub fn compile_many(
    sources: Vec<String>,
    opts: CompileOptions,
) -> Result<Vec<CompileResult>, String> {
    sources
        .into_iter()
        .map(|s| {
            compile(
                s,
                CompileOptions {
                    data: opts.data.clone(),
                    fonts: None,
                },
            )
        })
        .collect()
}
