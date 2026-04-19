use napi::bindgen_prelude::*;
use napi_derive::napi;
use quick_xml::Reader;
use quick_xml::events::Event;
use std::collections::HashMap;

#[napi(object)]
pub struct XmlAttr {
    pub name: String,
    pub value: String,
}

#[napi(object)]
pub struct XmlEvent {
    /// One of: "opentag", "closetag", "text", "cdata", "comment",
    /// "processinginstruction", "doctype".
    pub kind: String,
    pub name: Option<String>,
    pub text: Option<String>,
    pub attrs: Option<Vec<XmlAttr>>,
    pub self_closing: Option<bool>,
}

fn decode_attrs(
    reader: &Reader<&[u8]>,
    bs: &quick_xml::events::BytesStart,
    strict: bool,
) -> Result<Vec<XmlAttr>> {
    let mut out = Vec::new();
    let mut seen: HashMap<String, ()> = HashMap::new();
    for a in bs.attributes() {
        let a = match a {
            Ok(a) => a,
            Err(e) => {
                if strict {
                    return Err(Error::from_reason(format!("attribute error: {e}")));
                }
                continue;
            }
        };
        let name = String::from_utf8_lossy(a.key.as_ref()).into_owned();
        if seen.contains_key(&name) {
            continue;
        }
        seen.insert(name.clone(), ());
        let value = match a.decode_and_unescape_value(reader.decoder()) {
            Ok(v) => v.into_owned(),
            Err(e) => {
                if strict {
                    return Err(Error::from_reason(format!("attribute value error: {e}")));
                }
                String::from_utf8_lossy(a.value.as_ref()).into_owned()
            }
        };
        out.push(XmlAttr { name, value });
    }
    Ok(out)
}

#[napi]
pub fn parse_xml(input: String, strict: Option<bool>) -> Result<Vec<XmlEvent>> {
    let mut reader = Reader::from_str(&input);
    let strict = strict.unwrap_or(true);
    let config = reader.config_mut();
    config.trim_text(false);
    config.expand_empty_elements = false;
    // In non-strict mode, don't require matching end tags.
    config.check_end_names = strict;

    let mut out = Vec::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(bs)) => {
                let name = String::from_utf8_lossy(bs.name().as_ref()).into_owned();
                let attrs = decode_attrs(&reader, &bs, strict)?;
                out.push(XmlEvent {
                    kind: "opentag".into(),
                    name: Some(name),
                    text: None,
                    attrs: Some(attrs),
                    self_closing: Some(false),
                });
            }
            Ok(Event::End(be)) => {
                let name = String::from_utf8_lossy(be.name().as_ref()).into_owned();
                out.push(XmlEvent {
                    kind: "closetag".into(),
                    name: Some(name),
                    text: None,
                    attrs: None,
                    self_closing: None,
                });
            }
            Ok(Event::Empty(bs)) => {
                let name = String::from_utf8_lossy(bs.name().as_ref()).into_owned();
                let attrs = decode_attrs(&reader, &bs, strict)?;
                out.push(XmlEvent {
                    kind: "opentag".into(),
                    name: Some(name.clone()),
                    text: None,
                    attrs: Some(attrs),
                    self_closing: Some(true),
                });
                out.push(XmlEvent {
                    kind: "closetag".into(),
                    name: Some(name),
                    text: None,
                    attrs: None,
                    self_closing: None,
                });
            }
            Ok(Event::Text(bt)) => {
                let text = match bt.unescape() {
                    Ok(t) => t.into_owned(),
                    Err(e) => {
                        if strict {
                            return Err(Error::from_reason(format!("text decode error: {e}")));
                        }
                        String::from_utf8_lossy(bt.as_ref()).into_owned()
                    }
                };
                out.push(XmlEvent {
                    kind: "text".into(),
                    name: None,
                    text: Some(text),
                    attrs: None,
                    self_closing: None,
                });
            }
            Ok(Event::CData(bc)) => {
                let text = String::from_utf8_lossy(bc.as_ref()).into_owned();
                out.push(XmlEvent {
                    kind: "cdata".into(),
                    name: None,
                    text: Some(text),
                    attrs: None,
                    self_closing: None,
                });
            }
            Ok(Event::Comment(bc)) => {
                let text = String::from_utf8_lossy(bc.as_ref()).into_owned();
                out.push(XmlEvent {
                    kind: "comment".into(),
                    name: None,
                    text: Some(text),
                    attrs: None,
                    self_closing: None,
                });
            }
            Ok(Event::PI(bpi)) => {
                let text = String::from_utf8_lossy(bpi.as_ref()).into_owned();
                out.push(XmlEvent {
                    kind: "processinginstruction".into(),
                    name: None,
                    text: Some(text),
                    attrs: None,
                    self_closing: None,
                });
            }
            Ok(Event::DocType(bd)) => {
                let text = String::from_utf8_lossy(bd.as_ref()).into_owned();
                out.push(XmlEvent {
                    kind: "doctype".into(),
                    name: None,
                    text: Some(text),
                    attrs: None,
                    self_closing: None,
                });
            }
            Ok(Event::Decl(_)) => {
                // skip XML declaration
            }
            Ok(Event::Eof) => break,
            Err(e) => {
                if strict {
                    return Err(Error::from_reason(format!("xml parse error: {e}")));
                }
                break;
            }
        }
    }

    Ok(out)
}

fn json_escape(out: &mut String, s: &str) {
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\x08' => out.push_str("\\b"),
            '\x0c' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => {
                use std::fmt::Write;
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
}

fn push_event(out: &mut String, first: &mut bool, body: impl FnOnce(&mut String)) {
    if !*first {
        out.push(',');
    }
    *first = false;
    body(out);
}

/// Stream-parse XML and return events as a single JSON array string.
/// Avoids the Vec<XmlEvent> + per-event String allocations of `parseXml`.
/// Event shape: `{"t":"open"|"close"|"text"|"cdata"|"comment"|"pi"|"doctype",
/// "n":"tag","a":[{"n":"attr","v":"val"}],"c":bool,"v":"text"}` (fields present
/// as relevant). Use JSON.parse() on the JS side.
#[napi(js_name = "parseXmlToJson")]
pub fn parse_xml_to_json(input: String, strict: Option<bool>) -> Result<String> {
    let mut reader = Reader::from_str(&input);
    let strict = strict.unwrap_or(true);
    let config = reader.config_mut();
    config.trim_text(false);
    config.expand_empty_elements = false;
    config.check_end_names = strict;

    // Heuristic: ~1 event per 50 input bytes keeps reallocations low.
    let mut out = String::with_capacity(input.len().saturating_add(input.len() / 4));
    out.push('[');
    let mut first = true;

    loop {
        match reader.read_event() {
            Ok(Event::Start(bs)) => {
                let name = String::from_utf8_lossy(bs.name().as_ref()).into_owned();
                let attrs = decode_attrs(&reader, &bs, strict)?;
                push_event(&mut out, &mut first, |o| {
                    o.push_str("{\"t\":\"open\",\"n\":\"");
                    json_escape(o, &name);
                    o.push_str("\",\"a\":[");
                    let mut af = true;
                    for a in &attrs {
                        if !af {
                            o.push(',');
                        }
                        af = false;
                        o.push_str("{\"n\":\"");
                        json_escape(o, &a.name);
                        o.push_str("\",\"v\":\"");
                        json_escape(o, &a.value);
                        o.push_str("\"}");
                    }
                    o.push_str("],\"c\":false}");
                });
            }
            Ok(Event::End(be)) => {
                let name = String::from_utf8_lossy(be.name().as_ref()).into_owned();
                push_event(&mut out, &mut first, |o| {
                    o.push_str("{\"t\":\"close\",\"n\":\"");
                    json_escape(o, &name);
                    o.push_str("\"}");
                });
            }
            Ok(Event::Empty(bs)) => {
                let name = String::from_utf8_lossy(bs.name().as_ref()).into_owned();
                let attrs = decode_attrs(&reader, &bs, strict)?;
                push_event(&mut out, &mut first, |o| {
                    o.push_str("{\"t\":\"open\",\"n\":\"");
                    json_escape(o, &name);
                    o.push_str("\",\"a\":[");
                    let mut af = true;
                    for a in &attrs {
                        if !af {
                            o.push(',');
                        }
                        af = false;
                        o.push_str("{\"n\":\"");
                        json_escape(o, &a.name);
                        o.push_str("\",\"v\":\"");
                        json_escape(o, &a.value);
                        o.push_str("\"}");
                    }
                    o.push_str("],\"c\":true}");
                });
                push_event(&mut out, &mut first, |o| {
                    o.push_str("{\"t\":\"close\",\"n\":\"");
                    json_escape(o, &name);
                    o.push_str("\"}");
                });
            }
            Ok(Event::Text(bt)) => {
                let text = match bt.unescape() {
                    Ok(t) => t.into_owned(),
                    Err(e) => {
                        if strict {
                            return Err(Error::from_reason(format!("text decode error: {e}")));
                        }
                        String::from_utf8_lossy(bt.as_ref()).into_owned()
                    }
                };
                push_event(&mut out, &mut first, |o| {
                    o.push_str("{\"t\":\"text\",\"v\":\"");
                    json_escape(o, &text);
                    o.push_str("\"}");
                });
            }
            Ok(Event::CData(bc)) => {
                let text = String::from_utf8_lossy(bc.as_ref()).into_owned();
                push_event(&mut out, &mut first, |o| {
                    o.push_str("{\"t\":\"cdata\",\"v\":\"");
                    json_escape(o, &text);
                    o.push_str("\"}");
                });
            }
            Ok(Event::Comment(bc)) => {
                let text = String::from_utf8_lossy(bc.as_ref()).into_owned();
                push_event(&mut out, &mut first, |o| {
                    o.push_str("{\"t\":\"comment\",\"v\":\"");
                    json_escape(o, &text);
                    o.push_str("\"}");
                });
            }
            Ok(Event::PI(bpi)) => {
                let text = String::from_utf8_lossy(bpi.as_ref()).into_owned();
                push_event(&mut out, &mut first, |o| {
                    o.push_str("{\"t\":\"pi\",\"v\":\"");
                    json_escape(o, &text);
                    o.push_str("\"}");
                });
            }
            Ok(Event::DocType(bd)) => {
                let text = String::from_utf8_lossy(bd.as_ref()).into_owned();
                push_event(&mut out, &mut first, |o| {
                    o.push_str("{\"t\":\"doctype\",\"v\":\"");
                    json_escape(o, &text);
                    o.push_str("\"}");
                });
            }
            Ok(Event::Decl(_)) => {}
            Ok(Event::Eof) => break,
            Err(e) => {
                if strict {
                    return Err(Error::from_reason(format!("xml parse error: {e}")));
                }
                break;
            }
        }
    }

    out.push(']');
    Ok(out)
}

// Rust unit tests intentionally omitted: exported #[napi] functions cannot
// be linked into a pure-Rust test binary. The vitest suite in
// __test__/index.spec.ts covers parsing behaviour.
