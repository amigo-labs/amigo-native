//! BM25 full-text search over small-to-medium corpora. Backed by
//! the internal `amigo-search-core` crate (shared with
//! `@amigo-labs/minisearch`).
//!
//! Stateful NAPI-class API: build the index once in the constructor,
//! re-use it across queries. Index mutation during query is not
//! supported; rebuild the index if documents change.

use amigo_search_core::{
    Bm25Params, Index, bm25_scores, en_stopwords_sorted, tokenize, tokenize_with_stopwords,
};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::sync::Mutex;

#[napi(object)]
#[derive(Clone)]
pub struct IndexOptions {
    /// BM25 `k1`. Default 1.5.
    pub k1: Option<f64>,
    /// BM25 `b`. Default 0.75.
    pub b: Option<f64>,
    /// Strip English stopwords during tokenization. Default false.
    pub remove_stopwords: Option<bool>,
}

#[napi(object)]
pub struct BmDocument {
    pub id: String,
    pub text: String,
}

#[napi(object)]
pub struct SearchHit {
    pub id: String,
    pub score: f64,
}

#[napi(object)]
pub struct SearchOptions {
    /// Maximum hits to return. Default 10.
    pub limit: Option<u32>,
}

#[napi]
pub struct Bm25Index {
    inner: Mutex<Inner>,
}

struct Inner {
    index: Index<String>,
    params: Bm25Params,
    stopwords: Vec<String>,
    remove_stopwords: bool,
}

impl Inner {
    fn tokenize(&self, text: &str) -> Vec<String> {
        if self.remove_stopwords {
            tokenize_with_stopwords(text, &self.stopwords)
        } else {
            tokenize(text)
        }
    }
}

#[napi]
impl Bm25Index {
    #[napi(constructor)]
    pub fn new(options: Option<IndexOptions>) -> Self {
        let o = options.unwrap_or(IndexOptions {
            k1: None,
            b: None,
            remove_stopwords: None,
        });
        Self {
            inner: Mutex::new(Inner {
                index: Index::new(),
                params: Bm25Params {
                    k1: o.k1.unwrap_or(1.5),
                    b: o.b.unwrap_or(0.75),
                },
                stopwords: en_stopwords_sorted(),
                remove_stopwords: o.remove_stopwords.unwrap_or(false),
            }),
        }
    }

    /// Ingest a batch of documents — single FFI crossing for the
    /// whole corpus. Preferred over repeated `addDoc`.
    #[napi(js_name = "addAll")]
    pub fn add_all(&self, docs: Vec<BmDocument>) -> Result<()> {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        for doc in docs {
            let toks = inner.tokenize(&doc.text);
            inner.index.add(doc.id, toks);
        }
        Ok(())
    }

    /// Add a single document. Prefer `addAll` for bulk ingest.
    #[napi(js_name = "addDoc")]
    pub fn add_doc(&self, id: String, text: String) -> Result<()> {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let toks = inner.tokenize(&text);
        inner.index.add(id, toks);
        Ok(())
    }

    #[napi(js_name = "search")]
    pub fn search(&self, query: String, options: Option<SearchOptions>) -> Vec<SearchHit> {
        let inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let query_tokens = inner.tokenize(&query);
        let scores = bm25_scores(&inner.index, &query_tokens, inner.params);
        let limit = options.and_then(|o| o.limit).unwrap_or(10) as usize;
        scores
            .into_iter()
            .take(limit)
            .map(|(idx, score)| SearchHit {
                id: inner.index.docs[idx].id.clone(),
                score,
            })
            .collect()
    }

    #[napi(js_name = "size")]
    pub fn size(&self) -> u32 {
        self.inner
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .index
            .len() as u32
    }
}
