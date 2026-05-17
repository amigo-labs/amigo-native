//! Shared CommonMark/GFM rendering via `pulldown-cmark`. Internal-only;
//! `crates/commonmark/` wraps this with napi (and adds rayon-based
//! parallel `renderMany`), `crates/commonmark/wasm/` wraps it with
//! wasm-bindgen.

use pulldown_cmark::{CowStr, Event, Options, Parser, Tag, TagEnd, html};
use std::collections::HashMap;

#[derive(Default, Clone, Debug)]
pub struct CommonMarkOptions {
    pub gfm: Option<bool>,
    pub footnotes: Option<bool>,
    pub smart_punctuation: Option<bool>,
    pub unsafe_html: Option<bool>,
    pub heading_ids: Option<bool>,
}

#[derive(Clone, Copy)]
pub struct Resolved {
    pub pc: Options,
    pub unsafe_html: bool,
    pub heading_ids: bool,
}

pub fn resolve(opts: Option<&CommonMarkOptions>) -> Resolved {
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

pub const FAST_RESOLVED: Resolved = Resolved {
    pc: Options::ENABLE_TABLES
        .union(Options::ENABLE_STRIKETHROUGH)
        .union(Options::ENABLE_TASKLISTS)
        .union(Options::ENABLE_GFM),
    unsafe_html: true,
    heading_ids: false,
};

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

pub fn render_str(markdown: &str, r: Resolved) -> String {
    let mut out = String::with_capacity(markdown.len() * 2);
    let parser = Parser::new_ext(markdown, r.pc);

    if !r.heading_ids && r.unsafe_html {
        html::push_html(&mut out, parser);
        return out;
    }

    if !r.heading_ids && !r.unsafe_html {
        html::push_html(&mut out, parser.filter(|e| !is_raw_html(e)));
        return out;
    }

    let mut events: Vec<Event<'_>> = parser.collect();
    assign_heading_ids(&mut events);

    if r.unsafe_html {
        html::push_html(&mut out, events.into_iter());
    } else {
        html::push_html(&mut out, events.into_iter().filter(|e| !is_raw_html(e)));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn render_basic() {
        let out = render_str("**hi**", resolve(None));
        assert!(out.contains("<strong>hi</strong>"));
    }

    #[test]
    fn fast_path_no_heading_ids() {
        let out = render_str("# Title", FAST_RESOLVED);
        assert!(!out.contains(r#"id="title""#));
    }

    #[test]
    fn heading_ids_assigned_by_default() {
        let out = render_str("# Title", resolve(None));
        assert!(out.contains(r#"id="title""#));
    }
}
