use crate::{BYTES, OUTPUT, WORDS};

fn with_strings<T>(f: impl FnOnce(&str, &mut dyn Iterator<Item = &str>) -> T) -> T {
    BYTES.with_borrow(|bytes| {
        WORDS.with_borrow(|lengths| {
            let mut offset = 0;
            let mut strings = lengths.iter().map(|&len| {
                let start = offset;
                offset += len as usize;
                std::str::from_utf8(&bytes[start..offset]).unwrap()
            });
            let first = strings.next().unwrap_or("");
            f(first, &mut strings)
        })
    })
}

#[no_mangle]
pub extern "C" fn cable_index(flex: bool) -> i32 {
    with_strings(|length, cables| {
        cables
            .enumerate()
            .find(|(_, text)| text.contains("High flex") == flex && text.contains(length))
            .map_or(-1, |(i, _)| i as i32)
    })
}
#[no_mangle]
pub extern "C" fn accessory_indices() -> usize {
    with_strings(|model, targets| {
        OUTPUT.with_borrow_mut(|out| {
            out.clear();
            for (index, list) in targets.enumerate() {
                if list.split(',').any(|label| {
                    let label = label.trim();
                    label == "ALL"
                        || (if label.contains("(ALL)") {
                            model.contains(label.replacen("(ALL)", "", 1).trim())
                        } else {
                            model.contains(label)
                        })
                }) {
                    out.push(index as u32);
                }
            }
            out.len()
        })
    })
}
#[no_mangle]
pub extern "C" fn model_specs() -> usize {
    BYTES.with_borrow(|value| {
        OUTPUT.with_borrow_mut(|out| {
            let name = std::str::from_utf8(value).unwrap();
            let has = |values: &[&str]| values.iter().any(|s| name.contains(s));
            let fixed = has(&["R10-140", "R16", "R25"]);
            let breaker = if name.contains("R10-140") {
                20
            } else if has(&["R16", "R25"]) {
                30
            } else if has(&["R10-110", "R10H", "R11"]) {
                15
            } else if has(&["R4", "R7H"]) {
                10
            } else if has(&["S35", "S50", "S60"]) {
                20
            } else if name.contains("S25") {
                15
            } else if has(&["S4", "S7", "S10", "TS4", "TS5"]) {
                10
            } else {
                0
            };
            out.clear();
            out.extend([
                fixed as u32,
                breaker,
                has(&["R15H", "R20H"]) as u32,
                name.contains("IR-GS60") as u32,
            ]);
            out.len()
        })
    })
}
#[no_mangle]
pub extern "C" fn lead_time(
    scara: bool,
    clean: bool,
    kcs: bool,
    extended: bool,
    code: bool,
) -> u32 {
    if !scara {
        return if code { 7 } else { 8 };
    }
    if clean {
        return 0;
    } // six months
    if !kcs {
        10
    } else if code {
        6
    } else if extended {
        10
    } else {
        7
    }
}
