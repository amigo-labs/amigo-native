use encoding_rs::Encoding;
use napi::bindgen_prelude::*;
use napi_derive::napi;

// Legacy iconv-lite aliases that encoding_rs doesn't resolve out of the box.
// Pre-mapped to WHATWG-standard labels encoding_rs recognises.
const ICONV_ALIASES: &[(&str, &str)] = &[
    ("latin0", "iso-8859-15"),
    ("latin9", "iso-8859-15"),
    ("iso88591", "iso-8859-1"),
    ("iso88592", "iso-8859-2"),
    ("iso88593", "iso-8859-3"),
    ("iso88594", "iso-8859-4"),
    ("iso88595", "iso-8859-5"),
    ("iso88596", "iso-8859-6"),
    ("iso88597", "iso-8859-7"),
    ("iso88598", "iso-8859-8"),
    ("iso88599", "windows-1254"),
    ("iso885910", "iso-8859-10"),
    ("iso885913", "iso-8859-13"),
    ("iso885914", "iso-8859-14"),
    ("iso885915", "iso-8859-15"),
    ("iso885916", "iso-8859-16"),
    ("utf8", "utf-8"),
    ("utf16", "utf-16le"),
    ("utf16le", "utf-16le"),
    ("utf16be", "utf-16be"),
    ("ucs2", "utf-16le"),
    ("ucs-2", "utf-16le"),
    ("ascii", "windows-1252"),
    ("cp932", "shift_jis"),
    ("cp936", "gbk"),
    ("cp949", "euc-kr"),
    ("cp950", "big5"),
    ("cp1250", "windows-1250"),
    ("cp1251", "windows-1251"),
    ("cp1252", "windows-1252"),
    ("cp1253", "windows-1253"),
    ("cp1254", "windows-1254"),
    ("cp1255", "windows-1255"),
    ("cp1256", "windows-1256"),
    ("cp1257", "windows-1257"),
    ("cp1258", "windows-1258"),
];

fn normalise_label(label: &str) -> String {
    // iconv-lite lowercase + strip dashes/underscores for alias lookup
    let norm = label.to_ascii_lowercase().replace(['_', '-'], "");
    if let Some((_, canonical)) = ICONV_ALIASES.iter().find(|(k, _)| *k == norm) {
        return canonical.to_string();
    }
    label.to_string()
}

fn lookup(label: &str) -> Option<&'static Encoding> {
    let mapped = normalise_label(label);
    Encoding::for_label(mapped.as_bytes())
}

#[napi]
pub fn encoding_exists(encoding: String) -> bool {
    lookup(&encoding).is_some()
}

#[napi]
pub fn encode(input: String, encoding: String) -> Result<Buffer> {
    let enc = lookup(&encoding)
        .ok_or_else(|| Error::from_reason(format!("unknown encoding: {encoding}")))?;
    let (out, _, _) = enc.encode(&input);
    Ok(out.into_owned().into())
}

#[napi]
pub fn decode(input: Buffer, encoding: String) -> Result<String> {
    let enc = lookup(&encoding)
        .ok_or_else(|| Error::from_reason(format!("unknown encoding: {encoding}")))?;
    let (out, _, _) = enc.decode(&input);
    Ok(out.into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lookup_basic_encodings() {
        assert!(lookup("utf-8").is_some());
        assert!(lookup("utf8").is_some());
        assert!(lookup("UTF-8").is_some());
        assert!(lookup("latin1").is_some());
        assert!(lookup("shift_jis").is_some());
        assert!(lookup("cp932").is_some());
        assert!(lookup("gbk").is_some());
    }

    #[test]
    fn roundtrip_utf8() {
        let enc = lookup("utf-8").unwrap();
        let (out, _, _) = enc.encode("hëllo");
        let (dec, _, _) = enc.decode(&out);
        assert_eq!(dec, "hëllo");
    }

    #[test]
    fn roundtrip_windows_1252() {
        let enc = lookup("windows-1252").unwrap();
        let (out, _, _) = enc.encode("café");
        let (dec, _, _) = enc.decode(&out);
        assert_eq!(dec, "café");
    }

    #[test]
    fn unknown_encoding_none() {
        assert!(lookup("totally-not-real").is_none());
    }
}
