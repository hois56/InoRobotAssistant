use std::cell::RefCell;

#[derive(Default)]
struct Mesh {
    positions: Vec<f32>,
    normals: Vec<f32>,
    colors: Vec<f32>,
    alpha: Option<f64>,
    groups: Vec<Group>,
    proxy_positions: Vec<f32>,
    proxy_indices: Vec<u32>,
}
struct Group {
    start: usize,
    count: usize,
    name: String,
}
#[derive(Default)]
struct Reader {
    bytes: Vec<u8>,
    mesh: Mesh,
}
thread_local! {static READER:RefCell<Reader>=RefCell::new(Reader::default());}
#[no_mangle]
pub extern "C" fn stl_input(length: usize) -> *mut u8 {
    READER.with_borrow_mut(|r| {
        r.bytes.resize(length, 0);
        r.bytes.as_mut_ptr()
    })
}
fn triplet(bytes: &[u8]) -> [f32; 3] {
    std::array::from_fn(|i| f32::from_le_bytes(bytes[4 * i..4 * i + 4].try_into().unwrap()))
}
fn linear(s: f64) -> f32 {
    (if s < 0.04045 {
        s * 0.0773993808
    } else {
        (s * 0.9478672986 + 0.0521327014).powf(2.4)
    }) as f32
}
fn binary(data: &[u8], count: usize) -> Option<Mesh> {
    let end = count.checked_mul(50)?.checked_add(84)?;
    if end > data.len() {
        return None;
    }
    let default = data[..80]
        .windows(10)
        .filter(|s| &s[..6] == b"COLOR=")
        .last()
        .map(|s| {
            (
                [
                    linear(s[6] as f64 / 255.),
                    linear(s[7] as f64 / 255.),
                    linear(s[8] as f64 / 255.),
                ],
                s[9] as f64 / 255.,
            )
        });
    let mut m = Mesh {
        positions: Vec::with_capacity(9 * count),
        normals: Vec::with_capacity(9 * count),
        alpha: default.map(|(_, alpha)| alpha),
        ..Mesh::default()
    };
    if default.is_some() {
        m.colors.reserve_exact(9 * count);
    }
    for face in data[84..end].chunks_exact(50) {
        let normal = triplet(face);
        let packed = u16::from_le_bytes([face[48], face[49]]);
        let color = default.map(|(base, _)| {
            if packed & 0x8000 != 0 {
                base
            } else {
                [0u32, 5, 10].map(|k| linear(f64::from((packed >> k) & 31) / 31.))
            }
        });
        for p in face[12..48].chunks_exact(12) {
            m.positions.extend(triplet(p));
            m.normals.extend(normal);
            if let Some(c) = color {
                m.colors.extend(c);
            }
        }
    }
    Some(m)
}
fn text_triplets<'a>(face: &'a str, tag: &'a str) -> impl Iterator<Item = [f32; 3]> + 'a {
    face.match_indices(tag).filter_map(move |(i, _)| {
        let tail = &face[i + tag.len()..];
        if !tail.starts_with(char::is_whitespace) {
            return None;
        }
        let mut words = tail.split_whitespace();
        Some(std::array::from_fn(|_| {
            words
                .next()
                .and_then(|v| v.parse::<f32>().ok())
                .unwrap_or(f32::NAN)
        }))
    })
}
fn ascii(data: &[u8]) -> Mesh {
    let decoded = String::from_utf8_lossy(data);
    let mut source = decoded.as_ref();
    let mut m = Mesh::default();
    let mut normal = [0.; 3];
    while let Some((_, solid)) = source.split_once("solid") {
        let Some((body, rest)) = solid.split_once("endsolid") else {
            break;
        };
        let start = m.positions.len() / 3;
        let name = body
            .strip_prefix(char::is_whitespace)
            .and_then(|s| s.lines().next())
            .unwrap_or("")
            .to_owned();
        let mut faces = body;
        while let Some((_, new_face)) = faces.split_once("facet") {
            let Some((face, remaining)) = new_face.split_once("endfacet") else {
                break;
            };
            if let Some(n) = text_triplets(face, "normal").last() {
                normal = n;
            }
            for p in text_triplets(face, "vertex") {
                m.positions.extend(p);
                m.normals.extend(normal);
            }
            faces = remaining;
        }
        m.groups.push(Group {
            start,
            count: m.positions.len() / 3 - start,
            name,
        });
        source = rest;
    }
    m
}
impl Mesh {
    fn proxy(&mut self) {
        if self.positions.len() / 9 <= 50000 {
            return;
        }
        let mut min = [f64::INFINITY; 3];
        let mut max = [f64::NEG_INFINITY; 3];
        for v in self.positions.chunks_exact(3) {
            for i in 0..3 {
                min[i] = min[i].min(v[i] as f64);
                max[i] = max[i].max(v[i] as f64);
            }
        }
        let cell: [f64; 3] = std::array::from_fn(|i| (max[i] - min[i]).max(1e-6) / 8.);
        let cell_of = |v: f64, i: usize| (((v - min[i]) / cell[i]).floor() as usize).min(7);
        let mut marked = [false; 512];
        let mut cells = Vec::new();
        for tri in self.positions.chunks_exact(9) {
            let mut lo = [0; 3];
            let mut hi = [0; 3];
            for i in 0..3 {
                lo[i] = cell_of(tri[i].min(tri[i + 3]).min(tri[i + 6]) as f64, i);
                hi[i] = cell_of(tri[i].max(tri[i + 3]).max(tri[i + 6]) as f64, i);
            }
            for z in lo[2]..=hi[2] {
                for y in lo[1]..=hi[1] {
                    for x in lo[0]..=hi[0] {
                        let index = x + 8 * (y + 8 * z);
                        if !marked[index] {
                            marked[index] = true;
                            cells.push([x, y, z]);
                        }
                    }
                }
            }
        }
        for position in cells {
            let base = (self.proxy_positions.len() / 3) as u32;
            let low: [f64; 3] = std::array::from_fn(|i| min[i] + position[i] as f64 * cell[i]);
            let high: [f64; 3] = std::array::from_fn(|i| {
                if position[i] == 7 {
                    max[i]
                } else {
                    low[i] + cell[i]
                }
            });
            for bits in [0, 1, 3, 2, 4, 5, 7, 6] {
                for i in 0..3 {
                    self.proxy_positions.push(if bits & (1 << i) != 0 {
                        high[i]
                    } else {
                        low[i]
                    } as f32);
                }
            }
            self.proxy_indices.extend(
                [
                    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4,
                    7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
                ]
                .map(|x| base + x),
            );
        }
    }
}
#[no_mangle]
pub extern "C" fn stl_parse(proxy: bool) -> bool {
    READER.with_borrow_mut(|r| {
        let bytes = std::mem::take(&mut r.bytes);
        let count = bytes
            .get(80..84)
            .map(|b| u32::from_le_bytes(b.try_into().unwrap()) as usize);
        let expected = count.and_then(|v| v.checked_mul(50)?.checked_add(84));
        let is_text = bytes.windows(5).take(5).any(|s| s == b"solid");
        let mesh = if expected != Some(bytes.len()) && is_text {
            Some(ascii(&bytes))
        } else {
            count.and_then(|count| binary(&bytes, count))
        };
        drop(bytes);
        let Some(mut mesh) = mesh else {
            return false;
        };
        if proxy {
            mesh.proxy();
        }
        r.mesh = mesh;
        true
    })
}
#[no_mangle]
pub extern "C" fn stl_groups() -> usize {
    READER.with_borrow(|r| r.mesh.groups.len())
}
#[no_mangle]
pub extern "C" fn stl_alpha() -> f64 {
    READER.with_borrow(|r| r.mesh.alpha.unwrap_or(-1.))
}
#[no_mangle]
pub extern "C" fn stl_group(index: usize, field: usize) -> usize {
    READER.with_borrow(|r| {
        let g = &r.mesh.groups[index];
        match field {
            0 => g.start,
            1 => g.count,
            2 => g.name.as_ptr() as usize,
            _ => g.name.len(),
        }
    })
}
#[no_mangle]
pub extern "C" fn stl_field(field: usize, length: bool) -> usize {
    READER.with_borrow(|r| {
        let m = &r.mesh;
        if field == 4 {
            return if length {
                m.proxy_indices.len()
            } else {
                m.proxy_indices.as_ptr() as usize
            };
        }
        let a = match field {
            0 => &m.positions,
            1 => &m.normals,
            2 => &m.colors,
            _ => &m.proxy_positions,
        };
        if length {
            a.len()
        } else {
            a.as_ptr() as usize
        }
    })
}
#[no_mangle]
pub extern "C" fn stl_release() {
    READER.with_borrow_mut(|r| *r = Reader::default());
}
