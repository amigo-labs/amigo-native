//! SVG optimizer via a quick-xml event pipeline. Implements the
//! highest-impact subset of svgo's `preset-default` plugin list.
//! Plugins enabled by default: `removeComments`, `removeMetadata`,
//! `removeEditorsNSData`, `removeTitle`, `removeDesc`, `removeDoctype`,
//! `removeXMLProcInst`, `removeEmptyAttrs`, `removeEmptyText`,
//! `removeEmptyContainers`, `removeHiddenElems`, `removeUselessDefs`,
//! `cleanupNumericValues`, `cleanupAttrs`, `collapseGroups`,
//! `convertColors`, `collapseWhitespace`.
//!
//! Scope-cut: custom JS plugins are **not** exposed — each node visit
//! would cost a FFI crossing (the `ejs` trap documented in
//! `docs/perf-review/svgo.md`). Also out of scope: `convertPathData`,
//! `mergePaths`, `reusePaths` — deferred to v0.2.

use napi_derive::napi;
use quick_xml::Reader;
use quick_xml::Writer;
use quick_xml::events::{BytesEnd, BytesStart, BytesText, Event};
use std::io::Cursor;

#[napi(object)]
pub struct SvgoConfig {
    pub remove_comments: Option<bool>,
    pub remove_metadata: Option<bool>,
    pub remove_title: Option<bool>,
    pub remove_desc: Option<bool>,
    pub remove_doctype: Option<bool>,
    pub remove_xml_proc_inst: Option<bool>,
    pub remove_editors_ns_data: Option<bool>,
    pub remove_empty_attrs: Option<bool>,
    pub remove_empty_text: Option<bool>,
    pub remove_empty_containers: Option<bool>,
    pub remove_hidden_elems: Option<bool>,
    pub remove_useless_defs: Option<bool>,
    pub cleanup_numeric_values: Option<bool>,
    pub cleanup_attrs: Option<bool>,
    pub collapse_groups: Option<bool>,
    pub convert_colors: Option<bool>,
    pub collapse_whitespace: Option<bool>,
    /// Decimal places kept by `cleanupNumericValues`. Default: 3.
    pub float_precision: Option<u32>,
    pub multipass: Option<bool>,
}

impl Default for SvgoConfig {
    fn default() -> Self {
        Self {
            remove_comments: Some(true),
            remove_metadata: Some(true),
            remove_title: Some(true),
            remove_desc: Some(true),
            remove_doctype: Some(true),
            remove_xml_proc_inst: Some(true),
            remove_editors_ns_data: Some(true),
            remove_empty_attrs: Some(true),
            remove_empty_text: Some(true),
            remove_empty_containers: Some(true),
            remove_hidden_elems: Some(true),
            remove_useless_defs: Some(true),
            cleanup_numeric_values: Some(true),
            cleanup_attrs: Some(true),
            collapse_groups: Some(true),
            convert_colors: Some(true),
            collapse_whitespace: Some(true),
            float_precision: Some(3),
            multipass: Some(false),
        }
    }
}

#[napi(object)]
pub struct SvgoResult {
    pub data: String,
    pub input_bytes: u32,
    pub output_bytes: u32,
    pub saved_percent: f64,
}

struct Resolved {
    remove_comments: bool,
    remove_metadata: bool,
    remove_title: bool,
    remove_desc: bool,
    remove_doctype: bool,
    remove_xml_proc_inst: bool,
    remove_editors_ns_data: bool,
    remove_empty_attrs: bool,
    remove_empty_text: bool,
    remove_empty_containers: bool,
    remove_hidden_elems: bool,
    remove_useless_defs: bool,
    cleanup_numeric_values: bool,
    cleanup_attrs: bool,
    collapse_groups: bool,
    convert_colors: bool,
    collapse_whitespace: bool,
    float_precision: u32,
}

fn or_default(opt: Option<bool>, default: bool) -> bool {
    opt.unwrap_or(default)
}

impl From<&SvgoConfig> for Resolved {
    fn from(c: &SvgoConfig) -> Self {
        Self {
            remove_comments: or_default(c.remove_comments, true),
            remove_metadata: or_default(c.remove_metadata, true),
            remove_title: or_default(c.remove_title, true),
            remove_desc: or_default(c.remove_desc, true),
            remove_doctype: or_default(c.remove_doctype, true),
            remove_xml_proc_inst: or_default(c.remove_xml_proc_inst, true),
            remove_editors_ns_data: or_default(c.remove_editors_ns_data, true),
            remove_empty_attrs: or_default(c.remove_empty_attrs, true),
            remove_empty_text: or_default(c.remove_empty_text, true),
            remove_empty_containers: or_default(c.remove_empty_containers, true),
            remove_hidden_elems: or_default(c.remove_hidden_elems, true),
            remove_useless_defs: or_default(c.remove_useless_defs, true),
            cleanup_numeric_values: or_default(c.cleanup_numeric_values, true),
            cleanup_attrs: or_default(c.cleanup_attrs, true),
            collapse_groups: or_default(c.collapse_groups, true),
            convert_colors: or_default(c.convert_colors, true),
            collapse_whitespace: or_default(c.collapse_whitespace, true),
            float_precision: c.float_precision.unwrap_or(3),
        }
    }
}

const EDITOR_NS_PREFIXES: &[&str] = &[
    "sodipodi:",
    "inkscape:",
    "sketch:",
    "adobe:",
    "illustrator:",
    "graph:",
];

const EDITOR_NS_DECLS: &[&str] = &["xmlns:sodipodi", "xmlns:inkscape", "xmlns:sketch"];

fn is_editor_ns_name(name: &[u8]) -> bool {
    let s = std::str::from_utf8(name).unwrap_or("");
    if EDITOR_NS_DECLS.contains(&s) {
        return true;
    }
    EDITOR_NS_PREFIXES.iter().any(|p| s.starts_with(p))
}

const CONTAINERS: &[&[u8]] = &[
    b"svg",
    b"g",
    b"defs",
    b"symbol",
    b"clipPath",
    b"mask",
    b"pattern",
    b"a",
    b"marker",
    b"switch",
];

fn is_container(name: &[u8]) -> bool {
    CONTAINERS.contains(&name)
}

fn cleanup_number_str(s: &str, precision: u32) -> String {
    let mut out = String::with_capacity(s.len());
    let mut token = String::new();
    let mut had_digit_in_token = false;
    let mut had_dot_in_token = false;
    for c in s.chars() {
        let is_numeric_char = c.is_ascii_digit()
            || (c == '.' && !had_dot_in_token)
            || ((c == '-' || c == '+') && token.is_empty())
            || ((c == 'e' || c == 'E') && had_digit_in_token);
        if is_numeric_char {
            if c.is_ascii_digit() {
                had_digit_in_token = true;
            }
            if c == '.' {
                had_dot_in_token = true;
            }
            token.push(c);
        } else {
            if !token.is_empty() {
                out.push_str(&reformat_if_number(&token, precision));
                token.clear();
                had_digit_in_token = false;
                had_dot_in_token = false;
            }
            out.push(c);
        }
    }
    if !token.is_empty() {
        out.push_str(&reformat_if_number(&token, precision));
    }
    out
}

fn reformat_if_number(token: &str, precision: u32) -> String {
    if !token.contains('.') {
        return token.to_string();
    }
    match token.parse::<f64>() {
        Ok(n) => {
            let factor = 10f64.powi(precision as i32);
            let rounded = (n * factor).round() / factor;
            let formatted = format!("{:.*}", precision as usize, rounded);
            if formatted.contains('.') {
                let trimmed = formatted.trim_end_matches('0').trim_end_matches('.');
                if trimmed.is_empty() || trimmed == "-" {
                    "0".to_string()
                } else {
                    trimmed.to_string()
                }
            } else {
                formatted
            }
        }
        _ => token.to_string(),
    }
}

const NAMED_COLORS: &[(&str, &str)] = &[
    ("black", "#000"),
    ("white", "#fff"),
    ("red", "#f00"),
    ("green", "#008000"),
    ("blue", "#00f"),
    ("yellow", "#ff0"),
    ("cyan", "#0ff"),
    ("magenta", "#f0f"),
    ("silver", "#c0c0c0"),
    ("gray", "#808080"),
    ("grey", "#808080"),
    ("maroon", "#800000"),
    ("olive", "#808000"),
    ("purple", "#800080"),
    ("teal", "#008080"),
    ("navy", "#000080"),
    ("orange", "#ffa500"),
    ("pink", "#ffc0cb"),
];

fn convert_color(v: &str) -> String {
    let trimmed = v.trim();
    let lower = trimmed.to_ascii_lowercase();
    for (name, hex) in NAMED_COLORS {
        if lower == *name {
            return hex.to_string();
        }
    }
    if lower.starts_with("rgb(") && lower.ends_with(')') {
        let inner = &lower[4..lower.len() - 1];
        let parts: Vec<_> = inner.split(',').map(|s| s.trim()).collect();
        if parts.len() == 3
            && let (Ok(r), Ok(g), Ok(b)) = (
                parts[0].parse::<i32>(),
                parts[1].parse::<i32>(),
                parts[2].parse::<i32>(),
            )
        {
            let hex = format!("#{:02x}{:02x}{:02x}", r & 0xff, g & 0xff, b & 0xff);
            return shorten_hex(&hex);
        }
    }
    if lower.starts_with('#') {
        return shorten_hex(&lower);
    }
    v.to_string()
}

fn shorten_hex(hex: &str) -> String {
    if hex.len() == 7 {
        let bytes = hex.as_bytes();
        if bytes[1] == bytes[2] && bytes[3] == bytes[4] && bytes[5] == bytes[6] {
            return format!(
                "#{}{}{}",
                bytes[1] as char, bytes[3] as char, bytes[5] as char
            );
        }
    }
    hex.to_string()
}

const COLOR_ATTRS: &[&str] = &["fill", "stroke", "stop-color", "color", "flood-color"];

fn is_hidden(attrs: &[(Vec<u8>, Vec<u8>)]) -> bool {
    for (k, v) in attrs {
        let kn = std::str::from_utf8(k).unwrap_or("");
        let vn = std::str::from_utf8(v).unwrap_or("").trim();
        if kn == "display" && vn == "none" {
            return true;
        }
        if kn == "visibility" && vn == "hidden" {
            return true;
        }
    }
    false
}

fn collect_attrs(e: &BytesStart<'_>) -> Vec<(Vec<u8>, Vec<u8>)> {
    let mut out = Vec::new();
    for a in e.attributes().flatten() {
        out.push((a.key.as_ref().to_vec(), a.value.into_owned()));
    }
    out
}

fn transform_attrs(attrs: Vec<(Vec<u8>, Vec<u8>)>, cfg: &Resolved) -> Vec<(Vec<u8>, Vec<u8>)> {
    attrs
        .into_iter()
        .filter_map(|(k, v)| {
            if cfg.remove_editors_ns_data && is_editor_ns_name(&k) {
                return None;
            }
            let mut val = v;
            if cfg.cleanup_attrs
                && let Ok(s) = std::str::from_utf8(&val)
            {
                let collapsed = collapse_whitespace_in_attr(s);
                val = collapsed.into_bytes();
            }
            if cfg.remove_empty_attrs && val.is_empty() {
                return None;
            }
            if cfg.cleanup_numeric_values
                && let Ok(s) = std::str::from_utf8(&val)
            {
                val = cleanup_number_str(s, cfg.float_precision).into_bytes();
            }
            if cfg.convert_colors {
                let kn = std::str::from_utf8(&k).unwrap_or("");
                if COLOR_ATTRS.contains(&kn)
                    && let Ok(s) = std::str::from_utf8(&val)
                {
                    val = convert_color(s).into_bytes();
                }
            }
            Some((k, val))
        })
        .collect()
}

fn collapse_whitespace_in_attr(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut prev_ws = false;
    for c in s.trim().chars() {
        if c.is_ascii_whitespace() {
            if !prev_ws {
                out.push(' ');
                prev_ws = true;
            }
        } else {
            out.push(c);
            prev_ws = false;
        }
    }
    out
}

fn write_start(w: &mut Writer<Cursor<Vec<u8>>>, name: &[u8], attrs: &[(Vec<u8>, Vec<u8>)]) {
    let mut el = BytesStart::new(std::str::from_utf8(name).unwrap_or(""));
    for (k, v) in attrs {
        el.push_attribute((
            std::str::from_utf8(k).unwrap_or(""),
            std::str::from_utf8(v).unwrap_or(""),
        ));
    }
    w.write_event(Event::Start(el)).ok();
}

fn write_empty(w: &mut Writer<Cursor<Vec<u8>>>, name: &[u8], attrs: &[(Vec<u8>, Vec<u8>)]) {
    let mut el = BytesStart::new(std::str::from_utf8(name).unwrap_or(""));
    for (k, v) in attrs {
        el.push_attribute((
            std::str::from_utf8(k).unwrap_or(""),
            std::str::from_utf8(v).unwrap_or(""),
        ));
    }
    w.write_event(Event::Empty(el)).ok();
}

// Intermediate node tree — we need a tree to do containment-aware
// passes (removeEmptyContainers, collapseGroups, removeUselessDefs).
#[derive(Debug)]
enum Node {
    Element {
        name: Vec<u8>,
        attrs: Vec<(Vec<u8>, Vec<u8>)>,
        children: Vec<Node>,
        empty: bool, // self-closing in the source
    },
    Text(String),
    CData(Vec<u8>),
    Comment(Vec<u8>),
    Decl(Vec<u8>),
    PI(Vec<u8>),
    DocType(Vec<u8>),
    GeneralRef(Vec<u8>),
}

fn parse(svg: &str, cfg: &Resolved) -> Vec<Node> {
    let mut reader = Reader::from_str(svg);
    reader.config_mut().trim_text(cfg.collapse_whitespace);
    parse_until_end(&mut reader, None)
}

fn parse_until_end(reader: &mut Reader<&[u8]>, close: Option<&[u8]>) -> Vec<Node> {
    let mut out = Vec::new();
    while let Ok(ev) = reader.read_event() {
        match ev {
            Event::Eof => break,
            Event::Start(e) => {
                let name = e.name().as_ref().to_vec();
                let attrs = collect_attrs(&e);
                let children = parse_until_end(reader, Some(&name));
                out.push(Node::Element {
                    name,
                    attrs,
                    children,
                    empty: false,
                });
            }
            Event::End(e) => {
                if let Some(c) = close
                    && e.name().as_ref() == c
                {
                    return out;
                }
            }
            Event::Empty(e) => {
                let name = e.name().as_ref().to_vec();
                let attrs = collect_attrs(&e);
                out.push(Node::Element {
                    name,
                    attrs,
                    children: Vec::new(),
                    empty: true,
                });
            }
            Event::Text(t) => {
                out.push(Node::Text(
                    std::str::from_utf8(t.as_ref()).unwrap_or("").to_string(),
                ));
            }
            Event::CData(c) => {
                out.push(Node::CData(c.as_ref().to_vec()));
            }
            Event::Comment(c) => {
                out.push(Node::Comment(c.as_ref().to_vec()));
            }
            Event::Decl(d) => {
                out.push(Node::Decl(d.as_ref().to_vec()));
            }
            Event::PI(p) => {
                out.push(Node::PI(p.as_ref().to_vec()));
            }
            Event::DocType(d) => {
                out.push(Node::DocType(d.as_ref().to_vec()));
            }
            Event::GeneralRef(r) => {
                out.push(Node::GeneralRef(r.as_ref().to_vec()));
            }
        }
    }
    out
}

fn transform(nodes: Vec<Node>, cfg: &Resolved) -> Vec<Node> {
    let mut out: Vec<Node> = Vec::with_capacity(nodes.len());
    for n in nodes {
        match n {
            Node::Comment(_) if cfg.remove_comments => {}
            Node::DocType(_) if cfg.remove_doctype => {}
            Node::PI(p) => {
                if cfg.remove_xml_proc_inst {
                    let s = std::str::from_utf8(&p).unwrap_or("");
                    if s.starts_with("xml") {
                        continue;
                    }
                }
                out.push(Node::PI(p));
            }
            Node::Text(s) => {
                if cfg.remove_empty_text && s.trim().is_empty() {
                    continue;
                }
                out.push(Node::Text(s));
            }
            Node::Element {
                name,
                attrs,
                children,
                empty,
            } => {
                let name_str = std::str::from_utf8(&name).unwrap_or("");
                if cfg.remove_metadata && name_str == "metadata" {
                    continue;
                }
                if cfg.remove_title && name_str == "title" {
                    continue;
                }
                if cfg.remove_desc && name_str == "desc" {
                    continue;
                }
                if cfg.remove_hidden_elems && is_hidden(&attrs) {
                    continue;
                }
                let new_attrs = transform_attrs(attrs, cfg);
                let new_children = transform(children, cfg);

                if cfg.remove_useless_defs && name_str == "defs" && new_children.is_empty() {
                    continue;
                }
                if cfg.remove_empty_containers
                    && is_container(&name)
                    && name_str != "svg"
                    && new_children.is_empty()
                    && !has_meaningful_attrs(&new_attrs)
                {
                    continue;
                }

                // collapseGroups: <g> with no attributes and a single
                // child element collapses to the child.
                if cfg.collapse_groups
                    && name_str == "g"
                    && new_attrs.is_empty()
                    && new_children.len() == 1
                    && matches!(&new_children[0], Node::Element { .. })
                {
                    out.extend(new_children);
                    continue;
                }

                out.push(Node::Element {
                    name,
                    attrs: new_attrs,
                    children: new_children,
                    empty,
                });
            }
            other => out.push(other),
        }
    }
    out
}

fn has_meaningful_attrs(attrs: &[(Vec<u8>, Vec<u8>)]) -> bool {
    attrs.iter().any(|(k, _)| {
        let s = std::str::from_utf8(k).unwrap_or("");
        s == "id" || s == "class" || s == "style"
    })
}

fn serialize(nodes: &[Node]) -> String {
    let mut writer = Writer::new(Cursor::new(Vec::new()));
    for n in nodes {
        serialize_node(&mut writer, n);
    }
    let bytes = writer.into_inner().into_inner();
    String::from_utf8(bytes).unwrap_or_default()
}

fn serialize_node(w: &mut Writer<Cursor<Vec<u8>>>, n: &Node) {
    match n {
        Node::Element {
            name,
            attrs,
            children,
            empty: _,
        } => {
            if children.is_empty() {
                write_empty(w, name, attrs);
            } else {
                write_start(w, name, attrs);
                for c in children {
                    serialize_node(w, c);
                }
                let end = BytesEnd::new(std::str::from_utf8(name).unwrap_or("").to_string());
                w.write_event(Event::End(end)).ok();
            }
        }
        Node::Text(s) => {
            w.write_event(Event::Text(BytesText::new(s))).ok();
        }
        Node::CData(bs) => {
            let s = std::str::from_utf8(bs).unwrap_or("");
            w.write_event(Event::CData(quick_xml::events::BytesCData::new(s)))
                .ok();
        }
        Node::Comment(bs) => {
            let s = std::str::from_utf8(bs).unwrap_or("");
            w.write_event(Event::Comment(BytesText::new(s))).ok();
        }
        Node::Decl(bs) => {
            let s = std::str::from_utf8(bs).unwrap_or("");
            let text = BytesText::new(s);
            w.write_event(Event::Text(text)).ok();
        }
        Node::PI(bs) => {
            let s = std::str::from_utf8(bs).unwrap_or("");
            w.write_event(Event::PI(quick_xml::events::BytesPI::new(s)))
                .ok();
        }
        Node::DocType(bs) => {
            let s = std::str::from_utf8(bs).unwrap_or("");
            w.write_event(Event::DocType(BytesText::new(s))).ok();
        }
        Node::GeneralRef(bs) => {
            let s = std::str::from_utf8(bs).unwrap_or("");
            w.write_event(Event::GeneralRef(quick_xml::events::BytesRef::new(s)))
                .ok();
        }
    }
}

fn optimize_pass(svg: &str, cfg: &Resolved) -> String {
    let nodes = parse(svg, cfg);
    let transformed = transform(nodes, cfg);
    serialize(&transformed)
}

#[napi(js_name = "optimize")]
pub fn optimize(svg: String, config: Option<SvgoConfig>) -> SvgoResult {
    let cfg_value = config.unwrap_or_default();
    let resolved: Resolved = (&cfg_value).into();
    let input_bytes = svg.len() as u32;

    let mut data = optimize_pass(&svg, &resolved);
    if cfg_value.multipass.unwrap_or(false) {
        for _ in 0..4 {
            let next = optimize_pass(&data, &resolved);
            if next.len() >= data.len() {
                break;
            }
            data = next;
        }
    }

    let output_bytes = data.len() as u32;
    let saved_percent = if input_bytes == 0 {
        0.0
    } else {
        100.0 * (input_bytes as f64 - output_bytes as f64) / input_bytes as f64
    };
    SvgoResult {
        data,
        input_bytes,
        output_bytes,
        saved_percent,
    }
}

#[napi(js_name = "optimizeMany")]
pub fn optimize_many(svgs: Vec<String>, config: Option<SvgoConfig>) -> Vec<SvgoResult> {
    let cfg_value = config.unwrap_or_default();
    svgs.into_iter()
        .map(|s| optimize(s, Some(clone_cfg(&cfg_value))))
        .collect()
}

fn clone_cfg(c: &SvgoConfig) -> SvgoConfig {
    SvgoConfig {
        remove_comments: c.remove_comments,
        remove_metadata: c.remove_metadata,
        remove_title: c.remove_title,
        remove_desc: c.remove_desc,
        remove_doctype: c.remove_doctype,
        remove_xml_proc_inst: c.remove_xml_proc_inst,
        remove_editors_ns_data: c.remove_editors_ns_data,
        remove_empty_attrs: c.remove_empty_attrs,
        remove_empty_text: c.remove_empty_text,
        remove_empty_containers: c.remove_empty_containers,
        remove_hidden_elems: c.remove_hidden_elems,
        remove_useless_defs: c.remove_useless_defs,
        cleanup_numeric_values: c.cleanup_numeric_values,
        cleanup_attrs: c.cleanup_attrs,
        collapse_groups: c.collapse_groups,
        convert_colors: c.convert_colors,
        collapse_whitespace: c.collapse_whitespace,
        float_precision: c.float_precision,
        multipass: c.multipass,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_comments() {
        let res = optimize("<svg><!-- comment --><rect/></svg>".to_string(), None);
        assert!(!res.data.contains("comment"));
    }

    #[test]
    fn removes_metadata_title_desc() {
        let res = optimize(
            "<svg><title>X</title><desc>d</desc><metadata>m</metadata><rect/></svg>".to_string(),
            None,
        );
        assert!(!res.data.contains("title"));
        assert!(!res.data.contains("metadata"));
        assert!(!res.data.contains("desc"));
    }

    #[test]
    fn strips_empty_attrs() {
        let res = optimize("<svg><rect id=\"\" width=\"10\"/></svg>".to_string(), None);
        assert!(!res.data.contains("id="));
        assert!(res.data.contains("width"));
    }

    #[test]
    fn cleanup_numbers() {
        let res = optimize(
            "<svg><rect width=\"10.123456\" height=\"5.000000\"/></svg>".to_string(),
            None,
        );
        assert!(res.data.contains("10.123"));
        assert!(res.data.contains("\"5\""));
    }

    #[test]
    fn removes_hidden() {
        let res = optimize(
            "<svg><rect display=\"none\" width=\"10\"/><circle r=\"5\"/></svg>".to_string(),
            None,
        );
        assert!(!res.data.contains("rect"));
        assert!(res.data.contains("circle"));
    }

    #[test]
    fn converts_named_colors() {
        let res = optimize(
            "<svg><rect fill=\"black\" stroke=\"white\"/></svg>".to_string(),
            None,
        );
        assert!(res.data.contains("#000"));
        assert!(res.data.contains("#fff"));
    }

    #[test]
    fn converts_rgb_to_hex() {
        let res = optimize(
            "<svg><rect fill=\"rgb(255, 0, 0)\"/></svg>".to_string(),
            None,
        );
        assert!(res.data.contains("#f00"));
    }

    #[test]
    fn removes_useless_defs() {
        let res = optimize("<svg><defs></defs><rect/></svg>".to_string(), None);
        assert!(!res.data.contains("defs"));
    }

    #[test]
    fn collapses_groups() {
        let res = optimize("<svg><g><rect width=\"10\"/></g></svg>".to_string(), None);
        assert!(!res.data.contains("<g>"));
        assert!(res.data.contains("rect"));
    }

    #[test]
    fn removes_editor_ns() {
        let res = optimize(
            "<svg xmlns:sodipodi=\"x\"><rect sodipodi:nodetypes=\"cc\" width=\"10\"/></svg>"
                .to_string(),
            None,
        );
        assert!(!res.data.contains("sodipodi"));
    }

    #[test]
    fn reports_savings() {
        let res = optimize(
            "<svg>    <!-- comment -->  <rect width=\"1.000000\" fill=\"black\"/>  </svg>"
                .to_string(),
            None,
        );
        assert!(res.saved_percent > 0.0);
    }

    #[test]
    fn preserves_svg_root_even_if_empty() {
        let res = optimize("<svg></svg>".to_string(), None);
        assert!(res.data.contains("svg"));
    }

    #[test]
    fn batch_optimize() {
        let svgs = vec![
            "<svg><rect/></svg>".to_string(),
            "<svg><!-- x --><circle/></svg>".to_string(),
        ];
        let results = optimize_many(svgs, None);
        assert_eq!(results.len(), 2);
        assert!(!results[1].data.contains("x"));
    }
}
