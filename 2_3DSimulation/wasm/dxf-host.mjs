const encoder = new TextEncoder();
const decoder = new TextDecoder();
let active;

export const dxfImports = {
    emit(kind, address, length) {
        const value = JSON.parse(decoder.decode(new Uint8Array(active.engine.memory.buffer, address, length)));
        if (kind === 0) active.entities.push(value);
        else active.header = value;
    }
};

export function dxfData(engine, bytes) {
    const address = engine.dxf_input(bytes.length);
    new Uint8Array(engine.memory.buffer, address, bytes.length).set(bytes);
}

export function readDrawing(engine, source, segments, limit) {
    dxfData(engine, encoder.encode(source));
    const saved = active;
    active = { engine, entities: [], header: null };
    try {
        const status = engine.dxf_parse(segments, limit);
        if (status !== 0) {
            const messages = ['', 'The DXF drawing is empty.', 'The DXF drawing has too few group records.',
                'The DXF drawing has no supported visible entities.'];
            const error = new Error(messages[status]);
            error.code = status === 2 ? 'CAD_DXF_PARSE_FAILED' : 'CAD_EMPTY_DRAWING';
            throw error;
        }
        return { ...active.header, entities: active.entities };
    } finally { active = saved; }
}
