use crate::cad::Point;
use serde_json::{json, Value};
use std::collections::HashMap;

#[derive(Clone, Copy)]
pub(super) struct Pair<'a> {
    pub code: i32,
    pub value: &'a str,
}
impl Pair<'_> {
    pub fn marker(&self, name: &str) -> bool {
        self.code == 0 && self.value.eq_ignore_ascii_case(name)
    }
}
pub(super) fn number(s: &str, fallback: f64) -> f64 {
    if s.is_empty() {
        return 0.;
    }
    let radix = match s.as_bytes().get(..2) {
        Some(b"0x" | b"0X") => Some(16),
        Some(b"0b" | b"0B") => Some(2),
        Some(b"0o" | b"0O") => Some(8),
        _ => None,
    };
    let n = match radix {
        Some(base) => u64::from_str_radix(&s[2..], base).ok().map(|v| v as f64),
        None => s.parse::<f64>().ok(),
    };
    n.filter(|v| v.is_finite()).unwrap_or(fallback)
}
pub(super) fn pairs<'a>(source: &'a str, warnings: &mut Vec<Value>) -> Vec<Pair<'a>> {
    let mut lines = source.split('\n');
    let mut records = vec![];
    let mut index = 1;
    while let Some(group) = lines.next() {
        let Some(value) = lines.next() else {
            if !group.trim().is_empty() {
                warnings.push(json!({"code":"CAD_DXF_PARSE_FAILED","message":"The final DXF group was incomplete and was ignored."}));
            }
            break;
        };
        let code = number(group.trim(), f64::NAN);
        if code.fract() != 0. {
            warnings.push(json!({"code":"CAD_DXF_PARSE_FAILED","message":format!("Invalid group code at line {index}.")}));
        } else {
            records.push(Pair {
                code: code as i32,
                value: value.trim(),
            });
        }
        index += 2;
    }
    records
}
pub(super) fn sections<'a, 'b>(pairs: &'b [Pair<'a>]) -> HashMap<String, &'b [Pair<'a>]> {
    let mut out = HashMap::new();
    let mut i = 0;
    while i + 1 < pairs.len() {
        if !pairs[i].marker("SECTION") {
            i += 1;
            continue;
        }
        let name = pairs[i + 1].value.to_uppercase();
        let start = i + 2;
        let end = start
            + pairs[start..]
                .iter()
                .position(|p| p.marker("ENDSEC"))
                .unwrap_or(pairs.len() - start);
        out.insert(name, &pairs[start..end]);
        i = if end == pairs.len() { i + 1 } else { end + 1 };
    }
    out
}
pub(super) trait Fields<'a> {
    fn get_str(&self, code: i32) -> Option<&'a str>;
    fn num(&self, code: i32, default: f64) -> f64 {
        self.get_str(code)
            .map(|s| number(s, default))
            .unwrap_or(default)
    }
    fn point(&self, x: i32, y: i32, default: Point) -> Point {
        [self.num(x, default[0]), self.num(y, default[1])]
    }
}
impl<'a> Fields<'a> for [Pair<'a>] {
    fn get_str(&self, code: i32) -> Option<&'a str> {
        self.iter().find(|p| p.code == code).map(|p| p.value)
    }
}
pub(super) struct Record<'a> {
    pub kind: String,
    pub fields: &'a [Pair<'a>],
    pub vertices: Vec<(Point, f64)>,
}
fn next_marker(pairs: &[Pair], i: usize) -> usize {
    i + pairs[i..]
        .iter()
        .position(|p| p.code == 0)
        .unwrap_or(pairs.len() - i)
}
pub(super) fn records<'a>(pairs: &'a [Pair<'a>]) -> Vec<Record<'a>> {
    let mut out = vec![];
    let mut i = next_marker(pairs, 0);
    while i < pairs.len() {
        let kind = pairs[i].value.to_uppercase();
        let end = next_marker(pairs, i + 1);
        let fields = &pairs[i + 1..end];
        i = end;
        if matches!(kind.as_str(), "ENDSEC" | "SEQEND" | "VERTEX") {
            continue;
        }
        let mut vertices = vec![];
        if kind == "POLYLINE" {
            while i < pairs.len() && pairs[i].marker("VERTEX") {
                let end = next_marker(pairs, i + 1);
                let items = &pairs[i + 1..end];
                if let Some(ix) = items.iter().position(|p| p.code == 10) {
                    if let Some(y) = items[ix + 1..].get_str(20) {
                        vertices.push((
                            [number(items[ix].value, 0.), number(y, 0.)],
                            items.num(42, 0.),
                        ));
                    }
                }
                i = end;
            }
        }
        out.push(Record {
            kind,
            fields,
            vertices,
        });
    }
    out
}
pub(super) struct Definition<'a> {
    pub name: &'a str,
    pub base: Point,
    pub records: Vec<Record<'a>>,
}
pub(super) fn blocks<'a>(pairs: &'a [Pair<'a>]) -> (Vec<Definition<'a>>, HashMap<&'a str, usize>) {
    let mut out = vec![];
    let mut by_name = HashMap::new();
    let mut i = 0;
    while i < pairs.len() {
        if !pairs[i].marker("BLOCK") {
            i += 1;
            continue;
        }
        let start = next_marker(pairs, i + 1);
        let header = &pairs[i + 1..start];
        let name = header.get_str(2).unwrap_or("");
        if name.is_empty() {
            i += 1;
            continue;
        }
        let end = start
            + pairs[start..]
                .iter()
                .position(|p| p.marker("ENDBLK"))
                .unwrap_or(pairs.len() - start);
        let definition = Definition {
            name,
            base: header.point(10, 20, [0.; 2]),
            records: records(&pairs[start..end]),
        };
        if let Some(&index) = by_name.get(name) {
            out[index] = definition;
        } else {
            by_name.insert(name, out.len());
            out.push(definition);
        }
        i = end + 1;
    }
    (out, by_name)
}
