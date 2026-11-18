use crate::with_buffer;
use serde_json::{json, Value};
use std::{cell::RefCell, collections::HashSet};

const COLUMNS: usize = 18;
const NO_POINT: &str = "사용 가능한 포인트 번호가 없습니다.";
const BAD_ID: &str = "포인트 번호는 0부터 9999 사이의 정수여야 합니다.";
const USED_ID: &str = "이미 사용 중인 포인트 번호입니다.";
const BAD_COMPONENT: &str = "위치 값, Arm 파라미터 및 외부 축 값을 올바르게 입력하세요.";
const BAD_RANGE: &str = "붙여넣을 범위가 위치 목록을 벗어납니다.";

thread_local! {
    static DATA:RefCell<Vec<u8>>=const{RefCell::new(Vec::new())};
}
#[no_mangle]
pub extern "C" fn positions_data(size: usize) -> *mut u8 {
    DATA.with_borrow_mut(|b| {
        b.resize(size, 0);
        b.as_mut_ptr()
    })
}

fn text_trim(s: &str) -> &str {
    s.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}')
}
fn numeric(s: &str) -> Option<f64> {
    let s = text_trim(s);
    let radix = match s.as_bytes().get(..2) {
        Some(b"0x" | b"0X") => Some(16),
        Some(b"0o" | b"0O") => Some(8),
        Some(b"0b" | b"0B") => Some(2),
        _ => None,
    };
    let n = if let Some(base) = radix {
        let digits = &s[2..];
        if digits.is_empty() {
            return None;
        }
        digits.chars().try_fold(0., |acc, c| {
            Some(acc * base as f64 + c.to_digit(base)? as f64)
        })
    } else {
        s.parse().ok()
    };
    n.filter(|v: &f64| v.is_finite())
}
fn next_point(v: &Value) -> Result<Value, &'static str> {
    let mut used = [false; 10000];
    let mut max = -1;
    for n in v["used"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_f64)
    {
        if (0. ..=9999.).contains(&n) && n.fract() == 0. {
            used[n as usize] = true;
            max = max.max(n as i32);
        }
    }
    if v["standard"] == true {
        for process in 1..=99 {
            for (offset, label) in [(11, "Work"), (10, "Pre_work"), (1, "Wait"), (0, "Safe")] {
                let index = process * 100 + offset;
                if !used[index] {
                    return Ok(json!({"index":index,"label":format!("P{process}_{label}")}));
                }
            }
        }
    } else if max < 9999 {
        return Ok(json!({"index":max+1,"label":""}));
    }
    Err(NO_POINT)
}
// Each row descriptor carries the key, register bank, ID and actual lengths
// from the loaded project. Send only the validated changes back to the UI so
// unrelated metadata, including legacy fields, stays on the original record.
fn edit(
    row: &Value,
    field: &str,
    component: Option<usize>,
    s: &str,
) -> Result<Value, &'static str> {
    if field == "label" {
        return Ok(json!(text_trim(s)));
    }
    let value = numeric(s);
    if field == "index" {
        return value
            .filter(|n| n.fract() == 0. && (0. ..=9999.).contains(n))
            .map(|n| json!(n as usize))
            .ok_or(BAD_ID);
    }
    let slot = match field {
        "values" => 3,
        "armParameters" => 4,
        "externalAxes" => 5,
        _ => return Err(BAD_COMPONENT),
    };
    if !component.is_some_and(|i| i < row[slot].as_u64().unwrap_or(0) as usize) {
        return Err(BAD_COMPONENT);
    }
    value
        .filter(|n| field != "armParameters" || n.fract() == 0.)
        .map(|n| json!(n))
        .ok_or(BAD_COMPONENT)
}
fn column(col: usize) -> (&'static str, Option<usize>) {
    match col {
        0 => ("index", None),
        1 => ("label", None),
        2..=7 => ("values", Some(col - 2)),
        8..=11 => ("armParameters", Some(col - 8)),
        _ => ("externalAxes", Some(col - 12)),
    }
}
fn data_edit(v: &Value) -> Result<Value, &'static str> {
    let row = &v["row"];
    let field = v["field"].as_str().unwrap_or("");
    let component = v["component"].as_u64().map(|x| x as usize);
    let result = edit(row, field, component, v["text"].as_str().unwrap_or(""))?;
    if field == "index"
        && v["others"]
            .as_array()
            .into_iter()
            .flatten()
            .any(|r| r[0] != row[0] && r[1] == row[1] && r[2].as_f64() == result.as_f64())
    {
        return Err(USED_ID);
    }
    Ok(result)
}
fn paste(v: &Value) -> Result<Value, &'static str> {
    let rows = v["rows"].as_array().ok_or(BAD_RANGE)?;
    let start = rows
        .iter()
        .position(|r| r[0] == v["key"])
        .ok_or(BAD_RANGE)?;
    let col = v["column"]
        .as_u64()
        .and_then(|n| usize::try_from(n).ok())
        .filter(|n| *n < COLUMNS)
        .ok_or(BAD_RANGE)?;
    let raw = v["text"]
        .as_str()
        .unwrap_or("")
        .replace("\r\n", "\n")
        .replace('\r', "\n");
    let lines: Vec<_> = raw
        .strip_suffix('\n')
        .unwrap_or(&raw)
        .split('\n')
        .map(|s| s.split('\t').collect::<Vec<_>>())
        .collect();
    if start + lines.len() > rows.len() || lines.iter().any(|r| col + r.len() > COLUMNS) {
        return Err(BAD_RANGE);
    }
    let mut edits = vec![];
    let mut ids: Vec<_> = rows.iter().map(|r| r[2].clone()).collect();
    for (i, cells) in lines.into_iter().enumerate() {
        let row = &rows[start + i];
        let mut changes = vec![];
        for (c, s) in cells.iter().enumerate() {
            let (field, component) = column(col + c);
            let n = edit(row, field, component, s)?;
            if field == "index" {
                ids[start + i] = n.clone();
            }
            changes.push(n);
        }
        edits.push(json!([start + i, changes]));
    }
    let mut used = HashSet::new();
    for (row, id) in rows.iter().zip(&ids) {
        let symbol = row[1].as_str().unwrap_or("P");
        let id = match id {
            Value::String(s) => s.clone(),
            Value::Number(n) => n.as_f64().unwrap().to_string(),
            v => v.to_string(),
        };
        if !used.insert((symbol, id)) {
            return Err(USED_ID);
        }
    }
    Ok(json!(edits))
}
#[no_mangle]
pub extern "C" fn positions_request(op: i32) -> usize {
    DATA.with_borrow_mut(|data| {
        let v: Value = serde_json::from_slice(data).unwrap_or(Value::Null);
        let answer = match op {
            0 => next_point(&v),
            1 => data_edit(&v),
            _ => paste(&v),
        };
        let value = match answer {
            Ok(v) => json!({"value":v}),
            Err(message) => json!({"error":message}),
        };
        data.clear();
        serde_json::to_writer(&mut *data, &value).unwrap();
        data.len()
    })
}
#[no_mangle]
pub extern "C" fn position_navigate(
    row: i32,
    col: i32,
    rows: i32,
    cols: i32,
    key: i32,
    shift: bool,
    ctrl: bool,
    page: i32,
) -> i32 {
    if row < 0 || rows <= 0 || cols <= 0 {
        return -1;
    }
    let (mut r, mut c) = (row, col);
    match key {
        0 => {
            let n = r * cols + c + if shift { -1 } else { 1 };
            return if n >= 0 && n < rows * cols { n } else { -1 };
        }
        1 => r += if shift { -1 } else { 1 },
        2 => c = if ctrl { 0 } else { c - 1 },
        3 => c = if ctrl { cols - 1 } else { c + 1 },
        4 => r = if ctrl { 0 } else { r - 1 },
        5 => r = if ctrl { rows - 1 } else { r + 1 },
        6 => {
            c = 0;
            if ctrl {
                r = 0;
            }
        }
        7 => {
            c = cols - 1;
            if ctrl {
                r = rows - 1;
            }
        }
        8 => r -= page.max(1),
        9 => r += page.max(1),
        _ => return -1,
    }
    r.clamp(0, rows - 1) * cols + c.clamp(0, cols - 1)
}
#[no_mangle]
pub extern "C" fn position_selection(row: i32, col: i32, anchor_row: i32, anchor_col: i32) {
    let anchor_row = if anchor_row < 0 { row } else { anchor_row };
    with_buffer(|b| {
        b[..4].copy_from_slice(&[
            row.min(anchor_row) as f64,
            row.max(anchor_row) as f64,
            col.min(anchor_col) as f64,
            col.max(anchor_col) as f64,
        ])
    });
}
