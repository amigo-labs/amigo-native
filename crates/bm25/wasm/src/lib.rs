use amigo_search_core::{
    Bm25Params, Index, bm25_scores, en_stopwords_sorted, tokenize, tokenize_with_stopwords,
};
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use wasm_bindgen::prelude::*;

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IndexOptionsJs {
    k1: Option<f64>,
    b: Option<f64>,
    remove_stopwords: Option<bool>,
}

#[derive(Deserialize)]
struct BmDocumentJs {
    id: String,
    text: String,
}

#[derive(Serialize)]
struct SearchHitJs {
    id: String,
    score: f64,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchOptionsJs {
    limit: Option<u32>,
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

#[wasm_bindgen]
pub struct Bm25Index {
    inner: RefCell<Inner>,
}

#[wasm_bindgen]
impl Bm25Index {
    #[wasm_bindgen(constructor)]
    pub fn new(options: JsValue) -> Result<Bm25Index, JsError> {
        let o: IndexOptionsJs = if options.is_undefined() || options.is_null() {
            IndexOptionsJs::default()
        } else {
            serde_wasm_bindgen::from_value(options).map_err(|e| JsError::new(&e.to_string()))?
        };
        Ok(Bm25Index {
            inner: RefCell::new(Inner {
                index: Index::new(),
                params: Bm25Params {
                    k1: o.k1.unwrap_or(1.5),
                    b: o.b.unwrap_or(0.75),
                },
                stopwords: en_stopwords_sorted(),
                remove_stopwords: o.remove_stopwords.unwrap_or(false),
            }),
        })
    }

    #[wasm_bindgen(js_name = "addAll")]
    pub fn add_all(&self, docs: JsValue) -> Result<(), JsError> {
        let docs: Vec<BmDocumentJs> =
            serde_wasm_bindgen::from_value(docs).map_err(|e| JsError::new(&e.to_string()))?;
        let mut inner = self.inner.borrow_mut();
        for doc in docs {
            let toks = inner.tokenize(&doc.text);
            inner.index.add(doc.id, toks);
        }
        Ok(())
    }

    #[wasm_bindgen(js_name = "addDoc")]
    pub fn add_doc(&self, id: String, text: String) {
        let mut inner = self.inner.borrow_mut();
        let toks = inner.tokenize(&text);
        inner.index.add(id, toks);
    }

    #[wasm_bindgen]
    pub fn search(&self, query: &str, options: JsValue) -> Result<JsValue, JsError> {
        let inner = self.inner.borrow();
        let opts: SearchOptionsJs = if options.is_undefined() || options.is_null() {
            SearchOptionsJs::default()
        } else {
            serde_wasm_bindgen::from_value(options).map_err(|e| JsError::new(&e.to_string()))?
        };
        let query_tokens = inner.tokenize(query);
        let scores = bm25_scores(&inner.index, &query_tokens, inner.params);
        let limit = opts.limit.unwrap_or(10) as usize;
        let hits: Vec<SearchHitJs> = scores
            .into_iter()
            .take(limit)
            .map(|(idx, score)| SearchHitJs {
                id: inner.index.docs[idx].id.clone(),
                score,
            })
            .collect();
        serde_wasm_bindgen::to_value(&hits).map_err(|e| JsError::new(&e.to_string()))
    }

    #[wasm_bindgen]
    pub fn size(&self) -> u32 {
        self.inner.borrow().index.len() as u32
    }
}
