import { indexSolidWorksReferences } from './solidworks-import.mjs';
import initSolidWorks from './wasm/solidworks-display.mjs';
import { configureSolidWorksHost, referenceError } from './wasm/solidworks-host.mjs';

const encoder = new TextEncoder();

self.onmessage = async ({ data: { file, path, references } }) => {
    try {
        const response = await fetch(new URL('./wasm/solidworks-display.wasm', import.meta.url), { cache: 'no-cache' });
        if (!response.ok) throw new Error('SolidWorks WASM HTTP ' + response.status);
        const engine = await initSolidWorks({ module_or_path: await response.arrayBuffer() });
        const reader = new FileReaderSync();
        configureSolidWorksHost(engine.memory, indexSolidWorksReferences(references, path), reader);
        const name = encoder.encode(file.name);
        const input = reader.readAsArrayBuffer(file);
        const namePointer = engine.sw_name(name.length);
        const inputPointer = engine.sw_input(input.byteLength);
        const memory = engine.memory.buffer;
        new Uint8Array(memory, namePointer, name.length).set(name);
        new Uint8Array(memory, inputPointer, input.byteLength).set(new Uint8Array(input));
        const length = engine.sw_read();
        if (!length) {
            self.postMessage({ code: 'SW_NO_DISPLAY', ...referenceError });
            return;
        }
        const outputPointer = engine.sw_output();
        const buffer = engine.memory.buffer.slice(outputPointer, outputPointer + length);
        self.postMessage({ buffer, isStep: Boolean(engine.sw_is_step()) }, [buffer]);
    } catch (error) {
        self.postMessage({ code: 'SW_READ_FAILED', error: error.message, ...referenceError });
    }
};
