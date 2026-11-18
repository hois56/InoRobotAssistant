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
    append_text(address, length) {
        active.stack.at(-1).appendChild(active.document.createTextNode(read(address, length)));
    },
    end_element() { active.stack.pop(); }
};

export function createView(engine, document) {
    const fragment = document.createDocumentFragment();
    const previous = active;
    active = { document, memory: engine.memory, stack: [fragment] };
    try {
        engine.render_simulator();
        return fragment;
    } finally { active = previous; }
}
