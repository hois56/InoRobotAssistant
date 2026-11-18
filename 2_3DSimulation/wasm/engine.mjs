import { conditionWithEngine, evaluateWithEngine, olpImports } from './olp-host.mjs';
import { domImports } from './dom.mjs';

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

export const engine = (await WebAssembly.instantiate(await load(), { olp: olpImports, dom: domImports })).instance.exports;

export function evaluateOlpExpression(value, runtime, unknown) {
    return evaluateWithEngine(engine, value, runtime, unknown);
}

export function evaluateOlpCondition(value, runtime, parse) {
    return conditionWithEngine(engine, value, runtime, parse);
}

export function olpPoseOffset(base, offset, tool) {
    const pose = numbers(12);
    for (let i = 0; i < 6; i++) {
        pose[i] = Number(base[i] || 0);
        pose[6+i] = Number(offset[i] || 0);
    }
    engine.olp_offset(tool);
    return Array.from(numbers(6));
}

export function numbers(length) {
    const address = engine.number_buffer(length);
    return new Float64Array(engine.memory.buffer, address, length);
}
