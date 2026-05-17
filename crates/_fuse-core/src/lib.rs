//! Shared fuzzy-search logic backed by `nucleo-matcher`. Internal-only
//! crate; the napi and WASM bindings wrap the `Fuse` struct with their
//! respective FFI surface.

use nucleo_matcher::{
    Matcher, Utf32Str,
    pattern::{Atom, AtomKind, CaseMatching, Normalization},
};

#[derive(Default, Debug, Clone)]
pub struct FuseOptions {
    pub keys: Vec<(String, f64)>,
    pub threshold: Option<f64>,
    pub default_limit: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct FuseResult {
    pub ref_index: u32,
    pub score: f64,
}

struct Record {
    fields: Vec<String>,
}

pub struct Fuse {
    keys: Vec<(String, f64)>,
    records: Vec<Record>,
    threshold: f64,
    default_limit: Option<u32>,
}

fn extract_fields(json_record: &str, keys: &[(String, f64)]) -> Vec<String> {
    let v: serde_json::Value = match serde_json::from_str(json_record) {
        Ok(v) => v,
        Err(_) => return vec![String::new(); keys.len()],
    };
    keys.iter()
        .map(|(k, _)| {
            v.get(k)
                .and_then(|x| x.as_str())
                .map(|s| s.to_string())
                .unwrap_or_default()
        })
        .collect()
}

impl Fuse {
    pub fn new(records_json: Vec<String>, opts: FuseOptions) -> Self {
        let keys = if opts.keys.is_empty() {
            vec![(String::new(), 1.0)]
        } else {
            opts.keys
        };
        let records: Vec<Record> = records_json
            .iter()
            .map(|json| {
                if keys.first().map(|(k, _)| k.is_empty()).unwrap_or(false) {
                    let s = serde_json::from_str::<String>(json).unwrap_or_else(|_| json.clone());
                    Record { fields: vec![s] }
                } else {
                    Record {
                        fields: extract_fields(json, &keys),
                    }
                }
            })
            .collect();
        Self {
            keys,
            records,
            threshold: opts.threshold.unwrap_or(0.6),
            default_limit: opts.default_limit,
        }
    }

    pub fn search(&self, query: &str, limit: Option<u32>) -> Vec<FuseResult> {
        if query.is_empty() {
            return Vec::new();
        }
        let mut matcher = Matcher::new(nucleo_matcher::Config::DEFAULT);
        let atom = Atom::new(
            query,
            CaseMatching::Ignore,
            Normalization::Smart,
            AtomKind::Fuzzy,
            false,
        );

        let mut buf: Vec<char> = Vec::new();
        let mut hits: Vec<(u32, u32, f64)> = Vec::new();

        let nucleo_max: f64 = 256.0;

        for (idx, rec) in self.records.iter().enumerate() {
            let mut best: u32 = 0;
            for (field, weight) in rec.fields.iter().zip(self.keys.iter().map(|(_, w)| *w)) {
                buf.clear();
                buf.extend(field.chars());
                let haystack = Utf32Str::new(field, &mut buf);
                let score = atom.score(haystack, &mut matcher).unwrap_or(0);
                let weighted = ((score as f64) * weight) as u32;
                if weighted > best {
                    best = weighted;
                }
            }
            if best > 0 {
                let normalized = (best as f64 / nucleo_max).min(1.0);
                let fuse_score = 1.0 - normalized;
                if fuse_score <= self.threshold {
                    hits.push((idx as u32, best, fuse_score));
                }
            }
        }

        hits.sort_by_key(|&(_, raw, _)| std::cmp::Reverse(raw));
        let cap = limit
            .or(self.default_limit)
            .map(|n| n as usize)
            .unwrap_or(usize::MAX);
        hits.into_iter()
            .take(cap)
            .map(|(idx, _raw, score)| FuseResult {
                ref_index: idx,
                score,
            })
            .collect()
    }

    pub fn size(&self) -> u32 {
        self.records.len() as u32
    }
}
