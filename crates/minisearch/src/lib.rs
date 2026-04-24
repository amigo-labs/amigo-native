//! Drop-in-shape replacement for the `minisearch` npm package —
//! tiny, small-corpus, in-memory full-text search with prefix match
//! and autocomplete. Backed by the internal `amigo-search-core`
//! crate (shared with `@amigo-labs/bm25`).
//!
//! API follows minisearch's common shapes (`add`, `addAll`, `search`,
//! `autoSuggest`) while taking the FFI-friendly form: a stateful
//! NAPI class with single-crossing bulk ingest.

use amigo_search_core::{
    Bm25Params, Index, bm25_scores, en_stopwords_sorted, prefix_match, tokenize,
    tokenize_with_stopwords,
};
use napi_derive::napi;
use std::sync::Mutex;

#[napi(object)]
#[derive(Clone)]
pub struct MiniOptions {
    pub k1: Option<f64>,
    pub b: Option<f64>,
    /// Strip English stopwords at index- and query-time. Default false.
    pub remove_stopwords: Option<bool>,
    /// Default operator for multi-term queries: `"OR"` (default) or
    /// `"AND"`. AND requires every query token to appear in the doc.
    pub default_operator: Option<String>,
}

#[napi(object)]
pub struct MiniDocument {
    pub id: String,
    pub text: String,
}

#[napi(object)]
pub struct MiniHit {
    pub id: String,
    pub score: f64,
}

#[napi(object)]
pub struct MiniSearchOptions {
    pub limit: Option<u32>,
    /// Prefix-match: treat the last term as a prefix (autocomplete).
    pub prefix: Option<bool>,
    /// Override default operator for this query.
    pub operator: Option<String>,
}

#[napi(object)]
pub struct AutoSuggestion {
    pub suggestion: String,
    pub score: f64,
}

#[napi]
pub struct MiniSearch {
    inner: Mutex<Inner>,
}

struct Inner {
    index: Index<String>,
    params: Bm25Params,
    stopwords: Vec<String>,
    remove_stopwords: bool,
    default_and: bool,
}

impl Inner {
    fn tokenize(&self, text: &str) -> Vec<String> {
        if self.remove_stopwords {
            tokenize_with_stopwords(text, &self.stopwords)
        } else {
            tokenize(text)
        }
    }

    fn contains_all_tokens(&self, doc_idx: usize, tokens: &[String]) -> bool {
        let doc_tokens: std::collections::HashSet<&String> =
            self.index.docs[doc_idx].tokens.iter().collect();
        tokens.iter().all(|t| doc_tokens.contains(t))
    }
}

#[napi]
impl MiniSearch {
    #[napi(constructor)]
    pub fn new(options: Option<MiniOptions>) -> Self {
        let o = options.unwrap_or(MiniOptions {
            k1: None,
            b: None,
            remove_stopwords: None,
            default_operator: None,
        });
        let default_and = o
            .default_operator
            .as_deref()
            .map(|s| s.eq_ignore_ascii_case("AND"))
            .unwrap_or(false);
        Self {
            inner: Mutex::new(Inner {
                index: Index::new(),
                params: Bm25Params {
                    k1: o.k1.unwrap_or(1.5),
                    b: o.b.unwrap_or(0.75),
                },
                stopwords: en_stopwords_sorted(),
                remove_stopwords: o.remove_stopwords.unwrap_or(false),
                default_and,
            }),
        }
    }

    /// Single-FFI-crossing corpus ingest.
    #[napi(js_name = "addAll")]
    pub fn add_all(&self, docs: Vec<MiniDocument>) {
        let mut inner = self.inner.lock().unwrap();
        for doc in docs {
            let toks = inner.tokenize(&doc.text);
            inner.index.add(doc.id, toks);
        }
    }

    #[napi(js_name = "add")]
    pub fn add(&self, doc: MiniDocument) {
        let mut inner = self.inner.lock().unwrap();
        let toks = inner.tokenize(&doc.text);
        inner.index.add(doc.id, toks);
    }

    #[napi(js_name = "search")]
    pub fn search(&self, query: String, options: Option<MiniSearchOptions>) -> Vec<MiniHit> {
        let inner = self.inner.lock().unwrap();
        let opts = options.unwrap_or(MiniSearchOptions {
            limit: None,
            prefix: None,
            operator: None,
        });

        let mut query_tokens = inner.tokenize(&query);
        if query_tokens.is_empty() {
            return Vec::new();
        }

        // Prefix-expansion for autocomplete.
        if opts.prefix.unwrap_or(false)
            && let Some(last) = query_tokens.last().cloned()
        {
            let expansions = prefix_match(&inner.index, &last);
            query_tokens.pop();
            query_tokens.extend(expansions);
            if query_tokens.is_empty() {
                return Vec::new();
            }
        }

        let and_mode = opts
            .operator
            .as_deref()
            .map(|s| s.eq_ignore_ascii_case("AND"))
            .unwrap_or(inner.default_and);

        let scores = bm25_scores(&inner.index, &query_tokens, inner.params);
        let limit = opts.limit.unwrap_or(10) as usize;

        scores
            .into_iter()
            .filter(|(doc_idx, _)| !and_mode || inner.contains_all_tokens(*doc_idx, &query_tokens))
            .take(limit)
            .map(|(doc_idx, score)| MiniHit {
                id: inner.index.docs[doc_idx].id.clone(),
                score,
            })
            .collect()
    }

    /// Autocomplete: return the prefix-matching terms from the index,
    /// ranked by how many docs contain them.
    #[napi(js_name = "autoSuggest")]
    pub fn auto_suggest(&self, prefix: String, limit: Option<u32>) -> Vec<AutoSuggestion> {
        let inner = self.inner.lock().unwrap();
        let mut out: Vec<AutoSuggestion> = prefix_match(&inner.index, &prefix)
            .into_iter()
            .map(|term| {
                let df = inner
                    .index
                    .postings
                    .get(&term)
                    .map(|p| p.len())
                    .unwrap_or(0) as f64;
                AutoSuggestion {
                    suggestion: term,
                    score: df,
                }
            })
            .collect();
        out.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        let limit = limit.unwrap_or(10) as usize;
        out.truncate(limit);
        out
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
    fn empty_search() {
        let m = MiniSearch::new(None);
        assert!(m.search("anything".into(), None).is_empty());
    }

    #[test]
    fn basic_search() {
        let m = MiniSearch::new(None);
        m.add_all(vec![
            MiniDocument {
                id: "a".into(),
                text: "rust programming language".into(),
            },
            MiniDocument {
                id: "b".into(),
                text: "python programming language".into(),
            },
        ]);
        let hits = m.search("rust".into(), None);
        assert_eq!(hits[0].id, "a");
    }

    #[test]
    fn prefix_search() {
        let m = MiniSearch::new(None);
        m.add_all(vec![
            MiniDocument {
                id: "a".into(),
                text: "rust rustic programming".into(),
            },
            MiniDocument {
                id: "b".into(),
                text: "python".into(),
            },
        ]);
        let hits = m.search(
            "rus".into(),
            Some(MiniSearchOptions {
                limit: None,
                prefix: Some(true),
                operator: None,
            }),
        );
        assert_eq!(hits[0].id, "a");
    }

    #[test]
    fn and_operator_requires_all_tokens() {
        let m = MiniSearch::new(None);
        m.add_all(vec![
            MiniDocument {
                id: "a".into(),
                text: "rust programming".into(),
            },
            MiniDocument {
                id: "b".into(),
                text: "rust only".into(),
            },
        ]);
        let or_hits = m.search("rust programming".into(), None);
        assert_eq!(or_hits.len(), 2);
        let and_hits = m.search(
            "rust programming".into(),
            Some(MiniSearchOptions {
                limit: None,
                prefix: None,
                operator: Some("AND".into()),
            }),
        );
        assert_eq!(and_hits.len(), 1);
        assert_eq!(and_hits[0].id, "a");
    }

    #[test]
    fn auto_suggest() {
        let m = MiniSearch::new(None);
        m.add_doc_helper("a", "rust rustic rustaceous programming");
        let sugs = m.auto_suggest("rust".into(), None);
        assert!(sugs.iter().any(|s| s.suggestion == "rust"));
        assert!(sugs.iter().any(|s| s.suggestion == "rustic"));
    }

    impl MiniSearch {
        fn add_doc_helper(&self, id: &str, text: &str) {
            self.add(MiniDocument {
                id: id.to_string(),
                text: text.to_string(),
            });
        }
    }
}
