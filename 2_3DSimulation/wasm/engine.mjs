const url = new URL('./simulation.wasm', import.meta.url);
async function load() {
    if (url.protocol === 'file:' && typeof process !== 'undefined' && process.versions?.node) {
        const { readFile } = await import('node:fs/promises');
        return readFile(url);
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`시뮬레이션 엔진을 불러올 수 없습니다 (HTTP ${response.status}).`);
    return response.arrayBuffer();
}

export const engine = (await WebAssembly.instantiate(await load())).instance.exports;

export function numbers(length) {
    const address = engine.number_buffer(length);
    return new Float64Array(engine.memory.buffer, address, length);
}
