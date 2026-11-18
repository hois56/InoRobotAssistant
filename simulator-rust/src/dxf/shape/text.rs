use super::{Fields, Record, Shape};
use serde_json::json;

fn replace_ascii(source: &str, needle: &str, replacement: &str) -> String {
    let lower = source.to_ascii_lowercase();
    let mut out = String::new();
    let mut from = 0;
    for (pos, _) in lower.match_indices(needle) {
        out.push_str(&source[from..pos]);
        out.push_str(replacement);
        from = pos + needle.len();
    }
    out.push_str(&source[from..]);
    out
}
fn clean(source: &str, multiline: bool) -> String {
    if !multiline {
        return replace_ascii(source, "%%d", "°");
    }
    let escaped = replace_ascii(source, "\\p", "\n")
        .replace("\\~", " ")
        .replace("\\{", "{")
        .replace("\\}", "}");
    // DXF stacked fractions have a numerator and denominator separated by
    // a caret, slash, hash or escape. Other formatting commands end at ';'.
    let mut fractions = String::new();
    let mut input = escaped.as_str();
    while let Some(i) = input.find(['\\']) {
        fractions.push_str(&input[..i]);
        input = &input[i..];
        if input
            .as_bytes()
            .get(1)
            .is_some_and(|c| c.eq_ignore_ascii_case(&b's'))
        {
            if let Some(end) = input[2..].find(';').map(|i| i + 2) {
                if let Some(sep) = input[2..end].find(['^', '#', '/', '\\']).map(|i| i + 2) {
                    fractions.push_str(&input[2..sep]);
                    fractions.push('/');
                    fractions.push_str(&input[sep + 1..end]);
                    input = &input[end + 1..];
                    continue;
                }
            }
        }
        fractions.push('\\');
        input = &input[1..];
    }
    fractions.push_str(input);
    let mut out = String::new();
    let mut input = fractions.as_str();
    while let Some(i) = input.find('\\') {
        out.push_str(&input[..i]);
        input = &input[i..];
        if input.as_bytes().get(1).is_some_and(u8::is_ascii_alphabetic) {
            if let Some(end) = input.find(';') {
                input = &input[end + 1..];
                continue;
            }
        }
        out.push('\\');
        input = &input[1..];
    }
    out.push_str(input);
    replace_ascii(&out.replace("\\\\", "\\"), "%%d", "°").replace(['{', '}'], "")
}

pub(super) fn parse(r: &Record) -> Option<Shape> {
    let f = r.fields;
    let multi = r.kind == "MTEXT";
    let raw = if multi {
        f.iter()
            .filter(|p| matches!(p.code, 1 | 3))
            .map(|p| p.value)
            .collect::<String>()
    } else {
        f.get_str(1).unwrap_or("").to_owned()
    };
    let text = clean(&raw, multi);
    if text.trim().is_empty() {
        return None;
    }
    let insertion = f.point(10, 20, [0.; 2]);
    let h = f.num(40, 1.).abs().max(1e-6);
    let factor = f.num(41, 1.).abs().max(0.05);
    let angle = f.num(50, 0.).to_radians();
    let lines: Vec<_> = text.split('\n').collect();
    let line_h = h * if multi { f.num(44, 1.2).max(0.5) } else { 1. };
    let text_h = h + lines.len().saturating_sub(1) as f64 * line_h;
    let reference_w = if multi { f.num(41, 0.).max(0.) } else { 0. };
    let measured = lines.iter().fold(h * 0.1, |w, line| {
        w.max(
            line.chars()
                .map(|c| {
                    h * match c {
                        '\t' => 2.4,
                        ' ' => 0.35,
                        c if c.is_ascii() => 0.6,
                        _ => 0.95,
                    }
                })
                .sum::<f64>()
                * if multi { 1. } else { factor },
        )
    });
    let exact = |n: f64| if n.fract() == 0. { n as i32 } else { -1 };
    let (horizontal, vertical) = if multi {
        match exact(f.num(71, 1.)) {
            n @ 1..=9 => (
                ["left", "center", "right"][((n - 1) % 3) as usize],
                ["top", "middle", "bottom"][((n - 1) / 3) as usize],
            ),
            _ => ("left", "top"),
        }
    } else {
        (
            match exact(f.num(72, 0.)) {
                1 | 4 => "center",
                2 => "right",
                3 => "aligned",
                5 => "fit",
                _ => "left",
            },
            match exact(f.num(73, 0.)) {
                1 => "bottom",
                2 => "middle",
                3 => "top",
                _ => "baseline",
            },
        )
    };
    let aligned = f.point(11, 21, insertion);
    let has = f.get_str(11).is_some() && f.get_str(21).is_some();
    let anchor = if !multi && has && (horizontal != "left" || vertical != "baseline") {
        aligned
    } else {
        insertion
    };
    let dx = aligned[0] - insertion[0];
    let dy = aligned[1] - insertion[1];
    let fits = !multi && has && matches!(horizontal, "aligned" | "fit") && dx.hypot(dy) > 1e-9;
    let angle = if fits { dy.atan2(dx) } else { angle };
    let w = if fits { dx.hypot(dy) } else { measured };
    let x = match horizontal {
        "center" => -w / 2.,
        "right" => -w,
        _ => 0.,
    };
    let y = match vertical {
        "middle" => -text_h / 2.,
        "top" => -text_h,
        _ => 0.,
    };
    let (sin, cos) = angle.sin_cos();
    let corners = [[x, y], [x + w, y], [x + w, y + text_h], [x, y + text_h]]
        .map(|[x, y]| [anchor[0] + x * cos - y * sin, anchor[1] + x * sin + y * cos]);
    let mut shape = Shape::new(
        json!({"kind":"text","text":text,"insertionPoint":anchor,"height":h,"textWidth":w,
        "textHeight":text_h,"lineHeight":line_h,"widthFactor":factor,"referenceWidth":reference_w,"rotation":angle,
        "horizontalAlign":horizontal,"verticalAlign":vertical,"anchorOffset":[x,y]}),
        corners.into(),
    );
    shape.display = Some("text");
    Some(shape)
}
