//! Tool Selector part outlines: three.js r156 EdgesGeometry, step for step, so
//! the segments and their order match `new THREE.EdgesGeometry(geometry, angle)`.
use std::cell::RefCell;

type Vec3 = [f64; 3];
type Key = [u64; 3];

thread_local! {
    static POSITIONS: RefCell<Vec<f64>> = const { RefCell::new(Vec::new()) };
    static INDICES: RefCell<Vec<u32>> = const { RefCell::new(Vec::new()) };
    static LINES: RefCell<Vec<f64>> = const { RefCell::new(Vec::new()) };
}

#[no_mangle]
pub extern "C" fn edge_positions(len: usize) -> *mut f64 {
    POSITIONS.with_borrow_mut(|values| {
        values.resize(len, 0.0);
        values.as_mut_ptr()
    })
}

#[no_mangle]
pub extern "C" fn edge_indices(len: usize) -> *mut u32 {
    INDICES.with_borrow_mut(|values| {
        values.resize(len, 0);
        values.as_mut_ptr()
    })
}

#[no_mangle]
pub extern "C" fn edge_lines() -> *const f64 {
    LINES.with_borrow(|lines| lines.as_ptr())
}

/// Frees the input and result buffers after JavaScript copied the lines.
#[no_mangle]
pub extern "C" fn edge_release() {
    POSITIONS.with_borrow_mut(|values| *values = Vec::new());
    INDICES.with_borrow_mut(|values| *values = Vec::new());
    LINES.with_borrow_mut(|values| *values = Vec::new());
}

// Math.round: nearest integer, ties toward positive infinity.
fn js_round(value: f64) -> f64 {
    let lower = value.floor();
    if value - lower >= 0.5 {
        lower + 1.0
    } else {
        lower
    }
}

// Rounded coordinates print to the same hash text exactly when these match (-0 prints as "0").
fn text_key(value: f64) -> u64 {
    if value == 0.0 {
        0
    } else {
        value.to_bits()
    }
}

fn mix(mut x: u64) -> u64 {
    x ^= x >> 30;
    x = x.wrapping_mul(0xbf58_476d_1ce4_e5b9);
    x ^= x >> 27;
    x = x.wrapping_mul(0x94d0_49bb_1331_11eb);
    x ^ (x >> 31)
}

struct Edge {
    hash: (Key, Key),
    sibling: Option<(u32, u32, Vec3)>, // index0, index1, normal; None once matched
}

// The `edgeData` object: string keys keep insertion order, and a matched edge
// stays as a null entry so a third face on it starts no new edge.
struct EdgeData {
    edges: Vec<Edge>,
    slots: Vec<u32>,
    mask: usize,
}
impl EdgeData {
    fn new() -> Self {
        EdgeData { edges: Vec::new(), slots: vec![0; 64], mask: 63 }
    }
    fn hash(key: &(Key, Key)) -> u64 {
        let mut h = 0u64;
        for value in key.0.iter().chain(key.1.iter()) {
            h = mix(h ^ *value);
        }
        h
    }
    fn find(&self, key: &(Key, Key)) -> Option<usize> {
        let h = Self::hash(key);
        let mut slot = (h ^ (h >> 32)) as usize & self.mask;
        loop {
            match self.slots[slot] {
                0 => return None,
                stored if self.edges[stored as usize - 1].hash == *key => return Some(stored as usize - 1),
                _ => slot = (slot + 1) & self.mask,
            }
        }
    }
    fn place(&mut self, index: usize) {
        let h = Self::hash(&self.edges[index].hash);
        let mut slot = (h ^ (h >> 32)) as usize & self.mask;
        while self.slots[slot] != 0 {
            slot = (slot + 1) & self.mask;
        }
        self.slots[slot] = index as u32 + 1;
    }
    fn insert(&mut self, edge: Edge) {
        if (self.edges.len() + 1) * 2 > self.slots.len() {
            let size = self.slots.len() * 2;
            self.slots = vec![0; size];
            self.mask = size - 1;
            for index in 0..self.edges.len() {
                self.place(index);
            }
        }
        self.edges.push(edge);
        self.place(self.edges.len() - 1);
    }
}

// Triangle.getNormal(a, b, c)
fn normal(a: Vec3, b: Vec3, c: Vec3) -> Vec3 {
    let t = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
    let v = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    let n = [t[1] * v[2] - t[2] * v[1], t[2] * v[0] - t[0] * v[2], t[0] * v[1] - t[1] * v[0]];
    let length_squared = n[0] * n[0] + n[1] * n[1] + n[2] * n[2];
    if length_squared > 0.0 {
        let scale = 1.0 / length_squared.sqrt();
        n.map(|value| value * scale)
    } else {
        [0.0; 3]
    }
}

/// edge_positions = vertex positions (x, y, z); edge_indices = the index
/// attribute when `indexed` is set; `index_count` is the attribute's count.
/// Returns the number of line values in edge_lines, or -1 for input the
/// JavaScript EdgesGeometry must handle (non-finite coordinates, an index
/// outside the positions or a count that is not a multiple of three).
#[no_mangle]
pub extern "C" fn edge_build(indexed: u32, index_count: usize, threshold_dot: f64) -> i32 {
    let lines = POSITIONS.with_borrow(|positions| {
        INDICES.with_borrow(|indices| build(positions, (indexed != 0).then_some(indices.as_slice()), index_count, threshold_dot))
    });
    match lines {
        Some(lines) => {
            let count = lines.len() as i32;
            LINES.with_borrow_mut(|stored| *stored = lines);
            count
        }
        None => -1,
    }
}

fn build(positions: &[f64], indices: Option<&[u32]>, index_count: usize, threshold_dot: f64) -> Option<Vec<f64>> {
    let vertex_count = positions.len() / 3;
    if index_count % 3 != 0 || indices.is_some_and(|list| list.len() < index_count) {
        return None;
    }
    let index = |i: usize| indices.map_or(i, |list| list[i] as usize);
    let vertex = |v: usize| -> Vec3 { [positions[3 * v], positions[3 * v + 1], positions[3 * v + 2]] };
    for i in 0..index_count {
        let v = index(i);
        if v >= vertex_count || !vertex(v).iter().all(|value| value.is_finite()) {
            return None;
        }
    }
    let precision = 10000.0;
    let key = |p: Vec3| -> Key { p.map(|value| text_key(js_round(value * precision))) };
    let mut data = EdgeData::new();
    let mut lines: Vec<f64> = Vec::new();
    for i in (0..index_count).step_by(3) {
        let ids = [index(i), index(i + 1), index(i + 2)];
        let points = ids.map(vertex);
        let n = normal(points[0], points[1], points[2]);
        let hashes = points.map(key);
        if hashes[0] == hashes[1] || hashes[1] == hashes[2] || hashes[2] == hashes[0] {
            continue;
        }
        for j in 0..3 {
            let next = (j + 1) % 3;
            let hash = (hashes[j], hashes[next]);
            let reverse = (hashes[next], hashes[j]);
            let sibling = data.find(&reverse);
            if let Some(found) = sibling.filter(|&found| data.edges[found].sibling.is_some()) {
                let (_, _, other) = data.edges[found].sibling.expect("unmatched edge");
                if n[0] * other[0] + n[1] * other[1] + n[2] * other[2] <= threshold_dot {
                    lines.extend(points[j]);
                    lines.extend(points[next]);
                }
                data.edges[found].sibling = None;
            } else if data.find(&hash).is_none() {
                data.insert(Edge { hash, sibling: Some((ids[j] as u32, ids[next] as u32, n)) });
            }
        }
    }
    for edge in &data.edges {
        if let Some((index0, index1, _)) = edge.sibling {
            lines.extend(vertex(index0 as usize));
            lines.extend(vertex(index1 as usize));
        }
    }
    Some(lines)
}
