use napi::bindgen_prelude::*;
use napi_derive::napi;

// Thin NAPI bindings over the `linkify` crate (robinst/linkify, MIT/Apache-2.0).
// The pure-JS upstream `linkify-it` has a wider option surface (fuzzyIP, custom
// schemas via add()); v0.1 ships the default-schema URL + email path, which
// covers >95% of real-world markdown-it / chat-renderer call sites.

#[napi(object)]
pub struct LinkifyOptions {
    pub fuzzy_link: Option<bool>,
    pub fuzzy_email: Option<bool>,
}

#[napi(object)]
pub struct LinkMatch {
    pub schema: String,
    pub index: u32,
    pub last_index: u32,
    pub text: String,
    pub url: String,
}

fn build_finder(options: &LinkifyOptions) -> linkify::LinkFinder {
    let mut finder = linkify::LinkFinder::new();
    let fuzzy_link = options.fuzzy_link.unwrap_or(true);
    let fuzzy_email = options.fuzzy_email.unwrap_or(true);
    let mut kinds: Vec<linkify::LinkKind> = Vec::new();
    if fuzzy_link {
        kinds.push(linkify::LinkKind::Url);
    }
    if fuzzy_email {
        kinds.push(linkify::LinkKind::Email);
    }
    if kinds.is_empty() {
        kinds.push(linkify::LinkKind::Url);
    }
    finder.kinds(&kinds);
    finder
}

fn kind_name(kind: &linkify::LinkKind) -> &'static str {
    match kind {
        linkify::LinkKind::Url => "url",
        linkify::LinkKind::Email => "email",
        _ => "url",
    }
}

#[napi]
pub fn matches(text: String, options: Option<LinkifyOptions>) -> Vec<LinkMatch> {
    let opts = options.unwrap_or(LinkifyOptions {
        fuzzy_link: None,
        fuzzy_email: None,
    });
    let finder = build_finder(&opts);
    finder
        .links(&text)
        .map(|link| LinkMatch {
            schema: kind_name(link.kind()).to_string(),
            index: link.start() as u32,
            last_index: link.end() as u32,
            text: link.as_str().to_string(),
            url: link.as_str().to_string(),
        })
        .collect()
}

#[napi]
pub fn test(text: String, options: Option<LinkifyOptions>) -> bool {
    let opts = options.unwrap_or(LinkifyOptions {
        fuzzy_link: None,
        fuzzy_email: None,
    });
    let finder = build_finder(&opts);
    finder.links(&text).next().is_some()
}

// Offset-packed fast path: 3 × u32 per match (start, end, kindId).
// kindId: 0 = url, 1 = email.
#[napi(js_name = "matchOffsets")]
pub fn match_offsets(text: Buffer, options: Option<LinkifyOptions>) -> Result<Buffer> {
    let s = std::str::from_utf8(text.as_ref())
        .map_err(|e| Error::from_reason(format!("input is not valid UTF-8: {}", e)))?;
    let opts = options.unwrap_or(LinkifyOptions {
        fuzzy_link: None,
        fuzzy_email: None,
    });
    let finder = build_finder(&opts);
    let mut out: Vec<u8> = Vec::new();
    for link in finder.links(s) {
        let kind_id: u32 = match link.kind() {
            linkify::LinkKind::Email => 1,
            _ => 0,
        };
        out.extend_from_slice(&(link.start() as u32).to_le_bytes());
        out.extend_from_slice(&(link.end() as u32).to_le_bytes());
        out.extend_from_slice(&kind_id.to_le_bytes());
    }
    Ok(out.into())
}
