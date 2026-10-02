//! Shared text-splitter logic for RAG pipelines. Internal-only.
//!
//! `text-splitter` (Ben Brandt) handles the recursive-character and
//! markdown-aware splitting. `tiktoken-rs` provides token-based length
//! counting — but the tiktoken BPE tables are ~1.5 MB and the crate
//! does not compile cleanly for `wasm32-unknown-unknown`, so the
//! Tiktoken sizer variant is **not available in the WASM build**.
//! Callers requesting `tiktoken:*` length metrics will get an error
//! at runtime in the browser.

#[cfg(not(target_arch = "wasm32"))]
use std::sync::{Arc, LazyLock};
use text_splitter::{ChunkConfig, MarkdownSplitter, TextSplitter};

#[cfg(not(target_arch = "wasm32"))]
use text_splitter::ChunkSizer;
#[cfg(not(target_arch = "wasm32"))]
use tiktoken_rs::{CoreBPE, cl100k_base, o200k_base};

#[derive(Default, Clone, Debug)]
pub struct SplitterOptions {
    pub chunk_size: Option<u32>,
    pub chunk_overlap: Option<u32>,
    pub length_metric: Option<String>,
}

#[cfg(not(target_arch = "wasm32"))]
#[derive(Clone)]
pub struct TiktokenSizer(Arc<CoreBPE>);

/// Building a `CoreBPE` parses the full vocabulary (~1.5 MB of tables), so
/// each encoding is built once per process and shared via `Arc` instead of
/// being rebuilt on every `countTokens` / split call. The tables stay
/// resident after first use.
#[cfg(not(target_arch = "wasm32"))]
static CL100K_BASE: LazyLock<Result<Arc<CoreBPE>, String>> = LazyLock::new(|| {
    cl100k_base()
        .map(Arc::new)
        .map_err(|e| format!("tiktoken init: {e}"))
});

#[cfg(not(target_arch = "wasm32"))]
static O200K_BASE: LazyLock<Result<Arc<CoreBPE>, String>> = LazyLock::new(|| {
    o200k_base()
        .map(Arc::new)
        .map_err(|e| format!("tiktoken init: {e}"))
});

#[cfg(not(target_arch = "wasm32"))]
impl ChunkSizer for TiktokenSizer {
    fn size(&self, chunk: &str) -> usize {
        self.0.encode_with_special_tokens(chunk).len()
    }
}

pub enum Sizer {
    Chars,
    #[cfg(not(target_arch = "wasm32"))]
    Tiktoken(TiktokenSizer),
}

impl Sizer {
    pub fn from_metric(s: Option<&str>) -> Result<Self, String> {
        match s.unwrap_or("chars") {
            "chars" => Ok(Sizer::Chars),
            #[cfg(not(target_arch = "wasm32"))]
            "tiktoken:cl100k_base" | "tiktoken" => CL100K_BASE
                .clone()
                .map(|b| Sizer::Tiktoken(TiktokenSizer(b))),
            #[cfg(not(target_arch = "wasm32"))]
            "tiktoken:o200k_base" => O200K_BASE
                .clone()
                .map(|b| Sizer::Tiktoken(TiktokenSizer(b))),
            #[cfg(target_arch = "wasm32")]
            "tiktoken:cl100k_base" | "tiktoken" | "tiktoken:o200k_base" => {
                Err("tiktoken-based length metrics are not available in the WASM build; pass length_metric: \"chars\"".to_string())
            }
            other => Err(format!("unknown lengthMetric: {other}")),
        }
    }

    pub fn count(&self, s: &str) -> usize {
        match self {
            Sizer::Chars => s.chars().count(),
            #[cfg(not(target_arch = "wasm32"))]
            Sizer::Tiktoken(t) => t.size(s),
        }
    }
}

pub fn resolved(opts: &SplitterOptions) -> Result<(usize, usize, Sizer), String> {
    let chunk_size = opts.chunk_size.unwrap_or(1000) as usize;
    let chunk_overlap = opts.chunk_overlap.unwrap_or(0) as usize;
    let sizer = Sizer::from_metric(opts.length_metric.as_deref())?;
    if chunk_overlap >= chunk_size {
        return Err("chunkOverlap must be less than chunkSize".to_string());
    }
    Ok((chunk_size, chunk_overlap, sizer))
}

fn overlap_err<E: std::fmt::Display>(e: E) -> String {
    format!("invalid chunk overlap: {e}")
}

pub fn split_chars_recursive(
    text: &str,
    chunk_size: usize,
    chunk_overlap: usize,
) -> Result<Vec<String>, String> {
    let cfg = ChunkConfig::new(chunk_size)
        .with_overlap(chunk_overlap)
        .map_err(overlap_err)?;
    let splitter = TextSplitter::new(cfg);
    Ok(splitter.chunks(text).map(String::from).collect())
}

#[cfg(not(target_arch = "wasm32"))]
pub fn split_tokens_recursive(
    text: &str,
    chunk_size: usize,
    chunk_overlap: usize,
    sizer: TiktokenSizer,
) -> Result<Vec<String>, String> {
    let cfg = ChunkConfig::new(chunk_size)
        .with_sizer(sizer)
        .with_overlap(chunk_overlap)
        .map_err(overlap_err)?;
    let splitter = TextSplitter::new(cfg);
    Ok(splitter.chunks(text).map(String::from).collect())
}

pub fn split_markdown_chars(
    text: &str,
    chunk_size: usize,
    chunk_overlap: usize,
) -> Result<Vec<String>, String> {
    let cfg = ChunkConfig::new(chunk_size)
        .with_overlap(chunk_overlap)
        .map_err(overlap_err)?;
    let splitter = MarkdownSplitter::new(cfg);
    Ok(splitter.chunks(text).map(String::from).collect())
}

#[cfg(not(target_arch = "wasm32"))]
pub fn split_markdown_tokens(
    text: &str,
    chunk_size: usize,
    chunk_overlap: usize,
    sizer: TiktokenSizer,
) -> Result<Vec<String>, String> {
    let cfg = ChunkConfig::new(chunk_size)
        .with_sizer(sizer)
        .with_overlap(chunk_overlap)
        .map_err(overlap_err)?;
    let splitter = MarkdownSplitter::new(cfg);
    Ok(splitter.chunks(text).map(String::from).collect())
}

/// Dispatches between Chars and Tiktoken variants. Caller has already
/// validated overlap/size via `resolved`.
pub fn split_text(text: &str, opts: &SplitterOptions) -> Result<Vec<String>, String> {
    let (size, overlap, sizer) = resolved(opts)?;
    match sizer {
        Sizer::Chars => split_chars_recursive(text, size, overlap),
        #[cfg(not(target_arch = "wasm32"))]
        Sizer::Tiktoken(s) => split_tokens_recursive(text, size, overlap, s),
    }
}

pub fn split_markdown(text: &str, opts: &SplitterOptions) -> Result<Vec<String>, String> {
    let (size, overlap, sizer) = resolved(opts)?;
    match sizer {
        Sizer::Chars => split_markdown_chars(text, size, overlap),
        #[cfg(not(target_arch = "wasm32"))]
        Sizer::Tiktoken(s) => split_markdown_tokens(text, size, overlap, s),
    }
}

pub fn count_chars(text: &str) -> usize {
    text.chars().count()
}

pub fn count_tokens(text: &str, encoding: Option<&str>) -> Result<usize, String> {
    let sizer = Sizer::from_metric(encoding.or(Some("tiktoken:cl100k_base")))?;
    Ok(sizer.count(text))
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;

    fn bpe(metric: &str) -> Arc<CoreBPE> {
        match Sizer::from_metric(Some(metric)).unwrap() {
            Sizer::Tiktoken(TiktokenSizer(b)) => b,
            Sizer::Chars => panic!("{metric} should resolve to a tiktoken sizer"),
        }
    }

    #[test]
    fn tiktoken_encodings_are_built_once_and_shared() {
        assert!(Arc::ptr_eq(&bpe("tiktoken"), &bpe("tiktoken:cl100k_base")));
        assert!(Arc::ptr_eq(
            &bpe("tiktoken:o200k_base"),
            &bpe("tiktoken:o200k_base")
        ));
        assert!(!Arc::ptr_eq(&bpe("tiktoken"), &bpe("tiktoken:o200k_base")));
    }

    #[test]
    fn count_tokens_is_stable_across_calls() {
        let first = count_tokens("hello world, hello tokens", None).unwrap();
        let second = count_tokens("hello world, hello tokens", None).unwrap();
        assert_eq!(first, second);
        assert!(first > 0);
    }
}
