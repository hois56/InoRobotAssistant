use regex_lite::Regex;
use serde_json::{json, Map, Value};
use std::cell::RefCell;
use std::sync::LazyLock;

thread_local! {static BYTES:RefCell<Vec<u8>>=const{RefCell::new(Vec::new())};}

fn whitespace(c: char) -> bool {
    matches!(c,'\u{09}'..='\u{0d}'|' '|'\u{a0}'|'\u{1680}'|'\u{2000}'..='\u{200a}'|'\u{2028}'|'\u{2029}'|'\u{202f}'|'\u{205f}'|'\u{3000}'|'\u{feff}')
}
fn pattern(s: &str) -> Regex {
    let spaces="[\u{09}-\u{0d} \u{a0}\u{1680}\u{2000}-\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}\u{feff}]";
    Regex::new(&s.replace(r"\s", spaces)).expect("OLP file grammar")
}

static POINT: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"(?i)\b(JP|LP|P)\s*\[\s*(\d+)\s*\]\s*=\s*([^;]+)"));
static NUMBER: LazyLock<Regex> = LazyLock::new(|| pattern(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?"));
static NAME: LazyLock<Regex> = LazyLock::new(|| pattern(r"(?i)\bName\s*=\s*([^;]+)"));
static NOTES: LazyLock<Regex> = LazyLock::new(|| pattern(r"(?i)\bNotes\s*=\s*([^;]+)"));
static OFFSET: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"(?i)^Offset\s*\(\s*([^,]+?)(?:\s*,\s*([^)]+))?\s*\)$"));
static POINT_CALL: LazyLock<Regex> = LazyLock::new(|| pattern(r"(?i)^Point\s*\("));
static INDEX: LazyLock<Regex> = LazyLock::new(|| pattern(r"(?i)^(JP|LP|P)\s*\[?\s*(\d+)\s*\]?$"));
static REMOTE_COMMANDS: LazyLock<[Regex; 4]> = LazyLock::new(|| {
    [
        r"start\s+program",
        r"stop\s+program",
        r"reset\s+program",
        r"clear\s+alarm",
    ]
    .map(pattern)
});

fn parse_vector(s: &str, dimensions: usize) -> Vec<f64> {
    NUMBER
        .find_iter(s)
        .filter_map(|m| m.as_str().parse::<f64>().ok().filter(|n| n.is_finite()))
        .take(dimensions)
        .collect()
}
fn quoted<'a>(s: &'a str, re: &Regex) -> Option<&'a str> {
    let m = re.captures(s)?.get(1)?.as_str().trim_matches(whitespace);
    let m = m.strip_prefix(['\'', '"']).unwrap_or(m);
    Some(m.strip_suffix(['\'', '"']).unwrap_or(m))
}
fn js_number_text(n: f64) -> String {
    if n == 0. {
        return String::from("0");
    }
    if !n.is_finite() {
        return if n.is_sign_negative() {
            "-Infinity"
        } else {
            "Infinity"
        }
        .to_owned();
    }
    if (1e-6..1e21).contains(&n.abs()) {
        return n.to_string();
    }
    let exp = format!("{n:e}");
    if let Some((m, e)) = exp.split_once('e') {
        if !e.starts_with('-') {
            return format!("{m}e+{e}");
        }
    }
    exp
}
fn points_file(path: &str, text: &str, joint: bool) -> Value {
    let mut records = Vec::new();
    for line in text.split_inclusive('\n') {
        let line = match line.strip_suffix('\n') {
            Some(s) => s.strip_suffix('\r').unwrap_or(s),
            None => line,
        };
        let Some(parts) = POINT.captures(line) else {
            continue;
        };
        let symbol = parts[1].to_ascii_uppercase();
        let values = parse_vector(&parts[3], if joint { 16 } else { 6 });
        if values.is_empty() {
            continue;
        }
        let mut metadata = line.split(';').skip(1);
        let arm = if joint {
            Vec::new()
        } else {
            parse_vector(metadata.next().unwrap_or(""), 4)
        };
        let axes = if joint {
            Vec::new()
        } else {
            parse_vector(metadata.next().unwrap_or(""), 6)
        };
        let index = parts[2].parse::<f64>().unwrap_or(f64::INFINITY);
        let notes = quoted(line, &NOTES);
        let name = quoted(line, &NAME)
            .or(notes)
            .map(str::to_owned)
            .unwrap_or_else(|| format!("{symbol}{}", js_number_text(index)));
        records.push(json!({
            "kind": if joint { "jointPoint" } else { "point" },
            "sourceSymbol": symbol,
            "index": if index.is_finite() { index } else { records.len() as f64 },
            "name": name,
            "values": values,
            "armParameters": arm,
            "externalAxes": axes,
            "path": path,
            "notes": notes.unwrap_or(""),
            "sourceLine": line
        }));
    }
    Value::Array(records)
}

fn point_reference(text: &str) -> Value {
    let raw = text.trim_matches(whitespace);
    let raw = raw.strip_suffix([';', ',']).unwrap_or(raw);
    let offset = OFFSET.captures(raw);
    let base = offset
        .as_ref()
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().trim_matches(whitespace))
        .filter(|s| !s.is_empty())
        .unwrap_or(raw);
    let base = POINT_CALL.find(base).map_or(base, |m| &base[m.end()..]);
    let base = base
        .strip_suffix(')')
        .unwrap_or(base)
        .trim_matches(whitespace);
    let mut normalized = base.to_owned();
    for symbol in ["LP[", "JP[", "P["] {
        if base
            .get(..symbol.len())
            .is_some_and(|p| p.eq_ignore_ascii_case(symbol))
        {
            normalized.remove(symbol.len() - 1);
            break;
        }
    }
    if normalized.ends_with(']') {
        normalized.pop();
    }
    let index = INDEX.captures(base);
    let offset = offset
        .as_ref()
        .and_then(|c| c.get(2))
        .map(|m| m.as_str().trim_matches(whitespace))
        .filter(|s| !s.is_empty());
    json!({
        "base": base,
        "normalized": normalized,
        "symbol": index.as_ref().map(|c| c[1].to_ascii_uppercase()),
        "index": index.as_ref().and_then(|c| c[2].parse::<f64>().ok()),
        "offset": offset
    })
}

fn remote_entry(entry: &Value) -> Option<Value> {
    let direction = js_number(entry.get("IoType"))?;
    let function = js_number(entry.get("FuncId"))?;
    let address = js_number(entry.get("MemAddr"))?;
    let length = js_number(entry.get("Length"))?;
    if (direction != 0. && direction != 1.) || length <= 0. {
        return None;
    }
    let prefix = if direction == 1. { "Out" } else { "In" };
    let name = js_label(entry.get("Name"));
    let mapped = address >= 0.;
    let word = length == 16. && address >= 512. && (address - 512.) % 16. == 0.;
    let display = mapped.then(|| {
        if word {
            format!(
                "{prefix}W[{}]",
                js_number_text(32. + (address - 512.) / 16.)
            )
        } else {
            format!("{prefix}[{}]", js_number_text(address))
        }
    });
    let mut command = "";
    if mapped && direction == 0. && length == 1. {
        let lowered = name.to_lowercase();
        for (i, (id, cmd)) in [
            (0., "start"),
            (1., "stop"),
            (2., "reset"),
            (5., "clearAlarm"),
        ]
        .into_iter()
        .enumerate()
        {
            if function == id || REMOTE_COMMANDS[i].is_match(&lowered) {
                command = cmd;
                break;
            }
        }
    }
    Some(json!({
        "ioType": direction,
        "funcId": function,
        "memAddr": address,
        "length": length,
        "name": name,
        "direction": prefix,
        "mapped": mapped,
        "address": display,
        "command": command
    }))
}

fn remote_mapping(source: &str) -> Value {
    let config: Option<Value> = source
        .find('{')
        .and_then(|start| serde_json::from_str(&source[start..]).ok());
    let entries = config.as_ref().and_then(|v| v["BusIoFuncMap"].as_array());
    Value::Array(
        entries
            .into_iter()
            .flatten()
            .filter_map(remote_entry)
            .collect(),
    )
}
fn js_string(v: &Value) -> String {
    match v {
        Value::Null => "null".into(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => js_number_text(n.as_f64().unwrap_or(0.)),
        Value::String(s) => s.clone(),
        Value::Array(a) => a
            .iter()
            .map(|v| {
                if v.is_null() {
                    String::new()
                } else {
                    js_string(v)
                }
            })
            .collect::<Vec<_>>()
            .join(","),
        Value::Object(_) => "[object Object]".into(),
    }
}

// Paths and exported editor text are browser strings. Work in UTF-16 units
// so even an unpaired surrogate survives normalization unchanged.
thread_local! {static UNITS:RefCell<Vec<u16>>=const{RefCell::new(Vec::new())};}

#[no_mangle]
pub extern "C" fn project_text_units(size: usize) -> *mut u16 {
    UNITS.with_borrow_mut(|text| {
        text.resize(size, 0);
        text.as_mut_ptr()
    })
}
#[no_mangle]
pub extern "C" fn project_normalize_text(is_path: bool) -> isize {
    UNITS.with_borrow_mut(|text| {
        let mut normalized = Vec::with_capacity(text.len());
        if is_path {
            for part in text.split(|&c| c == b'/' as u16 || c == b'\\' as u16) {
                if part.is_empty() || part == [46] {
                    continue;
                }
                if part == [46, 46] {
                    return -1;
                }
                if !normalized.is_empty() {
                    normalized.push(b'/' as u16);
                }
                normalized.extend_from_slice(part);
            }
        } else {
            for &unit in text.strip_prefix(&[0xfeff]).unwrap_or(text) {
                if unit == 10 && normalized.last() != Some(&13) {
                    normalized.push(13);
                }
                normalized.push(unit);
            }
        }
        *text = normalized;
        text.len() as isize
    })
}
fn js_label(v: Option<&Value>) -> String {
    match v {
        None | Some(Value::Null | Value::Bool(false)) => String::new(),
        Some(v) if v.as_f64() == Some(0.) => String::new(),
        Some(v) => js_string(v).trim_matches(whitespace).to_owned(),
    }
}
fn js_number(v: Option<&Value>) -> Option<f64> {
    match v? {
        Value::Null => Some(0.),
        Value::Bool(b) => Some(*b as u8 as f64),
        Value::Number(n) => n.as_f64(),
        v => {
            let text = js_string(v);
            let text = text.trim_matches(whitespace);
            if text.is_empty() {
                return Some(0.);
            }
            let radix = match text.as_bytes().get(..2) {
                Some(b"0x" | b"0X") => 16,
                Some(b"0b" | b"0B") => 2,
                Some(b"0o" | b"0O") => 8,
                _ => 0,
            };
            if radix > 0 && text.len() > 2 {
                return text[2..]
                    .chars()
                    .try_fold(0., |n, c| {
                        Some(n * radix as f64 + c.to_digit(radix)? as f64)
                    })
                    .filter(|n| n.is_finite());
            }
            text.parse::<f64>().ok().filter(|n| n.is_finite())
        }
    }
}
fn labels(source: &str) -> Value {
    let value: Value = serde_json::from_str(source).unwrap_or(Value::Null);
    let mut labels = Map::new();
    for (group, prefix) in [
        ("InputBitLabels", "In"),
        ("InputByteLabels", "InB"),
        ("InputWordLabels", "InW"),
        ("OutputBitLabels", "Out"),
        ("OutputByteLabels", "OutB"),
        ("OutputWordLabels", "OutW"),
        ("BVarLabels", "B"),
        ("RVarLabels", "R"),
        ("DVarLabels", "D"),
    ] {
        if let Some(entries) = value[group]["LabelsArray"].as_array() {
            for entry in entries {
                let name = js_label(entry.get("sLabel"));
                if !name.is_empty() && name != "__proto__" {
                    if let Some(index) = js_number(entry.get("nIndex")) {
                        labels.insert(
                            name,
                            Value::String(format!("{prefix}[{}]", js_number_text(index))),
                        );
                    }
                }
            }
        }
    }
    Value::Object(labels)
}

#[no_mangle]
pub extern "C" fn project_file_bytes(size: usize) -> *mut u8 {
    BYTES.with_borrow_mut(|b| {
        b.resize(size, 0);
        b.as_mut_ptr()
    })
}
#[no_mangle]
pub extern "C" fn project_file_read(op: u32, path_bytes: usize) -> usize {
    BYTES.with_borrow_mut(|data| {
        let (path, source) = data.split_at(path_bytes);
        let source = std::str::from_utf8(source).unwrap();
        let result = match op {
            0 | 1 => points_file(std::str::from_utf8(path).unwrap(), source, op == 1),
            2 => point_reference(source),
            3 => remote_mapping(source),
            _ => labels(source),
        };
        data.clear();
        serde_json::to_writer(&mut *data, &result).unwrap();
        data.len()
    })
}
