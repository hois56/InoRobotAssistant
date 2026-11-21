// SPDX-License-Identifier: AGPL-3.0-only
use super::{Face, MARK, find, find_iter, string, word};
use std::collections::HashMap;

type Color = u32;
const VISUAL: &[u8] = b"moVisualProperties_c";
const FACE_CLASS: &[u8] = b"uoTempFaceTessData_c";
const STYLE: &[u8] = &[2, 0, 0, 0, 1, 0, 0, 0];
fn short(b: &[u8], p: usize) -> Option<u16> {
    Some(u16::from_le_bytes(b.get(p..p + 2)?.try_into().ok()?))
}
fn rgb(b: &[u8], p: usize) -> Option<Color> {
    let v = b.get(p..p + 12)?;
    if v[3] != 0 || v[7] != 0 || v[11] != 0 || b.get(p + 12..p + 15)? != MARK {
        return None;
    }
    Some(u32::from_be_bytes([0, v[0], v[1], v[2]]))
}
pub(super) fn default_color(b: &[u8]) -> Option<Color> {
    let at = find(b, VISUAL)?;
    rgb(b, at + VISUAL.len())
}
fn inline(b: &[u8], p: usize) -> Option<Color> {
    let tag = short(b, p)?;
    if tag == u16::MAX {
        let start = p + 6;
        if b.get(start..start + VISUAL.len())? != VISUAL {
            return None;
        }
        rgb(b, start + VISUAL.len())
    } else if tag & 0x8000 != 0 {
        rgb(b, p + 2)
    } else {
        None
    }
}
fn surface(s: &str) -> bool {
    s.starts_with("mo") && s.contains("SurfIdRep_c,")
}
/// The two surface identity records bracket the saved appearance of this tessellated face.
/// A subsequent face can reference the same archive object instead of storing RGB again.
pub(super) fn paint_part(b: &[u8], faces: &mut [Face]) {
    let mut shared = HashMap::new();
    for i in 0..faces.len() {
        let limit = faces.get(i + 1).map_or(b.len(), |f| f.at);
        let block = &b[faces[i].end..limit];
        let mut ids = find_iter(block, MARK).filter_map(|at| {
            let (end, s) = string(block, at)?;
            surface(&s).then_some((at, end, s))
        });
        let (Some((_, end, name)), Some((last, _, other))) = (ids.next(), ids.next()) else {
            continue;
        };
        if name != other {
            continue;
        }
        faces[i].id = last
            .checked_sub(8)
            .and_then(|p| word(block, p))
            .map(|n| n as u32);
        let Some(n) = word(block, end + 2) else {
            continue;
        };
        let prop = end + 22 + n * 28;
        if block.get(prop + 4..prop + 12) != Some(STYLE) {
            continue;
        }
        let p = prop + 12;
        if let Some(c) = inline(block, p) {
            faces[i].color = Some(c);
            if last >= 42 && word(block, last - 42) == Some(2) {
                if let Some(tag) = short(block, last - 38).filter(|t| (1..0x8000).contains(t)) {
                    shared.insert(tag, c);
                }
            }
        } else if let Some(tag) = short(block, p) {
            faces[i].color = shared.get(&tag).copied();
        }
    }
}
#[derive(Default, Clone, PartialEq)]
pub(super) struct Appearance {
    pub base: Option<Color>,
    pub faces: Vec<Option<Color>>,
    pub ids: Vec<u32>,
    pub body_ends: Vec<usize>,
    pub references: Vec<(usize, u16)>,
}
/// The assembly's display list stores appearances per occurrence even when its
/// tessellations are shared. Each body property record follows its face list.
pub(super) fn assemblies(
    b: &[u8],
    paths: &std::collections::HashSet<&str>,
) -> HashMap<String, Appearance> {
    let mut result = HashMap::new();
    let mut bounds = Vec::new();
    let mut face_classes = std::collections::HashSet::new();
    for at in find_iter(b, MARK) {
        if let Some((end, s)) = string(b, at) {
            if surface(&s) && b.get(end + 10..end + 18) == Some(STYLE) {
                if let Some(tag) = short(b, end + 8).filter(|tag| (0x8001..0xffff).contains(tag)) {
                    face_classes.insert(tag);
                }
            }
            if s.contains('@') && (paths.contains(s.as_str()) || s.contains('/')) {
                bounds.push((at, end, s));
            }
        }
    }
    for (i, (_, start, path)) in bounds.iter().enumerate() {
        if !paths.contains(path.as_str()) {
            continue;
        }
        let end = bounds.get(i + 1).map_or(b.len(), |r| r.0);
        let Some(block) = b.get(*start..end) else {
            continue;
        };
        let mut attrs = Appearance::default();
        let mut previous = 0;
        let mut body_start = 0;
        let mut bodies = Vec::new();
        for at in find_iter(block, MARK) {
            let Some((end, s)) = string(block, at) else {
                continue;
            };
            if surface(&s) {
                let Some(before) = block.get(previous..at) else {
                    continue;
                };
                let field = find_iter(before, STYLE).find_map(|p| {
                    let class = p >= 2
                        && short(before, p - 2).is_some_and(|tag| face_classes.contains(&tag))
                        || before[..p].ends_with(FACE_CLASS);
                    class.then_some(p + STYLE.len())
                });
                let face_color = field.and_then(|p| inline(before, p));
                if let Some(tag) = field
                    .and_then(|p| short(before, p))
                    .filter(|t| (1..0x8000).contains(t))
                {
                    attrs.references.push((attrs.faces.len(), tag));
                }
                attrs.ids.push(
                    at.checked_sub(8)
                        .and_then(|p| word(block, p))
                        .unwrap_or(usize::MAX) as u32,
                );
                attrs.faces.push(face_color);
                previous = end;
            } else if at >= 16
                && word(block, at - 16) == Some(6)
                && word(block, at - 4) == Some(0)
                && word(block, end) == Some(0)
                && block.get(end + 4..end + 12) == Some(STYLE)
            {
                let c = inline(block, end + 12);
                bodies.push(c);
                for face in &mut attrs.faces[body_start..] {
                    if face.is_none() {
                        *face = c;
                    }
                }
                body_start = attrs.faces.len();
                attrs.body_ends.push(body_start);
                previous = end;
            }
        }
        if let Some(&first) = bodies.first() {
            if bodies.iter().all(|&c| c == first) {
                attrs.base = first;
            }
        }
        result.insert(path.clone(), attrs);
    }
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    fn label(data: &mut Vec<u8>, text: &str) {
        data.extend_from_slice(MARK);
        data.push(text.len() as u8);
        for unit in text.encode_utf16() {
            data.extend_from_slice(&unit.to_le_bytes());
        }
    }
    fn prop(data: &mut Vec<u8>, color: [u8; 3]) {
        data.extend_from_slice(STYLE);
        data.extend_from_slice(&0x8032u16.to_le_bytes());
        data.extend_from_slice(&color);
        data.extend_from_slice(&[0; 9]);
        label(data, "");
    }
    #[test]
    fn assembly_face_overrides_body_and_black_is_a_color() {
        let mut bytes = Vec::new();
        label(&mut bytes, "Part-1@Root");
        bytes.extend_from_slice(FACE_CLASS);
        prop(&mut bytes, [255, 64, 64]);
        label(&mut bytes, "moSimpleSurfIdRep_c,25,0,");
        bytes.extend_from_slice(&[0; 8]);
        bytes.extend_from_slice(&0x8041u16.to_le_bytes());
        bytes.extend_from_slice(STYLE);
        bytes.extend_from_slice(&[0; 16]);
        label(&mut bytes, "moSimpleSurfIdRep_c,25,1,");
        for n in [6u32, 0, 1, 0] {
            bytes.extend_from_slice(&n.to_le_bytes());
        }
        label(&mut bytes, "Part[1]");
        bytes.extend_from_slice(&[0; 4]);
        prop(&mut bytes, [0, 0, 0]);
        let styles = assemblies(&bytes, &["Part-1@Root"].into_iter().collect());
        assert_eq!(styles["Part-1@Root"].faces, [Some(0xff4040), Some(0)]);
        assert_eq!(styles["Part-1@Root"].base, Some(0));
        assert_eq!(inline(&[0, 128, 255, 64], 0), None);
    }
}
