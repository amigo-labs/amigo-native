//! BM25 full-text search over small-to-medium corpora. Backed by
//! the internal `amigo-search-core` crate (shared with
//! `@amigo-labs/minisearch`).
//!
//! Stateful NAPI-class API: build the index once in the constructor,
//! re-use it across queries. Index mutation during query is not
//! supported; rebuild the index if documents change.

use amigo_search_core::{
    Bm25Params, Index, bm25_scores, en_stopwords_sorted, tokenize,
    tokenize_with_stopwords,
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
        let mut inner = self.inner.lock().unwrap();
        for doc in docs {
            let toks = inner.tokenize(&doc.text);
            inner.index.add(doc.id, toks);
        }
        Ok(())
    }

    /// Add a single document. Prefer `addAll` for bulk ingest.
    #[napi(js_name = "addDoc")]
    pub fn add_doc(&self, id: String, text: String) -> Result<()> {
        let mut inner = self.inner.lock().unwrap();
        let toks = inner.tokenize(&text);
        inner.index.add(id, toks);
        Ok(())
    }

    #[napi(js_name = "search")]
    pub fn search(&self, query: String, options: Option<SearchOptions>) -> Vec<SearchHit> {
        let inner = self.inner.lock().unwrap();
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
        self.inner.lock().unwrap().index.len() as u32
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_index_returns_empty_hits() {
        let idx = Bm25Index::new(None);
        let hits = idx.search("anything".into(), None);
        assert!(hits.is_empty());
    }

    #[test]
    fn search_finds_matching_doc() {
        let idx = Bm25Index::new(None);
        idx.add_all(vec![
            BmDocument {
                id: "a".into(),
                text: "the cat sat on the mat".into(),
            },
            BmDocument {
                id: "b".into(),
                text: "the dog ran away".into(),
            },
        ])
        .unwrap();
        let hits = idx.search("cat".into(), None);
        assert_eq!(hits[0].id, "a");
    }

    #[test]
    fn ranking_is_relevance_ordered() {
        let idx = Bm25Index::new(None);
        idx.add_all(vec![
            BmDocument {
                id: "a".into(),
                text: "rust rust rust programming".into(),
            },
            BmDocument {
                id: "b".into(),
                text: "rust and python programming".into(),
            },
        ])
        .unwrap();
        let hits = idx.search("rust".into(), None);
        assert_eq!(hits[0].id, "a");
    }

    #[test]
    fn limit_honored() {
        let idx = Bm25Index::new(None);
        for i in 0..10 {
            idx.add_doc(format!("{i}"), "rust lang programming".into()).unwrap();
        }
        let hits = idx.search(
            "rust".into(),
            Some(SearchOptions { limit: Some(3) }),
        );
        assert_eq!(hits.len(), 3);
    }

    #[test]
    fn stopwords_reduce_noise() {
        let idx = Bm25Index::new(Some(IndexOptions {
            k1: None,
            b: None,
            remove_stopwords: Some(true),
        }));
        idx.add_doc("a".into(), "the quick brown fox".into()).unwrap();
        let hits = idx.search("the".into(), None);
        // "the" is stopword-filtered, so no hits.
        assert!(hits.is_empty());
    }
}
