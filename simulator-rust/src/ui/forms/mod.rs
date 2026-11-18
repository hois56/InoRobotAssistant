mod conveyor;
mod equipment;
mod vision;
mod vision_controls;

use super::{render, Node};

fn form(controls: &[Node]) {
    for node in controls {
        render(node);
    }
}
#[no_mangle]
pub extern "C" fn render_equipment_form() {
    form(equipment::BODY);
}
#[no_mangle]
pub extern "C" fn render_conveyor_form() {
    form(conveyor::BODY);
}
#[no_mangle]
pub extern "C" fn render_vision_form() {
    form(vision::BODY);
}
