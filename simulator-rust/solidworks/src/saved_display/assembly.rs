// SPDX-License-Identifier: AGPL-3.0-only
use super::*;
use roxmltree::Node;
use crate::configs;
use std::{collections::HashSet, io::Cursor};

struct Leaf {
    index: usize,
    path: String,
    stored: String,
    config: String,
    virtual_part: bool,
}
fn filename(s: &str) -> &str {
    s.rsplit(['/', '\\']).next().unwrap_or(s)
}
type Models<'a> = HashMap<&'a str, Node<'a, 'a>>;
struct Tree<'a> {
    models: Models<'a>,
    files: Models<'a>,
    leaves: Vec<Leaf>,
    active: HashSet<&'a str>,
}
fn transform(s: &str, parent: [f64; 12]) -> Option<[f64; 12]> {
    let m: Vec<f64> = s
        .split_whitespace()
        .map(str::parse)
        .collect::<Result<_, _>>()
        .ok()?;
    if m.len() != 16
        || !m.iter().all(|n| n.is_finite())
        || [3, 7, 11].iter().any(|&j| m[j].abs() > 1e-10)
        || (m[15] - 1.).abs() > 1e-10
    {
        return None;
    }
    for a in 0..3 {
        for b in a..3 {
            let dot: f64 = (0..3).map(|j| m[a * 4 + j] * m[b * 4 + j]).sum();
            if (dot - if a == b { 1. } else { 0. }).abs() > 1e-6 {
                return None;
            }
        }
    }
    let mut world = [0.; 12];
    for row in 0..3 {
        for col in 0..4 {
            world[4 * row + col] = (0..3)
                .map(|k| parent[4 * row + k] * m[4 * col + k])
                .sum::<f64>();
            if col == 3 {
                world[4 * row + col] = world[4 * row + col] * 1000. + parent[4 * row + 3];
            }
        }
    }
    Some(world)
}
impl<'a> Tree<'a> {
    fn walk(
        &mut self,
        d: &mut Display,
        id: &'a str,
        parent: usize,
        path: &str,
        placement: [f64; 12],
        hidden: bool,
    ) -> Option<()> {
        if self.active.len() > 128 || !self.active.insert(id) {
            return None;
        }
        let model = *self.models.get(id)?;
        let doc = self.files.get(model.attribute("swFileRef")?)?;
        let stem = Path::new(filename(doc.attribute("swPath")?))
            .file_stem()?
            .to_str()?;
        for r in model.children().filter(|n| {
            n.tag_name().name() == "swReference" && n.attribute("swSuppressed") != Some("YES")
        }) {
            let child = r.attribute("swModelRef")?;
            let child_model = *self.models.get(child)?;
            let file = self.files.get(child_model.attribute("swFileRef")?)?;
            let instance = format!(
                "{}-{}",
                r.attribute("swName")?,
                r.attribute("swReferenceNumber")?
            );
            let part_path = if path.is_empty() {
                format!("{instance}@{stem}")
            } else {
                format!("{path}/{instance}@{stem}")
            };
            let world = transform(r.attribute("swTransform")?, placement)?;
            let invisible = hidden || r.attribute("swHidden") == Some("YES");
            let index = d.nodes.len();
            let id = index + 1;
            d.nodes.push(json!({"id":id,"parentId":parent,"name":r.attribute("swComponentName").unwrap_or(&instance)}));
            match file.attribute("swDocType")? {
                "ASSEMBLY" => self.walk(d, child, id, &part_path, world, invisible)?,
                "PART" => {
                    let n = &mut d.nodes[index];
                    n["key"] = json!([&part_path, null]);
                    n["matrix"] = json!(world);
                    n["hidden"] = json!(invisible);
                    self.leaves.push(Leaf {
                        index,
                        path: part_path,
                        stored: file.attribute("swPath")?.to_owned(),
                        virtual_part: r.attribute("swIsVirtualComponent") == Some("YES"),
                        config: r
                            .attribute("swConfigurationName")
                            .or(child_model.attribute("swConfigurationName"))
                            .unwrap_or("")
                            .to_owned(),
                    });
                }
                _ => return None,
            }
        }
        self.active.remove(id);
        Some(())
    }
}
type Key = [u8; 8];
fn modern(d: &mut Display, blobs: &Streams, dir: &[u8], leaves: &[Leaf]) -> Option<()> {
    if word(dir, 0)? != 2 {
        return None;
    }
    let mut entries = HashMap::new();
    let mut aliases = HashMap::new();
    let mut chunks: HashMap<String, HashMap<Key, u32>> = HashMap::new();
    for at in find_iter(dir, MARK) {
        let Some((end, name)) = string(dir, at) else {
            continue;
        };
        if !name.contains('@') {
            continue;
        }
        let alias: Key = dir.get(end + 12..end + 20)?.try_into().ok()?;
        let key: Key = dir.get(end + 20..end + 28)?.try_into().ok()?;
        let (p, chunk) = (0..=4).find_map(|i| string(dir, end + 28 + 8 * i))?;
        entries.insert(name, key);
        if chunk.is_empty() {
            aliases.insert(key, alias);
        } else {
            chunks
                .entry(chunk)
                .or_default()
                .insert(key, word(dir, p)? as u32);
        }
    }
    let mut meshes = HashMap::new();
    for (chunk, group) in chunks {
        let data = blobs.get(&format!("FaceTessellations/{chunk}"))?;
        let tables = faces(data)?;
        let mut records = Vec::new();
        for (key, id) in group {
            let mut marker = id.to_le_bytes().to_vec();
            marker.extend(key);
            let mut hits = find_iter(data, &marker);
            if let Some(at) = hits.next() {
                if hits.next().is_none() {
                    records.push((at, key, word(data, at + 12)?));
                }
            }
        }
        records.sort_unstable();
        for (i, &(at, key, n)) in records.iter().enumerate() {
            let first = tables.partition_point(|f| f.at < at + 16);
            let end = records
                .get(i + 1)
                .map_or(tables.len(), |r| tables.partition_point(|f| f.at < r.0));
            if n > 0 && first + n == end {
                meshes.insert(key, d.mesh(data, &tables[first..end])?);
            }
        }
    }
    for leaf in leaves {
        let Some(mut key) = entries.get(&leaf.path) else {
            continue;
        };
        let mut seen = HashSet::new();
        while !meshes.contains_key(key) {
            if !seen.insert(*key) {
                return None;
            }
            let Some(alias) = aliases.get(key) else { break };
            key = alias;
        }
        if let Some(mesh) = meshes.get(key) {
            d.nodes[leaf.index]["mesh"] = json!(mesh);
        }
    }
    Some(())
}
fn legacy(d: &mut Display, data: &[u8], leaves: &[Leaf]) -> Option<()> {
    let strings: Vec<_> = find_iter(data, MARK)
        .filter_map(|at| string(data, at).map(|(_, s)| (at, s)))
        .collect();
    let mut headers = Vec::new();
    for (i, (at, name)) in strings.iter().enumerate() {
        if let Some((instance, _)) = name.split_once('@') {
            if let Some((_, file)) = strings
                .iter()
                .skip(i + 1)
                .take(4)
                .find(|(_, s)| s.to_ascii_lowercase().ends_with(".sldprt"))
            {
                headers.push((*at, instance, filename(file)));
            }
        }
    }
    let fs = faces(data)?;
    let mut protos = HashMap::new();
    for (i, &(at, name, file)) in headers.iter().enumerate() {
        let start = fs.partition_point(|f| f.at < at);
        let end = headers
            .get(i + 1)
            .map_or(fs.len(), |h| fs.partition_point(|f| f.at < h.0));
        if start == end {
            continue;
        }
        let mut matches = leaves.iter().filter(|l| {
            l.path.rsplit('/').next().and_then(|s| s.split('@').next()) == Some(name)
                && filename(&l.stored).eq_ignore_ascii_case(file)
        });
        let leaf = matches.next()?;
        if matches.next().is_some() {
            return None;
        }
        let mesh = d.mesh(data, &fs[start..end])?;
        d.nodes[leaf.index]["mesh"] = json!(mesh);
        protos.insert((&leaf.stored, &leaf.config), mesh);
    }
    for l in leaves {
        if d.nodes[l.index]["mesh"].is_null() {
            if let Some(mesh) = protos.get(&(&l.stored, &l.config)) {
                d.nodes[l.index]["mesh"] = json!(mesh);
            }
        }
    }
    Some(())
}
fn tree(d: &mut Display, b: &Streams) -> Option<Vec<Leaf>> {
    let xml = std::str::from_utf8(b.get("swXmlContents/COMPINSTANCETREE")?)
        .ok()?
        .trim_start_matches('\u{feff}')
        .trim_end_matches('\0');
    let tree = roxmltree::Document::parse(xml).ok()?;
    let map = |tag: &str| {
        tree.descendants()
            .filter(|n| n.tag_name().name() == tag)
            .filter_map(|n| Some((n.attribute("id")?, n)))
            .collect()
    };
    let mut configs: Vec<_> = tree
        .descendants()
        .filter(|n| n.tag_name().name() == "swConfiguration")
        .collect();
    if configs
        .iter()
        .any(|c| c.attribute("swMostRecentConfiguration") == Some("YES"))
    {
        configs.retain(|c| c.attribute("swMostRecentConfiguration") == Some("YES"));
    }
    if configs.len() != 1 {
        return None;
    }
    let mut t = Tree {
        models: map("swModel"),
        files: map("swFile"),
        leaves: Vec::new(),
        active: HashSet::new(),
    };
    t.walk(d, configs[0].attribute("swModelRef")?, 1, "", ID, false)?;
    if t.leaves.is_empty() {
        return None;
    }
    Some(t.leaves)
}
pub(super) fn read(
    d: &mut Display,
    b: &Streams,
    mut reference: impl FnMut(&str) -> Option<Vec<u8>>,
) -> Option<()> {
    let leaves = tree(d, b)?;
    let embedded = if let Some(dir) = b.get("FaceTessellations/Directory") {
        modern(d, b, dir, &leaves)
    } else if let Some(data) = b.get("Contents/DisplayLists") {
        legacy(d, data, &leaves)
    } else {
        Some(())
    };
    if embedded.is_none() {
        d.meshes.clear();
        d.bytes.clear();
        for leaf in &leaves {
            d.nodes[leaf.index]["mesh"] = Value::Null;
        }
    }
    let mut prototypes = HashMap::new();
    for l in &leaves {
        if !d.nodes[l.index]["mesh"].is_null() {
            continue;
        }
        if l.virtual_part {
            return None;
        }
        let key = (&l.stored, &l.config);
        if !prototypes.contains_key(&key) {
            let mut f = Cursor::new(reference(&l.stored)?);
            let child = streams(&mut f, |n| {
                n == "Contents/DisplayLists" || n.starts_with("swXmlContents/Features")
            })?;
            let cfg = configs::read(&child);
            if !l.config.is_empty()
                && !cfg
                    .names
                    .get(&cfg.active)
                    .is_some_and(|n| n.eq_ignore_ascii_case(&l.config))
            {
                return None;
            }
            let data = child.get("Contents/DisplayLists")?;
            let mut tables = faces(data)?;
            appearance::paint_part(data, &mut tables);
            let mesh = d.mesh(data, &tables)?;
            if let Some(c) = appearance::default_color(data) {
                d.meshes[mesh]["color"] = json!(c);
            }
            prototypes.insert(key, mesh);
        }
        d.nodes[l.index]["mesh"] = json!(prototypes.get(&key)?);
    }
    if let Some(data) = b.get("Contents/DisplayLists") {
        let paths = leaves.iter().map(|l| l.path.as_str()).collect();
        let mut colors = appearance::assemblies(data, &paths);
        let mut prototypes = HashMap::<usize, Option<appearance::Appearance>>::new();
        for leaf in &leaves {
            let Some(style) = colors.get(&leaf.path) else {
                continue;
            };
            if style.faces.is_empty() {
                continue;
            }
            let mesh = d.nodes[leaf.index]["mesh"].as_u64()? as usize;
            prototypes
                .entry(mesh)
                .and_modify(|prior| {
                    if prior.as_ref().is_some_and(|p| {
                        p.faces != style.faces
                            || p.base != style.base
                            || p.ids != style.ids
                            || p.body_ends != style.body_ends
                    }) {
                        *prior = None;
                    }
                })
                .or_insert_with(|| Some(style.clone()));
        }
        for leaf in leaves {
            let Some(style) = colors.remove(&leaf.path) else {
                continue;
            };
            let node = &mut d.nodes[leaf.index];
            let mesh = node["mesh"].as_u64()? as usize;
            let style = if style.faces.is_empty() && style.base.is_none() {
                prototypes
                    .get(&mesh)
                    .and_then(Option::as_ref)
                    .unwrap_or(&style)
            } else {
                &style
            };
            if let Some(c) = style.base {
                node["color"] = json!(c);
            }
            if style.faces.iter().any(Option::is_some)
                && d.meshes[mesh]["faces"].as_array()?.len() == style.faces.len()
            {
                node["faceColors"] = json!(style.faces);
                node["faceIds"] = json!(style.ids);
                node["bodyEnds"] = json!(style.body_ends);
            }
        }
    }
    Some(())
}
