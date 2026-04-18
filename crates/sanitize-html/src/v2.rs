use html5ever::tendril::StrTendril;
use html5ever::tokenizer::{
    BufferQueue, TagKind, Token, TokenSink, TokenSinkResult, Tokenizer, TokenizerOpts,
};
use napi::bindgen_prelude::Either;
use napi_derive::napi;
use std::cell::RefCell;

use crate::{coerce_input, SanitizeOptions};

// ---------------------------------------------------------------------------
// Phase A1 skeleton — pass-through sink. Re-serialises the html5ever token
// stream verbatim. Goal of this phase is just to confirm we wire up the
// tokenizer + buffer queue correctly. Sanitization rules land in Phase A2.
// ---------------------------------------------------------------------------

struct PassThroughSink {
    out: RefCell<String>,
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

impl TokenSink for PassThroughSink {
    type Handle = ();

    fn process_token(&self, token: Token, _line: u64) -> TokenSinkResult<()> {
        let mut out = self.out.borrow_mut();
        match token {
            Token::CharacterTokens(s) => escape_text(&s, &mut out),
            Token::TagToken(tag) => {
                out.push('<');
                if tag.kind == TagKind::EndTag {
                    out.push('/');
                }
                out.push_str(&tag.name);
                for attr in &tag.attrs {
                    out.push(' ');
                    if let Some(prefix) = &attr.name.prefix {
                        out.push_str(prefix);
                        out.push(':');
                    }
                    out.push_str(&attr.name.local);
                    if !attr.value.is_empty() {
                        out.push_str("=\"");
                        escape_attr(&attr.value, &mut out);
                        out.push('"');
                    } else {
                        // Bare attribute — preserve `<a href>` form. Phase A2
                        // will distinguish bare-vs-empty per the html5ever
                        // tokenizer signal once we inspect attr origin info.
                        out.push_str("=\"\"");
                    }
                }
                if tag.self_closing {
                    out.push_str(" /");
                }
                out.push('>');
            }
            Token::CommentToken(s) => {
                out.push_str("<!--");
                out.push_str(&s);
                out.push_str("-->");
            }
            Token::DoctypeToken(d) => {
                out.push_str("<!DOCTYPE");
                if let Some(name) = &d.name {
                    out.push(' ');
                    out.push_str(name);
                }
                out.push('>');
            }
            Token::NullCharacterToken => out.push('\u{FFFD}'),
            Token::EOFToken | Token::ParseError(_) => {}
        }
        TokenSinkResult::Continue
    }
}

/// Phase A1 entry point: tokenise + re-serialise. Equivalent to a no-op
/// sanitize so we can verify the html5ever wiring before layering rules
/// on top in Phase A2.
#[napi(js_name = "sanitizeV2")]
pub fn sanitize_v2(
    html: Option<Either<String, f64>>,
    _options: Option<SanitizeOptions>,
) -> String {
    let html = coerce_input(html);
    let sink = PassThroughSink {
        out: RefCell::new(String::with_capacity(html.len())),
    };
    let tokenizer = Tokenizer::new(sink, TokenizerOpts::default());
    let buffer = BufferQueue::default();
    buffer.push_back(StrTendril::from(html.as_str()));
    let _ = tokenizer.feed(&buffer);
    tokenizer.end();
    tokenizer.sink.out.into_inner()
}
