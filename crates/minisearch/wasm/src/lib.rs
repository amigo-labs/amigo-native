use amigo_search_core::{
    Bm25Params, Index, bm25_scores, en_stopwords_sorted, prefix_match, tokenize,
    tokenize_with_stopwords,
};
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use wasm_bindgen::prelude::*;

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MiniOptionsJs {
    k1: Option<f64>,
    b: Option<f64>,
    remove_stopwords: Option<bool>,
    default_operator: Option<String>,
}

#[derive(Deserialize)]
struct MiniDocumentJs {
    id: String,
    text: String,
}

#[derive(Serialize)]
struct MiniHitJs {
    id: String,
    score: f64,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MiniSearchOptionsJs {
    limit: Option<u32>,
    prefix: Option<bool>,
    operator: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AutoSuggestionJs {
    suggestion: String,
    score: f64,
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

#[wasm_bindgen]
pub struct MiniSearch {
    inner: RefCell<Inner>,
}

#[wasm_bindgen]
impl MiniSearch {
    #[wasm_bindgen(constructor)]
    pub fn new(options: JsValue) -> Result<MiniSearch, JsError> {
        let o: MiniOptionsJs = if options.is_undefined() || options.is_null() {
            MiniOptionsJs::default()
        } else {
            serde_wasm_bindgen::from_value(options).map_err(|e| JsError::new(&e.to_string()))?
        };
        let default_and = o
            .default_operator
            .as_deref()
            .map(|s| s.eq_ignore_ascii_case("AND"))
            .unwrap_or(false);
        Ok(MiniSearch {
            inner: RefCell::new(Inner {
                index: Index::new(),
                params: Bm25Params {
                    k1: o.k1.unwrap_or(1.5),
                    b: o.b.unwrap_or(0.75),
                },
                stopwords: en_stopwords_sorted(),
                remove_stopwords: o.remove_stopwords.unwrap_or(false),
                default_and,
            }),
        })
    }

    #[wasm_bindgen(js_name = "addAll")]
    pub fn add_all(&self, docs: JsValue) -> Result<(), JsError> {
        let docs: Vec<MiniDocumentJs> =
            serde_wasm_bindgen::from_value(docs).map_err(|e| JsError::new(&e.to_string()))?;
        let mut inner = self.inner.borrow_mut();
        for doc in docs {
            let toks = inner.tokenize(&doc.text);
            inner.index.add(doc.id, toks);
        }
        Ok(())
    }

    #[wasm_bindgen]
    pub fn add(&self, doc: JsValue) -> Result<(), JsError> {
        let doc: MiniDocumentJs =
            serde_wasm_bindgen::from_value(doc).map_err(|e| JsError::new(&e.to_string()))?;
        let mut inner = self.inner.borrow_mut();
        let toks = inner.tokenize(&doc.text);
        inner.index.add(doc.id, toks);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn search(&self, query: &str, options: JsValue) -> Result<JsValue, JsError> {
        let inner = self.inner.borrow();
        let opts: MiniSearchOptionsJs = if options.is_undefined() || options.is_null() {
            MiniSearchOptionsJs::default()
        } else {
            serde_wasm_bindgen::from_value(options).map_err(|e| JsError::new(&e.to_string()))?
        };

        let mut query_tokens = inner.tokenize(query);
        if query_tokens.is_empty() {
            return serde_wasm_bindgen::to_value::<Vec<MiniHitJs>>(&Vec::new())
                .map_err(|e| JsError::new(&e.to_string()));
        }

        if opts.prefix.unwrap_or(false)
            && let Some(last) = query_tokens.last().cloned()
        {
            let expansions = prefix_match(&inner.index, &last);
            query_tokens.pop();
            query_tokens.extend(expansions);
            if query_tokens.is_empty() {
                return serde_wasm_bindgen::to_value::<Vec<MiniHitJs>>(&Vec::new())
                    .map_err(|e| JsError::new(&e.to_string()));
            }
        }

        let and_mode = opts
            .operator
            .as_deref()
            .map(|s| s.eq_ignore_ascii_case("AND"))
            .unwrap_or(inner.default_and);

        let scores = bm25_scores(&inner.index, &query_tokens, inner.params);
        let limit = opts.limit.unwrap_or(10) as usize;
        let hits: Vec<MiniHitJs> = scores
            .into_iter()
            .filter(|(doc_idx, _)| !and_mode || inner.contains_all_tokens(*doc_idx, &query_tokens))
            .take(limit)
            .map(|(doc_idx, score)| MiniHitJs {
                id: inner.index.docs[doc_idx].id.clone(),
                score,
            })
            .collect();
        serde_wasm_bindgen::to_value(&hits).map_err(|e| JsError::new(&e.to_string()))
    }

    #[wasm_bindgen(js_name = "autoSuggest")]
    pub fn auto_suggest(&self, prefix: &str, limit: Option<u32>) -> Result<JsValue, JsError> {
        let inner = self.inner.borrow();
        let mut out: Vec<AutoSuggestionJs> = prefix_match(&inner.index, prefix)
            .into_iter()
            .map(|term| {
                let df = inner
                    .index
                    .postings
                    .get(&term)
                    .map(|p| p.len())
                    .unwrap_or(0) as f64;
                AutoSuggestionJs {
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
        serde_wasm_bindgen::to_value(&out).map_err(|e| JsError::new(&e.to_string()))
    }

    #[wasm_bindgen]
    pub fn size(&self) -> u32 {
        self.inner.borrow().index.len() as u32
    }
}
