use napi::bindgen_prelude::{Buffer, Error, Result, Status};
use napi_derive::napi;
use pulldown_cmark::{CowStr, Event, Options, Parser, Tag, TagEnd, html};
use rayon::prelude::*;
use std::collections::HashMap;

#[napi(object)]
#[derive(Default, Clone)]
pub struct CommonMarkOptions {
    pub gfm: Option<bool>,
    pub footnotes: Option<bool>,
    pub smart_punctuation: Option<bool>,
    pub unsafe_html: Option<bool>,
    pub heading_ids: Option<bool>,
}

#[derive(Clone, Copy)]
struct Resolved {
    pc: Options,
    unsafe_html: bool,
    heading_ids: bool,
}

fn resolve(opts: Option<&CommonMarkOptions>) -> Resolved {
    let gfm = opts.and_then(|o| o.gfm).unwrap_or(true);
    let footnotes = opts.and_then(|o| o.footnotes).unwrap_or(false);
    let smart = opts.and_then(|o| o.smart_punctuation).unwrap_or(false);
    let unsafe_html = opts.and_then(|o| o.unsafe_html).unwrap_or(false);
    let heading_ids = opts.and_then(|o| o.heading_ids).unwrap_or(true);

    let mut pc = Options::empty();
    if gfm {
        pc |= Options::ENABLE_TABLES
            | Options::ENABLE_STRIKETHROUGH
            | Options::ENABLE_TASKLISTS
            | Options::ENABLE_GFM;
    }
    if footnotes {
        pc |= Options::ENABLE_FOOTNOTES;
    }
    if smart {
        pc |= Options::ENABLE_SMART_PUNCTUATION;
    }
    Resolved {
        pc,
        unsafe_html,
        heading_ids,
    }
}

fn slugify(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut prev_dash = true;
    for c in text.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    if out.ends_with('-') {
        out.pop();
    }
    out
}

fn is_raw_html(e: &Event<'_>) -> bool {
    matches!(e, Event::Html(_) | Event::InlineHtml(_))
}

/// Walk collected events and assign slugified IDs to headings that don't
/// already have one. Mutates in place — no cloning of the event vector.
fn assign_heading_ids(events: &mut [Event<'_>]) {
    let mut used: HashMap<String, u32> = HashMap::new();
    for i in 0..events.len() {
        let needs = matches!(&events[i], Event::Start(Tag::Heading { id: None, .. }));
        if !needs {
            continue;
        }
        let mut text = String::new();
        for event in events.iter().skip(i + 1) {
            match event {
                Event::End(TagEnd::Heading(_)) => break,
                Event::Text(t) | Event::Code(t) => text.push_str(t),
                _ => {}
            }
        }
        let base = slugify(&text);
        let slug = if base.is_empty() {
            "heading".to_string()
        } else {
            let counter = used.entry(base.clone()).or_insert(0);
            let s = if *counter == 0 {
                base.clone()
            } else {
                format!("{}-{}", base, counter)
            };
            *counter += 1;
            s
        };
        if let Event::Start(Tag::Heading { id, .. }) = &mut events[i] {
            *id = Some(CowStr::from(slug));
        }
    }
}

fn render_str(markdown: &str, r: Resolved) -> String {
    let mut out = String::with_capacity(markdown.len() * 2);
    let parser = Parser::new_ext(markdown, r.pc);

    // Fast path 1: no heading-ID rewrite, raw HTML allowed → stream straight through.
    if !r.heading_ids && r.unsafe_html {
        html::push_html(&mut out, parser);
        return out;
    }

    // Fast path 2: no heading-ID rewrite, HTML filtered → streaming filter, no collect.
    if !r.heading_ids && !r.unsafe_html {
        html::push_html(&mut out, parser.filter(|e| !is_raw_html(e)));
        return out;
    }

    // Slow path: heading-IDs need lookahead → one collect, in-place mutation, no clones.
    let mut events: Vec<Event<'_>> = parser.collect();
    assign_heading_ids(&mut events);

    if r.unsafe_html {
        html::push_html(&mut out, events.into_iter());
    } else {
        html::push_html(&mut out, events.into_iter().filter(|e| !is_raw_html(e)));
    }
    out
}

fn decode_utf8(buf: &[u8]) -> Result<&str> {
    std::str::from_utf8(buf)
        .map_err(|e| Error::new(Status::InvalidArg, format!("input is not valid UTF-8: {e}")))
}

#[napi]
pub fn render(markdown: String, options: Option<CommonMarkOptions>) -> String {
    render_str(&markdown, resolve(options.as_ref()))
}

/// Render from a UTF-8 byte buffer. Skips the V8 UTF-16 → UTF-8 copy on
/// the FFI boundary — measurably faster for inputs ≥ ~10 KB (see
/// `docs/BASELINE.md`: ~0.35 ns/byte on string input vs. flat 170 ns
/// on Buffer input).
#[napi(js_name = "renderBytes")]
pub fn render_bytes(markdown: Buffer, options: Option<CommonMarkOptions>) -> Result<String> {
    let s = decode_utf8(&markdown)?;
    Ok(render_str(s, resolve(options.as_ref())))
}

/// GFM + tables + strikethrough, raw HTML passthrough, no heading-ID
/// rewrite. Equivalent to `render(md, { headingIds: false, unsafeHtml:
/// true })` but without the options-object unmarshalling cost — measurable
/// on sub-KB inputs where the option cost eats 10–15 % of the budget.
#[napi(js_name = "renderFast")]
pub fn render_fast(markdown: String) -> String {
    render_str(&markdown, FAST_RESOLVED)
}

/// Buffer-input twin of `renderFast`. Skips both the V8 UTF-16 → UTF-8
/// copy (via Buffer input) and the options-object unmarshalling.
#[napi(js_name = "renderBytesFast")]
pub fn render_bytes_fast(markdown: Buffer) -> Result<String> {
    let s = decode_utf8(&markdown)?;
    Ok(render_str(s, FAST_RESOLVED))
}

const FAST_RESOLVED: Resolved = Resolved {
    pc: Options::ENABLE_TABLES
        .union(Options::ENABLE_STRIKETHROUGH)
        .union(Options::ENABLE_TASKLISTS)
        .union(Options::ENABLE_GFM),
    unsafe_html: true,
    heading_ids: false,
};

#[napi(js_name = "renderMany")]
pub fn render_many(docs: Vec<String>, options: Option<CommonMarkOptions>) -> Vec<String> {
    let r = resolve(options.as_ref());
    // Parallelise only when the batch is big enough to amortise rayon's
    // thread-pool overhead. Threshold tuned empirically on medium-sized
    // documents.
    if docs.len() >= 8 && docs.iter().any(|d| d.len() >= 512) {
        docs.par_iter().map(|d| render_str(d, r)).collect()
    } else {
        docs.iter().map(|d| render_str(d, r)).collect()
    }
}

#[napi]
pub struct Renderer {
    resolved: Resolved,
}

#[napi]
impl Renderer {
    #[napi(constructor)]
    pub fn new(options: Option<CommonMarkOptions>) -> Self {
        Self {
            resolved: resolve(options.as_ref()),
        }
    }

    #[napi]
    pub fn render(&self, markdown: String) -> String {
        render_str(&markdown, self.resolved)
    }

    #[napi(js_name = "renderBytes")]
    pub fn render_bytes(&self, markdown: Buffer) -> Result<String> {
        let s = decode_utf8(&markdown)?;
        Ok(render_str(s, self.resolved))
    }
}
