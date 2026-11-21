// SPDX-License-Identifier: AGPL-3.0-only
//! Saved SolidWorks tessellation reader ported from CAD_Lightweight V2.0.

use memchr::memmem::{find, find_iter};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    io::{self, Read, Seek},
    path::Path,
};

pub(crate) type Streams = HashMap<String, Vec<u8>>;
const MARK: &[u8] = &[255, 254, 255];
const STRIPS: &[u8] = &[4, 0, 0, 0, 8, 0, 0, 0, 2, 0, 0, 0];
const POINTS: &[u8] = &[12, 0, 0, 0, 100, 0, 0, 0, 2, 0, 0, 0];
const ID: [f64; 12] = [1., 0., 0., 0., 0., 1., 0., 0., 0., 0., 1., 0.];
fn word(d: &[u8], i: usize) -> Option<usize> {
    Some(u32::from_le_bytes(d.get(i..i + 4)?.try_into().ok()?) as usize)
}
fn wanted(n: &str) -> bool {
    matches!(
        n,
        "Contents/DisplayLists" | "swXmlContents/COMPINSTANCETREE"
    ) || n.starts_with("FaceTessellations/")
}
pub(crate) fn streams(file: &mut (impl Read + Seek), wanted: impl Fn(&str) -> bool) -> Option<Streams> {
    let mut magic = [0; 8];
    file.read_exact(&mut magic).ok()?;
    file.rewind().ok()?;
    let mut out = Streams::new();
    if magic == [208, 207, 17, 224, 161, 177, 26, 225] {
        let mut c = cfb::CompoundFile::open(file).ok()?;
        let names: Vec<_> = c
            .walk()
            .filter(|e| e.is_stream())
            .map(|e| {
                e.path()
                    .to_string_lossy()
                    .replace('\\', "/")
                    .trim_start_matches('/')
                    .to_owned()
            })
            .filter(|n| wanted(n))
            .collect();
        for n in names {
            let mut b = Vec::new();
            c.open_stream(&n).ok()?.read_to_end(&mut b).ok()?;
            out.insert(n, b);
        }
    } else {
        let mut d = Vec::new();
        file.read_to_end(&mut d).ok()?;
        let key = if magic[4..7] == [0, 0, 0] && magic[7] != 0 {
            magic[7] as u32
        } else {
            4
        };
        let marker = &[20, 0, 6, 0, 8, 0];
        let mut p = 0;
        while let Some(at) = find(&d[p..], marker).map(|i| p + i) {
            p = at + 6;
            let z = word(&d, at + 14)?;
            let size = word(&d, at + 18)?;
            let n = word(&d, at + 22)?;
            if n > 4096 {
                continue;
            }
            let Some(name_bytes) = d.get(at + 26..at + 26 + n) else {
                continue;
            };
            let name: String = name_bytes
                .iter()
                .map(|b| char::from(b.rotate_left(key)))
                .collect();
            if !wanted(&name) || size > 1 << 30 {
                continue;
            }
            let start = at + 26 + n;
            let Some(buf) = d.get(start..start + z) else {
                continue;
            };
            let mut inflated = Vec::new();
            if flate2::read::DeflateDecoder::new(buf)
                .take(size as u64 + 1)
                .read_to_end(&mut inflated)
                .is_ok()
                && inflated.len() == size
                && crc32fast::hash(&inflated) as usize == word(&d, at + 10)?
            {
                out.insert(name, inflated);
                p = start + z;
            }
        }
    }
    Some(out)
}
fn string(d: &[u8], i: usize) -> Option<(usize, String)> {
    if d.get(i..i + 3)? != MARK {
        return None;
    }
    let mut p = i + 4;
    let mut n = *d.get(i + 3)? as usize;
    if n == 255 {
        n = u16::from_le_bytes(d.get(p..p + 2)?.try_into().ok()?) as usize;
        p += 2;
        if n == 65535 {
            n = word(d, p)?;
            p += 4;
        }
    }
    if n > 4096 {
        return None;
    }
    let s = d
        .get(p..p + 2 * n)?
        .chunks_exact(2)
        .map(|b| u16::from_le_bytes([b[0], b[1]]))
        .collect::<Vec<_>>();
    Some((p + 2 * n, String::from_utf16(&s).ok()?))
}
struct Face {
    at: usize,
    end: usize,
    color: Option<u32>,
    id: Option<u32>,
    xyz: usize,
    normal: Option<usize>,
    vertices: usize,
    strips: Vec<usize>,
}
fn faces(d: &[u8]) -> Option<Vec<Face>> {
    let mut out = Vec::new();
    let mut p = 0;
    while let Some(at) = find(&d[p..], STRIPS).map(|k| k + p) {
        p = at + 12;
        let count = word(d, p)?;
        let second = at + 16 + 4 * count;
        if d.get(second..second + 12) != Some(POINTS) {
            continue;
        }
        let mut arrays = [(0, 0); 6];
        let mut end = at;
        for (j, (width, kind)) in [(4, 8), (12, 100), (12, 100), (4, 8), (4, 8), (1, 8)]
            .into_iter()
            .enumerate()
        {
            if (word(d, end)?, word(d, end + 4)?, word(d, end + 8)?) != (width, kind, 2) {
                return None;
            }
            let n = word(d, end + 12)?;
            arrays[j] = (end + 16, n);
            end += 16 + width * n;
            if end > d.len() {
                return None;
            }
        }
        p = end;
        let strips = (0..count)
            .map(|j| word(d, arrays[0].0 + j * 4))
            .collect::<Option<Vec<_>>>()?;
        let vertices = arrays[1].1;
        if strips.iter().any(|&n| n < 3)
            || strips.iter().sum::<usize>() != vertices
            || (arrays[2].1 != 0 && arrays[2].1 != vertices)
            || arrays[4].1 != count
        {
            return None;
        }
        for (j, &n) in strips.iter().enumerate() {
            if word(d, arrays[4].0 + j * 4)? != 2 * n - 2 {
                return None;
            }
        }
        out.push(Face {
            at,
            end,
            color: None,
            id: None,
            xyz: arrays[1].0,
            normal: (arrays[2].1 > 0).then_some(arrays[2].0),
            vertices,
            strips,
        });
    }
    Some(out)
}
#[derive(Default)]
pub(crate) struct Display {
    meshes: Vec<Value>,
    bytes: Vec<u8>,
    nodes: Vec<Value>,
}
impl Display {
    fn mesh(&mut self, d: &[u8], faces: &[Face]) -> Option<usize> {
        let offset = self.bytes.len();
        let normals = faces
            .iter()
            .filter(|f| f.vertices > 0)
            .all(|f| f.normal.is_some());
        for f in faces {
            self.bytes
                .extend_from_slice(&d[f.xyz..f.xyz + 12 * f.vertices]);
        }
        if normals {
            for f in faces {
                if let Some(i) = f.normal {
                    self.bytes.extend_from_slice(&d[i..i + 12 * f.vertices]);
                }
            }
        }
        let mut vertices = 0u32;
        let mut counts = Vec::new();
        let mut indices = 0;
        for f in faces.iter().filter(|f| f.vertices > 0) {
            let triangles = f.vertices - 2 * f.strips.len();
            counts.push(triangles);
            indices += 3 * triangles;
            for &n in &f.strips {
                let end = vertices.checked_add(u32::try_from(n).ok()?)?;
                for (j, a) in (vertices..end - 2).enumerate() {
                    let odd = (j & 1) as u32;
                    for k in [a + odd, a + 1 - odd, a + 2] {
                        self.bytes.extend_from_slice(&k.to_le_bytes());
                    }
                }
                vertices = end;
            }
        }
        if indices == 0 {
            return None;
        }
        let mut mesh = json!({ "offset":offset,"vertices":vertices,"indices":indices,"normals":normals,"faces":counts });
        if faces.iter().any(|f| f.id.is_some()) {
            mesh["faceIds"] = json!(
                faces
                    .iter()
                    .filter(|f| f.vertices > 0)
                    .map(|f| f.id)
                    .collect::<Vec<_>>()
            );
        }
        if faces.iter().any(|f| f.color.is_some()) {
            mesh["faceColors"] = json!(
                faces
                    .iter()
                    .filter(|f| f.vertices > 0)
                    .map(|f| f.color)
                    .collect::<Vec<_>>()
            );
        }
        self.meshes.push(mesh);
        Some(self.meshes.len() - 1)
    }
    fn part(&mut self, d: &[u8]) -> Option<()> {
        let mut fs = faces(d)?;
        appearance::paint_part(d, &mut fs);
        let mut ranges = Vec::new();
        let mut first = 0;
        let mut marker = vec![6, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        marker.extend(MARK);
        for at in find_iter(d, &marker) {
            let end = fs.partition_point(|f| f.at < at + 16);
            if end == first {
                continue;
            }
            let (_, name) = string(d, at + 16)?;
            if !name.is_empty() {
                ranges.push((first, end, name));
                first = end;
            }
        }
        if ranges.len() < 2
            || first != fs.len()
            || ranges
                .iter()
                .map(|r| &r.2)
                .collect::<std::collections::HashSet<_>>()
                .len()
                != ranges.len()
        {
            let mesh = self.mesh(d, &fs)?;
            let root = self.nodes.first_mut()?;
            root["mesh"] = json!(mesh);
            root["key"] = json!(["", null]);
            root["matrix"] = json!(ID);
        } else {
            for (a, b, name) in ranges {
                let mesh = self.mesh(d, &fs[a..b])?;
                self.nodes.push(json!({"id":self.nodes.len()+1,"parentId":1,"name":name.rsplit('/').next()?,"mesh":mesh,"key":["",name],"matrix":ID}));
            }
        }
        Some(())
    }
}

mod appearance;
mod assembly;

pub(crate) fn load_display(
    path: &Path,
    mut file: impl Read + Seek,
    reference: impl FnMut(&str) -> Option<Vec<u8>>,
) -> io::Result<Option<Display>> {
    let Some(blobs) = streams(&mut file, wanted) else {
        return Ok(None);
    };
    let mut display = Display::default();
    display.nodes.push(json!({"id":1,"parentId":null,"name":path.file_stem().unwrap_or_default().to_string_lossy()}));
    let ok = if path
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("sldprt"))
    {
        blobs
            .get("Contents/DisplayLists")
            .and_then(|d| display.part(d))
    } else {
        assembly::read(&mut display, &blobs, reference)
    };
    if ok.is_none() {
        return Ok(None);
    }
    if let Some(color) = blobs
        .get("Contents/DisplayLists")
        .and_then(|b| appearance::default_color(b))
    {
        for node in &mut display.nodes {
            if let Some(m) = node["mesh"].as_u64() {
                if node["color"].is_null() && display.meshes[m as usize]["color"].is_null() {
                    node["color"] = json!(color);
                }
            }
        }
    }
    Ok(Some(display))
}

pub(crate) fn encode(display: Display) -> io::Result<[Vec<u8>; 2]> {
    let mut header = vec![0; 4];
    serde_json::to_writer(
        &mut header,
        &json!({"nodes":display.nodes,"meshes":display.meshes}),
    )?;
    header.resize(header.len().next_multiple_of(4), b' ');
    let size = u32::try_from(header.len() - 4).map_err(io::Error::other)?;
    header[..4].copy_from_slice(&size.to_le_bytes());
    Ok([header, display.bytes])
}
