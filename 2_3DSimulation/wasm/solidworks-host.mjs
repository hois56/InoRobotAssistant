const decoder = new TextDecoder();
const maxFileSize = 500 * 1024 * 1024;
let memory;
let resolveReference;
let reader;
let pending;

export let referenceError;

export function configureSolidWorksHost(wasmMemory, resolve, fileReader) {
    memory = wasmMemory;
    resolveReference = resolve;
    reader = fileReader;
    referenceError = undefined;
    pending = null;
}

export function reference_size(pointer, length) {
    const stored = decoder.decode(new Uint8Array(memory.buffer, pointer, length));
    const { file, ambiguous } = resolveReference(stored);
    if (!file || !file.size || file.size > maxFileSize) {
        const code = ambiguous ? 'SW_AMBIGUOUS_REF' : file ? 'SW_INVALID_REF' : 'SW_MISSING_REF';
        referenceError = { code, reference: stored.split(/[\\/]/).at(-1) };
        return 0;
    }
    pending = reader.readAsArrayBuffer(file);
    return pending.byteLength;
}

export function copy_reference(pointer, length) {
    new Uint8Array(memory.buffer, pointer, length).set(new Uint8Array(pending));
    pending = null;
}
