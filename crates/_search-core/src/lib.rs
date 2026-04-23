//! Shared search primitives used by @amigo-labs/bm25 and
//! @amigo-labs/minisearch. Internal-only crate (not published to npm).
//!
//! Contents:
//!   - `tokenize()`        — unicode-safe word tokenizer with optional
//!                           stemming stub and stopword filtering.
//!   - `Index`             — per-field inverted index with document
//!                           frequency, term frequency, and doc lengths.
//!   - `bm25_scores()`     — BM25 ranking (k1=1.5, b=0.75 defaults).
//!
//! Deliberately minimal: no I/O, no NAPI types. The public npm
//! wrappers (`crates/bm25/`, `crates/minisearch/`) own the FFI
//! surface.

use std::collections::HashMap;

/// Lowercase + split on any non-alphanumeric character. Cheap,
/// allocation-conscious.
pub fn tokenize(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    for c in text.chars() {
        if c.is_alphanumeric() {
            for l in c.to_lowercase() {
                cur.push(l);
            }
        } else if !cur.is_empty() {
            out.push(std::mem::take(&mut cur));
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

/// Tokenize with a stopword-skip pass. Stopwords are provided as a
/// sorted slice for binary-search lookup.
pub fn tokenize_with_stopwords(text: &str, stopwords: &[String]) -> Vec<String> {
    let all = tokenize(text);
    all.into_iter()
        .filter(|t| stopwords.binary_search(t).is_err())
        .collect()
}

/// A single document's tokenised form plus its original id.
#[derive(Debug, Clone)]
pub struct Doc<Id> {
    pub id: Id,
    pub tokens: Vec<String>,
}

/// Inverted index: token → [(doc_idx, tf)].
#[derive(Debug, Clone)]
pub struct Index<Id: Clone> {
    pub docs: Vec<Doc<Id>>,
    pub postings: HashMap<String, Vec<(usize, u32)>>,
    pub doc_lengths: Vec<u32>,
    pub avg_doc_len: f64,
}

impl<Id: Clone> Default for Index<Id> {
    fn default() -> Self {
        Self {
            docs: Vec::new(),
            postings: HashMap::new(),
            doc_lengths: Vec::new(),
            avg_doc_len: 0.0,
        }
    }
}

impl<Id: Clone> Index<Id> {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add(&mut self, id: Id, tokens: Vec<String>) {
        let doc_idx = self.docs.len();
        let len = tokens.len() as u32;

        // Term-frequency counts for this document.
        let mut counts: HashMap<String, u32> = HashMap::new();
        for t in &tokens {
            *counts.entry(t.clone()).or_insert(0) += 1;
        }
        for (term, tf) in counts {
            self.postings.entry(term).or_default().push((doc_idx, tf));
        }

        self.docs.push(Doc { id, tokens });
        self.doc_lengths.push(len);
        self.recompute_avg();
    }

    pub fn len(&self) -> usize {
        self.docs.len()
    }

    pub fn is_empty(&self) -> bool {
        self.docs.is_empty()
    }

    fn recompute_avg(&mut self) {
        if self.doc_lengths.is_empty() {
            self.avg_doc_len = 0.0;
        } else {
            let sum: u64 = self.doc_lengths.iter().map(|&n| n as u64).sum();
            self.avg_doc_len = sum as f64 / self.doc_lengths.len() as f64;
        }
    }
}

/// BM25 tuning parameters.
#[derive(Debug, Clone, Copy)]
pub struct Bm25Params {
    pub k1: f64,
    pub b: f64,
}

impl Default for Bm25Params {
    fn default() -> Self {
        Self { k1: 1.5, b: 0.75 }
    }
}

/// BM25 scoring. Returns (doc_idx, score) sorted descending.
pub fn bm25_scores<Id: Clone>(
    index: &Index<Id>,
    query_tokens: &[String],
    params: Bm25Params,
) -> Vec<(usize, f64)> {
    let n = index.docs.len() as f64;
    if n == 0.0 {
        return Vec::new();
    }

    let mut scores: HashMap<usize, f64> = HashMap::new();
    for q in query_tokens {
        let postings = match index.postings.get(q) {
            Some(p) => p,
            None => continue,
        };
        let df = postings.len() as f64;
        let idf = ((n - df + 0.5) / (df + 0.5) + 1.0).ln();

        for &(doc_idx, tf) in postings {
            let dl = index.doc_lengths[doc_idx] as f64;
            let tf = tf as f64;
            let norm =
                tf * (params.k1 + 1.0)
                    / (tf + params.k1 * (1.0 - params.b + params.b * dl / index.avg_doc_len));
            *scores.entry(doc_idx).or_insert(0.0) += idf * norm;
        }
    }

    let mut out: Vec<(usize, f64)> = scores.into_iter().collect();
    out.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    out
}

/// Prefix match: all tokens that start with `prefix`, sorted alphabetically.
pub fn prefix_match<Id: Clone>(index: &Index<Id>, prefix: &str) -> Vec<String> {
    let prefix_lower = prefix.to_ascii_lowercase();
    let mut out: Vec<String> = index
        .postings
        .keys()
        .filter(|k| k.starts_with(&prefix_lower))
        .cloned()
        .collect();
    out.sort();
    out
}

/// Built-in English stopwords, sorted for binary search.
pub const EN_STOPWORDS: &[&str] = &[
    "a", "about", "above", "after", "again", "against", "all", "am", "an",
    "and", "any", "are", "as", "at", "be", "because", "been", "before",
    "being", "below", "between", "both", "but", "by", "could", "did", "do",
    "does", "doing", "down", "during", "each", "few", "for", "from",
    "further", "had", "has", "have", "having", "he", "her", "here", "hers",
    "herself", "him", "himself", "his", "how", "i", "if", "in", "into",
    "is", "it", "its", "itself", "just", "me", "more", "most", "my",
    "myself", "no", "nor", "not", "now", "of", "off", "on", "once", "only",
    "or", "other", "our", "ours", "ourselves", "out", "over", "own", "same",
    "she", "should", "so", "some", "such", "than", "that", "the", "their",
    "theirs", "them", "themselves", "then", "there", "these", "they",
    "this", "those", "through", "to", "too", "under", "until", "up", "very",
    "was", "we", "were", "what", "when", "where", "which", "while", "who",
    "whom", "why", "will", "with", "would", "you", "your", "yours",
    "yourself", "yourselves",
];

pub fn en_stopwords_sorted() -> Vec<String> {
    let mut v: Vec<String> = EN_STOPWORDS.iter().map(|s| s.to_string()).collect();
    v.sort();
    v
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokenize_basic() {
        assert_eq!(tokenize("Hello, World!"), vec!["hello", "world"]);
    }

    #[test]
    fn tokenize_unicode() {
        let toks = tokenize("Größe Straße");
        assert_eq!(toks, vec!["größe", "straße"]);
    }

    #[test]
    fn index_add_and_score() {
        let mut idx: Index<String> = Index::new();
        idx.add("a".into(), tokenize("the cat sat on the mat"));
        idx.add("b".into(), tokenize("the dog ran away"));
        idx.add("c".into(), tokenize("cat and dog together"));

        let scores = bm25_scores(&idx, &tokenize("cat"), Bm25Params::default());
        assert!(scores.iter().any(|(idx, _)| *idx == 0));
        assert!(scores.iter().any(|(idx, _)| *idx == 2));
        // doc b should not appear (no "cat")
        assert!(!scores.iter().any(|(idx, _)| *idx == 1));
    }

    #[test]
    fn bm25_ranks_higher_relevance_first() {
        let mut idx: Index<String> = Index::new();
        idx.add("a".into(), tokenize("rust rust rust"));
        idx.add("b".into(), tokenize("rust and python"));
        let scores = bm25_scores(&idx, &tokenize("rust"), Bm25Params::default());
        assert_eq!(scores[0].0, 0);
    }

    #[test]
    fn prefix_match_works() {
        let mut idx: Index<String> = Index::new();
        idx.add("a".into(), tokenize("cat catalog cattle dog"));
        let matches = prefix_match(&idx, "cat");
        assert_eq!(matches, vec!["cat", "catalog", "cattle"]);
    }

    #[test]
    fn stopwords_filter() {
        let stop = en_stopwords_sorted();
        let toks = tokenize_with_stopwords("the quick brown fox", &stop);
        assert_eq!(toks, vec!["quick", "brown", "fox"]);
    }
}
