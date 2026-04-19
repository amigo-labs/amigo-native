use napi_derive::napi;
use pulldown_cmark::{html, CowStr, Event, Options, Parser, Tag, TagEnd};
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
    Resolved { pc, unsafe_html, heading_ids }
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

fn render_internal(markdown: &str, r: Resolved) -> String {
    let parser = Parser::new_ext(markdown, r.pc);
    let events: Vec<Event<'_>> = parser.collect();

    let mut out_events: Vec<Event<'_>> = Vec::with_capacity(events.len());
    let mut used_ids: HashMap<String, u32> = HashMap::new();

    let mut i = 0;
    while i < events.len() {
        match &events[i] {
            Event::Start(Tag::Heading { level, id, classes, attrs })
                if r.heading_ids && id.is_none() =>
            {
                let mut text = String::new();
                let mut j = i + 1;
                while j < events.len() {
                    match &events[j] {
                        Event::End(TagEnd::Heading(_)) => break,
                        Event::Text(t) | Event::Code(t) => text.push_str(t),
                        _ => {}
                    }
                    j += 1;
                }
                let base = slugify(&text);
                let slug = if base.is_empty() {
                    "heading".to_string()
                } else {
                    let counter = used_ids.entry(base.clone()).or_insert(0);
                    let s = if *counter == 0 {
                        base.clone()
                    } else {
                        format!("{}-{}", base, counter)
                    };
                    *counter += 1;
                    s
                };
                out_events.push(Event::Start(Tag::Heading {
                    level: *level,
                    id: Some(CowStr::from(slug)),
                    classes: classes.clone(),
                    attrs: attrs.clone(),
                }));
            }
            Event::Html(_) | Event::InlineHtml(_) if !r.unsafe_html => {}
            e => out_events.push(e.clone()),
        }
        i += 1;
    }

    let mut output = String::with_capacity(markdown.len() * 3 / 2);
    html::push_html(&mut output, out_events.into_iter());
    output
}

#[napi]
pub fn render(markdown: String, options: Option<CommonMarkOptions>) -> String {
    render_internal(&markdown, resolve(options.as_ref()))
}

#[napi(js_name = "renderMany")]
pub fn render_many(docs: Vec<String>, options: Option<CommonMarkOptions>) -> Vec<String> {
    let r = resolve(options.as_ref());
    docs.iter().map(|d| render_internal(d, r)).collect()
}

#[napi]
pub struct Renderer {
    resolved: Resolved,
}

#[napi]
impl Renderer {
    #[napi(constructor)]
    pub fn new(options: Option<CommonMarkOptions>) -> Self {
        Self { resolved: resolve(options.as_ref()) }
    }

    #[napi]
    pub fn render(&self, markdown: String) -> String {
        render_internal(&markdown, self.resolved)
    }
}
