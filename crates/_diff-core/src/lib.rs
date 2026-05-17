//! Shared text-diff logic. Internal-only crate; napi and WASM bindings
//! wrap these functions.
//!
//! Offset-packed layout is 5 × u32 LE per hunk:
//! `[type, oldStart, oldEnd, newStart, newEnd]`, where type
//! `0 = equal`, `1 = added`, `2 = removed`.

use similar::{ChangeTag, TextDiff};

#[derive(Debug, Clone)]
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
    TextDiff::from_chars(a, b)
        .iter_all_changes()
        .map(|c| (c.tag(), c.value().to_string()))
        .collect()
}

fn diff_words_impl(a: &str, b: &str) -> Vec<(ChangeTag, String)> {
    TextDiff::from_words(a, b)
        .iter_all_changes()
        .map(|c| (c.tag(), c.value().to_string()))
        .collect()
}

fn diff_lines_impl(a: &str, b: &str) -> Vec<(ChangeTag, String)> {
    TextDiff::from_lines(a, b)
        .iter_all_changes()
        .map(|c| (c.tag(), c.value().to_string()))
        .collect()
}

pub fn diff_chars(old_str: &str, new_str: &str) -> Vec<Hunk> {
    coalesce_hunks(diff_chars_impl(old_str, new_str))
}

pub fn diff_words(old_str: &str, new_str: &str) -> Vec<Hunk> {
    coalesce_hunks(diff_words_impl(old_str, new_str))
}

pub fn diff_lines(old_str: &str, new_str: &str) -> Vec<Hunk> {
    coalesce_hunks(diff_lines_impl(old_str, new_str))
}

pub fn diff_trimmed_lines(old_str: &str, new_str: &str) -> Vec<Hunk> {
    let trim = |s: &str| -> String {
        s.lines()
            .map(|l| l.trim_end())
            .collect::<Vec<_>>()
            .join("\n")
    };
    coalesce_hunks(diff_lines_impl(&trim(old_str), &trim(new_str)))
}

pub fn diff_lines_to_offsets(old_str: &str, new_str: &str) -> Result<Vec<u8>, String> {
    build_offsets(
        TextDiff::from_lines(old_str, new_str)
            .iter_all_changes()
            .map(|c| (c.tag(), c.value().len())),
    )
}

pub fn diff_chars_to_offsets(old_str: &str, new_str: &str) -> Result<Vec<u8>, String> {
    build_offsets(
        TextDiff::from_chars(old_str, new_str)
            .iter_all_changes()
            .map(|c| (c.tag(), c.value().len())),
    )
}

/// Shared builder for the offset-packed layout. Each entry is 5 × u32.
///
/// Returns an error string if a single hunk longer than `u32::MAX` (~4 GiB)
/// is encountered — silent corruption would be worse than rejecting it.
fn build_offsets<I: Iterator<Item = (ChangeTag, usize)>>(iter: I) -> Result<Vec<u8>, String> {
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

        let len_u32: u32 = len.try_into().map_err(|_| {
            format!(
                "diff hunk of {len} elements exceeds u32::MAX; offset buffer can't represent it"
            )
        })?;
        if adv_old {
            old_pos = old_pos.checked_add(len_u32).ok_or_else(|| {
                "offset overflow on old side; total length > u32::MAX".to_string()
            })?;
        }
        if adv_new {
            new_pos = new_pos.checked_add(len_u32).ok_or_else(|| {
                "offset overflow on new side; total length > u32::MAX".to_string()
            })?;
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

    Ok(out)
}

pub fn create_patch(
    file_name: &str,
    old_str: &str,
    new_str: &str,
    old_header: Option<&str>,
    new_header: Option<&str>,
) -> String {
    let diff = TextDiff::from_lines(old_str, new_str);
    let old_h = old_header.unwrap_or(file_name);
    let new_h = new_header.unwrap_or(file_name);
    let mut unified = diff.unified_diff();
    unified.context_radius(3).header(old_h, new_h).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn line_diff_basic() {
        let out = diff_lines("a\nb\nc", "a\nb\nd");
        assert!(out.iter().any(|h| h.removed == Some(true)));
        assert!(out.iter().any(|h| h.added == Some(true)));
    }

    #[test]
    fn offsets_5xu32() {
        let buf = diff_lines_to_offsets("a\nb", "a\nc").unwrap();
        // at least 1 hunk -> 20 bytes
        assert!(buf.len() >= 20);
        assert_eq!(buf.len() % 20, 0);
    }
}
