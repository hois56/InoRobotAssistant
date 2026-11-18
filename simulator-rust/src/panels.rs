use crate::with_buffer;

#[derive(Clone, Copy, PartialEq)]
enum Requirement {
    None,
    Robot,
    JogTarget,
}

struct Panel {
    id: &'static str,
    size: (u16, u16),
    requirement: Requirement,
    dialog: bool,
}

const fn panel(id: &'static str, width: u16, height: u16, requirement: Requirement) -> Panel {
    Panel {
        id,
        size: (width, height),
        requirement,
        dialog: false,
    }
}

use Requirement::{JogTarget, None as Always, Robot};
// Sized panels retain their original initialization order. Auxiliary dialogs
// enter the stack when opened. Work origin stays below the fixed status bar.
const PANELS: &[Panel] = &[
    panel("position-points-panel", 380, 300, Robot),
    panel("model-browser-panel", 260, 220, Always),
    panel("jog-panel", 250, 300, JogTarget),
    panel("tcp-profile-panel", 280, 360, Robot),
    panel("workobject-panel", 320, 500, Robot),
    panel("arm-load-panel", 300, 440, Robot),
    panel("virtual-controller-panel", 250, 230, Robot),
    panel("collaboration-panel", 280, 420, Always),
    panel("view-presets-panel", 280, 260, Always),
    panel("view-window", 360, 220, Always),
    panel("program-panel", 300, 540, Robot),
    panel("trace-panel", 620, 480, Always),
    panel("io-simulator-panel", 390, 620, Always),
    panel("interference-zone-panel", 350, 420, Always),
    panel("measurement-panel", 300, 520, Always),
    panel("shape-panel", 300, 460, Always),
    panel("tool-load-info-panel", 390, 560, Always),
    Panel {
        dialog: true,
        ..panel("work-origin-dialog", 320, 220, Always)
    },
    panel("vision-panel", 400, 520, Always),
    panel("conveyor-tracking-dialog", 340, 360, Always),
    Panel {
        dialog: true,
        ..panel("interference-zone-dialog", 0, 0, Always)
    },
    Panel {
        dialog: true,
        ..panel("equipment-dialog", 0, 0, Always)
    },
    Panel {
        dialog: true,
        ..panel("io-function-mapping-dialog", 0, 0, Always)
    },
];

#[no_mangle]
pub extern "C" fn panel_count() -> usize {
    PANELS.len()
}

#[no_mangle]
pub extern "C" fn panel_info(i: usize) {
    let p = &PANELS[i];
    with_buffer(|b| {
        b[..6].copy_from_slice(&[
            p.id.as_ptr() as usize as f64,
            p.id.len() as f64,
            p.size.0 as f64,
            p.size.1 as f64,
            p.requirement as u8 as f64,
            p.dialog as u8 as f64,
        ])
    });
}

#[no_mangle]
pub extern "C" fn panel_stack(count: usize, visible: u32, front: i32) -> usize {
    let mut order = Vec::with_capacity(PANELS.len());
    with_buffer(|b| {
        let candidates = b[..count]
            .iter()
            .map(|x| *x as i32)
            .chain(std::iter::once(front));
        for (pos, id) in candidates.enumerate() {
            if id < 0 || id as usize >= PANELS.len() || visible & (1 << id) == 0 {
                continue;
            }
            if id != front || pos == count {
                order.push(id as usize);
            }
        }
        for (pos, &id) in order.iter().enumerate() {
            let z = if PANELS[id].id == "work-origin-dialog" {
                PANELS.iter().filter(|p| p.size.0 != 0).count() + 1
            } else {
                pos
            };
            b[pos * 2] = id as f64;
            b[pos * 2 + 1] = (70 + z) as f64;
        }
    });
    order.len()
}

const WEST: u32 = 1;
const EAST: u32 = 2;
const NORTH: u32 = 4;
const SOUTH: u32 = 8;

#[no_mangle]
pub extern "C" fn panel_resize_edge(left: f64, right: f64, top: f64, bottom: f64) -> u32 {
    let x = if left <= 8.0 {
        WEST
    } else if right <= 8.0 {
        EAST
    } else {
        0
    };
    let y = if top <= 8.0 {
        NORTH
    } else if bottom <= 8.0 {
        SOUTH
    } else {
        0
    };
    x | y
}

// Three.MathUtils.clamp also handles a viewport that has become smaller than
// the panel between pointer events by keeping the minimum size.
fn bound(value: f64, min: f64, max: f64) -> f64 {
    value.min(max).max(min)
}

#[no_mangle]
pub extern "C" fn panel_fit(
    id: usize,
    extra_height: f64,
    w: f64,
    h: f64,
    left: f64,
    top: f64,
    preferred_w: f64,
    preferred_h: f64,
) {
    let (min_w, min_h) = PANELS
        .get(id)
        .map(|p| p.size)
        .filter(|s| s.0 != 0)
        .unwrap_or((220, 180));
    let min_w = (min_w as f64).min(w.max(1.0));
    let min_h = (min_h as f64).max(extra_height).min(h.max(1.0));
    let width = bound(preferred_w, min_w, w.max(1.0));
    let height = bound(preferred_h, min_h, h.max(1.0));
    with_buffer(|b| {
        b[..6].copy_from_slice(&[
            bound(left, 0.0, w - width),
            bound(top, 0.0, h - height),
            width,
            height,
            min_w,
            min_h,
        ])
    });
}

#[no_mangle]
pub extern "C" fn panel_resize(edge: u32, dx: f64, dy: f64) {
    with_buffer(|b| {
        let (mut left, mut top, mut w, mut h) = (b[0], b[1], b[2], b[3]);
        let (min_w, min_h, viewport_w, viewport_h) = (b[4], b[5], b[6], b[7]);
        if edge & WEST != 0 {
            let right = left + w;
            left = bound(left + dx, 0.0, right - min_w);
            w = right - left;
        } else if edge & EAST != 0 {
            w = bound(w + dx, min_w, viewport_w - left);
        }
        if edge & NORTH != 0 {
            let bottom = top + h;
            top = bound(top + dy, 0.0, bottom - min_h);
            h = bottom - top;
        } else if edge & SOUTH != 0 {
            h = bound(h + dy, min_h, viewport_h - top);
        }
        b[..4].copy_from_slice(&[left, top, w, h]);
    });
}

#[no_mangle]
pub extern "C" fn panel_drag(
    left: f64,
    top: f64,
    w: f64,
    h: f64,
    viewport_w: f64,
    viewport_h: f64,
) {
    with_buffer(|b| {
        b[0] = bound(left, 0.0, viewport_w - w);
        b[1] = bound(top, 0.0, viewport_h - h);
    });
}
