use ammonia::Builder;
use napi::bindgen_prelude::Either;
use napi_derive::napi;
use std::collections::{HashMap, HashSet};

mod v2;

#[napi(object)]
pub struct SanitizeOptions {
    pub allowed_tags: Option<Vec<String>>,
    pub allowed_attributes: Option<HashMap<String, Vec<String>>>,
    pub allowed_classes: Option<HashMap<String, Vec<String>>>,
    pub allowed_schemes: Option<Vec<String>>,
    pub strip_comments: Option<bool>,
    pub link_rel: Option<String>,
}

// ammonia's `url_schemes` requires `&'static str`; the incoming scheme names
// arrive as runtime `String` via NAPI. We leak each distinct scheme once
// into a process-wide cache so the static-lifetime requirement is satisfied
// without leaking on every call.
fn intern_scheme(scheme: &str) -> &'static str {
    use std::collections::HashSet as Set;
    use std::sync::{Mutex, OnceLock};
    static CACHE: OnceLock<Mutex<Set<&'static str>>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(Set::new()));
    let mut guard = cache.lock().unwrap();
    if let Some(s) = guard.get(scheme) {
        return s;
    }
    let leaked: &'static str = Box::leak(scheme.to_string().into_boxed_str());
    guard.insert(leaked);
    leaked
}

fn number_to_string(n: f64) -> String {
    // Match JS Number.prototype.toString(): integers print without decimals,
    // NaN/Infinity use their JS names.
    if n.is_nan() {
        return "NaN".to_string();
    }
    if n.is_infinite() {
        return if n < 0.0 {
            "-Infinity".into()
        } else {
            "Infinity".into()
        };
    }
    if n == n.trunc() && n.abs() < 1e21 {
        return format!("{}", n as i64);
    }
    format!("{n}")
}

pub(crate) fn coerce_input(html: Option<Either<String, f64>>) -> String {
    match html {
        None => String::new(),
        Some(Either::A(s)) => s,
        Some(Either::B(n)) => number_to_string(n),
    }
}

#[napi]
pub fn sanitize(html: Option<Either<String, f64>>, options: Option<SanitizeOptions>) -> String {
    let html = coerce_input(html);
    let mut builder = Builder::default();

    if let Some(opts) = &options {
        if let Some(tags) = &opts.allowed_tags {
            let tag_set: HashSet<&str> = tags.iter().map(|s| s.as_str()).collect();
            // Ammonia panics if a tag is in both `tags` and `clean_content_tags`
            // (e.g. default `script`/`style`). If the caller explicitly allows
            // such a tag, remove it from `clean_content_tags` first.
            builder.rm_clean_content_tags(tag_set.iter().copied());
            builder.tags(tag_set);
        }
        if let Some(attrs) = &opts.allowed_attributes {
            let mut attr_map: HashMap<&str, HashSet<&str>> = HashMap::new();
            for (tag, attr_list) in attrs {
                let attr_set: HashSet<&str> = attr_list.iter().map(|s| s.as_str()).collect();
                attr_map.insert(tag.as_str(), attr_set);
            }
            builder.tag_attributes(attr_map);
        }
        if let Some(classes) = &opts.allowed_classes {
            let mut class_map: HashMap<&str, HashMap<&str, HashSet<&str>>> = HashMap::new();
            for (tag, class_list) in classes {
                let class_set: HashSet<&str> = class_list.iter().map(|s| s.as_str()).collect();
                let mut inner = HashMap::new();
                inner.insert("class", class_set);
                class_map.insert(tag.as_str(), inner);
            }
            builder.tag_attribute_values(class_map);
        }
        if let Some(schemes) = &opts.allowed_schemes {
            let set: HashSet<&'static str> = schemes.iter().map(|s| intern_scheme(s)).collect();
            builder.url_schemes(set);
        }
        if let Some(strip) = opts.strip_comments {
            builder.strip_comments(strip);
        }
        if let Some(ref rel) = opts.link_rel {
            builder.link_rel(Some(rel));
        }
    }

    builder.clean(&html).to_string()
}

#[napi(js_name = "isClean")]
pub fn is_clean(html: Option<Either<String, f64>>, options: Option<SanitizeOptions>) -> bool {
    let coerced = coerce_input(html);
    sanitize(Some(Either::A(coerced.clone())), options) == coerced
}
