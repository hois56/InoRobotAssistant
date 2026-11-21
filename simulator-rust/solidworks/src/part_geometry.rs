// SPDX-License-Identifier: AGPL-3.0-only
mod revolution;
mod step;
mod torus;
mod transmits;

use std::{io, io::Cursor, path::Path};
use xt_step::reader::parse_xt;

struct Body {
    name: Option<String>,
    data: String,
}

pub(super) fn reconstruct_part(path: &Path, input: &[u8]) -> io::Result<Vec<u8>> {
    let mut bodies = Vec::new();
    transmits::visit_transmits(Cursor::new(input), |transmits| {
        let first = bodies.len();
        for bytes in transmits {
            let xt = parse_xt(bytes).map_err(|error| io::Error::other(error.to_string()))?;
            let names = transmits::body_names(&xt);
            for node in xt.nodes().iter().filter(|node| node.type_name() == "BODY") {
                let data = match xt_step::body_to_step(&xt, node, node.index as usize) {
                    Ok(body) => torus::canonicalize(body.step),
                    Err(error) => revolution::closed_profile(&xt, node)
                        .map(|(data, _)| data)
                        .ok_or_else(|| io::Error::other(error.to_string()))?,
                };
                bodies.push(Body { name: names.get(&node.index).cloned(), data });
            }
        }
        Ok(bodies.len() > first)
    })?;

    let label = path.file_stem().unwrap_or_default().to_string_lossy();
    let mut writer = step::Writer::new();
    if let [body] = bodies.as_slice() {
        writer.append_body(&label, body)?;
    } else {
        let root = writer.product(&label, None);
        for (index, body) in bodies.iter().enumerate() {
            let component = body.name.clone().unwrap_or_else(|| format!("{label} {}", index + 1));
            let product = writer.append_body(&component, body)?;
            writer.link(root, product, &component, step::ID)?;
        }
    }
    Ok(writer.finish().into_bytes())
}
