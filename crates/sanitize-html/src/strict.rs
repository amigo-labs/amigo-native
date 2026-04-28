use std::borrow::Cow;

use html5ever::driver::ParseOpts;
use html5ever::interface::QualName;
use html5ever::tendril::TendrilSink;
use html5ever::tree_builder::TreeBuilderOpts;
use html5ever::{local_name, ns, parse_fragment};
use markup5ever::interface::Attribute;
use markup5ever_rcdom::{Handle, NodeData, RcDom};
use napi::bindgen_prelude::Either;

use crate::rules::{Rules, escape_attr, escape_text, is_raw_text_element, is_void};
use crate::{SanitizeOptions, coerce_input};

// ---------------------------------------------------------------------------
// Strict sanitization engine. Runs html5ever's full parser
// (`parse_fragment` + TreeBuilder → RcDom) so the tokenizer correctly
// transitions through SCRIPT_DATA, RAWTEXT, and foreign-content (SVG /
// MathML) states. Slower than the tokenizer-only fast path; the compat
// layer routes to this only when a caller needs the state-machine-driven
// behaviour (script/style in allowedTags, SVG tags, or
// `parser.lowerCase*: false`).
// ---------------------------------------------------------------------------

/// Render an attribute name with its namespace prefix restored
/// (`xmlns:xlink`, `xlink:href`). html5ever stores the prefix and local
/// parts separately; the HTML5 serialiser glues them back together.
/// html5ever also emits an empty `Some("")` prefix for attributes like
/// `xmlns=` (no real prefix); treat those as prefix-less so we don't
/// output `:xmlns`.
fn attr_full_name<'a>(attr: &'a Attribute) -> Cow<'a, str> {
    match &attr.name.prefix {
        Some(prefix) if !prefix.is_empty() => Cow::Owned(format!("{}:{}", prefix, attr.name.local)),
        _ => Cow::Borrowed(attr.name.local.as_ref()),
    }
}

/// Tag / attribute name used for both allowlist matching and output
/// emission. We do NOT lowercase here: html5ever already lowercases HTML
/// tag names during tokenisation, but preserves the source case for
/// foreign-content elements (SVG / MathML). The compat layer lowercases
/// the user's allowlist before dispatch when `lowerCaseTags` is on, so
/// exact-string matching is correct here either way — and keeping source
/// case lets us emit `<linearGradient>` verbatim, which the SVG test
/// requires.
fn element_name(qn: &QualName) -> &str {
    qn.local.as_ref()
}

fn walk_node(node: &Handle, rules: &Rules, out: &mut String, dropping: bool, raw_text: bool) {
    match &node.data {
        NodeData::Document | NodeData::ProcessingInstruction { .. } | NodeData::Doctype { .. } => {
            for child in node.children.borrow().iter() {
                walk_node(child, rules, out, dropping, raw_text);
            }
        }
        NodeData::Text { contents } => {
            if dropping {
                return;
            }
            if raw_text {
                out.push_str(&contents.borrow());
            } else {
                escape_text(&contents.borrow(), out);
            }
        }
        NodeData::Comment { contents } => {
            if dropping {
                return;
            }
            if !rules.strip_comments {
                out.push_str("<!--");
                out.push_str(contents);
                out.push_str("-->");
            }
        }
        NodeData::Element { name, attrs, .. } => {
            if dropping {
                for child in node.children.borrow().iter() {
                    walk_node(child, rules, out, true, raw_text);
                }
                return;
            }
            let tag = element_name(name);
            if rules.is_drop_content_tag(tag) {
                for child in node.children.borrow().iter() {
                    walk_node(child, rules, out, true, raw_text);
                }
                return;
            }
            // html5ever inserts an implicit <tbody> around <tr> children of
            // <table>. Upstream sanitize-html (htmlparser2) does not. Unwrap
            // the auto-tbody when it was not in the user's allowlist so the
            // output shape matches upstream byte-for-byte.
            if tag == "tbody" && !rules.is_allowed_tag("tbody") {
                for child in node.children.borrow().iter() {
                    walk_node(child, rules, out, false, raw_text);
                }
                return;
            }
            if !rules.is_allowed_tag(tag) {
                for child in node.children.borrow().iter() {
                    walk_node(child, rules, out, false, raw_text);
                }
                return;
            }
            emit_element(node, name, &attrs.borrow(), rules, out);
        }
    }
}

fn emit_element(
    node: &Handle,
    name: &QualName,
    attrs: &[Attribute],
    rules: &Rules,
    out: &mut String,
) {
    let tag = element_name(name);

    out.push('<');
    out.push_str(tag);

    let mut emitted_rel = false;
    let mut has_href = false;
    for attr in attrs {
        let full = attr_full_name(attr);
        if !rules.is_allowed_attr(tag, &full) {
            continue;
        }
        if rules.is_url_attr(tag, &full) && !rules.scheme_allowed(&attr.value) {
            continue;
        }
        let filtered_value;
        let value_ref: &str = if full == "class" {
            if let Some(allowed) = rules.allowed_classes.get(tag) {
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

        if full == "href" {
            has_href = true;
        }
        if full == "rel" {
            emitted_rel = true;
        }

        out.push(' ');
        out.push_str(&full);
        out.push_str("=\"");
        escape_attr(value_ref, out);
        out.push('"');
    }

    if tag == "a"
        && has_href
        && !emitted_rel
        && let Some(rel) = &rules.link_rel
    {
        out.push_str(" rel=\"");
        escape_attr(rel, out);
        out.push('"');
    }
    out.push('>');

    if !is_void(tag) {
        let raw = is_raw_text_element(tag);
        for child in node.children.borrow().iter() {
            walk_node(child, rules, out, false, raw);
        }
        out.push_str("</");
        out.push_str(tag);
        out.push('>');
    }
}

/// Same DoS guard as the fast path. See `v2::DEFAULT_MAX_INPUT_BYTES`.
const DEFAULT_MAX_INPUT_BYTES: usize = 5 * 1024 * 1024;

pub(crate) fn sanitize_impl(
    html: Option<Either<String, f64>>,
    options: Option<SanitizeOptions>,
) -> String {
    let max_input_bytes = options
        .as_ref()
        .and_then(|o| o.max_input_bytes)
        .map(|n| if n == 0 { usize::MAX } else { n as usize })
        .unwrap_or(DEFAULT_MAX_INPUT_BYTES);

    let html = coerce_input(html);
    if html.len() > max_input_bytes {
        return String::new();
    }
    let rules = Rules::from_options(&options);

    let opts = ParseOpts {
        tree_builder: TreeBuilderOpts {
            drop_doctype: true,
            ..Default::default()
        },
        ..Default::default()
    };

    // `<body>` context drives the parser's "in body" insertion mode, which
    // is the right starting state for sanitizing a fragment that will be
    // inserted into a document body. The TreeBuilder handles the SCRIPT_DATA
    // / RAWTEXT / foreign-content transitions from there.
    let context = QualName::new(None, ns!(html), local_name!("body"));
    let dom = parse_fragment(RcDom::default(), opts, context, vec![], false).one(html);

    // `parse_fragment` wraps the parsed fragment inside a synthetic <html>
    // root; the fragment nodes are that root's children.
    let mut out = String::with_capacity(64);
    let doc_children = dom.document.children.borrow();
    for wrapper in doc_children.iter() {
        let wrapper_children = wrapper.children.borrow();
        for node in wrapper_children.iter() {
            walk_node(node, &rules, &mut out, false, false);
        }
    }
    out
}
