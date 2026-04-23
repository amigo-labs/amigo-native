//! Text diff via the `similar` crate. Offers the jsdiff-compatible hunk-array
//! shape (`diffLines` etc.) plus an offset-packed Green-path (`diffLinesToOffsets`)
//! that amortises Vec<String> marshalling for hot loops.

use napi::bindgen_prelude::*;
use napi_derive::napi;
use similar::{ChangeTag, TextDiff};

#[napi(object)]
pub struct Hunk {
    pub value: String,
    pub added: Option<bool>,
    pub removed: Option<bool>,
}

fn tag_to_flags(tag: ChangeTag) -> (Option<bool>, Option<bool>) {
    match tag {
        ChangeTag::Insert => (Some(true), None),
        ChangeTag::Delete => (None, Some(true)),
        ChangeTag::Equal => (None, None),
    }
}

/// Merge consecutive changes of the same tag into one hunk — jsdiff's
/// output format groups by change type, whereas `similar` emits one
/// change per element.
fn coalesce_hunks(raw: Vec<(ChangeTag, String)>) -> Vec<Hunk> {
    let mut out: Vec<Hunk> = Vec::with_capacity(raw.len());
    for (tag, value) in raw {
        match out.last_mut() {
            Some(last) if same_tag(last, tag) => {
                last.value.push_str(&value);
            }
            _ => {
                let (added, removed) = tag_to_flags(tag);
                out.push(Hunk {
                    value,
                    added,
                    removed,
                });
            }
        }
    }
    out
}

fn same_tag(h: &Hunk, tag: ChangeTag) -> bool {
    match tag {
        ChangeTag::Insert => h.added.unwrap_or(false),
        ChangeTag::Delete => h.removed.unwrap_or(false),
        ChangeTag::Equal => !h.added.unwrap_or(false) && !h.removed.unwrap_or(false),
    }
}

fn diff_chars_impl(a: &str, b: &str) -> Vec<(ChangeTag, String)> {
    let diff = TextDiff::from_chars(a, b);
    diff.iter_all_changes()
        .map(|c| (c.tag(), c.value().to_string()))
        .collect()
}

fn diff_words_impl(a: &str, b: &str) -> Vec<(ChangeTag, String)> {
    let diff = TextDiff::from_words(a, b);
    diff.iter_all_changes()
        .map(|c| (c.tag(), c.value().to_string()))
        .collect()
}

fn diff_lines_impl(a: &str, b: &str) -> Vec<(ChangeTag, String)> {
    let diff = TextDiff::from_lines(a, b);
    diff.iter_all_changes()
        .map(|c| (c.tag(), c.value().to_string()))
        .collect()
}

/// Char-level diff. Output: jsdiff-compatible hunk array.
#[napi(js_name = "diffChars")]
pub fn diff_chars(old_str: String, new_str: String) -> Vec<Hunk> {
    coalesce_hunks(diff_chars_impl(&old_str, &new_str))
}

/// Word-level diff.
#[napi(js_name = "diffWords")]
pub fn diff_words(old_str: String, new_str: String) -> Vec<Hunk> {
    coalesce_hunks(diff_words_impl(&old_str, &new_str))
}

/// Line-level diff — the most common shape for code-review tooling.
#[napi(js_name = "diffLines")]
pub fn diff_lines(old_str: String, new_str: String) -> Vec<Hunk> {
    coalesce_hunks(diff_lines_impl(&old_str, &new_str))
}

/// Line diff that trims trailing whitespace — mirrors `diffTrimmedLines`
/// from jsdiff by preprocessing inputs.
#[napi(js_name = "diffTrimmedLines")]
pub fn diff_trimmed_lines(old_str: String, new_str: String) -> Vec<Hunk> {
    let trim = |s: &str| -> String {
        s.lines()
            .map(|l| l.trim_end())
            .collect::<Vec<_>>()
            .join("\n")
    };
    coalesce_hunks(diff_lines_impl(&trim(&old_str), &trim(&new_str)))
}

/// Offset-packed line diff. Returns a Uint32Array laid out as
/// `[type, oldStart, oldEnd, newStart, newEnd, …]` where `type` is
/// `0 = equal`, `1 = added`, `2 = removed`. Caller slices the source
/// strings lazily — no per-hunk JS-string marshalling.
///
/// This is the Green hot-path for large or char-level diffs where the
/// hunk-array shape drowns in Vec<String> allocation.
#[napi(js_name = "diffLinesToOffsets")]
pub fn diff_lines_to_offsets(old_str: String, new_str: String) -> Buffer {
    build_offsets(
        TextDiff::from_lines(&old_str, &new_str)
            .iter_all_changes()
            .map(|c| (c.tag(), c.value().len())),
    )
}

/// Offset-packed char diff. Same layout as `diffLinesToOffsets`.
#[napi(js_name = "diffCharsToOffsets")]
pub fn diff_chars_to_offsets(old_str: String, new_str: String) -> Buffer {
    build_offsets(
        TextDiff::from_chars(&old_str, &new_str)
            .iter_all_changes()
            .map(|c| (c.tag(), c.value().len())),
    )
}

/// Shared builder for the offset-packed layout. Each entry is 5 × u32.
fn build_offsets<I: Iterator<Item = (ChangeTag, usize)>>(iter: I) -> Buffer {
    let mut out: Vec<u8> = Vec::new();
    let mut old_pos: u32 = 0;
    let mut new_pos: u32 = 0;
    let mut run_tag: Option<u8> = None;
    let mut run_old_start: u32 = 0;
    let mut run_new_start: u32 = 0;

    let flush =
        |buf: &mut Vec<u8>, tag: u8, old_start: u32, old_end: u32, new_start: u32, new_end: u32| {
            buf.extend_from_slice(&(tag as u32).to_le_bytes());
            buf.extend_from_slice(&old_start.to_le_bytes());
            buf.extend_from_slice(&old_end.to_le_bytes());
            buf.extend_from_slice(&new_start.to_le_bytes());
            buf.extend_from_slice(&new_end.to_le_bytes());
        };

    for (tag, len) in iter {
        let tag_byte: u8 = match tag {
            ChangeTag::Equal => 0,
            ChangeTag::Insert => 1,
            ChangeTag::Delete => 2,
        };
        let adv_old = !matches!(tag, ChangeTag::Insert);
        let adv_new = !matches!(tag, ChangeTag::Delete);

        if run_tag != Some(tag_byte) {
            if let Some(prev_tag) = run_tag {
                flush(
                    &mut out,
                    prev_tag,
                    run_old_start,
                    old_pos,
                    run_new_start,
                    new_pos,
                );
            }
            run_tag = Some(tag_byte);
            run_old_start = old_pos;
            run_new_start = new_pos;
        }

        if adv_old {
            old_pos += len as u32;
        }
        if adv_new {
            new_pos += len as u32;
        }
    }

    if let Some(prev_tag) = run_tag {
        flush(
            &mut out,
            prev_tag,
            run_old_start,
            old_pos,
            run_new_start,
            new_pos,
        );
    }

    out.into()
}

/// Unified-diff-format patch string.
#[napi(js_name = "createPatch")]
pub fn create_patch(
    file_name: String,
    old_str: String,
    new_str: String,
    old_header: Option<String>,
    new_header: Option<String>,
) -> String {
    let diff = TextDiff::from_lines(&old_str, &new_str);
    let old_h = old_header.unwrap_or_else(|| file_name.clone());
    let new_h = new_header.unwrap_or_else(|| file_name.clone());
    let mut unified = diff.unified_diff();
    unified.context_radius(3).header(&old_h, &new_h).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diff_lines_basic() {
        let a = "alpha\nbeta\ngamma\n";
        let b = "alpha\nBETA\ngamma\n";
        let hunks = diff_lines(a.to_string(), b.to_string());
        let has_added = hunks.iter().any(|h| h.added.unwrap_or(false));
        let has_removed = hunks.iter().any(|h| h.removed.unwrap_or(false));
        assert!(has_added);
        assert!(has_removed);
    }

    #[test]
    fn diff_lines_identity() {
        let same = "hello\nworld\n";
        let hunks = diff_lines(same.to_string(), same.to_string());
        assert!(
            hunks
                .iter()
                .all(|h| h.added.is_none() && h.removed.is_none())
        );
    }

    #[test]
    fn diff_chars_detects_insertion() {
        let hunks = diff_chars("cat".to_string(), "cats".to_string());
        assert!(hunks.iter().any(|h| h.added.unwrap_or(false)));
    }

    #[test]
    fn diff_lines_to_offsets_is_multiple_of_twenty_bytes() {
        let a = "alpha\nbeta\ngamma\n";
        let b = "alpha\nBETA\ngamma\n";
        let buf = diff_lines_to_offsets(a.to_string(), b.to_string());
        assert_eq!(buf.len() % 20, 0); // 5 × u32 per entry
        assert!(!buf.is_empty());
    }

    #[test]
    fn diff_trimmed_lines_ignores_trailing_whitespace() {
        let hunks =
            diff_trimmed_lines("hello  \nworld\n".to_string(), "hello\nworld\n".to_string());
        assert!(
            hunks
                .iter()
                .all(|h| h.added.is_none() && h.removed.is_none())
        );
    }
}
