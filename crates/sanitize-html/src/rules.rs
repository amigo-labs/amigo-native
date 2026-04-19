//! Shared sanitization rule engine used by both the tokenizer-based fast
//! path (`v2.rs`) and the parser-based strict path (`strict.rs`).
//!
//! The rule set defines which tags / attributes / URL schemes survive,
//! which are unwrapped (tag stripped but text kept), and which drop their
//! content (script / style by default). Helpers for HTML-safe escaping of
//! text / attribute values live here too so both engines emit identical
//! output for identical inputs.

use std::collections::{HashMap, HashSet};

use crate::SanitizeOptions;

// ---------------------------------------------------------------------------
// Defaults — mirror ammonia's safe defaults so callers that migrated off
// ammonia don't see behavioural drift.
// ---------------------------------------------------------------------------

pub const VOID_ELEMENTS: &[&str] = &[
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source",
    "track", "wbr",
];

pub const DEFAULT_TAGS: &[&str] = &[
    "a",
    "abbr",
    "acronym",
    "area",
    "article",
    "aside",
    "b",
    "bdi",
    "bdo",
    "blockquote",
    "br",
    "caption",
    "center",
    "cite",
    "code",
    "col",
    "colgroup",
    "data",
    "dd",
    "del",
    "details",
    "dfn",
    "div",
    "dl",
    "dt",
    "em",
    "figcaption",
    "figure",
    "footer",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "hgroup",
    "hr",
    "i",
    "img",
    "ins",
    "kbd",
    "li",
    "map",
    "mark",
    "nav",
    "ol",
    "p",
    "pre",
    "q",
    "rp",
    "rt",
    "rtc",
    "ruby",
    "s",
    "samp",
    "small",
    "span",
    "strike",
    "strong",
    "sub",
    "summary",
    "sup",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "time",
    "tr",
    "tt",
    "u",
    "ul",
    "var",
    "wbr",
];

pub const DEFAULT_CLEAN_CONTENT_TAGS: &[&str] = &["script", "style"];

pub const DEFAULT_GENERIC_ATTRS: &[&str] = &["lang", "title"];

pub const DEFAULT_TAG_ATTRS: &[(&str, &[&str])] = &[
    ("a", &["href", "hreflang"]),
    ("bdo", &["dir"]),
    ("blockquote", &["cite"]),
    ("col", &["align", "char", "charoff", "span"]),
    ("colgroup", &["align", "char", "charoff", "span"]),
    ("del", &["cite", "datetime"]),
    ("hr", &["align", "size", "width"]),
    ("img", &["align", "alt", "height", "src", "width"]),
    ("ins", &["cite", "datetime"]),
    ("ol", &["start"]),
    ("q", &["cite"]),
    ("table", &["align", "char", "charoff", "summary"]),
    ("tbody", &["align", "char", "charoff"]),
    (
        "td",
        &["align", "char", "charoff", "colspan", "headers", "rowspan"],
    ),
    ("tfoot", &["align", "char", "charoff"]),
    (
        "th",
        &[
            "align", "char", "charoff", "colspan", "headers", "rowspan", "scope",
        ],
    ),
    ("thead", &["align", "char", "charoff"]),
    ("tr", &["align", "char", "charoff"]),
];

pub const DEFAULT_URL_SCHEMES: &[&str] = &[
    "bitcoin",
    "ftp",
    "ftps",
    "geo",
    "http",
    "https",
    "im",
    "irc",
    "ircs",
    "magnet",
    "mailto",
    "mms",
    "mx",
    "news",
    "nntp",
    "openpgp4fpr",
    "sip",
    "sms",
    "smsto",
    "ssh",
    "tel",
    "url",
    "webcal",
    "wtai",
    "xmpp",
];

pub const URL_ATTRS: &[(&str, &[&str])] = &[
    ("a", &["href"]),
    ("area", &["href"]),
    ("blockquote", &["cite"]),
    ("del", &["cite"]),
    ("img", &["src"]),
    ("ins", &["cite"]),
    ("q", &["cite"]),
];

pub fn is_void(name: &str) -> bool {
    VOID_ELEMENTS.binary_search(&name).is_ok()
}

/// HTML5 raw-text elements. Text inside these is emitted verbatim on
/// re-parse (no entity decoding in `SCRIPT_DATA` / `RAWTEXT` tokenizer
/// states); the strict engine uses this to avoid double-encoding `&` in
/// script / style contents that html5ever's parser already left raw.
pub fn is_raw_text_element(tag_name: &str) -> bool {
    matches!(tag_name, "script" | "style")
}

// ---------------------------------------------------------------------------
// Escaping helpers — shared between fast- and strict-path emitters so both
// engines produce byte-identical output for normal text / attribute content.
// ---------------------------------------------------------------------------

pub fn escape_attr(value: &str, out: &mut String) {
    for ch in value.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '"' => out.push_str("&quot;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            c => out.push(c),
        }
    }
}

pub fn escape_text(text: &str, out: &mut String) {
    for ch in text.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            c => out.push(c),
        }
    }
}

// ---------------------------------------------------------------------------
// Rule set.
// ---------------------------------------------------------------------------

pub struct Rules {
    pub tags: HashSet<String>,
    pub clean_content_tags: HashSet<String>,
    pub tag_attrs: HashMap<String, HashSet<String>>,
    pub generic_attrs: HashSet<String>,
    pub allowed_classes: HashMap<String, HashSet<String>>,
    pub url_attrs: HashMap<String, HashSet<String>>,
    pub url_schemes: HashSet<String>,
    pub strip_comments: bool,
    pub link_rel: Option<String>,
    /// When `true`, attribute filtering is skipped (except event handlers,
    /// which are always dropped). Used for `allowedAttributes: false`.
    pub allow_all_attributes: bool,
}

impl Rules {
    pub fn from_options(opts: &Option<SanitizeOptions>) -> Self {
        let mut tags: HashSet<String> = DEFAULT_TAGS.iter().map(|s| (*s).to_string()).collect();
        let mut clean_content_tags: HashSet<String> = DEFAULT_CLEAN_CONTENT_TAGS
            .iter()
            .map(|s| (*s).to_string())
            .collect();
        let mut tag_attrs: HashMap<String, HashSet<String>> = DEFAULT_TAG_ATTRS
            .iter()
            .map(|(tag, attrs)| {
                (
                    (*tag).to_string(),
                    attrs.iter().map(|s| (*s).to_string()).collect(),
                )
            })
            .collect();
        let generic_attrs: HashSet<String> = DEFAULT_GENERIC_ATTRS
            .iter()
            .map(|s| (*s).to_string())
            .collect();
        let url_attrs: HashMap<String, HashSet<String>> = URL_ATTRS
            .iter()
            .map(|(tag, attrs)| {
                (
                    (*tag).to_string(),
                    attrs.iter().map(|s| (*s).to_string()).collect(),
                )
            })
            .collect();
        let mut url_schemes: HashSet<String> = DEFAULT_URL_SCHEMES
            .iter()
            .map(|s| (*s).to_string())
            .collect();
        let mut strip_comments = true;
        let mut link_rel = Some("noopener noreferrer".to_string());
        let mut allowed_classes: HashMap<String, HashSet<String>> = HashMap::new();
        let mut allow_all_attributes = false;

        if let Some(opts) = opts {
            if let Some(custom) = &opts.allowed_tags {
                tags = custom.iter().cloned().collect();
                // Allowing script/style as tags must remove them from the
                // drop-content set so their inner text survives.
                for tag in &tags {
                    clean_content_tags.remove(tag);
                }
            }
            if let Some(custom) = &opts.allowed_attributes {
                tag_attrs.clear();
                for (tag, attrs) in custom {
                    tag_attrs.insert(tag.clone(), attrs.iter().cloned().collect());
                }
            }
            if let Some(custom) = &opts.allowed_classes {
                for (tag, classes) in custom {
                    allowed_classes.insert(tag.clone(), classes.iter().cloned().collect());
                }
            }
            if let Some(custom) = &opts.allowed_schemes {
                url_schemes = custom.iter().map(|s| s.to_lowercase()).collect();
            }
            if let Some(strip) = opts.strip_comments {
                strip_comments = strip;
            }
            if let Some(rel) = &opts.link_rel {
                link_rel = Some(rel.clone());
            }
            if let Some(true) = opts.allow_all_attributes {
                allow_all_attributes = true;
            }
        }

        Rules {
            tags,
            clean_content_tags,
            tag_attrs,
            generic_attrs,
            allowed_classes,
            url_attrs,
            url_schemes,
            strip_comments,
            link_rel,
            allow_all_attributes,
        }
    }

    pub fn is_allowed_tag(&self, name: &str) -> bool {
        self.tags.contains(name)
    }

    pub fn is_drop_content_tag(&self, name: &str) -> bool {
        self.clean_content_tags.contains(name)
    }

    pub fn is_allowed_attr(&self, tag: &str, attr: &str) -> bool {
        // Drop all event handlers unconditionally.
        if attr.starts_with("on") {
            return false;
        }
        if self.allow_all_attributes {
            return true;
        }
        if self.generic_attrs.contains(attr) {
            return true;
        }
        if let Some(attrs) = self.tag_attrs.get(tag)
            && attrs.contains(attr)
        {
            return true;
        }
        if let Some(attrs) = self.tag_attrs.get("*")
            && attrs.contains(attr)
        {
            return true;
        }
        false
    }

    pub fn is_url_attr(&self, tag: &str, attr: &str) -> bool {
        self.url_attrs
            .get(tag)
            .map(|set| set.contains(attr))
            .unwrap_or(false)
    }

    pub fn scheme_allowed(&self, url: &str) -> bool {
        // Trim leading whitespace + control chars — browsers ignore them when
        // resolving the scheme, so `  javascript:alert(1)` must still fail.
        let trimmed = url.trim_start_matches(|c: char| c.is_ascii_whitespace() || c.is_control());
        // A URL with no ':' before the first '/', '?', or '#' is relative and
        // therefore scheme-less; allow it.
        let mut scheme_end = None;
        for (i, ch) in trimmed.char_indices() {
            match ch {
                ':' => {
                    scheme_end = Some(i);
                    break;
                }
                '/' | '?' | '#' => return true,
                c if c.is_ascii_alphanumeric() || c == '+' || c == '-' || c == '.' => {}
                _ => return true, // Not a valid scheme char → treat as relative.
            }
        }
        let Some(end) = scheme_end else {
            return true; // No colon seen → relative.
        };
        let scheme = trimmed[..end].to_ascii_lowercase();
        self.url_schemes.contains(&scheme)
    }
}
