//! Sentence Boundary Detection (SBD). Rule-based engine combining an
//! abbreviation table, quote/ellipsis/decimal handling, and optional
//! newline-paragraph boundaries. Multi-language via per-language
//! abbreviation tables.
//!
//! Internal shared crate; the public API is exposed by
//! `crates/sentences/` (napi) and `crates/sentences/wasm/` (WASM).

mod abbreviations;

#[derive(Default, Debug, Clone)]
pub struct SplitOptions {
    pub language: Option<String>,
    pub newline_boundaries: Option<bool>,
    pub preserve_whitespace: Option<bool>,
    pub custom_abbreviations: Option<Vec<String>>,
}

#[derive(Debug, Clone)]
pub struct Resolved {
    pub language: String,
    pub newline_boundaries: bool,
    pub preserve_whitespace: bool,
    pub custom_abbrevs: Vec<String>,
}

impl Resolved {
    pub fn from_opts(opts: Option<&SplitOptions>) -> Self {
        let default_lang = "en".to_string();
        match opts {
            Some(o) => Self {
                language: o.language.clone().unwrap_or(default_lang),
                newline_boundaries: o.newline_boundaries.unwrap_or(false),
                preserve_whitespace: o.preserve_whitespace.unwrap_or(false),
                custom_abbrevs: o.custom_abbreviations.clone().unwrap_or_default(),
            },
            None => Self {
                language: default_lang,
                newline_boundaries: false,
                preserve_whitespace: false,
                custom_abbrevs: Vec::new(),
            },
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Span {
    pub start: u32,
    pub end: u32,
}

pub fn find_spans(text: &str, cfg: &Resolved) -> Vec<Span> {
    let bytes = text.as_bytes();
    let abbrevs = abbreviations::for_language(&cfg.language);

    let mut abbrev_set: Vec<String> = abbrevs.iter().map(|s| s.to_ascii_lowercase()).collect();
    for extra in &cfg.custom_abbrevs {
        abbrev_set.push(extra.to_ascii_lowercase());
    }
    abbrev_set.sort();
    abbrev_set.dedup();

    let mut spans: Vec<Span> = Vec::new();
    let mut sentence_start: usize = 0;
    let mut i: usize = 0;
    let mut quote_depth: i32 = 0;
    let mut paren_depth: i32 = 0;

    while i < bytes.len() {
        let b = bytes[i];

        match b {
            b'"' => quote_depth = 1 - quote_depth,
            b'(' | b'[' | b'{' => paren_depth += 1,
            b')' | b']' | b'}' => paren_depth = (paren_depth - 1).max(0),
            _ => {}
        }

        let is_terminator = b == b'.' || b == b'!' || b == b'?';
        if is_terminator {
            if b == b'.' && is_part_of_ellipsis(bytes, i) {
                while i < bytes.len() && bytes[i] == b'.' {
                    i += 1;
                }
                if let Some(boundary_end) =
                    check_boundary_after(bytes, i, quote_depth, paren_depth, cfg)
                {
                    emit(&mut spans, &mut sentence_start, boundary_end, text, cfg);
                    i = boundary_end;
                    continue;
                }
                continue;
            }

            if b == b'.' && is_decimal_dot(bytes, i) {
                i += 1;
                continue;
            }

            if b == b'.' && ends_with_abbreviation(bytes, i, &abbrev_set) {
                i += 1;
                continue;
            }

            let mut j = i + 1;
            while j < bytes.len() && (bytes[j] == b'!' || bytes[j] == b'?') {
                j += 1;
            }
            while j < bytes.len()
                && (bytes[j] == b'"' || bytes[j] == b')' || bytes[j] == b']' || bytes[j] == b'}')
            {
                if bytes[j] == b'"' {
                    quote_depth = 1 - quote_depth;
                }
                if matches!(bytes[j], b')' | b']' | b'}') {
                    paren_depth = (paren_depth - 1).max(0);
                }
                j += 1;
            }

            if is_sentence_start_after(bytes, j) && quote_depth == 0 && paren_depth == 0 {
                emit(&mut spans, &mut sentence_start, j, text, cfg);
                i = j;
                continue;
            }
            i = j;
            continue;
        }

        if cfg.newline_boundaries && b == b'\n' && i + 1 < bytes.len() && bytes[i + 1] == b'\n' {
            let end = i + 2;
            emit(&mut spans, &mut sentence_start, end, text, cfg);
            i = end;
            continue;
        }

        i += 1;
    }

    if sentence_start < bytes.len() {
        emit(&mut spans, &mut sentence_start, bytes.len(), text, cfg);
    }

    spans
}

fn is_part_of_ellipsis(bytes: &[u8], i: usize) -> bool {
    let next_is_dot = i + 1 < bytes.len() && bytes[i + 1] == b'.';
    let prev_is_dot = i > 0 && bytes[i - 1] == b'.';
    next_is_dot || prev_is_dot
}

fn is_decimal_dot(bytes: &[u8], i: usize) -> bool {
    let prev = if i > 0 { bytes[i - 1] } else { 0 };
    let next = if i + 1 < bytes.len() { bytes[i + 1] } else { 0 };
    prev.is_ascii_digit() && next.is_ascii_digit()
}

fn ends_with_abbreviation(bytes: &[u8], dot_idx: usize, abbrevs: &[String]) -> bool {
    let mut start = dot_idx;
    while start > 0 {
        let b = bytes[start - 1];
        if b.is_ascii_alphanumeric() || b == b'\'' {
            start -= 1;
        } else {
            break;
        }
    }
    if start == dot_idx {
        return false;
    }
    let token = &bytes[start..dot_idx];
    let token_str = std::str::from_utf8(token).unwrap_or("");
    let token_lower = token_str.to_ascii_lowercase();

    if token.len() == 1 && token[0].is_ascii_alphabetic() {
        return true;
    }

    abbrevs.binary_search(&token_lower).is_ok()
}

fn is_sentence_start_after(bytes: &[u8], from: usize) -> bool {
    let mut j = from;
    while j < bytes.len() && (bytes[j] == b' ' || bytes[j] == b'\t' || bytes[j] == b'\n') {
        j += 1;
    }
    if j >= bytes.len() {
        return true;
    }
    let b = bytes[j];
    b.is_ascii_uppercase()
        || b.is_ascii_digit()
        || b == b'"'
        || b == b'\''
        || b == b'('
        || b == b'['
        || b == b'{'
        || b >= 0x80
}

fn check_boundary_after(
    bytes: &[u8],
    from: usize,
    quote_depth: i32,
    paren_depth: i32,
    _cfg: &Resolved,
) -> Option<usize> {
    if quote_depth != 0 || paren_depth != 0 {
        return None;
    }
    if is_sentence_start_after(bytes, from) {
        Some(from)
    } else {
        None
    }
}

fn emit(spans: &mut Vec<Span>, sentence_start: &mut usize, end: usize, text: &str, cfg: &Resolved) {
    if end <= *sentence_start {
        return;
    }
    let mut s = *sentence_start;
    let mut e = end;
    if !cfg.preserve_whitespace {
        let bytes = text.as_bytes();
        while s < e && bytes[s].is_ascii_whitespace() {
            s += 1;
        }
        while e > s && bytes[e - 1].is_ascii_whitespace() {
            e -= 1;
        }
    }
    if e > s {
        spans.push(Span {
            start: s as u32,
            end: e as u32,
        });
    }
    *sentence_start = end;
}

pub fn split(text: &str, cfg: &Resolved) -> Vec<String> {
    find_spans(text, cfg)
        .into_iter()
        .map(|s| text[s.start as usize..s.end as usize].to_string())
        .collect()
}

pub fn split_to_offsets(text: &str, cfg: &Resolved) -> Vec<u8> {
    let spans = find_spans(text, cfg);
    let mut out: Vec<u8> = Vec::with_capacity(spans.len() * 8);
    for s in spans {
        out.extend_from_slice(&s.start.to_le_bytes());
        out.extend_from_slice(&s.end.to_le_bytes());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg() -> Resolved {
        Resolved::from_opts(None)
    }

    #[test]
    fn splits_simple_sentences() {
        let out = split("Hello world. How are you? I am fine.", &cfg());
        assert_eq!(out.len(), 3);
    }

    #[test]
    fn handles_abbreviation() {
        let out = split("Dr. Smith arrived. He waved.", &cfg());
        assert_eq!(out.len(), 2);
    }

    #[test]
    fn offsets_are_byte_aligned() {
        let buf = split_to_offsets("Hi. Bye.", &cfg());
        // two sentences -> 2 * (4 + 4) = 16 bytes
        assert_eq!(buf.len(), 16);
    }
}
