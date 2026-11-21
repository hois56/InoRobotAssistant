//! CAD feature edges for the 3D simulation's model outlines. Every arithmetic
//! step mirrors buildCleanOutlinePositions in 2_3DSimulation/outline-geometry-core.mjs,
//! so both paths return the same line segments in the same order.
use std::cell::RefCell;

use crate::with_buffer;

const NONE: u32 = u32::MAX;

type Vector = [f64; 3];

thread_local! {
    static INDICES: RefCell<Vec<u32>> = const { RefCell::new(Vec::new()) };
    static LINES: RefCell<Vec<f64>> = const { RefCell::new(Vec::new()) };
}

fn mix(mut x: u64) -> u64 {
    x ^= x >> 30;
    x = x.wrapping_mul(0xbf58_476d_1ce4_e5b9);
    x ^= x >> 27;
    x = x.wrapping_mul(0x94d0_49bb_1331_11eb);
    x ^ (x >> 31)
}

// JavaScript Math.round: nearest integer, ties toward positive infinity.
fn js_round(value: f64) -> f64 {
    let lower = value.floor();
    if value - lower >= 0.5 {
        lower + 1.0
    } else {
        lower
    }
}

// Rounded coordinates join into the same key text exactly when these match:
// -0 prints as "0".
fn text_key(value: f64) -> u64 {
    if value == 0.0 {
        0
    } else {
        value.to_bits()
    }
}

// V8's Math.hypot: scale by the largest magnitude, then Kahan-sum the squares.
fn js_hypot(values: Vector) -> f64 {
    let mut max = 0.0_f64;
    let mut nan = false;
    for value in values {
        if value.is_nan() {
            nan = true;
        } else if value.abs() > max {
            max = value.abs();
        }
    }
    if max == f64::INFINITY {
        return f64::INFINITY;
    }
    if nan {
        return f64::NAN;
    }
    if max == 0.0 {
        return 0.0;
    }
    let (mut sum, mut compensation) = (0.0_f64, 0.0_f64);
    for value in values {
        let n = value.abs() / max;
        let summand = n * n - compensation;
        let preliminary = sum + summand;
        compensation = (preliminary - sum) - summand;
        sum = preliminary;
    }
    sum.sqrt() * max
}

fn sub(a: Vector, b: Vector) -> Vector {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
fn cross(a: Vector, b: Vector) -> Vector {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}
fn edge_key(a: u32, b: u32) -> u64 {
    let (low, high) = if a < b { (a, b) } else { (b, a) };
    (u64::from(low) << 32) | u64::from(high)
}

// Insertion-ordered hash table that grows with its contents, like a JavaScript Map's keys.
struct Table<K> {
    keys: Vec<K>,
    slots: Vec<u32>,
    mask: usize,
}
impl<K: Copy + PartialEq> Table<K> {
    fn new() -> Self {
        Table { keys: Vec::new(), slots: vec![0; 16], mask: 15 }
    }
    fn find(&self, key: K, hash: u64) -> Option<usize> {
        let mut slot = (hash ^ (hash >> 32)) as usize & self.mask;
        loop {
            match self.slots[slot] {
                0 => return None,
                stored if self.keys[stored as usize - 1] == key => return Some(stored as usize - 1),
                _ => slot = (slot + 1) & self.mask,
            }
        }
    }
    /// The entry for `key`, appended when missing; the flag is true for a new entry.
    fn entry(&mut self, key: K, hash: impl Fn(K) -> u64) -> (usize, bool) {
        let first = hash(key);
        if let Some(found) = self.find(key, first) {
            return (found, false);
        }
        if (self.keys.len() + 1) * 2 > self.slots.len() {
            let size = self.slots.len() * 2;
            self.slots = vec![0; size];
            self.mask = size - 1;
            for index in 0..self.keys.len() {
                self.place(hash(self.keys[index]), index);
            }
        }
        self.keys.push(key);
        self.place(first, self.keys.len() - 1);
        (self.keys.len() - 1, true)
    }
    fn place(&mut self, hash: u64, index: usize) {
        let mut slot = (hash ^ (hash >> 32)) as usize & self.mask;
        while self.slots[slot] != 0 {
            slot = (slot + 1) & self.mask;
        }
        self.slots[slot] = index as u32 + 1;
    }
}

fn weld_hash(key: [u64; 3]) -> u64 {
    mix(key[0] ^ mix(key[1] ^ mix(key[2])))
}
fn face_hash(key: [u32; 3]) -> u64 {
    mix(u64::from(key[0]) ^ mix(u64::from(key[1]) ^ mix(u64::from(key[2]))))
}

// Math.min / Math.max: NaN wins, and -0 is below +0.
fn js_min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a == b {
        if a.is_sign_negative() { a } else { b }
    } else if a < b {
        a
    } else {
        b
    }
}
fn js_max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a == b {
        if a.is_sign_positive() { a } else { b }
    } else if a > b {
        a
    } else {
        b
    }
}

struct Edge {
    a: u32,
    b: u32,
    sides: u32, // head of this edge's list in `sides`
    count: u32,
    excluded: bool,
    degenerate: bool,
}

// One triangle side on an edge: the triangle (high bit set when the side runs
// from the higher to the lower vertex id) and the next side of the same edge.
// The feature test compares every pair, so list order does not matter.
const REVERSED: u32 = 1 << 31;

// getVertex: the first raw point referenced in each rounded bucket represents it.
struct Welder {
    tolerance: f64,
    welded_of_raw: Vec<u32>,
    buckets: Table<[u64; 3]>,
    vertices: Vec<Vector>,
}
impl Welder {
    fn vertex(&mut self, positions: &[f64], raw: usize) -> u32 {
        if self.welded_of_raw[raw] == NONE {
            let point = [positions[3 * raw], positions[3 * raw + 1], positions[3 * raw + 2]];
            let tolerance = self.tolerance;
            let key = point.map(|value| text_key(js_round(value / tolerance)));
            let (id, added) = self.buckets.entry(key, weld_hash);
            if added {
                self.vertices.push(point);
            }
            self.welded_of_raw[raw] = id as u32;
        }
        self.welded_of_raw[raw]
    }
}

#[no_mangle]
pub extern "C" fn outline_indices(len: usize) -> *mut u32 {
    INDICES.with_borrow_mut(|indices| {
        indices.resize(len, 0);
        indices.as_mut_ptr()
    })
}

#[no_mangle]
pub extern "C" fn outline_lines() -> *const f64 {
    LINES.with_borrow(|lines| lines.as_ptr())
}

/// Frees the index and segment buffers after JavaScript copied the result.
#[no_mangle]
pub extern "C" fn outline_release() {
    INDICES.with_borrow_mut(|indices| *indices = Vec::new());
    LINES.with_borrow_mut(|lines| *lines = Vec::new());
}

/// Input: number_buffer = positions (`position_len` values), then `bound_count`
/// boxes (min xyz, max xyz) and `range_count` (start, count) index ranges;
/// outline_indices = triangle indices when `indexed` is set. A NaN `weld`
/// selects the automatic tolerance. Output: outline_lines holds the segment end
/// points. Returns their value count, or -1 for input the JavaScript path must
/// handle (non-finite coordinates or an index outside the positions).
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn outline_edges(
    position_len: usize,
    indexed: u32,
    bound_count: usize,
    range_count: usize,
    weld: f64,
    cosine: f64,
    aspect: f64,
    prune: u32,
) -> i32 {
    let (indexed, prune) = (indexed != 0, prune != 0);
    let lines = with_buffer(|numbers| {
        let (positions, rest) = numbers.split_at(position_len);
        let (bounds, ranges) = rest.split_at(6 * bound_count);
        let bounds: Vec<(Vector, Vector)> =
            bounds.chunks_exact(6).map(|b| ([b[0], b[1], b[2]], [b[3], b[4], b[5]])).collect();
        let ranges: Vec<(f64, f64)> = ranges[..2 * range_count].chunks_exact(2).map(|r| (r[0], r[1])).collect();
        INDICES.with_borrow(|indices| {
            outline(positions, indexed.then_some(indices.as_slice()), &bounds, &ranges, weld, cosine, aspect, prune)
        })
    });
    let Some(lines) = lines else {
        return -1;
    };
    let count = lines.len() as i32;
    LINES.with_borrow_mut(|stored| *stored = lines);
    count
}

#[allow(clippy::too_many_arguments)]
fn outline(
    positions: &[f64],
    indices: Option<&[u32]>,
    bounds: &[(Vector, Vector)],
    ranges: &[(f64, f64)],
    weld: f64,
    cosine: f64,
    aspect: f64,
    prune: bool,
) -> Option<Vec<f64>> {
    if positions.len() % 3 != 0 || positions.iter().any(|value| !value.is_finite()) {
        return None;
    }
    let raw_count = positions.len() / 3;
    let tolerance = if weld.is_nan() {
        let mut min = [f64::INFINITY; 3];
        let mut max = [f64::NEG_INFINITY; 3];
        for (i, &value) in positions.iter().enumerate() {
            min[i % 3] = js_min(min[i % 3], value);
            max[i % 3] = js_max(max[i % 3], value);
        }
        let extent = js_max(js_max(max[0] - min[0], max[1] - min[1]), max[2] - min[2]);
        js_max(1e-6, js_min(0.02, extent * 1e-5))
    } else {
        weld
    };

    let mut welder = Welder { tolerance, welded_of_raw: vec![NONE; raw_count], buckets: Table::new(), vertices: Vec::new() };

    let count = indices.map_or(raw_count, <[u32]>::len);
    if let Some(indices) = indices {
        if indices.iter().any(|&index| index as usize >= raw_count) {
            return None;
        }
    }
    let mut faces: Table<[u32; 3]> = Table::new();
    let mut edge_table: Table<u64> = Table::new();
    let mut edges: Vec<Edge> = Vec::new();
    let mut units: Vec<Vector> = Vec::new(); // unit normal of each kept triangle
    let mut sides: Vec<(u32, u32)> = Vec::new(); // triangle | REVERSED, next side
    let mut excluded_keys: Vec<u64> = Vec::new();
    let mut degenerate_keys: Vec<u64> = Vec::new();
    let mut i = 0;
    while i + 2 < count {
        let start = i;
        i += 3;
        let raw = |offset: usize| indices.map_or(start + offset, |list| list[start + offset] as usize);
        let ids = [0, 1, 2].map(|offset| welder.vertex(positions, raw(offset)));
        let vertices = &welder.vertices;
        if ids[0] == ids[1] || ids[1] == ids[2] || ids[0] == ids[2] {
            continue;
        }
        let pairs = [(ids[0], ids[1]), (ids[1], ids[2]), (ids[2], ids[0])];
        let at = start as f64;
        if ranges.iter().any(|&(first, length)| at >= first && at < first + length) {
            excluded_keys.extend(pairs.map(|(a, b)| edge_key(a, b)));
        }
        // The ids are distinct, so ordering three of them needs no general sort.
        let low = ids[0].min(ids[1]).min(ids[2]);
        let high = ids[0].max(ids[1]).max(ids[2]);
        let sorted = [low, ids[0] ^ ids[1] ^ ids[2] ^ low ^ high, high];
        if !faces.entry(sorted, face_hash).1 {
            continue;
        }
        let [a, b, c] = ids.map(|id| vertices[id as usize]);
        let ab = sub(b, a);
        let ac = sub(c, a);
        let normal = cross(ab, ac);
        let area2 = js_hypot(normal);
        let longest = js_max(js_max(js_hypot(ab), js_hypot(ac)), js_hypot(sub(c, b)));
        if area2 <= longest * tolerance || area2 < longest * longest * aspect {
            degenerate_keys.extend(pairs.map(|(a, b)| edge_key(a, b)));
            continue;
        }
        let triangle = units.len() as u32;
        units.push(normal.map(|value| value / area2));
        for (a, b) in pairs {
            let (slot, added) = edge_table.entry(edge_key(a, b), mix);
            if added {
                edges.push(Edge { a, b, sides: NONE, count: 0, excluded: false, degenerate: false });
            }
            let edge = &mut edges[slot];
            sides.push((if a < b { triangle } else { triangle | REVERSED }, edge.sides));
            edge.sides = sides.len() as u32 - 1;
            edge.count += 1;
        }
    }
    let vertices = welder.vertices;
    for key in excluded_keys {
        if let Some(slot) = edge_table.find(key, mix(key)) {
            edges[slot].excluded = true;
        }
    }
    for key in degenerate_keys {
        if let Some(slot) = edge_table.find(key, mix(key)) {
            edges[slot].degenerate = true;
        }
    }

    let mut list: Vec<(Vector, f64)> = Vec::new();
    let mut feature_edges: Vec<(u32, u32)> = Vec::new();
    for edge in &edges {
        if edge.excluded {
            continue;
        }
        let mut feature = edge.count == 1 && !edge.degenerate;
        if !feature {
            list.clear();
            let mut node = edge.sides;
            while node != NONE {
                let (side, next) = sides[node as usize];
                let direction = if side & REVERSED == 0 { 1.0 } else { -1.0 };
                list.push((units[(side & !REVERSED) as usize], direction));
                node = next;
            }
            'pairs: for i in 0..list.len() {
                for j in i + 1..list.len() {
                    let (first, second) = (list[i].0, list[j].0);
                    let sum = first[0] * second[0] + first[1] * second[1] + first[2] * second[2];
                    if sum * -list[i].1 * list[j].1 < cosine {
                        feature = true;
                        break 'pairs;
                    }
                }
            }
        }
        if feature {
            feature_edges.push((edge.a, edge.b));
        }
    }

    // Loose chains from tessellation defects: repeatedly drop edges with a free end.
    let mut removed = vec![false; feature_edges.len()];
    if prune {
        let mut degree = vec![0_u32; vertices.len()];
        let mut first = vec![NONE; vertices.len()];
        let mut next = vec![NONE; feature_edges.len() * 2];
        for (index, &(a, b)) in feature_edges.iter().enumerate() {
            for (side, vertex) in [a, b].into_iter().enumerate() {
                degree[vertex as usize] += 1;
                next[2 * index + side] = first[vertex as usize];
                first[vertex as usize] = (2 * index + side) as u32;
            }
        }
        let mut pending: Vec<u32> = (0..vertices.len() as u32).filter(|&v| degree[v as usize] == 1).collect();
        while let Some(vertex) = pending.pop() {
            if degree[vertex as usize] != 1 {
                continue;
            }
            let mut link = first[vertex as usize];
            while removed[link as usize / 2] {
                link = next[link as usize];
            }
            let index = link as usize / 2;
            removed[index] = true;
            let (a, b) = feature_edges[index];
            for end in [a, b] {
                degree[end as usize] -= 1;
                if degree[end as usize] == 1 {
                    pending.push(end);
                }
            }
        }
    }

    let mut lines: Vec<f64> = Vec::new();
    let mut segments: Vec<(Vector, Vector)> = Vec::new();
    let mut clipped: Vec<(Vector, Vector)> = Vec::new();
    for (index, &(a, b)) in feature_edges.iter().enumerate() {
        if removed[index] {
            continue;
        }
        segments.clear();
        segments.push((vertices[a as usize], vertices[b as usize]));
        for &(min, max) in bounds {
            clipped.clear();
            for &(start, end) in &segments {
                clip_outside(start, end, min, max, &mut clipped);
            }
            std::mem::swap(&mut segments, &mut clipped);
        }
        for &(start, end) in &segments {
            lines.extend(start);
            lines.extend(end);
        }
    }
    Some(lines)
}

// clipOutlineOutsideBounds: keep the parts of a segment outside an axis-aligned box.
fn clip_outside(start: Vector, end: Vector, min: Vector, max: Vector, out: &mut Vec<(Vector, Vector)>) {
    let direction = sub(end, start);
    let (mut enter, mut exit) = (0.0, 1.0);
    for axis in 0..3 {
        if direction[axis].abs() < 1e-12 {
            if start[axis] < min[axis] || start[axis] > max[axis] {
                out.push((start, end));
                return;
            }
            continue;
        }
        let first = (min[axis] - start[axis]) / direction[axis];
        let last = (max[axis] - start[axis]) / direction[axis];
        enter = js_max(enter, js_min(first, last));
        exit = js_min(exit, js_max(first, last));
        if enter >= exit {
            out.push((start, end));
            return;
        }
    }
    let at = |t: f64| -> Vector { std::array::from_fn(|axis| start[axis] + direction[axis] * t) };
    if enter > 1e-9 {
        out.push((start, at(enter)));
    }
    if exit < 1.0 - 1e-9 {
        out.push((at(exit), end));
    }
}
