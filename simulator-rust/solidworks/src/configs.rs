// SPDX-License-Identifier: AGPL-3.0-only
use crate::saved_display::Streams;
use flate2::read::ZlibDecoder;
use std::{collections::HashMap, io::Read};

#[derive(Default)]
pub(crate) struct Configs {
    pub active: String,
    pub names: HashMap<String, String>,
}
pub(crate) fn read(blobs: &Streams) -> Configs {
    let mut xml = Vec::new();
    let mut out = Configs::default();
    let data = if let Some(raw) = blobs.get("swXmlContents/Features") {
        raw.as_slice()
    } else if let Some(raw) = blobs.get("swXmlContents/Features__ZLB") {
        if let Some(at) = raw
            .windows(2)
            .position(|b| b[0] == 120 && matches!(b[1], 1 | 94 | 156 | 218))
        {
            if ZlibDecoder::new(&raw[at..])
                .take(1 << 28)
                .read_to_end(&mut xml)
                .is_err()
            {
                return out;
            }
        }
        &xml
    } else {
        return out;
    };
    if let Ok(text) = std::str::from_utf8(data) {
        if let Ok(doc) = roxmltree::Document::parse(text.trim_matches(['\u{feff}', '\0'])) {
            for n in doc.descendants() {
                match n.tag_name().name() {
                    "swModel" => {
                        if let (Some(id), Some(name)) = (
                            n.attribute("swConfigurationId"),
                            n.attribute("swConfigurationName"),
                        ) {
                            out.names
                                .entry(id.to_owned())
                                .or_insert_with(|| name.to_owned());
                        }
                    }
                    "swConfiguration"
                        if n.attribute("swMostRecentConfiguration") == Some("YES") =>
                    {
                        if let Some(id) = n.attribute("swID") {
                            out.active = id.into();
                            out.names
                                .entry(id.into())
                                .or_insert_with(|| n.attribute("swName").unwrap_or("").into());
                        }
                    }
                    _ => (),
                }
            }
        }
    }
    out
}
