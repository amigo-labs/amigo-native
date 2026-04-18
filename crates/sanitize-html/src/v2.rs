use html5ever::tendril::StrTendril;
use html5ever::tokenizer::{
    BufferQueue, TagKind, Token, TokenSink, TokenSinkResult, Tokenizer, TokenizerOpts,
};
use napi::bindgen_prelude::Either;
use std::cell::RefCell;
use std::collections::{HashMap, HashSet};

use crate::{coerce_input, SanitizeOptions};

// ---------------------------------------------------------------------------
// Sanitization engine layered on top of the html5ever tokenizer. Replaces
// the previous ammonia-based implementation; behaviour modelled on ammonia's
// defaults so callers keep the same safety posture:
//   * `allowed_tags`: kept verbatim (after attr filtering).
//   * `clean_content_tags` (script/style): tag and its text content dropped.
//   * Everything else: tag dropped, text content preserved (unwrap).
//   * Comments stripped unless `strip_comments = false`.
//   * URL-bearing attrs validated against the scheme allowlist.
//   * `a[href]` gets `rel=<link_rel>` injected (default `noopener noreferrer`).
// ---------------------------------------------------------------------------

const VOID_ELEMENTS: &[&str] = &[
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source",
    "track", "wbr",
];

const DEFAULT_TAGS: &[&str] = &[
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

const DEFAULT_CLEAN_CONTENT_TAGS: &[&str] = &["script", "style"];

// Attributes allowed on every tag (generic in ammonia parlance).
const DEFAULT_GENERIC_ATTRS: &[&str] = &["lang", "title"];

// Per-tag attribute allowlist (matches ammonia's defaults).
const DEFAULT_TAG_ATTRS: &[(&str, &[&str])] = &[
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
    ("td", &["align", "char", "charoff", "colspan", "headers", "rowspan"]),
    ("tfoot", &["align", "char", "charoff"]),
    (
        "th",
        &["align", "char", "charoff", "colspan", "headers", "rowspan", "scope"],
    ),
    ("thead", &["align", "char", "charoff"]),
    ("tr", &["align", "char", "charoff"]),
];

const DEFAULT_URL_SCHEMES: &[&str] = &[
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

// Attribute names that carry URLs and therefore need scheme validation.
const URL_ATTRS: &[(&str, &[&str])] = &[
    ("a", &["href"]),
    ("area", &["href"]),
    ("blockquote", &["cite"]),
    ("del", &["cite"]),
    ("img", &["src"]),
    ("ins", &["cite"]),
    ("q", &["cite"]),
];

fn is_void(name: &str) -> bool {
    VOID_ELEMENTS.binary_search(&name).is_ok()
}

struct Rules {
    tags: HashSet<String>,
    clean_content_tags: HashSet<String>,
    tag_attrs: HashMap<String, HashSet<String>>,
    generic_attrs: HashSet<String>,
    allowed_classes: HashMap<String, HashSet<String>>,
    url_attrs: HashMap<String, HashSet<String>>,
    url_schemes: HashSet<String>,
    strip_comments: bool,
    link_rel: Option<String>,
}

impl Rules {
    fn from_options(opts: &Option<SanitizeOptions>) -> Self {
        // Start from ammonia-shaped defaults.
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
        }
    }

    fn is_allowed_tag(&self, name: &str) -> bool {
        self.tags.contains(name)
    }

    fn is_drop_content_tag(&self, name: &str) -> bool {
        self.clean_content_tags.contains(name)
    }

    fn is_allowed_attr(&self, tag: &str, attr: &str) -> bool {
        // Drop all event handlers unconditionally.
        if attr.starts_with("on") {
            return false;
        }
        if self.generic_attrs.contains(attr) {
            return true;
        }
        if let Some(attrs) = self.tag_attrs.get(tag) {
            if attrs.contains(attr) {
                return true;
            }
        }
        if let Some(attrs) = self.tag_attrs.get("*") {
            if attrs.contains(attr) {
                return true;
            }
        }
        false
    }

    fn is_url_attr(&self, tag: &str, attr: &str) -> bool {
        self.url_attrs
            .get(tag)
            .map(|set| set.contains(attr))
            .unwrap_or(false)
    }

    fn scheme_allowed(&self, url: &str) -> bool {
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

fn escape_attr(value: &str, out: &mut String) {
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

fn escape_text(text: &str, out: &mut String) {
    for ch in text.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            c => out.push(c),
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum FrameKind {
    /// Tag survived the allowlist and was emitted; emit matching close tag.
    Emitted,
    /// Tag is in `clean_content_tags`; drop all descendants including text.
    DropContent,
    /// Tag is not allowed but not a content-drop tag; unwrap → content kept,
    /// no tags emitted.
    Unwrap,
}

struct Frame {
    name: String,
    kind: FrameKind,
}

struct SanitizingSink<'a> {
    rules: &'a Rules,
    out: RefCell<String>,
    stack: RefCell<Vec<Frame>>,
}

impl<'a> SanitizingSink<'a> {
    fn is_dropping_content(&self) -> bool {
        self.stack
            .borrow()
            .iter()
            .any(|f| f.kind == FrameKind::DropContent)
    }
}

impl<'a> TokenSink for SanitizingSink<'a> {
    type Handle = ();

    fn process_token(&self, token: Token, _line: u64) -> TokenSinkResult<()> {
        match token {
            Token::CharacterTokens(s) => {
                if self.is_dropping_content() {
                    return TokenSinkResult::Continue;
                }
                let mut out = self.out.borrow_mut();
                escape_text(&s, &mut out);
            }
            Token::TagToken(tag) => {
                let name = tag.name.to_string();
                if tag.kind == TagKind::StartTag {
                    // Nested start tags inside a DropContent frame are
                    // skipped but still tracked for matching end tags when
                    // the tag is non-void.
                    if self.is_dropping_content() {
                        if !is_void(&name) && !tag.self_closing {
                            self.stack.borrow_mut().push(Frame {
                                name,
                                kind: FrameKind::DropContent,
                            });
                        }
                        return TokenSinkResult::Continue;
                    }

                    if self.rules.is_drop_content_tag(&name) {
                        if !is_void(&name) && !tag.self_closing {
                            self.stack.borrow_mut().push(Frame {
                                name,
                                kind: FrameKind::DropContent,
                            });
                        }
                        return TokenSinkResult::Continue;
                    }

                    if !self.rules.is_allowed_tag(&name) {
                        if !is_void(&name) && !tag.self_closing {
                            self.stack.borrow_mut().push(Frame {
                                name,
                                kind: FrameKind::Unwrap,
                            });
                        }
                        return TokenSinkResult::Continue;
                    }

                    // Tag is allowed — emit with filtered attrs.
                    let mut out = self.out.borrow_mut();
                    out.push('<');
                    out.push_str(&name);

                    let mut emitted_rel = false;
                    let mut has_href = false;
                    for attr in &tag.attrs {
                        let attr_name = attr.name.local.to_string();
                        if !self.rules.is_allowed_attr(&name, &attr_name) {
                            continue;
                        }
                        // URL scheme validation.
                        if self.rules.is_url_attr(&name, &attr_name)
                            && !self.rules.scheme_allowed(&attr.value)
                        {
                            continue;
                        }
                        // Class filtering runs only when the caller
                        // configured `allowed_classes` for this tag; otherwise
                        // the `class` attribute passes through unchanged (its
                        // pass-through is already gated by `allowed_attributes`).
                        let filtered_value;
                        let value_ref: &str = if attr_name == "class" {
                            if let Some(allowed) = self.rules.allowed_classes.get(&name) {
                                filtered_value = attr
                                    .value
                                    .split_ascii_whitespace()
                                    .filter(|c| allowed.contains(*c))
                                    .collect::<Vec<_>>()
                                    .join(" ");
                                if filtered_value.is_empty() {
                                    continue;
                                }
                                &filtered_value
                            } else {
                                &attr.value
                            }
                        } else {
                            &attr.value
                        };

                        if attr_name == "href" {
                            has_href = true;
                        }
                        if attr_name == "rel" {
                            emitted_rel = true;
                        }

                        out.push(' ');
                        out.push_str(&attr_name);
                        out.push_str("=\"");
                        escape_attr(value_ref, &mut out);
                        out.push('"');
                    }

                    // Inject rel on a[href] when configured and none was set.
                    if name == "a" && has_href && !emitted_rel {
                        if let Some(rel) = &self.rules.link_rel {
                            out.push_str(" rel=\"");
                            escape_attr(rel, &mut out);
                            out.push('"');
                        }
                    }
                    out.push('>');
                    drop(out);

                    if !is_void(&name) && !tag.self_closing {
                        self.stack.borrow_mut().push(Frame {
                            name,
                            kind: FrameKind::Emitted,
                        });
                    }
                } else {
                    // End tag — pop matching frame and emit only if the
                    // opener was Emitted. We search from the top so stray
                    // end tags without a matching start are dropped.
                    let mut stack = self.stack.borrow_mut();
                    let pos = stack.iter().rposition(|f| f.name == name);
                    if let Some(idx) = pos {
                        let frame = stack.remove(idx);
                        // Any frames above the match are implicitly closed;
                        // emit end tags for any of them that were Emitted.
                        // We already removed frame `idx`, so drain the tail
                        // in reverse (which is already what remove does —
                        // entries above `idx` stayed put but we still need to
                        // close in LIFO order relative to what was above).
                        // Simpler: reconstruct by popping everything above
                        // `idx` first.
                        //
                        // `remove(idx)` shifted subsequent frames down by one,
                        // so restore the invariant by popping extras.
                        let extras: Vec<Frame> = stack.drain(idx..).collect();
                        drop(stack);
                        let mut out = self.out.borrow_mut();
                        for extra in extras.into_iter().rev() {
                            if extra.kind == FrameKind::Emitted {
                                out.push_str("</");
                                out.push_str(&extra.name);
                                out.push('>');
                            }
                        }
                        if frame.kind == FrameKind::Emitted {
                            out.push_str("</");
                            out.push_str(&frame.name);
                            out.push('>');
                        }
                    }
                    // No matching open frame → drop the stray end tag.
                }
            }
            Token::CommentToken(s) => {
                if self.is_dropping_content() {
                    return TokenSinkResult::Continue;
                }
                if !self.rules.strip_comments {
                    let mut out = self.out.borrow_mut();
                    out.push_str("<!--");
                    out.push_str(&s);
                    out.push_str("-->");
                }
            }
            Token::DoctypeToken(_) => {
                // Doctypes are stripped — safe for fragment sanitization.
            }
            Token::NullCharacterToken => {
                if !self.is_dropping_content() {
                    self.out.borrow_mut().push('\u{FFFD}');
                }
            }
            Token::EOFToken | Token::ParseError(_) => {}
        }
        TokenSinkResult::Continue
    }
}

pub(crate) fn sanitize_impl(
    html: Option<Either<String, f64>>,
    options: Option<SanitizeOptions>,
) -> String {
    let html = coerce_input(html);
    let rules = Rules::from_options(&options);
    let sink = SanitizingSink {
        rules: &rules,
        out: RefCell::new(String::with_capacity(html.len())),
        stack: RefCell::new(Vec::new()),
    };
    let tokenizer = Tokenizer::new(sink, TokenizerOpts::default());
    let buffer = BufferQueue::default();
    buffer.push_back(StrTendril::from(html.as_str()));
    let _ = tokenizer.feed(&buffer);
    tokenizer.end();

    // Implicitly close any still-open emitted frames so we never return
    // unbalanced markup.
    let mut out = tokenizer.sink.out.into_inner();
    let stack = tokenizer.sink.stack.into_inner();
    for frame in stack.into_iter().rev() {
        if frame.kind == FrameKind::Emitted {
            out.push_str("</");
            out.push_str(&frame.name);
            out.push('>');
        }
    }
    out
}
