use html5ever::tendril::StrTendril;
use html5ever::tokenizer::{
    BufferQueue, TagKind, Token, TokenSink, TokenSinkResult, Tokenizer, TokenizerOpts,
};
use napi::bindgen_prelude::Either;
use std::cell::RefCell;

use crate::rules::{Rules, escape_attr, escape_text, is_void};
use crate::{SanitizeOptions, coerce_input};

/// DoS guards. Both can be overridden per-call via `SanitizeOptions`;
/// pass `0` to disable.
const DEFAULT_MAX_DEPTH: usize = 256;
const DEFAULT_MAX_INPUT_BYTES: usize = 5 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Tokenizer-based sanitization engine (fast path). Routes ~all real-world
// calls. Behaviour:
//   * `allowed_tags`: kept verbatim (after attr filtering).
//   * `clean_content_tags` (script/style): tag + its text content dropped.
//   * Everything else: tag dropped, text content preserved (unwrap).
//   * Comments stripped unless `strip_comments = false`.
//   * URL-bearing attrs validated against the scheme allowlist.
//   * `a[href]` gets `rel=<link_rel>` injected (default `noopener noreferrer`).
//
// Does NOT transition to SCRIPT_DATA / foreign content / RAWTEXT states —
// callers needing those route through `strict::sanitize_impl` instead.
// ---------------------------------------------------------------------------

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
    max_depth: usize,
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

                    // Depth guard: once the frame stack hits `max_depth`, we
                    // unwrap any further start tags (keep their content, drop
                    // the tag) so deeply-nested input can't grow the stack
                    // without bound. The check sits AFTER the allowlist /
                    // drop-content branches so a deep `<script>` chain still
                    // gets its content stripped.
                    if self.max_depth > 0 && self.stack.borrow().len() >= self.max_depth {
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

                    if name == "a"
                        && has_href
                        && !emitted_rel
                        && let Some(rel) = &self.rules.link_rel
                    {
                        out.push_str(" rel=\"");
                        escape_attr(rel, &mut out);
                        out.push('"');
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
                    // opener was Emitted.
                    let mut stack = self.stack.borrow_mut();
                    let pos = stack.iter().rposition(|f| f.name == name);
                    if let Some(idx) = pos {
                        // Drain everything above the matching frame as
                        // "extras" — these were opened after `idx` and never
                        // closed, so we must implicitly close any that were
                        // emitted. After the drain, the matched frame is the
                        // last element, so a `pop()` retrieves it.
                        let extras: Vec<Frame> = stack.drain(idx + 1..).collect();
                        let frame = stack.pop().expect("frame at idx must exist");
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
    let max_input_bytes = options
        .as_ref()
        .and_then(|o| o.max_input_bytes)
        .map(|n| if n == 0 { usize::MAX } else { n as usize })
        .unwrap_or(DEFAULT_MAX_INPUT_BYTES);
    let max_depth = options
        .as_ref()
        .and_then(|o| o.max_depth)
        .map(|n| n as usize)
        .unwrap_or(DEFAULT_MAX_DEPTH);

    let html = coerce_input(html);
    if html.len() > max_input_bytes {
        // Oversized input is rejected outright rather than truncated mid-
        // tag (which would re-introduce the unbalanced-markup case the
        // implicit-close pass at the bottom of this function fixes).
        return String::new();
    }
    let rules = Rules::from_options(&options);
    let sink = SanitizingSink {
        rules: &rules,
        out: RefCell::new(String::with_capacity(html.len())),
        stack: RefCell::new(Vec::new()),
        max_depth,
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
