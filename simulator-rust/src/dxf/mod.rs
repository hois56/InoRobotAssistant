mod records;
mod shape;
use crate::cad::bounds;
use records::{number, Fields, Pair, Record};
use serde_json::{json, Map, Value};
use shape::{Shape, Transform};
use std::{cell::RefCell, collections::HashMap};

#[link(wasm_import_module = "dxf")]
extern "C" {
    fn emit(kind: u32, ptr: *const u8, length: usize);
}
thread_local! {static INPUT: RefCell<Vec<u8>>= const {RefCell::new(Vec::new())};}
#[no_mangle]
pub extern "C" fn dxf_input(len: usize) -> *mut u8 {
    INPUT.with_borrow_mut(|b| {
        b.resize(len, 0);
        b.as_mut_ptr()
    })
}
fn publish(kind: u32, value: &Value) {
    let bytes = serde_json::to_vec(value).expect("DXF values are JSON objects");
    unsafe {
        emit(kind, bytes.as_ptr(), bytes.len());
    }
}
fn color(index: f64, fallback: &str) -> &str {
    match index.abs() as usize {
        1 => "#ff0000",
        2 => "#ffff00",
        3 => "#00ff00",
        4 => "#00ffff",
        5 => "#0000ff",
        6 => "#ff00ff",
        7 => "#ffffff",
        8 => "#808080",
        9 => "#c0c0c0",
        _ => fallback,
    }
}
fn line_type(value: &str) -> String {
    if value.is_empty() {
        "CONTINUOUS".into()
    } else {
        value.to_uppercase()
    }
}
struct Tables {
    layers: Map<String, Value>,
    patterns: HashMap<String, Vec<f64>>,
}
impl Tables {
    fn read(pairs: &[Pair]) -> Self {
        let records = records::records(pairs);
        let mut patterns = HashMap::new();
        for r in records.iter().filter(|r| r.kind == "LTYPE") {
            let pattern = r
                .fields
                .iter()
                .filter(|p| p.code == 49)
                .map(|p| number(p.value, f64::NAN))
                .filter(|n| n.is_finite())
                .collect();
            patterns.insert(line_type(r.fields.get_str(2).unwrap_or("")), pattern);
        }
        let mut layers = Map::new();
        for r in records.iter().filter(|r| r.kind == "LAYER") {
            let f = r.fields;
            let name = f.get_str(2).unwrap_or("0");
            let index = f.num(62, 7.);
            let lt = line_type(f.get_str(6).unwrap_or(""));
            let pattern = patterns.get(&lt).map(Vec::as_slice).unwrap_or(&[]);
            layers.insert(name.into(),json!({"name":name,"color":color(index,"#dbeafe"),"linetype":lt,"linePattern":pattern,"off":index<0.}));
        }
        Self { layers, patterns }
    }
    fn entity(&self, r: &Record, index: usize, mut s: Shape, path: &[&str]) -> Value {
        let f = r.fields;
        let layer = f.get_str(8).unwrap_or("0");
        let info = self.layers.get(layer);
        let base_color = info.and_then(|v| v["color"].as_str()).unwrap_or("#dbeafe");
        let base_type = info
            .and_then(|v| v["linetype"].as_str())
            .unwrap_or("CONTINUOUS");
        let requested = line_type(f.get_str(6).unwrap_or("BYLAYER"));
        let linetype = if requested == "BYLAYER" {
            base_type
        } else {
            &requested
        };
        let pattern = self
            .patterns
            .get(linetype)
            .map(Vec::as_slice)
            .unwrap_or(&[]);
        let pattern = if pattern.is_empty() && requested == "BYLAYER" {
            info.map(|v| v["linePattern"].clone())
                .unwrap_or_else(|| json!([]))
        } else {
            json!(pattern)
        };
        let mut warnings = vec![];
        if info.is_some_and(|v| v["off"] == true) {
            warnings.push("CAD_LAYER_OFF");
        }
        if s.infinite_line {
            warnings.push("CAD_INFINITE_LINE_CLIPPED");
        }
        let [left, bottom, right, top] = bounds(&s.points);
        if s.copy_points {
            s.geometry["points"] = json!(s.points);
        }
        let mut out = json!({"type":r.kind,"handle":f.get_str(5).map(str::to_owned).unwrap_or_else(||format!("#{}",index+1)),
            "layer":layer,"color":color(f.num(62,0.),base_color),"linetype":linetype,"linePattern":pattern,
            "geometry":s.geometry,"renderPoints":s.points,"bounds":{"min":[left,bottom],"max":[right,top]},"warningCodes":warnings});
        if let Some(closed) = s.closed {
            out["closed"] = json!(closed);
        }
        if let Some(display) = s.display {
            out["renderType"] = json!(display);
        }
        if !path.is_empty() {
            out["sourceSpace"] = json!("block");
            out["blockPath"] = json!(path);
        }
        out
    }
}
struct Skipped {
    warnings: Vec<Value>,
    types: HashMap<String, usize>,
    count: usize,
    limited: bool,
}
impl Skipped {
    fn add(&mut self, kind: &str, message: String) {
        self.count += 1;
        let kind = if kind.is_empty() { "UNKNOWN" } else { kind };
        if let Some(&i) = self.types.get(kind) {
            let n = self.warnings[i]["count"].as_u64().unwrap_or(0) + 1;
            self.warnings[i]["count"] = json!(n);
        } else {
            self.types.insert(kind.into(), self.warnings.len());
            self.warnings
                .push(json!({"code":"CAD_ENTITY_SKIPPED","message":message,"type":kind,"count":1}));
        }
    }
}
struct Cursor<'a> {
    list: &'a [Record<'a>],
    next: usize,
    world: Option<Transform>,
}
fn parse(source: &str, segments: f64, limit: f64) -> u32 {
    if source.trim().is_empty() {
        return 1;
    }
    // Windows and older Mac exporters use CRLF and CR respectively.
    let normalized;
    let source = if source.contains('\r') {
        normalized = source.replace("\r\n", "\n").replace('\r', "\n");
        &normalized
    } else {
        source
    };
    let mut skipped = Skipped {
        warnings: vec![],
        types: HashMap::new(),
        count: 0,
        limited: false,
    };
    let pairs = records::pairs(source, &mut skipped.warnings);
    if pairs.len() < 4 {
        return 2;
    }
    let sections = records::sections(&pairs);
    let get = |name: &str| sections.get(name).copied().unwrap_or(&[]);
    let tables = Tables::read(get("TABLES"));
    let (blocks, by_name) = records::blocks(get("BLOCKS"));
    let model = records::records(get("ENTITIES"));
    let mut path = vec![];
    let mut stack = vec![Cursor {
        list: &model,
        next: 0,
        world: None,
    }];
    let mut count = 0usize;
    while let Some(frame) = stack.last_mut() {
        let Some(r) = frame.list.get(frame.next) else {
            stack.pop();
            path.pop();
            continue;
        };
        let i = frame.next;
        frame.next += 1;
        let world = frame.world;
        if r.kind == "INSERT" {
            let name = r.fields.get_str(2).unwrap_or("");
            let Some(block) = by_name.get(name).map(|i| &blocks[*i]) else {
                skipped.add("INSERT", format!("DXF block definition not found: {name}."));
                continue;
            };
            if path.contains(&name) {
                let cycle = path
                    .iter()
                    .copied()
                    .chain(std::iter::once(name))
                    .collect::<Vec<_>>()
                    .join(" -> ");
                skipped.warnings.push(json!({"code":"CAD_BLOCK_CYCLE","message":format!("Cyclic DXF block reference was ignored: {cycle}."),"type":"INSERT"}));
                skipped.count += 1;
                continue;
            }
            let local = Transform::insert(r, block.base);
            path.push(name);
            stack.push(Cursor {
                list: &block.records,
                next: 0,
                world: Some(world.map_or(local, |p| p.compose(local))),
            });
        } else if let Some(mut shape) = shape::shape(r, segments) {
            if count as f64 >= limit {
                if !skipped.limited {
                    skipped.limited = true;
                    skipped.warnings.push(json!({"code":"CAD_ENTITY_LIMIT_REACHED","message":format!("DXF entity expansion was limited to {limit} visible entities.")}));
                }
                skipped.add(
                    &r.kind,
                    format!("DXF entity expansion limit reached; skipped {}.", r.kind),
                );
                continue;
            }
            if let Some(transform) = world {
                transform.apply(&mut shape);
            }
            publish(0, &tables.entity(r, i, shape, &path));
            count += 1;
        } else {
            skipped.add(&r.kind, format!("Unsupported DXF entity: {}.", r.kind));
        }
    }
    if count == 0 {
        return 3;
    }
    let header = get("HEADER");
    let units = header.iter().enumerate().find_map(|(i, p)| {
        if p.code != 9 || !p.value.eq_ignore_ascii_case("$INSUNITS") {
            return None;
        }
        header[i + 1..(i + 8).min(header.len())]
            .get_str(70)
            .map(|v| number(v, 0.))
    });
    let definitions: Vec<_> = blocks
        .iter()
        .map(|b| json!({"name":b.name,"basePoint":b.base,"entityCount":b.records.len()}))
        .collect();
    publish(
        1,
        &json!({"units":units,"cadVersion":header.get_str(1).unwrap_or(""),"layers":tables.layers.values().collect::<Vec<_>>(),
        "blocks":definitions,"warnings":skipped.warnings,"skippedCount":skipped.count}),
    );
    0
}
#[no_mangle]
pub extern "C" fn dxf_parse(segments: f64, limit: f64) -> u32 {
    let bytes = INPUT.with_borrow_mut(std::mem::take);
    parse(&String::from_utf8_lossy(&bytes), segments, limit)
}

#[no_mangle]
pub extern "C" fn dxf_binary_signature() -> bool {
    INPUT.with_borrow(|bytes| bytes.strip_prefix(&[0xef,0xbb,0xbf]).unwrap_or(bytes).starts_with(b"AutoCAD Binary DXF"))
}

#[no_mangle]
pub extern "C" fn dxf_encoding() -> u32 {
    let bytes=INPUT.with_borrow_mut(std::mem::take);
    let source=String::from_utf8_lossy(&bytes).replace("\r\n","\n").replace('\r',"\n");
    let mut lines=source.split('\n');
    let mut header=false;
    while let (Some(group),Some(value))=(lines.next(),lines.next()) {
        if header && group.trim()=="3" {
            return match value.trim().to_ascii_uppercase().as_str() {"ANSI_949"|"CP949"=>1,"ANSI_1252"=>2,_=>0};
        }
        header=group.trim()=="9" && value.trim().eq_ignore_ascii_case("$DWGCODEPAGE");
    }
    0
}
