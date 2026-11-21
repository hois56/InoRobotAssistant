use crate::{BYTES, OUTPUT};

fn trimmed(s: &str) -> &str {
    // Match ECMAScript trim, including BOM, for user-maintained Markdown files.
    s.trim_matches(|c: char| c == '\u{feff}' || (c.is_whitespace() && c != '\u{85}'))
}

// Return byte ranges into the input (kind, tag/start, tag/end, text/start, text/end).
// Keeping the text in its original buffer avoids copying a multi-locale history.
#[no_mangle]
pub extern "C" fn history_entries(heading_bytes: usize, stop_at_rule: bool) -> usize {
    BYTES.with_borrow(|data| {
        OUTPUT.with_borrow_mut(|out| {
            let (heading, body) = data.split_at(heading_bytes);
            let heading = std::str::from_utf8(heading).unwrap();
            let body = std::str::from_utf8(body).unwrap();
            let mut active = heading.is_empty();
            let mut version = false;
            let offset = |s: &str| (s.as_ptr() as usize - data.as_ptr() as usize) as u32;
            out.clear();
            for line in body.lines().map(trimmed) {
                if !active {
                    if line.strip_prefix("## ") == Some(heading) {
                        active = true;
                    }
                    continue;
                }
                if !heading.is_empty() && (line.starts_with("## ") || stop_at_rule && line == "---")
                {
                    break;
                }
                if let Some(title) = line.strip_prefix("### ") {
                    let title = trimmed(title);
                    out.extend([1, 0, 0, offset(title), offset(title) + title.len() as u32]);
                    version = true;
                } else if let Some(raw) = line.strip_prefix("- ").filter(|_| version) {
                    let mut text = trimmed(raw);
                    let mut tag_range = [0, 0];
                    for (open, close) in [("`[", "]`"), ("**[", "]**")] {
                        if let Some((tag, rest)) =
                            text.strip_prefix(open).and_then(|s| s.split_once(close))
                        {
                            if !tag.is_empty() && !tag.contains(']') {
                                tag_range = [offset(tag), offset(tag) + tag.len() as u32];
                                text = trimmed(rest);
                                break;
                            }
                        }
                    }
                    out.extend([
                        2,
                        tag_range[0],
                        tag_range[1],
                        offset(text),
                        offset(text) + text.len() as u32,
                    ]);
                }
            }
            out.len()
        })
    })
}
