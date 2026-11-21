//! Mesh topology for STEP snap points: vertex welding, triangle properties,
//! feature edges and B-rep face centres. Every arithmetic step mirrors
//! 3_ToolSelector/snap-geometry.mjs so both paths return identical candidates.
use crate::{NUMBERS, OUTPUT, WORDS};

const EPSILON: f64 = 1e-12;
const MISSING: u32 = u32::MAX;

// Each table's entry count is bounded before it is filled, so a fixed
// open-addressing index (keys kept by the caller) replaces std's HashMap and
// keeps the shared site engine small.
struct Index {
    slots: Vec<u32>,
    mask: usize,
}
impl Index {
    fn new(entries: usize) -> Self {
        let size = (entries * 2).max(8).next_power_of_two();
        Index { slots: vec![0; size], mask: size - 1 }
    }
    /// The entry whose key `same` accepts, or None after recording `next` for this key.
    fn find_or_insert(&mut self, hash: u64, next: usize, same: impl Fn(usize) -> bool) -> Option<usize> {
        let mut slot = (hash ^ (hash >> 32)) as usize & self.mask;
        loop {
            match self.slots[slot] {
                0 => {
                    self.slots[slot] = next as u32 + 1;
                    return None;
                }
                stored if same(stored as usize - 1) => return Some(stored as usize - 1),
                _ => slot = (slot + 1) & self.mask,
            }
        }
    }
}
fn mix(mut x: u64) -> u64 {
    x ^= x >> 30;
    x = x.wrapping_mul(0xbf58_476d_1ce4_e5b9);
    x ^= x >> 27;
    x = x.wrapping_mul(0x94d0_49bb_1331_11eb);
    x ^ (x >> 31)
}

type Vector = [f64; 3];

// JavaScript Math.round: nearest integer, ties toward positive infinity.
fn js_round(value: f64) -> f64 {
    let lower = value.floor();
    if value - lower >= 0.5 {
        lower + 1.0
    } else {
        lower
    }
}

// Two doubles give the same template-string text exactly when this key matches:
// -0 prints as "0" and every NaN prints as "NaN".
fn text_key(value: f64) -> u64 {
    if value == 0.0 {
        0
    } else if value.is_nan() {
        f64::NAN.to_bits()
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
fn add(a: Vector, b: Vector) -> Vector {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}
fn scale(v: Vector, s: f64) -> Vector {
    [v[0] * s, v[1] * s, v[2] * s]
}
fn dot(a: Vector, b: Vector) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
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

struct Triangle {
    ids: [u32; 3],
    area: f64,
    normal: Vector,
    centroid: Vector,
}

// Insertion-ordered edge map, like a JavaScript Map keyed by "low:high".
struct EdgeMap {
    index: Index,
    keys: Vec<u64>,
    edges: Vec<(u32, u32)>,
}
impl EdgeMap {
    fn new(entries: usize) -> Self {
        EdgeMap { index: Index::new(entries), keys: Vec::new(), edges: Vec::new() }
    }
    /// The slot of an existing key, or None after appending this edge.
    fn slot(&mut self, a: u32, b: u32) -> Option<usize> {
        let key = edge_key(a, b);
        let keys = &self.keys;
        let found = self.index.find_or_insert(mix(key), keys.len(), |slot| keys[slot] == key);
        if found.is_none() {
            self.keys.push(key);
            self.edges.push((a, b));
        }
        found
    }
    /// Map.set: a replaced value keeps the key's first position.
    fn set(&mut self, a: u32, b: u32) {
        if let Some(slot) = self.slot(a, b) {
            self.edges[slot] = (a, b);
        }
    }
}

/// Input: NUMBERS holds the selected raw positions (x, y, z per vertex).
/// WORDS holds the triangle count, four words per triangle (three raw vertex
/// indices and the source triangle index), the B-rep face count and a
/// (first, last) source-triangle range per face.
/// Output: OUTPUT = [welded, triangles, edges, faces, first raw index of each
/// welded vertex, edge vertex pairs, face indices]; NUMBERS = face centres.
/// Returns 0, or 1 for a vertex index outside the positions.
#[no_mangle]
pub extern "C" fn snap_topology(tolerance: f64, sharp_cosine: f64) -> u32 {
    NUMBERS.with_borrow_mut(|numbers| {
        WORDS.with_borrow(|words| {
            OUTPUT.with_borrow_mut(|out| topology(numbers, words, out, tolerance, sharp_cosine))
        })
    })
}

const SIDES: [(usize, usize); 3] = [(0, 1), (1, 2), (2, 0)];

fn topology(numbers: &mut Vec<f64>, words: &[u32], out: &mut Vec<u32>, tolerance: f64, sharp_cosine: f64) -> u32 {
    let raw_count = numbers.len() / 3;
    let raw = |index: usize| -> Vector { [numbers[3 * index], numbers[3 * index + 1], numbers[3 * index + 2]] };

    // weldPositions: the first vertex of each rounded-coordinate bucket represents it.
    let inverse = 1.0 / tolerance;
    let mut buckets = Index::new(raw_count);
    let mut keys: Vec<[u64; 3]> = Vec::new();
    let mut first_raw: Vec<u32> = Vec::new();
    let mut welded_of_raw: Vec<u32> = Vec::with_capacity(raw_count);
    for vertex in 0..raw_count {
        let key = raw(vertex).map(|value| text_key(js_round(value * inverse)));
        let hash = mix(key[0] ^ mix(key[1] ^ mix(key[2])));
        let welded = match buckets.find_or_insert(hash, keys.len(), |slot| keys[slot] == key) {
            Some(existing) => existing,
            None => {
                keys.push(key);
                first_raw.push(vertex as u32);
                keys.len() - 1
            }
        };
        welded_of_raw.push(welded as u32);
    }
    let position = |welded: u32| raw(first_raw[welded as usize] as usize);

    // addTriangle
    let triangle_count = words.first().copied().unwrap_or(0) as usize;
    let mut triangles: Vec<Triangle> = Vec::with_capacity(triangle_count);
    let mut sources: Vec<u32> = Vec::with_capacity(triangle_count);
    for entry in words[1..1 + 4 * triangle_count].chunks_exact(4) {
        let mut ids = [0_u32; 3];
        for (id, &vertex) in ids.iter_mut().zip(&entry[..3]) {
            let Some(&welded) = welded_of_raw.get(vertex as usize) else {
                return 1;
            };
            *id = welded;
        }
        if ids[0] == ids[1] || ids[1] == ids[2] || ids[0] == ids[2] {
            continue;
        }
        let [a, b, c] = ids.map(position);
        let normal_vector = cross(sub(b, a), sub(c, a));
        let twice_area = js_hypot(normal_vector);
        let area = twice_area * 0.5;
        if area <= EPSILON {
            continue;
        }
        let normal = if twice_area > EPSILON {
            scale(normal_vector, 1.0 / twice_area)
        } else {
            [0.0; 3]
        };
        triangles.push(Triangle { ids, area, normal, centroid: scale(add(add(a, b), c), 1.0 / 3.0) });
        sources.push(entry[3]);
    }

    let faces_at = 1 + 4 * triangle_count;
    let face_count = words.get(faces_at).copied().unwrap_or(0) as usize;
    // Every feature edge is a side of a kept triangle.
    let mut feature = EdgeMap::new(triangles.len() * 3);
    let mut centres: Vec<(u32, Vector)> = Vec::new();
    if face_count > 0 {
        // Boundary edges of each B-rep face (used by one of its triangles) are feature edges.
        // A later duplicate of a source triangle replaces the earlier one, as in the JS Map.
        let span = sources.iter().map(|&source| source as usize + 1).max().unwrap_or(0);
        let mut by_source = vec![MISSING; span];
        for (index, &source) in sources.iter().enumerate() {
            by_source[source as usize] = index as u32;
        }
        let mut members: Vec<u32> = Vec::new();
        let ranges = &words[faces_at + 1..faces_at + 1 + 2 * face_count];
        for (face_index, range) in ranges.chunks_exact(2).enumerate() {
            members.clear();
            let (first, last) = (range[0] as usize, (range[1] as usize).min(span.saturating_sub(1)));
            if span > 0 && first <= last {
                members.extend(by_source[first..=last].iter().copied().filter(|&found| found != MISSING));
            }
            let mut local = EdgeMap::new(members.len() * 3);
            let mut counts: Vec<u32> = Vec::new();
            let mut area = 0.0;
            let mut weighted = [0.0; 3];
            for &found in &members {
                let triangle = &triangles[found as usize];
                area += triangle.area;
                weighted = add(weighted, scale(triangle.centroid, triangle.area));
                for (from, to) in SIDES {
                    match local.slot(triangle.ids[from], triangle.ids[to]) {
                        Some(slot) => counts[slot] += 1,
                        None => counts.push(1),
                    }
                }
            }
            for (slot, &(a, b)) in local.edges.iter().enumerate() {
                if counts[slot] == 1 {
                    feature.set(a, b);
                }
            }
            if area > EPSILON {
                centres.push((face_index as u32, scale(weighted, 1.0 / area)));
            }
        }
    } else {
        // Open edges, non-manifold edges and creases sharper than the threshold.
        let mut all = EdgeMap::new(triangles.len() * 3);
        let mut adjacent: Vec<(u32, u32, u32)> = Vec::new(); // count, first two triangles
        for (index, triangle) in triangles.iter().enumerate() {
            for (from, to) in SIDES {
                match all.slot(triangle.ids[from], triangle.ids[to]) {
                    Some(slot) => {
                        let entry = &mut adjacent[slot];
                        if entry.0 == 1 {
                            entry.2 = index as u32;
                        }
                        entry.0 += 1;
                    }
                    None => adjacent.push((1, index as u32, 0)),
                }
            }
        }
        for (slot, &(a, b)) in all.edges.iter().enumerate() {
            let (count, first, second) = adjacent[slot];
            if count != 2
                || dot(triangles[first as usize].normal, triangles[second as usize].normal) < sharp_cosine
            {
                feature.set(a, b);
            }
        }
    }

    out.clear();
    out.extend([first_raw.len() as u32, triangles.len() as u32, feature.edges.len() as u32, centres.len() as u32]);
    out.extend_from_slice(&first_raw);
    out.extend(feature.edges.iter().flat_map(|&(a, b)| [a, b]));
    out.extend(centres.iter().map(|&(face, _)| face));
    numbers.clear();
    numbers.extend(centres.iter().flat_map(|&(_, point)| point));
    0
}

