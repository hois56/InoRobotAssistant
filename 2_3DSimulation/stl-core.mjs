import { engine } from './wasm/engine.mjs';

const decoder = new TextDecoder();
function readArray(field, Type = Float32Array) {
    const length = engine.stl_field(field, true);
    const address = engine.stl_field(field, false);
    return new Type(engine.memory.buffer, address, length).slice();
}
function attribute(array) {
    return { array, itemSize: 3, normalized: false };
}

export function parseStl(buffer, includeCollisionProxy = false) {
    const bytes = ArrayBuffer.isView(buffer)
        ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength) : new Uint8Array(buffer);
    const input = engine.stl_input(bytes.byteLength);
    try {
        new Uint8Array(engine.memory.buffer, input, bytes.byteLength).set(bytes);
        if (!engine.stl_parse(includeCollisionProxy)) throw new Error('Invalid or truncated STL data.');
        const attributes = { position: attribute(readArray(0)), normal: attribute(readArray(1)) };
        const alpha = engine.stl_alpha();
        if (alpha >= 0) attributes.color = attribute(readArray(2));
        const groups = Array.from({ length: engine.stl_groups() }, (_, i) => ({
            start: engine.stl_group(i, 0), count: engine.stl_group(i, 1),
            name: decoder.decode(new Uint8Array(engine.memory.buffer, engine.stl_group(i, 2), engine.stl_group(i, 3)))
        }));
        const collisionGeometry = engine.stl_field(4, true)
            ? { attributes: { position: attribute(readArray(3)) }, index: readArray(4, Uint32Array) }
            : null;
        return { geometry: { attributes, index: null }, collisionGeometry, alpha, groups };
    } finally {
        engine.stl_release();
    }
}
