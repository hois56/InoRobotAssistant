// SPDX-License-Identifier: AGPL-3.0-only
use crate::{configs, saved_display::streams};
use flate2::read::ZlibDecoder;
use memchr::memmem::find;
use std::{collections::{BTreeMap, HashMap, HashSet}, io::{self, Read, Seek}};
use xt_step::reader::XtFile;

fn invalid(s: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, s.into())
}
const SECTION: [u8; 16] = [
    0x23, 0x1d, 0xd5, 0x71, 0xda, 0x81, 0x48, 0xa2, 0xa8, 0x58, 0x98, 0xb2, 0x1b, 0x89, 0xef, 0x99,
];
fn word(b: &[u8], p: usize) -> io::Result<usize> {
    Ok(u32::from_le_bytes(
        b.get(p..p + 4)
            .ok_or_else(|| invalid("잘린 형상 스트림입니다."))?
            .try_into()
            .unwrap(),
    ) as usize)
}
fn sections(b: &[u8]) -> io::Result<Vec<Vec<u8>>> {
    let mut at = 0;
    let mut out = Vec::new();
    while let Some(i) = find(&b[at..], &SECTION) {
        let begin = at + i;
        at = begin + 16;
        let limit = if begin >= 4 {
            begin.saturating_add(word(b, begin - 4)?).min(b.len())
        } else {
            b.len()
        };
        let mut bytes = Vec::new();
        while at + 8 <= limit {
            let n = word(b, at)?;
            let packed = word(b, at + 4)?;
            at += 8;
            if n == 0 && packed == 0 {
                break;
            }
            if packed == 0 || at + packed > limit || bytes.len() + n > 1 << 30 {
                return Err(invalid("정밀 형상 블록 길이가 올바르지 않습니다."));
            }
            let wrote = ZlibDecoder::new(&b[at..at + packed])
                .take(n as u64 + 1)
                .read_to_end(&mut bytes)?;
            if wrote != n {
                return Err(invalid("정밀 형상 블록이 잘렸습니다."));
            }
            at += packed;
        }
        if bytes.starts_with(b"PS") {
            out.push(bytes)
        }
    }
    Ok(out)
}
pub(super) fn visit_transmits(
    mut file: impl Read + Seek,
    mut visit: impl FnMut(&[&[u8]]) -> io::Result<bool>,
) -> io::Result<()> {
    let blobs = streams(&mut file, |n| {
        n.starts_with("swXmlContents/Features")
            || n.contains("Partition") && !n.contains("GhostPartition")
            || n.ends_with("FeatureBodies/LocalBodies")
    })
    .ok_or_else(|| invalid("부품 파일을 읽을 수 없습니다."))?;
    let config = configs::read(&blobs);
    for local in [false, true] {
        let mut groups = BTreeMap::<String, Vec<Vec<u8>>>::new();
        for (name, data) in &blobs {
            if (local && !name.ends_with("FeatureBodies/LocalBodies"))
                || (!local && !name.contains("Partition"))
            {
                continue;
            }
            let id = name
                .split("Config-")
                .nth(1)
                .and_then(|s| s.split('-').next())
                .unwrap_or("");
            if !config.active.is_empty() && !id.is_empty() && id != config.active {
                continue;
            }
            for bytes in sections(data)? {
                let end = bytes
                    .get(2..6)
                    .map(|b| 6 + u32::from_be_bytes(b.try_into().unwrap()) as usize)
                    .unwrap_or(0);
                if !local
                    && !bytes
                        .get(6..end)
                        .is_some_and(|s| find(s, b"(partition)").is_some())
                {
                    continue;
                }
                groups.entry(id.into()).or_default().push(bytes);
            }
        }
        let mut found = false;
        for bytes in groups.values() {
            let mut seen = HashSet::new();
            let distinct: Vec<_> = bytes
                .iter()
                .map(Vec::as_slice)
                .filter(|&b| seen.insert(b))
                .collect();
            if visit(&distinct)? {
                if found {
                    return Err(invalid("정밀 형상의 활성 구성을 확인할 수 없습니다."));
                }
                found = true;
            }
        }
        if found {
            return Ok(());
        }
    }
    Err(invalid("정밀 본체가 없습니다."))
}
pub(super) fn body_names(xt: &XtFile) -> HashMap<u32, String> {
    let defs: HashSet<_> = xt
        .nodes()
        .iter()
        .filter(|n| {
            n.type_name() == "ATTRIB_DEF"
                && xt.follow(n, "identifier").is_some_and(|i| {
                    i.text("string") == Some("SWIMPLICITBODYNAME_ID_U")
                        || i.ints("string")
                            .into_iter()
                            .map(|v| v as u8)
                            .eq(b"SWIMPLICITBODYNAME_ID_U".iter().copied())
                })
        })
        .map(|n| n.index)
        .collect();
    let mut out = HashMap::new();
    for a in xt
        .nodes()
        .iter()
        .filter(|n| n.type_name() == "ATTRIBUTE" && defs.contains(&n.ptr("definition")))
    {
        for i in a.ints("fields") {
            if let Some(v) = xt
                .node(i as u32)
                .filter(|n| n.type_name() == "UNICODE_VALUES")
            {
                if let Ok(s) = String::from_utf16(
                    &v.ints("values")
                        .iter()
                        .map(|v| *v as u16)
                        .collect::<Vec<_>>(),
                ) {
                    out.insert(a.ptr("owner"), s.trim_end_matches('\0').into());
                }
            }
        }
    }
    out
}
