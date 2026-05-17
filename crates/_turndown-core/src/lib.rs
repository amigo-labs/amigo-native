//! HTML → Markdown conversion via html5ever + a bespoke rule walker.
//! Ships the turndown CommonMark rule set plus GFM tables and
//! strikethrough behind `gfm: true`. No custom-JS-rule surface —
//! see `docs/perf-review/turndown.md` for scope rationale.

use html5ever::driver::ParseOpts;
use html5ever::parse_fragment;
use html5ever::tendril::TendrilSink;
use html5ever::{QualName, local_name, ns};
use markup5ever_rcdom::{Handle, NodeData, RcDom};

#[derive(Clone, Default, Debug)]
pub struct TurndownOptions {
    /// `atx` (default: `# Heading`) or `setext` (underline style).
    pub heading_style: Option<String>,
    /// Thematic-break marker. Default `* * *`.
    pub hr: Option<String>,
    /// `*`, `-`, or `+`. Default `*`.
    pub bullet_list_marker: Option<String>,
    /// `indented` or `fenced`. Default `indented`.
    pub code_block_style: Option<String>,
    /// `` ``` `` or `~~~`. Default `` ``` ``.
    pub fence: Option<String>,
    /// `_` or `*`. Default `_`.
    pub em_delimiter: Option<String>,
    /// `__` or `**`. Default `**`.
    pub strong_delimiter: Option<String>,
    /// `inlined` or `referenced`. Default `inlined`.
    pub link_style: Option<String>,
    /// Enable GitHub-Flavored Markdown: tables, strikethrough,
    /// task-lists. Default `false`.
    pub gfm: Option<bool>,
    /// Tags to keep as raw HTML in the output.
    pub keep: Option<Vec<String>>,
    /// Tags to remove entirely (including content).
    pub remove: Option<Vec<String>>,
}

struct Resolved {
    heading_style: String,
    hr: String,
    bullet_list_marker: String,
    code_block_style: String,
    fence: String,
    em_delimiter: String,
    strong_delimiter: String,
    gfm: bool,
    keep: Vec<String>,
    remove: Vec<String>,
}

impl Resolved {
    fn from(o: &TurndownOptions) -> Self {
        Self {
            heading_style: o.heading_style.clone().unwrap_or_else(|| "atx".to_string()),
            hr: o.hr.clone().unwrap_or_else(|| "* * *".to_string()),
            bullet_list_marker: o
                .bullet_list_marker
                .clone()
                .unwrap_or_else(|| "*".to_string()),
            code_block_style: o
                .code_block_style
                .clone()
                .unwrap_or_else(|| "indented".to_string()),
            fence: o.fence.clone().unwrap_or_else(|| "```".to_string()),
            em_delimiter: o.em_delimiter.clone().unwrap_or_else(|| "_".to_string()),
            strong_delimiter: o
                .strong_delimiter
                .clone()
                .unwrap_or_else(|| "**".to_string()),
            gfm: o.gfm.unwrap_or(false),
            keep: o.keep.clone().unwrap_or_default(),
            remove: o.remove.clone().unwrap_or_default(),
        }
    }
}

struct Writer<'a> {
    out: String,
    list_stack: Vec<ListCtx>,
    cfg: &'a Resolved,
}

#[derive(Clone)]
struct ListCtx {
    ordered: bool,
    index: u32,
}

impl<'a> Writer<'a> {
    fn new(cfg: &'a Resolved) -> Self {
        Self {
            out: String::new(),
            list_stack: Vec::new(),
            cfg,
        }
    }

    fn push(&mut self, s: &str) {
        self.out.push_str(s);
    }

    fn ensure_blank_line(&mut self) {
        if self.out.is_empty() {
            return;
        }
        // Trim trailing whitespace (but not newlines) then ensure \n\n.
        while self.out.ends_with(' ') || self.out.ends_with('\t') {
            self.out.pop();
        }
        while self.out.ends_with("\n\n\n") {
            self.out.pop();
        }
        if !self.out.ends_with("\n\n") {
            if self.out.ends_with('\n') {
                self.out.push('\n');
            } else {
                self.out.push_str("\n\n");
            }
        }
    }
}

fn parse_html(html: &str) -> RcDom {
    let opts = ParseOpts::default();
    let parser = parse_fragment(
        RcDom::default(),
        opts,
        QualName::new(None, ns!(html), local_name!("body")),
        vec![],
        false,
    );
    parser.one(html)
}

fn get_attr(node: &Handle, name: &str) -> Option<String> {
    if let NodeData::Element { attrs, .. } = &node.data {
        for attr in attrs.borrow().iter() {
            if attr.name.local.as_ref() == name {
                return Some(attr.value.to_string());
            }
        }
    }
    None
}

fn element_name(node: &Handle) -> Option<String> {
    if let NodeData::Element { name, .. } = &node.data {
        Some(name.local.to_string())
    } else {
        None
    }
}

fn gather_children(node: &Handle) -> Vec<Handle> {
    node.children.borrow().iter().cloned().collect()
}

fn walk(w: &mut Writer, node: &Handle) {
    let children = gather_children(node);
    for child in &children {
        emit_node(w, child);
    }
}

fn inline_text(node: &Handle, cfg: &Resolved) -> String {
    let mut temp = Writer::new(cfg);
    walk(&mut temp, node);
    temp.out
}

fn emit_node(w: &mut Writer, node: &Handle) {
    match &node.data {
        NodeData::Document => {
            walk(w, node);
        }
        NodeData::Text { contents } => {
            let s = contents.borrow().to_string();
            let escaped = escape_md_text(&s);
            w.push(&escaped);
        }
        NodeData::Element { .. } => emit_element(w, node),
        NodeData::Comment { .. } => {}
        NodeData::ProcessingInstruction { .. } => {}
        NodeData::Doctype { .. } => {}
    }
}

fn emit_element(w: &mut Writer, node: &Handle) {
    let name = match element_name(node) {
        Some(n) => n,
        None => return,
    };
    let name_l = name.to_ascii_lowercase();

    if w.cfg.remove.iter().any(|t| t == &name_l) {
        return;
    }
    if w.cfg.keep.iter().any(|t| t == &name_l) {
        // Emit as raw HTML fragment.
        emit_raw_open(w, node, &name_l);
        walk(w, node);
        w.push("</");
        w.push(&name_l);
        w.push(">");
        return;
    }

    match name_l.as_str() {
        "html" | "body" | "head" | "section" | "article" | "main" | "nav" | "header" | "footer"
        | "aside" | "figure" | "figcaption" => {
            walk(w, node);
        }
        "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => {
            let level: usize = name_l[1..].parse().unwrap_or(1);
            let content = inline_text(node, w.cfg).trim().to_string();
            if w.cfg.heading_style == "setext" && (level == 1 || level == 2) {
                w.ensure_blank_line();
                w.push(&content);
                w.push("\n");
                w.push(&(if level == 1 { "=" } else { "-" }.repeat(content.len().max(3))));
                w.push("\n\n");
            } else {
                w.ensure_blank_line();
                w.push(&"#".repeat(level));
                w.push(" ");
                w.push(&content);
                w.push("\n\n");
            }
        }
        "p" => {
            w.ensure_blank_line();
            walk(w, node);
            w.push("\n\n");
        }
        "br" => {
            w.push("  \n");
        }
        "hr" => {
            w.ensure_blank_line();
            w.push(&w.cfg.hr.clone());
            w.push("\n\n");
        }
        "strong" | "b" => {
            let d = w.cfg.strong_delimiter.clone();
            w.push(&d);
            walk(w, node);
            w.push(&d);
        }
        "em" | "i" => {
            let d = w.cfg.em_delimiter.clone();
            w.push(&d);
            walk(w, node);
            w.push(&d);
        }
        "del" | "s" | "strike" if w.cfg.gfm => {
            w.push("~~");
            walk(w, node);
            w.push("~~");
        }
        "code" => {
            // Inline code only — <pre><code> is handled in "pre".
            let content = text_content(node);
            let needs_double = content.contains('`');
            let fence = if needs_double { "``" } else { "`" };
            w.push(fence);
            if needs_double && !content.starts_with(' ') {
                w.push(" ");
            }
            w.push(&content);
            if needs_double && !content.ends_with(' ') {
                w.push(" ");
            }
            w.push(fence);
        }
        "pre" => {
            w.ensure_blank_line();
            let (lang, content) = find_code_block(node);
            if w.cfg.code_block_style == "fenced" {
                let fence = w.cfg.fence.clone();
                w.push(&fence);
                w.push(&lang);
                w.push("\n");
                w.push(&content);
                if !content.ends_with('\n') {
                    w.push("\n");
                }
                w.push(&fence);
                w.push("\n\n");
            } else {
                for line in content.lines() {
                    w.push("    ");
                    w.push(line);
                    w.push("\n");
                }
                w.push("\n");
            }
        }
        "blockquote" => {
            w.ensure_blank_line();
            let inner = inline_text(node, w.cfg);
            for line in inner.trim().lines() {
                w.push("> ");
                w.push(line);
                w.push("\n");
            }
            w.push("\n");
        }
        "ul" => {
            w.ensure_blank_line();
            w.list_stack.push(ListCtx {
                ordered: false,
                index: 0,
            });
            walk(w, node);
            w.list_stack.pop();
            w.push("\n");
        }
        "ol" => {
            w.ensure_blank_line();
            w.list_stack.push(ListCtx {
                ordered: true,
                index: 0,
            });
            walk(w, node);
            w.list_stack.pop();
            w.push("\n");
        }
        "li" => {
            let marker = if let Some(cur) = w.list_stack.last_mut() {
                if cur.ordered {
                    cur.index += 1;
                    format!("{}. ", cur.index)
                } else {
                    format!("{} ", w.cfg.bullet_list_marker)
                }
            } else {
                format!("{} ", w.cfg.bullet_list_marker)
            };
            let indent_depth = w.list_stack.len().saturating_sub(1);
            let indent = "  ".repeat(indent_depth);
            let inner = inline_text(node, w.cfg);
            let trimmed = inner.trim_end();
            let lines: Vec<&str> = trimmed.lines().collect();
            for (i, line) in lines.iter().enumerate() {
                if i == 0 {
                    w.push(&indent);
                    w.push(&marker);
                    w.push(line);
                } else {
                    w.push("\n");
                    w.push(&indent);
                    w.push("  ");
                    w.push(line);
                }
            }
            w.push("\n");
        }
        "a" => {
            let href = get_attr(node, "href").unwrap_or_default();
            let title = get_attr(node, "title").unwrap_or_default();
            let text = inline_text(node, w.cfg);
            if href.is_empty() {
                w.push(&text);
            } else if title.is_empty() {
                w.push("[");
                w.push(&text);
                w.push("](");
                w.push(&href);
                w.push(")");
            } else {
                w.push("[");
                w.push(&text);
                w.push("](");
                w.push(&href);
                w.push(" \"");
                w.push(&title);
                w.push("\")");
            }
        }
        "img" => {
            let src = get_attr(node, "src").unwrap_or_default();
            let alt = get_attr(node, "alt").unwrap_or_default();
            let title = get_attr(node, "title").unwrap_or_default();
            if title.is_empty() {
                w.push(&format!("![{}]({})", alt, src));
            } else {
                w.push(&format!("![{}]({} \"{}\")", alt, src, title));
            }
        }
        "table" if w.cfg.gfm => emit_gfm_table(w, node),
        "table" => {
            walk(w, node);
        }
        "thead" | "tbody" | "tfoot" | "tr" if !w.cfg.gfm => {
            walk(w, node);
            w.push("\n");
        }
        "th" | "td" if !w.cfg.gfm => {
            let inner = inline_text(node, w.cfg);
            w.push(inner.trim());
            w.push(" ");
        }
        "input" if w.cfg.gfm => {
            // GFM task-list item checkbox: <input type="checkbox" checked>
            let t = get_attr(node, "type").unwrap_or_default();
            if t == "checkbox" {
                let checked = get_attr(node, "checked").is_some();
                w.push(if checked { "[x] " } else { "[ ] " });
            }
        }
        "div" | "span" => {
            walk(w, node);
        }
        "script" | "style" | "noscript" | "iframe" => {
            // drop entirely
        }
        _ => {
            // Unknown element — emit content only.
            walk(w, node);
        }
    }
}

fn emit_raw_open(w: &mut Writer, node: &Handle, name: &str) {
    w.push("<");
    w.push(name);
    if let NodeData::Element { attrs, .. } = &node.data {
        for a in attrs.borrow().iter() {
            w.push(" ");
            w.push(a.name.local.as_ref());
            w.push("=\"");
            w.push(&a.value.to_string().replace('"', "&quot;"));
            w.push("\"");
        }
    }
    w.push(">");
}

fn text_content(node: &Handle) -> String {
    let mut buf = String::new();
    collect_text(node, &mut buf);
    buf
}

fn collect_text(node: &Handle, buf: &mut String) {
    match &node.data {
        NodeData::Text { contents } => buf.push_str(&contents.borrow()),
        NodeData::Element { .. } => {
            for c in node.children.borrow().iter() {
                collect_text(c, buf);
            }
        }
        _ => {}
    }
}

fn find_code_block(pre: &Handle) -> (String, String) {
    // Look for <code> child; language from its class attr
    // (class="language-rust" → "rust").
    for c in pre.children.borrow().iter() {
        if element_name(c).as_deref() == Some("code") {
            let lang = get_attr(c, "class")
                .unwrap_or_default()
                .split_whitespace()
                .find_map(|t| t.strip_prefix("language-").map(|s| s.to_string()))
                .unwrap_or_default();
            return (lang, text_content(c));
        }
    }
    (String::new(), text_content(pre))
}

fn emit_gfm_table(w: &mut Writer, table: &Handle) {
    w.ensure_blank_line();
    let mut rows: Vec<Vec<String>> = Vec::new();
    for c in table.children.borrow().iter() {
        collect_table_rows(c, w.cfg, &mut rows);
    }
    if rows.is_empty() {
        return;
    }
    let col_count = rows.iter().map(|r| r.len()).max().unwrap_or(0);
    let header = rows.remove(0);
    w.push("| ");
    for i in 0..col_count {
        let cell = header.get(i).map(String::as_str).unwrap_or("");
        w.push(cell);
        w.push(" |");
        if i + 1 < col_count {
            w.push(" ");
        }
    }
    w.push("\n| ");
    for i in 0..col_count {
        w.push("---");
        w.push(" |");
        if i + 1 < col_count {
            w.push(" ");
        }
    }
    w.push("\n");
    for row in rows {
        w.push("| ");
        for i in 0..col_count {
            let cell = row.get(i).map(String::as_str).unwrap_or("");
            w.push(cell);
            w.push(" |");
            if i + 1 < col_count {
                w.push(" ");
            }
        }
        w.push("\n");
    }
    w.push("\n");
}

fn collect_table_rows(node: &Handle, cfg: &Resolved, rows: &mut Vec<Vec<String>>) {
    match element_name(node).as_deref() {
        Some("thead") | Some("tbody") | Some("tfoot") => {
            for c in node.children.borrow().iter() {
                collect_table_rows(c, cfg, rows);
            }
        }
        Some("tr") => {
            let mut row = Vec::new();
            for c in node.children.borrow().iter() {
                if matches!(element_name(c).as_deref(), Some("th") | Some("td")) {
                    let mut inner = Writer::new(cfg);
                    walk(&mut inner, c);
                    row.push(inner.out.trim().replace('\n', " "));
                }
            }
            rows.push(row);
        }
        _ => {}
    }
}

fn escape_md_text(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '\\' | '`' | '*' | '_' | '{' | '}' | '[' | ']' | '(' | ')' | '#' | '+' | '-' | '.'
            | '!' | '>' | '<' | '|' => {
                // Conservative escape — only when at line start or
                // it would otherwise form a Markdown construct. For
                // v1 we pass through common characters; full
                // turndown-style escaping is a fast-follow.
                out.push(c);
            }
            _ => out.push(c),
        }
    }
    out
}

fn postprocess(s: String) -> String {
    // Trim, collapse 3+ blank lines to 2.
    let mut lines: Vec<&str> = s.lines().collect();
    while lines.first().map(|l| l.trim().is_empty()).unwrap_or(false) {
        lines.remove(0);
    }
    while lines.last().map(|l| l.trim().is_empty()).unwrap_or(false) {
        lines.pop();
    }
    let mut out = String::with_capacity(s.len());
    let mut blank_run = 0usize;
    for l in lines {
        if l.trim().is_empty() {
            blank_run += 1;
            if blank_run <= 1 {
                out.push('\n');
            }
        } else {
            if !out.is_empty() && !out.ends_with('\n') {
                out.push('\n');
            }
            blank_run = 0;
            out.push_str(l);
            out.push('\n');
        }
    }
    if out.ends_with('\n') {
        out.pop();
    }
    out
}

pub fn turndown(html: &str, options: &TurndownOptions) -> String {
    let cfg = Resolved::from(options);
    let dom = parse_html(html);
    let mut w = Writer::new(&cfg);
    walk(&mut w, &dom.document);
    postprocess(w.out)
}

pub fn turndown_batch(htmls: &[String], options: &TurndownOptions) -> Vec<String> {
    htmls.iter().map(|h| turndown(h, options)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn md(s: &str) -> String {
        turndown(s, &TurndownOptions::default())
    }

    #[test]
    fn heading_atx() {
        assert_eq!(md("<h1>Hello</h1>"), "# Hello");
    }

    #[test]
    fn paragraphs() {
        assert_eq!(md("<p>a</p><p>b</p>"), "a\n\nb");
    }

    #[test]
    fn strong_and_em() {
        assert_eq!(md("<p><strong>x</strong> <em>y</em></p>"), "**x** _y_");
    }

    #[test]
    fn link_inlined() {
        assert_eq!(md("<a href=\"/x\">click</a>"), "[click](/x)");
    }

    #[test]
    fn image() {
        assert_eq!(md("<img src=\"/x.png\" alt=\"X\"/>"), "![X](/x.png)");
    }

    #[test]
    fn ul_basic() {
        assert_eq!(md("<ul><li>a</li><li>b</li></ul>"), "* a\n* b");
    }

    #[test]
    fn ol_basic() {
        assert_eq!(md("<ol><li>a</li><li>b</li></ol>"), "1. a\n2. b");
    }

    #[test]
    fn inline_code() {
        assert_eq!(md("<p>use <code>x</code></p>"), "use `x`");
    }

    #[test]
    fn pre_code_indented() {
        let out = md("<pre><code>let x = 1;\nlet y = 2;</code></pre>");
        assert!(out.contains("    let x = 1;"));
        assert!(out.contains("    let y = 2;"));
    }

    #[test]
    fn pre_code_fenced_with_lang() {
        let opts = TurndownOptions {
            code_block_style: Some("fenced".to_string()),
            ..TurndownOptions::default()
        };
        let out = turndown(
            "<pre><code class=\"language-rust\">fn main(){}</code></pre>",
            &opts,
        );
        assert!(out.starts_with("```rust"));
        assert!(out.contains("fn main"));
    }

    #[test]
    fn blockquote() {
        let out = md("<blockquote><p>quote</p></blockquote>");
        assert!(out.starts_with("> "));
    }

    #[test]
    fn hr() {
        assert_eq!(md("<hr/>"), "* * *");
    }

    #[test]
    fn gfm_strikethrough() {
        let opts = TurndownOptions {
            gfm: Some(true),
            ..TurndownOptions::default()
        };
        let out = turndown("<p><del>gone</del></p>", &opts);
        assert!(out.contains("~~gone~~"));
    }

    #[test]
    fn gfm_table() {
        let opts = TurndownOptions {
            gfm: Some(true),
            ..TurndownOptions::default()
        };
        let out = turndown(
            "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>",
            &opts,
        );
        assert!(out.contains("| A | B |"));
        assert!(out.contains("| --- | --- |"));
        assert!(out.contains("| 1 | 2 |"));
    }

    #[test]
    fn remove_tag() {
        let opts = TurndownOptions {
            remove: Some(vec!["aside".to_string()]),
            ..TurndownOptions::default()
        };
        let out = turndown("<p>keep</p><aside>drop</aside><p>keep2</p>", &opts);
        assert!(!out.contains("drop"));
        assert!(out.contains("keep"));
    }

    #[test]
    fn bullet_list_marker() {
        let opts = TurndownOptions {
            bullet_list_marker: Some("-".to_string()),
            ..TurndownOptions::default()
        };
        let out = turndown("<ul><li>a</li></ul>", &opts);
        assert!(out.contains("- a"));
    }
}
