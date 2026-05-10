use napi::bindgen_prelude::*;
use napi_derive::napi;
use nucleo_matcher::{
    Matcher, Utf32Str,
    pattern::{Atom, AtomKind, CaseMatching, Normalization},
};

// `@amigo-labs/fuse` — fuzzy search index built on `nucleo-matcher`.
//
// Parity contract is *ranking direction* (closer matches rank higher),
// not bit-identical scores with `fuse.js` (whose Bitap-based scoring is
// idiosyncratic). See docs/perf-review/fuse.js.md for the rationale.
//
// The state-heavy build-once / query-many shape is what makes this Green:
// records + their weighted fields live in the `Fuse` NAPI class, queries
// only marshal a string in and a small result list back.

#[napi(object)]
pub struct FuseKey {
    pub name: String,
    pub weight: Option<f64>,
}

#[napi(object)]
pub struct FuseOptions {
    pub keys: Option<Vec<FuseKey>>,
    pub include_score: Option<bool>,
    pub threshold: Option<f64>,
    pub limit: Option<u32>,
}

#[napi(object)]
pub struct FuseResult {
    pub ref_index: u32,
    pub score: f64,
}

struct Record {
    /// Per-key text, lower-cased and pre-tokenized. Index aligned with `keys`.
    fields: Vec<String>,
}

#[napi]
pub struct Fuse {
    keys: Vec<(String, f64)>,
    records: Vec<Record>,
    threshold: f64,
}

fn extract_fields(json_record: &str, keys: &[(String, f64)]) -> Vec<String> {
    // Minimal JSON value extraction. Records are passed as JSON strings to
    // sidestep the cost of a `Vec<serde_json::Value>` marshall — `keys`
    // are known up-front, so we only need to pluck them by string match.
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

#[napi]
impl Fuse {
    #[napi(constructor)]
    pub fn new(records_json: Vec<String>, options: Option<FuseOptions>) -> Result<Self> {
        let opts = options.unwrap_or(FuseOptions {
            keys: None,
            include_score: None,
            threshold: None,
            limit: None,
        });
        let keys: Vec<(String, f64)> = match opts.keys {
            Some(ks) => ks
                .into_iter()
                .map(|k| (k.name, k.weight.unwrap_or(1.0)))
                .collect(),
            None => vec![(String::new(), 1.0)],
        };
        let records: Vec<Record> = records_json
            .iter()
            .map(|json| {
                if keys.first().map(|(k, _)| k.is_empty()).unwrap_or(false) {
                    // No keys configured — treat the record itself as the string
                    // (jimp-style "flat list" usage). Try JSON-decode first;
                    // fall back to raw string.
                    let s = serde_json::from_str::<String>(json).unwrap_or_else(|_| json.clone());
                    Record { fields: vec![s] }
                } else {
                    Record {
                        fields: extract_fields(json, &keys),
                    }
                }
            })
            .collect();
        Ok(Self {
            keys,
            records,
            threshold: opts.threshold.unwrap_or(0.6),
        })
    }

    #[napi]
    pub fn search(&self, query: String, limit: Option<u32>) -> Vec<FuseResult> {
        if query.is_empty() {
            return Vec::new();
        }
        let mut matcher = Matcher::new(nucleo_matcher::Config::DEFAULT);
        let atom = Atom::new(
            &query,
            CaseMatching::Ignore,
            Normalization::Smart,
            AtomKind::Fuzzy,
            false,
        );

        let mut buf: Vec<char> = Vec::new();
        let mut hits: Vec<(u32, u32, f64)> = Vec::new();

        let nucleo_max: f64 = 256.0; // empirical normalization for nucleo's u16 score range

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
                // fuse.js convention: score 0 = perfect match, 1 = worst.
                let fuse_score = 1.0 - normalized;
                if fuse_score <= self.threshold {
                    hits.push((idx as u32, best, fuse_score));
                }
            }
        }

        hits.sort_by(|a, b| b.1.cmp(&a.1));
        let cap = limit.map(|n| n as usize).unwrap_or(usize::MAX);
        hits.into_iter()
            .take(cap)
            .map(|(idx, _raw, score)| FuseResult {
                ref_index: idx,
                score,
            })
            .collect()
    }

    #[napi]
    pub fn size(&self) -> u32 {
        self.records.len() as u32
    }
}
