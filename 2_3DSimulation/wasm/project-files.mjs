import { engine } from './engine.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
function read(operation, text, path = '') {
    const name = encoder.encode(path);
    const source = encoder.encode(text);
    const size = name.length + source.length;
    const address = engine.project_file_bytes(size);
    const input = new Uint8Array(engine.memory.buffer, address, size);
    input.set(name);
    input.set(source, name.length);
    const length = engine.project_file_read(operation, name.length);
    const output = engine.project_file_bytes(length);
    return JSON.parse(decoder.decode(new Uint8Array(engine.memory.buffer, output, length)));
}

export function parsePointsFile(path, text, kind) {
    return read(kind === 'jointPoint' ? 1 : 0, text || '', path);
}
export function parsePointReference(expression) {
    return read(2, String(expression || ''));
}
export function parseRemoteIoMappingText(text) {
    return read(3, text ?? '');
}
export function parseLabels(value) {
    return read(4, JSON.stringify(value ?? null));
}

function normalize(text, path) {
    const address = engine.project_text_units(text.length);
    const input = new Uint16Array(engine.memory.buffer, address, text.length);
    for (let i = 0; i < text.length; i++) input[i] = text.charCodeAt(i);
    const length = engine.project_normalize_text(path);
    if (length < 0) throw new Error(`Parent traversal is not allowed in OLP path: ${text}`);
    const result = engine.project_text_units(length);
    const units = new Uint16Array(engine.memory.buffer, result, length);
    const parts = [];
    for (let i = 0; i < length; i += 8192) parts.push(String.fromCharCode(...units.subarray(i, i + 8192)));
    return parts.join('');
}
export function normalizeOlpPath(value) {
    return normalize(String(value || ''), true);
}
export function normalizeOlpTextForWindows(value) {
    return normalize(String(value ?? ''), false);
}
