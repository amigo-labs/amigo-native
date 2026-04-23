//! Sentence Boundary Detection (SBD). Rule-based — abbreviation table
//! + quote/ellipsis/decimal handling + optional newline-boundaries.
//! Multi-language via per-language abbreviation tables.
//!
//! Two output shapes: `split(text) → string[]` (compat form) and
//! `splitToOffsets(text) → Buffer` (Uint32-packed byte offsets —
//! the Green hot-path). See `docs/perf-review/sbd.md`.

use napi::bindgen_prelude::*;
use napi_derive::napi;

mod abbreviations;

#[napi(object)]
#[derive(Clone)]
pub struct SplitOptions {
    /// Language code. Default: "en". Supported: en, de, fr, es, it, pt, nl.
    pub language: Option<String>,
    /// Treat `\n\n` as a hard sentence boundary. Default: false.
    pub newline_boundaries: Option<bool>,
    /// Keep leading/trailing whitespace on each emitted sentence.
    /// Default: false — sentences are trimmed.
    pub preserve_whitespace: Option<bool>,
    /// Additional abbreviations to recognise (without trailing period).
    pub custom_abbreviations: Option<Vec<String>>,
}

struct Resolved {
    language: String,
    newline_boundaries: bool,
    preserve_whitespace: bool,
    custom_abbrevs: Vec<String>,
}

impl Resolved {
    fn from_opts(opts: Option<&SplitOptions>) -> Self {
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
struct Span {
    start: u32,
    end: u32,
}

/// Find all sentence boundaries in `text`. Returns byte-offset spans.
fn find_spans(text: &str, cfg: &Resolved) -> Vec<Span> {
    let bytes = text.as_bytes();
    let abbrevs = abbreviations::for_language(&cfg.language);

    // Pre-compute lower-case versions for abbreviation lookup.
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

        // Track quote / paren balance so we don't split mid-quote.
        match b {
            b'"' => {
                // Naive quote toggle. Doesn't track open vs. close curly
                // quotes (those are multi-byte, handled below).
                quote_depth = 1 - quote_depth;
            }
            b'(' | b'[' | b'{' => paren_depth += 1,
            b')' | b']' | b'}' => paren_depth = (paren_depth - 1).max(0),
            _ => {}
        }

        let is_terminator = b == b'.' || b == b'!' || b == b'?';
        if is_terminator {
            // Skip ellipsis — "..." is not a boundary per se, but the
            // last `.` may or may not be one depending on what follows.
            if b == b'.' && is_part_of_ellipsis(bytes, i) {
                // Move to end of ellipsis run, then decide based on
                // what comes next.
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

            // Skip decimal 3.14 pattern: digit . digit
            if b == b'.' && is_decimal_dot(bytes, i) {
                i += 1;
                continue;
            }

            // Check abbreviations: scan backward for the token ending
            // at this dot and see if it matches any abbreviation.
            if b == b'.' && ends_with_abbreviation(bytes, i, &abbrev_set) {
                i += 1;
                continue;
            }

            // Advance past terminator + any additional `!` or `?` runs
            // and closing quote/paren.
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

            // Is the next non-space character an uppercase / digit /
            // quote-open (i.e. plausibly a new sentence)?
            if is_sentence_start_after(bytes, j) && quote_depth == 0 && paren_depth == 0 {
                emit(&mut spans, &mut sentence_start, j, text, cfg);
                i = j;
                continue;
            }
            i = j;
            continue;
        }

        // Newline boundary (optional).
        if cfg.newline_boundaries && b == b'\n' {
            // `\n\n` is a hard break.
            if i + 1 < bytes.len() && bytes[i + 1] == b'\n' {
                let end = i + 2;
                emit(&mut spans, &mut sentence_start, end, text, cfg);
                i = end;
                continue;
            }
        }

        i += 1;
    }

    // Trailing text after last boundary.
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
    // Walk backward from dot to the start of the current token
    // (non-alphanumeric boundary).
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

    // Single-letter initials (A., B., …) are treated as abbreviations
    // — "Mr. A. Smith" shouldn't split on "A.".
    if token.len() == 1 && token[0].is_ascii_alphabetic() {
        return true;
    }

    abbrevs.binary_search(&token_lower).is_ok()
}

fn is_sentence_start_after(bytes: &[u8], from: usize) -> bool {
    // Find next non-space byte.
    let mut j = from;
    while j < bytes.len() && (bytes[j] == b' ' || bytes[j] == b'\t' || bytes[j] == b'\n') {
        j += 1;
    }
    if j >= bytes.len() {
        // End of input — treat as boundary.
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
        || b >= 0x80 // non-ASCII start byte — could be e.g. German capital Ä, accented letter
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

fn emit(
    spans: &mut Vec<Span>,
    sentence_start: &mut usize,
    end: usize,
    text: &str,
    cfg: &Resolved,
) {
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

#[napi(js_name = "split")]
pub fn split(text: String, options: Option<SplitOptions>) -> Vec<String> {
    let cfg = Resolved::from_opts(options.as_ref());
    let spans = find_spans(&text, &cfg);
    spans
        .into_iter()
        .map(|s| text[s.start as usize..s.end as usize].to_string())
        .collect()
}

/// Zero-copy hot-path. Returns a `Buffer` laid out as u32 little-endian
/// pairs: `[start0, end0, start1, end1, …]`. Caller slices the source
/// string lazily — no per-sentence string marshalling.
#[napi(js_name = "splitToOffsets")]
pub fn split_to_offsets(text: String, options: Option<SplitOptions>) -> Buffer {
    let cfg = Resolved::from_opts(options.as_ref());
    let spans = find_spans(&text, &cfg);
    let mut out: Vec<u8> = Vec::with_capacity(spans.len() * 8);
    for s in spans {
        out.extend_from_slice(&s.start.to_le_bytes());
        out.extend_from_slice(&s.end.to_le_bytes());
    }
    out.into()
}

#[napi(js_name = "splitBatch")]
pub fn split_batch(texts: Vec<String>, options: Option<SplitOptions>) -> Vec<Vec<String>> {
    let cfg = Resolved::from_opts(options.as_ref());
    texts
        .into_iter()
        .map(|t| {
            let spans = find_spans(&t, &cfg);
            spans
                .into_iter()
                .map(|s| t[s.start as usize..s.end as usize].to_string())
                .collect()
        })
        .collect()
}

#[napi(js_name = "splitBatchToOffsets")]
pub fn split_batch_to_offsets(
    texts: Vec<String>,
    options: Option<SplitOptions>,
) -> Vec<Buffer> {
    let cfg = Resolved::from_opts(options.as_ref());
    texts
        .into_iter()
        .map(|t| {
            let spans = find_spans(&t, &cfg);
            let mut out = Vec::with_capacity(spans.len() * 8);
            for s in spans {
                out.extend_from_slice(&s.start.to_le_bytes());
                out.extend_from_slice(&s.end.to_le_bytes());
            }
            out.into()
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sp(s: &str) -> Vec<String> {
        split(s.to_string(), None)
    }

    #[test]
    fn simple_two_sentences() {
        let out = sp("Hello world. How are you?");
        assert_eq!(out, vec!["Hello world.", "How are you?"]);
    }

    #[test]
    fn abbreviation_mr() {
        let out = sp("Mr. Smith went home. He was tired.");
        assert_eq!(out, vec!["Mr. Smith went home.", "He was tired."]);
    }

    #[test]
    fn decimal_is_preserved() {
        let out = sp("The value is 3.14 and the next value is 2.71.");
        assert_eq!(out.len(), 1);
    }

    #[test]
    fn ellipsis_then_capital() {
        let out = sp("He said... Go away.");
        assert_eq!(out.len(), 2);
    }

    #[test]
    fn exclamation() {
        let out = sp("Run! Now!");
        assert_eq!(out, vec!["Run!", "Now!"]);
    }

    #[test]
    fn empty_input() {
        let out = sp("");
        assert!(out.is_empty());
    }

    #[test]
    fn single_sentence_no_terminator() {
        let out = sp("no terminator here");
        assert_eq!(out, vec!["no terminator here"]);
    }

    #[test]
    fn offsets_are_paired_u32() {
        let buf = split_to_offsets("A. B.".to_string(), None);
        assert_eq!(buf.len() % 8, 0);
        assert!(buf.len() >= 16); // at least 2 sentences
    }

    #[test]
    fn preserve_whitespace() {
        let opts = SplitOptions {
            language: None,
            newline_boundaries: None,
            preserve_whitespace: Some(true),
            custom_abbreviations: None,
        };
        let out = split("A.  B.".to_string(), Some(opts));
        assert!(out[1].starts_with(' '));
    }

    #[test]
    fn newline_boundaries_option() {
        let opts = SplitOptions {
            language: None,
            newline_boundaries: Some(true),
            preserve_whitespace: None,
            custom_abbreviations: None,
        };
        let out = split("para one\n\npara two".to_string(), Some(opts));
        assert_eq!(out.len(), 2);
    }

    #[test]
    fn custom_abbreviation() {
        let opts = SplitOptions {
            language: None,
            newline_boundaries: None,
            preserve_whitespace: None,
            custom_abbreviations: Some(vec!["prof".to_string()]),
        };
        let out = split("Prof. Müller spoke.".to_string(), Some(opts));
        // Custom abbrev prevents split after "Prof."
        assert!(out.iter().any(|s| s.starts_with("Prof.")));
    }

    #[test]
    fn batch_split() {
        let out = split_batch(
            vec!["A. B.".to_string(), "C! D?".to_string()],
            None,
        );
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].len(), 2);
        assert_eq!(out[1].len(), 2);
    }

    #[test]
    fn question_followed_by_quote() {
        let out = sp("\"Why?\" she asked. He left.");
        assert_eq!(out.len(), 2);
    }
}
