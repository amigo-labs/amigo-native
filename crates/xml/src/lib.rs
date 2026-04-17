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
) -> Result<Vec<XmlAttr>> {
    let mut out = Vec::new();
    let mut seen: HashMap<String, ()> = HashMap::new();
    for a in bs.attributes() {
        let a = a.map_err(|e| Error::from_reason(format!("attribute error: {e}")))?;
        let name = String::from_utf8_lossy(a.key.as_ref()).into_owned();
        if seen.contains_key(&name) {
            continue;
        }
        seen.insert(name.clone(), ());
        let value = a
            .decode_and_unescape_value(reader.decoder())
            .map_err(|e| Error::from_reason(format!("attribute value error: {e}")))?
            .into_owned();
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
                let attrs = decode_attrs(&reader, &bs)?;
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
                let attrs = decode_attrs(&reader, &bs)?;
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
                let text = bt
                    .unescape()
                    .map_err(|e| Error::from_reason(format!("text decode error: {e}")))?
                    .into_owned();
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
                return Err(Error::from_reason(format!("xml parse error: {e}")));
            }
        }
    }

    Ok(out)
}

// Rust unit tests intentionally omitted: exported #[napi] functions cannot
// be linked into a pure-Rust test binary. The vitest suite in
// __test__/index.spec.ts covers parsing behaviour.
