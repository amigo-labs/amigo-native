//! Bit-identical port of mapbox/pixelmatch (MIT) — pure-Rust core.
//! Both napi and WASM bindings call into `compute_with_diff` /
//! `compute_count_only`.

#[derive(Debug, Clone, Copy)]
pub struct Opts {
    pub threshold: f64,
    pub include_aa: bool,
    pub alpha: f64,
    pub aa_color: [u8; 3],
    pub diff_color: [u8; 3],
    pub diff_color_alt: Option<[u8; 3]>,
    pub diff_mask: bool,
}

impl Default for Opts {
    fn default() -> Self {
        Self {
            threshold: 0.1,
            include_aa: false,
            alpha: 0.1,
            aa_color: [255, 255, 0],
            diff_color: [255, 0, 0],
            diff_color_alt: None,
            diff_mask: false,
        }
    }
}

pub fn validate_dims(
    img1_len: usize,
    img2_len: usize,
    width: u32,
    height: u32,
) -> Result<(usize, usize), String> {
    let w = width as usize;
    let h = height as usize;
    let expected = w
        .checked_mul(h)
        .and_then(|n| n.checked_mul(4))
        .ok_or_else(|| "width * height * 4 overflows usize".to_string())?;
    if img1_len != expected || img2_len != expected {
        return Err(format!(
            "image buffers must be width * height * 4 bytes ({} expected)",
            expected
        ));
    }
    Ok((w, h))
}

/// Returns `(num_diff, diff_buffer)` — same shape as upstream's
/// `(numDiff, diff)` pair. `diff_buffer` is RGBA, same size as inputs.
pub fn compute_with_diff(
    img1: &[u8],
    img2: &[u8],
    width: usize,
    height: usize,
    opts: &Opts,
) -> (u32, Vec<u8>) {
    let mut out = vec![0u8; img1.len()];
    let num_diff = compute(img1, img2, Some(&mut out), width, height, opts);
    (num_diff, out)
}

pub fn compute_count_only(
    img1: &[u8],
    img2: &[u8],
    width: usize,
    height: usize,
    opts: &Opts,
) -> u32 {
    compute(img1, img2, None, width, height, opts)
}

fn compute(
    img1: &[u8],
    img2: &[u8],
    output: Option<&mut [u8]>,
    width: usize,
    height: usize,
    opts: &Opts,
) -> u32 {
    if img1 == img2 {
        if let Some(out) = output {
            if !opts.diff_mask {
                draw_gray(img1, out, opts.alpha);
            } else {
                for b in out.iter_mut() {
                    *b = 0;
                }
            }
        }
        return 0;
    }

    let max_delta = 35215.0_f64 * opts.threshold * opts.threshold;
    let mut diff: u32 = 0;

    if let Some(out) = output {
        if !opts.diff_mask {
            draw_gray(img1, out, opts.alpha);
        } else {
            for b in out.iter_mut() {
                *b = 0;
            }
        }
        for y in 0..height {
            for x in 0..width {
                let pos = (y * width + x) * 4;
                let delta = color_delta(img1, img2, pos, pos, false);
                if delta.abs() > max_delta {
                    if !opts.include_aa
                        && (antialiased(img1, x, y, width, height, img2)
                            || antialiased(img2, x, y, width, height, img1))
                    {
                        if !opts.diff_mask {
                            draw_pixel(out, pos, opts.aa_color);
                        }
                    } else {
                        let color = if delta < 0.0 {
                            opts.diff_color_alt.unwrap_or(opts.diff_color)
                        } else {
                            opts.diff_color
                        };
                        draw_pixel(out, pos, color);
                        diff += 1;
                    }
                }
            }
        }
    } else {
        for y in 0..height {
            for x in 0..width {
                let pos = (y * width + x) * 4;
                let delta = color_delta(img1, img2, pos, pos, false);
                if delta.abs() > max_delta
                    && !(!opts.include_aa
                        && (antialiased(img1, x, y, width, height, img2)
                            || antialiased(img2, x, y, width, height, img1)))
                {
                    diff += 1;
                }
            }
        }
    }

    diff
}

fn draw_pixel(out: &mut [u8], pos: usize, color: [u8; 3]) {
    out[pos] = color[0];
    out[pos + 1] = color[1];
    out[pos + 2] = color[2];
    out[pos + 3] = 255;
}

fn draw_gray(src: &[u8], out: &mut [u8], alpha: f64) {
    let n = src.len() / 4;
    for i in 0..n {
        let pos = i * 4;
        let r = src[pos] as f64;
        let g = src[pos + 1] as f64;
        let b = src[pos + 2] as f64;
        let a = src[pos + 3] as f64;
        let val = blend(rgb2y(r, g, b), alpha * a / 255.0);
        let v = val as u8;
        out[pos] = v;
        out[pos + 1] = v;
        out[pos + 2] = v;
        out[pos + 3] = 255;
    }
}

fn blend(c: f64, a: f64) -> f64 {
    255.0 + (c - 255.0) * a
}

fn rgb2y(r: f64, g: f64, b: f64) -> f64 {
    r * 0.29889531 + g * 0.58662247 + b * 0.11448223
}
fn rgb2i(r: f64, g: f64, b: f64) -> f64 {
    r * 0.59597799 - g * 0.27417610 - b * 0.32180189
}
fn rgb2q(r: f64, g: f64, b: f64) -> f64 {
    r * 0.21147017 - g * 0.52261711 + b * 0.31114694
}

fn color_delta(a: &[u8], b: &[u8], i: usize, j: usize, y_only: bool) -> f64 {
    let mut r1 = a[i] as f64;
    let mut g1 = a[i + 1] as f64;
    let mut b1 = a[i + 2] as f64;
    let a1 = a[i + 3] as f64;

    let mut r2 = b[j] as f64;
    let mut g2 = b[j + 1] as f64;
    let mut b2 = b[j + 2] as f64;
    let a2 = b[j + 3] as f64;

    if (a1 - a2).abs() < f64::EPSILON
        && (r1 - r2).abs() < f64::EPSILON
        && (g1 - g2).abs() < f64::EPSILON
        && (b1 - b2).abs() < f64::EPSILON
    {
        return 0.0;
    }

    if a1 < 255.0 {
        let af = a1 / 255.0;
        r1 = blend(r1, af);
        g1 = blend(g1, af);
        b1 = blend(b1, af);
    }
    if a2 < 255.0 {
        let af = a2 / 255.0;
        r2 = blend(r2, af);
        g2 = blend(g2, af);
        b2 = blend(b2, af);
    }

    let y1 = rgb2y(r1, g1, b1);
    let y2 = rgb2y(r2, g2, b2);
    let y = y1 - y2;

    if y_only {
        return y;
    }
    let i = rgb2i(r1, g1, b1) - rgb2i(r2, g2, b2);
    let q = rgb2q(r1, g1, b1) - rgb2q(r2, g2, b2);

    let delta = 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;
    if y1 > y2 { -delta } else { delta }
}

fn antialiased(img: &[u8], x1: usize, y1: usize, width: usize, height: usize, img2: &[u8]) -> bool {
    let x0 = x1.saturating_sub(1);
    let y0 = y1.saturating_sub(1);
    let x2 = (x1 + 1).min(width - 1);
    let y2 = (y1 + 1).min(height - 1);

    let pos = (y1 * width + x1) * 4;
    let mut zeroes = u32::from(x1 == x0 || x1 == x2 || y1 == y0 || y1 == y2);

    let mut min: f64 = 0.0;
    let mut max: f64 = 0.0;
    let mut min_x = 0;
    let mut min_y = 0;
    let mut max_x = 0;
    let mut max_y = 0;

    for x in x0..=x2 {
        for y in y0..=y2 {
            if x == x1 && y == y1 {
                continue;
            }
            let neighbor_pos = (y * width + x) * 4;
            let delta = color_delta(img, img, pos, neighbor_pos, true);
            if delta == 0.0 {
                zeroes += 1;
                if zeroes > 2 {
                    return false;
                }
            } else if delta < min {
                min = delta;
                min_x = x;
                min_y = y;
            } else if delta > max {
                max = delta;
                max_x = x;
                max_y = y;
            }
        }
    }

    if min == 0.0 || max == 0.0 {
        return false;
    }

    (has_many_siblings(img, min_x, min_y, width, height)
        && has_many_siblings(img2, min_x, min_y, width, height))
        || (has_many_siblings(img, max_x, max_y, width, height)
            && has_many_siblings(img2, max_x, max_y, width, height))
}

fn has_many_siblings(img: &[u8], x1: usize, y1: usize, width: usize, height: usize) -> bool {
    let x0 = x1.saturating_sub(1);
    let y0 = y1.saturating_sub(1);
    let x2 = (x1 + 1).min(width - 1);
    let y2 = (y1 + 1).min(height - 1);

    let pos = (y1 * width + x1) * 4;
    let mut zeroes = u32::from(x1 == x0 || x1 == x2 || y1 == y0 || y1 == y2);

    for x in x0..=x2 {
        for y in y0..=y2 {
            if x == x1 && y == y1 {
                continue;
            }
            let neighbor_pos = (y * width + x) * 4;
            if img[pos] == img[neighbor_pos]
                && img[pos + 1] == img[neighbor_pos + 1]
                && img[pos + 2] == img[neighbor_pos + 2]
                && img[pos + 3] == img[neighbor_pos + 3]
            {
                zeroes += 1;
                if zeroes > 2 {
                    return true;
                }
            }
        }
    }

    false
}

/// Helper for binding code: convert a `Vec<u8>` color into a `[u8; 3]`.
/// Returns `Err(message)` if the length is not 3.
pub fn to_color(v: Option<Vec<u8>>, default: [u8; 3]) -> Result<[u8; 3], String> {
    match v {
        None => Ok(default),
        Some(arr) if arr.len() == 3 => Ok([arr[0], arr[1], arr[2]]),
        Some(_) => Err("color tuples must have exactly 3 elements (R, G, B)".to_string()),
    }
}

/// Same as `to_color`, but `diffColorAlt` allows an empty Vec to mean
/// "not set" (mirrors the napi shape where `None` and `Some(vec![])`
/// are both treated as absent).
pub fn to_color_alt(v: Option<Vec<u8>>) -> Result<Option<[u8; 3]>, String> {
    match v {
        None => Ok(None),
        Some(arr) if arr.is_empty() => Ok(None),
        Some(arr) if arr.len() == 3 => Ok(Some([arr[0], arr[1], arr[2]])),
        Some(_) => Err("diffColorAlt must have 3 elements or be omitted".to_string()),
    }
}
