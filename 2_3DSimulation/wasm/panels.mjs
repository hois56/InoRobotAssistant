import { engine, numbers } from './engine.mjs';

const panels = new Map();
const decoder = new TextDecoder();
for (let index = 0; index < engine.panel_count(); index++) {
    numbers(6);
    engine.panel_info(index);
    const [address, length, width, , requirement, dialog] = numbers(6);
    const id = decoder.decode(new Uint8Array(engine.memory.buffer, address, length));
    panels.set(id, { index, sized: width > 0, requirement, dialog: Boolean(dialog) });
}
const ids = [...panels.keys()];
export const PANEL_IDS = Object.freeze(ids.filter(id => panels.get(id).sized));
export const PANEL_STACK_IDS = Object.freeze([...PANEL_IDS, 'interference-zone-dialog']);

export function panelOpen(panel, document) {
    if (!panel || panel.ownerDocument !== document) return false;
    return panels.get(panel.id)?.dialog ? panel.open
        : !panel.classList.contains('panel-user-hidden') && !panel.classList.contains('hidden');
}

export function panelAvailable(id, jogTarget, robots) {
    switch (panels.get(id)?.requirement) {
        case 1: return robots().length > 0;
        case 2: return Boolean(jogTarget());
        default: return true;
    }
}

export function stackPanels(order, front, lookup, document) {
    const nodes = new Map();
    let visible = 0;
    for (const id of new Set([...order, front])) {
        const descriptor = panels.get(id);
        if (!descriptor) continue;
        const node = lookup(id);
        if (panelOpen(node, document)) {
            visible |= 1 << descriptor.index;
            nodes.set(id, node);
        }
    }
    const data = numbers((order.length + 1) * 2);
    order.forEach((id, i) => { data[i] = panels.get(id)?.index ?? -1; });
    const length = engine.panel_stack(order.length, visible, panels.get(front)?.index ?? -1);
    const output = numbers(length * 2);
    const result = [];
    for (let i = 0; i < length; i++) {
        const id = ids[output[i * 2]];
        nodes.get(id).style.zIndex = String(output[i * 2 + 1]);
        result.push(id);
    }
    return result;
}

const edges = ['', 'w', 'e', '', 'n', 'nw', 'ne', '', 's', 'sw', 'se'];
export function panelResizeEdge(rect, x, y) {
    return edges[engine.panel_resize_edge(x - rect.left, rect.right - x, y - rect.top, rect.bottom - y)];
}

export function fitPanel(id, canvas, rect, minHeight, width, height) {
    numbers(6);
    engine.panel_fit(panels.get(id)?.index ?? -1, minHeight, canvas.width, canvas.height,
        rect.left - canvas.left, rect.top - canvas.top, width, height);
    const [left, top, w, h, minWidth, minimumHeight] = numbers(6);
    return { left, top, width: w, height: h, minWidth, minHeight: minimumHeight };
}

export function resizePanel(box, dx, dy) {
    numbers(8).set([box.left, box.top, box.width, box.height, box.minWidth, box.minHeight, box.canvasWidth, box.canvasHeight]);
    engine.panel_resize(edges.indexOf(box.edge), dx, dy);
    return Array.from(numbers(4));
}

export function dragPanel(x, y, width, height, canvas) {
    numbers(2);
    engine.panel_drag(x, y, width, height, canvas.width, canvas.height);
    return Array.from(numbers(2));
}
