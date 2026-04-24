//! Text splitters for RAG pipelines. Backed by the `text-splitter`
//! crate (Ben Brandt) plus tiktoken-rs for token-based length.
//!
//! Scope-cut: the `lengthFunction` user callback is **not** exposed
//! — each JS callback per chunk candidate would cost a FFI crossing.
//! Instead we expose an enum (`chars`, `tiktoken:cl100k_base`,
//! `tiktoken:o200k_base`). See docs/perf-review/langchain__textsplitters.md.

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::sync::Arc;
use text_splitter::{ChunkConfig, ChunkSizer, MarkdownSplitter, TextSplitter};
use tiktoken_rs::{CoreBPE, cl100k_base, o200k_base};

#[napi(object)]
#[derive(Clone, Default)]
pub struct SplitterOptions {
    /// Maximum chunk size (in chars or tokens, depending on `lengthMetric`).
    pub chunk_size: Option<u32>,
    /// Chunk overlap (same unit as `chunkSize`). Default: 0.
    pub chunk_overlap: Option<u32>,
    /// `"chars"` (default), `"tiktoken:cl100k_base"`, or `"tiktoken:o200k_base"`.
    pub length_metric: Option<String>,
}

/// Local adapter so we satisfy text-splitter's ChunkSizer trait for
/// tiktoken-rs — upstream text-splitter's bundled impl is pinned to
/// tiktoken-rs 0.6, and we run 0.11.
#[derive(Clone)]
struct TiktokenSizer(Arc<CoreBPE>);

impl ChunkSizer for TiktokenSizer {
    fn size(&self, chunk: &str) -> usize {
        self.0.encode_with_special_tokens(chunk).len()
    }
}

enum Sizer {
    Chars,
    Tiktoken(TiktokenSizer),
}

impl Sizer {
    fn from_metric(s: Option<&str>) -> Result<Self> {
        match s.unwrap_or("chars") {
            "chars" => Ok(Sizer::Chars),
            "tiktoken:cl100k_base" | "tiktoken" => cl100k_base()
                .map(|b| Sizer::Tiktoken(TiktokenSizer(Arc::new(b))))
                .map_err(|e| Error::from_reason(format!("tiktoken init: {e}"))),
            "tiktoken:o200k_base" => o200k_base()
                .map(|b| Sizer::Tiktoken(TiktokenSizer(Arc::new(b))))
                .map_err(|e| Error::from_reason(format!("tiktoken init: {e}"))),
            other => Err(Error::from_reason(format!("unknown lengthMetric: {other}"))),
        }
    }

    fn count(&self, s: &str) -> usize {
        match self {
            Sizer::Chars => s.chars().count(),
            Sizer::Tiktoken(t) => t.size(s),
        }
    }
}

fn resolved(opts: &SplitterOptions) -> Result<(usize, usize, Sizer)> {
    let chunk_size = opts.chunk_size.unwrap_or(1000) as usize;
    let chunk_overlap = opts.chunk_overlap.unwrap_or(0) as usize;
    let sizer = Sizer::from_metric(opts.length_metric.as_deref())?;
    if chunk_overlap >= chunk_size {
        return Err(Error::from_reason(
            "chunkOverlap must be less than chunkSize",
        ));
    }
    Ok((chunk_size, chunk_overlap, sizer))
}

fn split_chars_recursive(text: &str, chunk_size: usize, chunk_overlap: usize) -> Vec<String> {
    let cfg = ChunkConfig::new(chunk_size)
        .with_overlap(chunk_overlap)
        .unwrap();
    let splitter = TextSplitter::new(cfg);
    splitter.chunks(text).map(String::from).collect()
}

fn split_tokens_recursive(
    text: &str,
    chunk_size: usize,
    chunk_overlap: usize,
    sizer: TiktokenSizer,
) -> Vec<String> {
    let cfg = ChunkConfig::new(chunk_size)
        .with_sizer(sizer)
        .with_overlap(chunk_overlap)
        .unwrap();
    let splitter = TextSplitter::new(cfg);
    splitter.chunks(text).map(String::from).collect()
}

fn split_markdown_chars(text: &str, chunk_size: usize, chunk_overlap: usize) -> Vec<String> {
    let cfg = ChunkConfig::new(chunk_size)
        .with_overlap(chunk_overlap)
        .unwrap();
    let splitter = MarkdownSplitter::new(cfg);
    splitter.chunks(text).map(String::from).collect()
}

fn split_markdown_tokens(
    text: &str,
    chunk_size: usize,
    chunk_overlap: usize,
    sizer: TiktokenSizer,
) -> Vec<String> {
    let cfg = ChunkConfig::new(chunk_size)
        .with_sizer(sizer)
        .with_overlap(chunk_overlap)
        .unwrap();
    let splitter = MarkdownSplitter::new(cfg);
    splitter.chunks(text).map(String::from).collect()
}

/// RecursiveCharacterTextSplitter — the 80% API.
#[napi(js_name = "splitText")]
pub fn split_text(text: String, options: Option<SplitterOptions>) -> Result<Vec<String>> {
    let opts = options.unwrap_or_default();
    let (size, overlap, sizer) = resolved(&opts)?;
    let chunks = match sizer {
        Sizer::Chars => split_chars_recursive(&text, size, overlap),
        Sizer::Tiktoken(s) => split_tokens_recursive(&text, size, overlap, s),
    };
    Ok(chunks)
}

/// Batch — one FFI crossing for N docs.
#[napi(js_name = "splitTextBatch")]
pub fn split_text_batch(
    texts: Vec<String>,
    options: Option<SplitterOptions>,
) -> Result<Vec<Vec<String>>> {
    let opts = options.unwrap_or_default();
    let (size, overlap, sizer) = resolved(&opts)?;
    let out = match sizer {
        Sizer::Chars => texts
            .into_iter()
            .map(|t| split_chars_recursive(&t, size, overlap))
            .collect(),
        Sizer::Tiktoken(s) => texts
            .into_iter()
            .map(|t| split_tokens_recursive(&t, size, overlap, s.clone()))
            .collect(),
    };
    Ok(out)
}

/// Markdown-aware splitter: respects heading/paragraph/list boundaries.
#[napi(js_name = "splitMarkdown")]
pub fn split_markdown(text: String, options: Option<SplitterOptions>) -> Result<Vec<String>> {
    let opts = options.unwrap_or_default();
    let (size, overlap, sizer) = resolved(&opts)?;
    let chunks = match sizer {
        Sizer::Chars => split_markdown_chars(&text, size, overlap),
        Sizer::Tiktoken(s) => split_markdown_tokens(&text, size, overlap, s),
    };
    Ok(chunks)
}

#[napi(js_name = "splitMarkdownBatch")]
pub fn split_markdown_batch(
    texts: Vec<String>,
    options: Option<SplitterOptions>,
) -> Result<Vec<Vec<String>>> {
    let opts = options.unwrap_or_default();
    let (size, overlap, sizer) = resolved(&opts)?;
    let out = match sizer {
        Sizer::Chars => texts
            .into_iter()
            .map(|t| split_markdown_chars(&t, size, overlap))
            .collect(),
        Sizer::Tiktoken(s) => texts
            .into_iter()
            .map(|t| split_markdown_tokens(&t, size, overlap, s.clone()))
            .collect(),
    };
    Ok(out)
}

/// Pure character-length counter.
#[napi(js_name = "countChars")]
pub fn count_chars(text: String) -> u32 {
    text.chars().count() as u32
}

/// Tiktoken token count with a named encoding.
#[napi(js_name = "countTokens")]
pub fn count_tokens(text: String, encoding: Option<String>) -> Result<u32> {
    let sizer = Sizer::from_metric(encoding.as_deref().or(Some("tiktoken:cl100k_base")))?;
    Ok(sizer.count(&text) as u32)
}
