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

#[derive(Clone, Copy, PartialEq, Eq)]
enum NonWhatwg {
    Utf16Le,
    Utf16Be,
    Latin1Strict,
    Windows1252Strict,
}

fn classify(label: &str) -> Option<NonWhatwg> {
    // encoding_rs is WHATWG-compliant: it encodes all UTF-16 variants as UTF-8
    // (web-form behaviour) and aliases `latin1` to `windows-1252`. iconv-lite,
    // however, treats UTF-16LE/BE as raw byte orderings, `latin1` as strict
    // ISO-8859-1, and encodes windows-1252 per UTF-16 code unit with `?` as
    // the unmappable replacement (vs encoding_rs's `&#NNN;` HTML-entity form).
    // We match the iconv-lite semantics for parity.
    let norm = label.to_ascii_lowercase().replace(['_', '-'], "");
    match norm.as_str() {
        "utf16" | "utf16le" | "ucs2" => Some(NonWhatwg::Utf16Le),
        "utf16be" => Some(NonWhatwg::Utf16Be),
        "latin1" | "iso88591" => Some(NonWhatwg::Latin1Strict),
        "windows1252" | "cp1252" => Some(NonWhatwg::Windows1252Strict),
        _ => None,
    }
}

fn encode_utf16_le(input: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(input.len() * 2);
    for unit in input.encode_utf16() {
        out.extend_from_slice(&unit.to_le_bytes());
    }
    out
}

fn encode_utf16_be(input: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(input.len() * 2);
    for unit in input.encode_utf16() {
        out.extend_from_slice(&unit.to_be_bytes());
    }
    out
}

/// Decode a stream of UTF-16 code units (delivered as a byte slice with a
/// per-pair `unit_at` accessor) into UTF-8 with a single pre-allocated
/// byte buffer. Replaces the previous `char::decode_utf16().collect()`
/// iterator pipeline, which paid the cost of a `String::push(char)` —
/// reallocation + per-char UTF-8 encoding branch — for every single
/// code unit.
#[inline]
fn decode_utf16_inner<F>(input: &[u8], unit_at: F) -> String
where
    F: Fn(&[u8], usize) -> u16,
{
    let n = input.len() / 2;
    // 3 × n covers every BMP code point; surrogate pairs widen 2 code
    // units into 4 bytes (avg 2). Worst-case extra reallocation is rare.
    let mut out: Vec<u8> = Vec::with_capacity(n * 3);
    let mut i = 0;
    while i < n {
        let unit = unit_at(input, i);
        match unit {
            0x0000..=0x007F => {
                out.push(unit as u8);
            }
            0x0080..=0x07FF => {
                out.push(0xC0 | (unit >> 6) as u8);
                out.push(0x80 | (unit & 0x3F) as u8);
            }
            0xD800..=0xDBFF => {
                // High surrogate — must pair with a low surrogate.
                if i + 1 < n {
                    let next = unit_at(input, i + 1);
                    if (0xDC00..=0xDFFF).contains(&next) {
                        let cp = 0x10000
                            + (((unit - 0xD800) as u32) << 10)
                            + (next - 0xDC00) as u32;
                        out.push(0xF0 | (cp >> 18) as u8);
                        out.push(0x80 | ((cp >> 12) & 0x3F) as u8);
                        out.push(0x80 | ((cp >> 6) & 0x3F) as u8);
                        out.push(0x80 | (cp & 0x3F) as u8);
                        i += 2;
                        continue;
                    }
                }
                // Unpaired high surrogate → U+FFFD.
                out.extend_from_slice(&[0xEF, 0xBF, 0xBD]);
            }
            0xDC00..=0xDFFF => {
                // Unpaired low surrogate → U+FFFD.
                out.extend_from_slice(&[0xEF, 0xBF, 0xBD]);
            }
            _ => {
                // 0x0800..=0xFFFF (excluding surrogate range) → 3-byte UTF-8.
                out.push(0xE0 | (unit >> 12) as u8);
                out.push(0x80 | ((unit >> 6) & 0x3F) as u8);
                out.push(0x80 | (unit & 0x3F) as u8);
            }
        }
        i += 1;
    }
    // SAFETY: every branch above emits a valid UTF-8 byte sequence for
    // the decoded code point (including U+FFFD for unpaired surrogates).
    unsafe { String::from_utf8_unchecked(out) }
}

#[inline]
fn decode_utf16_le(input: &[u8]) -> String {
    decode_utf16_inner(input, |buf, i| {
        u16::from_le_bytes([buf[i * 2], buf[i * 2 + 1]])
    })
}

#[inline]
fn decode_utf16_be(input: &[u8]) -> String {
    decode_utf16_inner(input, |buf, i| {
        u16::from_be_bytes([buf[i * 2], buf[i * 2 + 1]])
    })
}

fn encode_latin1_strict(input: &str) -> Vec<u8> {
    // iconv-lite encodes per UTF-16 code unit, not per code point. Each
    // surrogate in an astral-plane char (e.g. 🌍 = D83C DF0D) maps to its
    // own '?' byte, yielding two bytes per emoji rather than one.
    input
        .encode_utf16()
        .map(|u| if u < 0x100 { u as u8 } else { b'?' })
        .collect()
}

fn decode_latin1_strict(input: &[u8]) -> String {
    // Every byte is a valid U+0000..U+00FF code point. Bytes < 0x80 are
    // 1-byte UTF-8 (ASCII); bytes 0x80..=0xFF expand to a 2-byte UTF-8
    // sequence (0xC2/0xC3 prefix + continuation). Pre-allocate for the
    // worst case (pure 0x80+ input = 2× length) and write bytes directly
    // — faster than `iter().map().collect::<String>()` which hit one
    // `push(char)` per byte plus repeated capacity doublings.
    let mut out: Vec<u8> = Vec::with_capacity(input.len() * 2);
    for &b in input {
        if b < 0x80 {
            out.push(b);
        } else {
            out.push(0xC0 | (b >> 6));
            out.push(0x80 | (b & 0x3F));
        }
    }
    // SAFETY: all emitted bytes are a valid UTF-8 encoding of a code
    // point in U+0000..U+00FF.
    unsafe { String::from_utf8_unchecked(out) }
}

fn encode_windows_1252_strict(input: &str) -> Vec<u8> {
    // Per-UTF-16-code-unit encoding matching iconv-lite. encoding_rs's default
    // encode() emits `&#NNN;` HTML entities for unmappable chars (web-form
    // behaviour); iconv-lite uses a single '?' byte per unmappable code unit.
    // Table: WHATWG windows-1252 index (https://encoding.spec.whatwg.org/index-windows-1252.txt).
    input
        .encode_utf16()
        .map(|u| match u {
            0x0000..=0x007F | 0x00A0..=0x00FF => u as u8,
            // Undefined positions roundtrip through the matching C1 control char.
            0x0081 => 0x81,
            0x008D => 0x8D,
            0x008F => 0x8F,
            0x0090 => 0x90,
            0x009D => 0x9D,
            0x20AC => 0x80,
            0x201A => 0x82,
            0x0192 => 0x83,
            0x201E => 0x84,
            0x2026 => 0x85,
            0x2020 => 0x86,
            0x2021 => 0x87,
            0x02C6 => 0x88,
            0x2030 => 0x89,
            0x0160 => 0x8A,
            0x2039 => 0x8B,
            0x0152 => 0x8C,
            0x017D => 0x8E,
            0x2018 => 0x91,
            0x2019 => 0x92,
            0x201C => 0x93,
            0x201D => 0x94,
            0x2022 => 0x95,
            0x2013 => 0x96,
            0x2014 => 0x97,
            0x02DC => 0x98,
            0x2122 => 0x99,
            0x0161 => 0x9A,
            0x203A => 0x9B,
            0x0153 => 0x9C,
            0x017E => 0x9E,
            0x0178 => 0x9F,
            _ => b'?',
        })
        .collect()
}

fn decode_windows_1252_strict(input: &[u8]) -> String {
    input
        .iter()
        .map(|&b| match b {
            0x80 => '\u{20AC}',
            0x82 => '\u{201A}',
            0x83 => '\u{0192}',
            0x84 => '\u{201E}',
            0x85 => '\u{2026}',
            0x86 => '\u{2020}',
            0x87 => '\u{2021}',
            0x88 => '\u{02C6}',
            0x89 => '\u{2030}',
            0x8A => '\u{0160}',
            0x8B => '\u{2039}',
            0x8C => '\u{0152}',
            0x8E => '\u{017D}',
            0x91 => '\u{2018}',
            0x92 => '\u{2019}',
            0x93 => '\u{201C}',
            0x94 => '\u{201D}',
            0x95 => '\u{2022}',
            0x96 => '\u{2013}',
            0x97 => '\u{2014}',
            0x98 => '\u{02DC}',
            0x99 => '\u{2122}',
            0x9A => '\u{0161}',
            0x9B => '\u{203A}',
            0x9C => '\u{0153}',
            0x9E => '\u{017E}',
            0x9F => '\u{0178}',
            _ => b as char,
        })
        .collect()
}

fn lookup(label: &str) -> Option<&'static Encoding> {
    let mapped = normalise_label(label);
    Encoding::for_label(mapped.as_bytes())
}

/// Cheap UTF-8 label detector — matches the canonical spelling plus the
/// `utf8` alias. Covers the hot path without paying for the heap-alloc
/// dance that `normalise_label` does.
#[inline]
fn is_utf8_label(label: &str) -> bool {
    label.eq_ignore_ascii_case("utf-8") || label.eq_ignore_ascii_case("utf8")
}

#[napi]
pub fn encoding_exists(encoding: String) -> bool {
    classify(&encoding).is_some() || lookup(&encoding).is_some()
}

#[napi]
pub fn encode(input: String, encoding: String) -> Result<Buffer> {
    // UTF-8 short-circuit: NAPI already delivered `input` as a UTF-8
    // `String`, so the encoded bytes are literally its internal buffer.
    // Moving them out avoids the redundant `enc.encode` No-Op plus the
    // `into_owned()` copy that `encoding_rs` would otherwise perform on
    // the borrowed Cow.
    if is_utf8_label(&encoding) {
        return Ok(input.into_bytes().into());
    }
    if let Some(kind) = classify(&encoding) {
        let bytes = match kind {
            NonWhatwg::Utf16Le => encode_utf16_le(&input),
            NonWhatwg::Utf16Be => encode_utf16_be(&input),
            NonWhatwg::Latin1Strict => encode_latin1_strict(&input),
            NonWhatwg::Windows1252Strict => encode_windows_1252_strict(&input),
        };
        return Ok(bytes.into());
    }
    let enc = lookup(&encoding)
        .ok_or_else(|| Error::from_reason(format!("unknown encoding: {encoding}")))?;
    let (out, _, _) = enc.encode(&input);
    Ok(out.into_owned().into())
}

#[napi]
pub fn decode(input: Buffer, encoding: String) -> Result<String> {
    // UTF-8 short-circuit: single validation pass + single copy into a
    // `String`. `encoding_rs::UTF_8.decode` does the same work with a
    // `Cow::Borrowed` indirection that adds no value once we copy.
    if is_utf8_label(&encoding) {
        return Ok(match std::str::from_utf8(&input) {
            Ok(s) => s.to_owned(),
            Err(_) => String::from_utf8_lossy(&input).into_owned(),
        });
    }
    if let Some(kind) = classify(&encoding) {
        let s = match kind {
            NonWhatwg::Utf16Le => decode_utf16_le(&input),
            NonWhatwg::Utf16Be => decode_utf16_be(&input),
            NonWhatwg::Latin1Strict => decode_latin1_strict(&input),
            NonWhatwg::Windows1252Strict => decode_windows_1252_strict(&input),
        };
        return Ok(s);
    }
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
