#[link(wasm_import_module = "dom")]
extern "C" {
    fn set_control(selector: *const u8, len: usize, property: u32, value: bool);
}
#[derive(Clone, Copy)]
enum Property {
    Hidden,
    Disabled,
    Selected,
}
fn set(selector: &str, property: Property, value: bool) {
    unsafe {
        set_control(selector.as_ptr(), selector.len(), property as u32, value);
    }
}

const CONDITIONS: [&str; 11] = [
    "external",
    "olp",
    "socket",
    "words",
    "role",
    "generated",
    "server",
    "client",
    "modbus",
    "mc",
    "eip",
];
const TABS: [&str; 4] = ["camera", "calibration", "workpiece", "link"];

#[no_mangle]
pub extern "C" fn vision_form_flags(
    external: bool,
    protocol: i32,
    olp_socket: bool,
    role: i32,
    has_target: bool,
) -> u32 {
    let socket = if external { protocol == 0 } else { olp_socket };
    let flags = [
        external,
        !external,
        socket,
        !socket,
        external || socket,
        !has_target,
        role == 0,
        role == 1,
        external && protocol == 1,
        external && protocol == 2,
        external && protocol == 3,
    ];
    flags
        .iter()
        .enumerate()
        .fold(0, |mask, (i, &on)| mask | ((on as u32) << i))
}

#[no_mangle]
pub extern "C" fn vision_form_update(
    enabled: bool,
    tab: i32,
    flags: u32,
    calibrating: bool,
    busy: bool,
    calibrated: bool,
) {
    use Property::{Disabled, Hidden, Selected};
    set("[data-vision-empty]", Hidden, enabled);
    set("[data-vision-main]", Hidden, !enabled);
    if !enabled {
        return;
    }
    for (i, name) in TABS.iter().enumerate() {
        let active = i as i32 == tab;
        set(&format!("[data-vision-tab=\"{name}\"]"), Selected, active);
        set(&format!("[data-vision-page=\"{name}\"]"), Hidden, !active);
    }
    set("[data-vision-if]", Hidden, false);
    for (i, name) in CONDITIONS.iter().enumerate() {
        if flags & (1 << i) == 0 {
            set(&format!("[data-vision-if~=\"{name}\"]"), Hidden, true);
        }
    }
    set("[data-vision-action=\"cal-auto\"]", Disabled, calibrating);
    set(
        "[data-vision-action=\"cal-export-lab\"]",
        Disabled,
        calibrating || !calibrated,
    );
    set(
        "[data-vision-action=\"capture\"],[data-vision-field=\"camera.direction\"]",
        Disabled,
        calibrating || busy,
    );
}

#[no_mangle]
pub extern "C" fn camera_pixel_size(width: f64, height: f64) -> f64 {
    match (width, height) {
        (1280., 1024.) => 4.8,
        (1920., 1200.) => 5.86,
        (2448., 2048.) => 3.45,
        (640., 480.) => 7.4,
        _ => f64::NAN,
    }
}
