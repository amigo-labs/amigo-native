//! Fuzzy search index — thin napi wrapper around `amigo-fuse-core`.

use amigo_fuse_core as core;
use napi_derive::napi;

#[napi(object)]
pub struct FuseKey {
    pub name: String,
    pub weight: Option<f64>,
}

#[napi(object)]
pub struct FuseOptions {
    pub keys: Option<Vec<FuseKey>>,
    pub threshold: Option<f64>,
    /// Default `limit` applied when `Fuse.search` is called without one.
    /// Per-call `limit` always wins. `None` means "no cap".
    pub default_limit: Option<u32>,
}

#[napi(object)]
pub struct FuseResult {
    pub ref_index: u32,
    pub score: f64,
}

#[napi]
pub struct Fuse {
    inner: core::Fuse,
}

fn into_core(opts: Option<FuseOptions>) -> core::FuseOptions {
    let o = opts.unwrap_or(FuseOptions {
        keys: None,
        threshold: None,
        default_limit: None,
    });
    core::FuseOptions {
        keys: o
            .keys
            .map(|ks| {
                ks.into_iter()
                    .map(|k| (k.name, k.weight.unwrap_or(1.0)))
                    .collect()
            })
            .unwrap_or_default(),
        threshold: o.threshold,
        default_limit: o.default_limit,
    }
}

#[napi]
impl Fuse {
    #[napi(constructor)]
    pub fn new(records_json: Vec<String>, options: Option<FuseOptions>) -> Self {
        Self {
            inner: core::Fuse::new(records_json, into_core(options)),
        }
    }

    #[napi]
    pub fn search(&self, query: String, limit: Option<u32>) -> Vec<FuseResult> {
        self.inner
            .search(&query, limit)
            .into_iter()
            .map(|r| FuseResult {
                ref_index: r.ref_index,
                score: r.score,
            })
            .collect()
    }

    #[napi]
    pub fn size(&self) -> u32 {
        self.inner.size()
    }
}
