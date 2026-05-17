//! Shared linkify logic used by @amigo-labs/linkify-it (napi and WASM
//! bindings). Internal-only crate.
//!
//! Thin wrapper over `linkify` (robinst/linkify): URL + email detection.
//! Offset-packed output uses u32 LE triplets (start, end, kindId 0=url 1=email).

#[derive(Default, Debug, Clone, Copy)]
pub struct LinkifyOptions {
    pub fuzzy_link: Option<bool>,
    pub fuzzy_email: Option<bool>,
}

#[derive(Debug, Clone)]
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

pub fn matches(text: &str, opts: &LinkifyOptions) -> Vec<LinkMatch> {
    let finder = build_finder(opts);
    finder
        .links(text)
        .map(|link| LinkMatch {
            schema: kind_name(link.kind()).to_string(),
            index: link.start() as u32,
            last_index: link.end() as u32,
            text: link.as_str().to_string(),
            url: link.as_str().to_string(),
        })
        .collect()
}

pub fn test(text: &str, opts: &LinkifyOptions) -> bool {
    let finder = build_finder(opts);
    finder.links(text).next().is_some()
}

/// Offset-packed output: 3 × u32 per match (start, end, kindId).
/// kindId: 0 = url, 1 = email.
pub fn match_offsets(text: &str, opts: &LinkifyOptions) -> Vec<u8> {
    let finder = build_finder(opts);
    let mut out: Vec<u8> = Vec::new();
    for link in finder.links(text) {
        let kind_id: u32 = match link.kind() {
            linkify::LinkKind::Email => 1,
            _ => 0,
        };
        out.extend_from_slice(&(link.start() as u32).to_le_bytes());
        out.extend_from_slice(&(link.end() as u32).to_le_bytes());
        out.extend_from_slice(&kind_id.to_le_bytes());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_urls() {
        let m = matches(
            "Visit https://example.com today",
            &LinkifyOptions::default(),
        );
        assert_eq!(m.len(), 1);
        assert_eq!(m[0].schema, "url");
    }

    #[test]
    fn finds_emails() {
        let m = matches("Email me at foo@example.com", &LinkifyOptions::default());
        assert_eq!(m.len(), 1);
        assert_eq!(m[0].schema, "email");
    }

    #[test]
    fn offsets_pack_3xu32() {
        let buf = match_offsets("Visit https://x.com", &LinkifyOptions::default());
        assert_eq!(buf.len(), 12);
    }
}
