const utf8 = new TextDecoder();
let active;

function read(address, length) {
    return utf8.decode(new Uint8Array(active.memory.buffer, address, length));
}

export const domImports = {
    element(address, length, svg) {
        const name = read(address, length);
        const node = svg ? active.document.createElementNS('http://www.w3.org/2000/svg', name)
            : active.document.createElement(name);
        active.stack.at(-1).appendChild(node);
        active.stack.push(node);
    },
    attribute(key, keyLength, value, length) {
        active.stack.at(-1).setAttribute(read(key, keyLength), read(value, length));
    },
    append_text(address, length, translated) {
        const value = read(address, length);
        active.stack.at(-1).appendChild(active.document.createTextNode(translated ? active.translate(value) : value));
    },
    end_element() { active.stack.pop(); },
    set_control(address, length, property, value) {
        for (const node of active.root.querySelectorAll(read(address, length))) {
            const on = Boolean(value);
            if (property === 0) node.hidden = on;
            else if (property === 1) node.disabled = on;
            else {
                node.classList.toggle('active', on);
                node.setAttribute('aria-selected', String(on));
            }
        }
    }
};

export function createView(engine, document, render = engine.render_simulator, translate = value => value) {
    const fragment = document.createDocumentFragment();
    const previous = active;
    active = { document, memory: engine.memory, stack: [fragment], translate };
    try {
        render();
        return fragment;
    } finally { active = previous; }
}

export function updateView(engine, root, update) {
    const previous = active;
    active = { memory: engine.memory, root };
    try { update(); }
    finally { active = previous; }
}
