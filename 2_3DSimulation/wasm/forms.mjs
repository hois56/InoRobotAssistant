import { createView, updateView } from './dom.mjs';
import { engine } from './engine.mjs';

export function fillEquipmentForm(node) {
    node.replaceChildren(createView(engine, node.ownerDocument, engine.render_equipment_form));
}
export function fillConveyorForm(node) {
    node.replaceChildren(createView(engine, node.ownerDocument, engine.render_conveyor_form));
}
export function fillVisionForm(node, translate) {
    node.replaceChildren(createView(engine, node.ownerDocument, engine.render_vision_form, translate));
}

const protocols = ['socket', 'modbus', 'mc', 'eip'];
const roles = ['server', 'client'];
const tabs = ['camera', 'calibration', 'workpiece', 'link'];
const conditions = ['external', 'olp', 'socket', 'words', 'role', 'generated', 'server', 'client', 'modbus', 'mc', 'eip'];

function visionMask(config) {
    const { link, detection } = config;
    return engine.vision_form_flags(link.target === 'external', protocols.indexOf(link.protocol),
        link.olpMode === 'socket', roles.indexOf(link.role), Boolean(detection.targetId));
}
export function visionFormConditions(config) {
    const mask = visionMask(config);
    return Object.fromEntries(conditions.map((name, i) => [name, Boolean(mask & (1 << i))]));
}
export function updateVisionForm(root, config, tab, busy, calibrating) {
    const mask = visionMask(config);
    updateView(engine, root, () => engine.vision_form_update(config.enabled, tabs.indexOf(tab), mask,
        calibrating, busy, Boolean(config.calibration.result)));
}
export function cameraPixelSize(width, height) {
    return engine.camera_pixel_size(width, height);
}
