import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const workerSource = readFileSync(new URL('../../2_3DSimulation/step-import-worker.js', import.meta.url), 'utf8');

function fixture({ heapBytes = 1024, assembly = false, failPart = false } = {}) {
    const messages = [];
    const timers = new Map();
    const calls = { init: 0, released: 0, disposed: 0, parameters: [], direct: 0, closed: 0 };
    let handler;
    let failImport = false;
    const mesh = {
        positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10]),
        normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0]),
        indices: new Uint32Array([2, 0, 1, 0, 3, 1]),
        faceGroups: new Uint32Array([0, 3, 101, 3, 3, 102])
    };
    const kernel = {
        importStep() { calls.direct += 1; if (failImport) throw new Error('invalid STEP'); return 1; },
        meshShape(shape, parameters) { calls.parameters.push(parameters); if (failPart && shape === 12) throw new Error('part failed'); return mesh; },
        release() {},
        releaseAll() { calls.released += 1; },
        getRawModule() { return { HEAPU8: { byteLength: heapBytes } }; },
        [Symbol.dispose]() { calls.disposed += 1; }
    };
    if (assembly) kernel.importXCAFFromSTEP = () => ({
        getRoots: () => [1],
        getChildren: label => label === 1 ? [2, 3] : [],
        getLabelInfo: label => ({ name: label === 1 ? 'Assembly' : 'Bolt', shapeHandle: label === 1 ? 10 : 10 + label, hasColor: true, color: [1, 0, 0] }),
        close() { calls.closed += 1; }
    });
    const context = vm.createContext({
        Float32Array, Uint16Array, Uint32Array, ArrayBuffer, Symbol, performance,
        console, setTimeout(callback) { const id = timers.size + 1; timers.set(id, callback); return id; },
        clearTimeout(id) { timers.delete(id); },
        __loadLargeModule: async () => ({ OcctKernel: { init: async () => { calls.init += 1; return kernel; } } }),
        self: {
            addEventListener(_type, callback) { handler = callback; },
            postMessage(message, transfer) { messages.push(structuredClone(message, { transfer })); }
        }
    });
    vm.runInContext(workerSource.replace('import(LARGE_OCCT_MODULE_URL)', '__loadLargeModule()'), context);
    const parse = (id = 1) => handler({ data: {
        type: 'parse', engine: 'large', requestId: id, fileBuffer: new ArrayBuffer(8),
        fileName: 'fixture.step', parameters: { linearDeflectionAbsolute: 0.125, angularDeflection: 0.25 }
    } });
    return { context, calls, messages, timers, mesh, parse, fail: () => { failImport = true; } };
}

test('STEP 연속 가져오기는 엔진을 재사용하고 매번 형상을 정리한다', async () => {
    const { parse, calls, messages, timers } = fixture();
    await parse(1);
    await parse(2);
    assert.equal(calls.init, 1);
    assert.equal(calls.released, 2);
    assert.equal(calls.disposed, 0);
    assert.equal(timers.size, 1);
    assert.equal(messages.filter(message => message.type === 'done').length, 2);
    for (const { timings } of messages.filter(message => message.type === 'done')) {
        for (const phase of ['engineInitMs', 'readingMs', 'tessellationMs', 'packingMs', 'totalMs']) {
            assert.ok(Number.isFinite(timings[phase]) && timings[phase] >= 0, phase);
        }
    }
    for (const parameters of calls.parameters) {
        assert.equal(parameters.linearDeflection, 0.125);
        assert.equal(parameters.angularDeflection, 0.25);
    }
    [...timers.values()][0]();
    assert.equal(calls.disposed, 1);
    await parse(3);
    assert.equal(calls.init, 2);
});

test('대용량 조립 STEP는 직접 변환 성공 여부와 관계없이 부품 구분을 보존한다', async () => {
    const { parse, calls, messages } = fixture({ assembly: true });
    await parse();
    const meshes = messages.filter(message => message.type === 'mesh').map(message => message.mesh);
    assert.equal(calls.direct, 0);
    assert.equal(new Set(meshes.map(mesh => mesh.partId)).size, 2);
    assert.deepEqual(meshes.map(mesh => mesh.partName), ['Bolt', 'Bolt']);
    assert.deepEqual(meshes.map(mesh => mesh.color), [[1, 0, 0], [1, 0, 0]]);
    assert.equal(calls.closed, 1);
    assert.equal(messages.at(-1).segmented, true);
});

test('조립 STEP의 일부 부품 변환 실패를 성공으로 보고하지 않는다', async () => {
    const { parse, calls, messages } = fixture({ assembly: true, failPart: true });
    await parse();
    assert.equal(messages.at(-1).type, 'error');
    assert.equal(messages.some(message => message.type === 'done'), false);
    assert.equal(calls.closed, 1);
});

test('중첩 조립 참조는 반복 부품의 ID와 부모 회전·이동을 보존한다', () => {
    const { context } = fixture();
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
    const document = {
        getRoots: () => [1],
        getChildren: label => ({ 1: [2, 3], 20: [4] }[label] || []),
        getLabelInfo: label => ({ name: label === 40 ? 'Bolt' : '', isComponent: [2, 3, 4].includes(label), shapeHandle: label === 40 ? 100 : null }),
        getReferredLabel: label => ({ 2: 20, 3: 20, 4: 40 }[label]),
        getLocation: label => label === 2 ? [0, -1, 0, 100, 1, 0, 0, 0, 0, 0, 1, 0]
            : label === 4 ? [1, 0, 0, 10, 0, 1, 0, 20, 0, 0, 1, 30] : identity
    };
    const parts = context.collectXcafParts(document);
    assert.equal(parts.length, 2);
    assert.notEqual(parts[0].partId, parts[1].partId);
    assert.equal(parts[0].partName, 'Bolt');
    assert.deepEqual(Array.from(parts[0].placement), [0, -1, 0, 80, 1, 0, 0, 10, 0, 0, 1, 30]);
    assert.deepEqual(Array.from(parts[1].placement), [1, 0, 0, 10, 0, 1, 0, 20, 0, 0, 1, 30]);
    const getInfo = document.getLabelInfo;
    document.getLabelInfo = label => ({ ...getInfo(label), name: label === 4 ? 'NAUO42' : label === 40 ? 'Bolt' : '' });
    assert.equal(context.collectXcafParts(document)[0].partName, 'Bolt');
});

test('STEP 변환 실패 후에는 엔진을 폐기하고 다음 요청에서 초기화한다', async () => {
    const { parse, calls, messages, timers, fail } = fixture();
    await parse(1);
    fail();
    await parse(2);
    assert.equal(calls.init, 1);
    assert.equal(calls.disposed, 1);
    assert.equal(timers.size, 0);
    assert.match(messages.at(-1).message, /invalid STEP/);
    await parse(3);
    assert.equal(calls.init, 2);
});

test('STEP 메시 분할은 좌표·법선·삼각형 순서와 면 정보를 그대로 보존한다', () => {
    const { context, mesh } = fixture();
    const ranges = [{ first: 0, last: 0 }, { first: 1, last: 1 }];
    const lookup = new Uint32Array(mesh.positions.length / 3);
    const result = context.createLargeMeshChunk(mesh, ranges, true, lookup);
    assert.deepEqual([...result.positions], [0, 10, 0, 0, 0, 0, 10, 0, 0, 0, 0, 10]);
    assert.deepEqual([...result.normals], [0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0]);
    assert.deepEqual([...result.indices], [0, 1, 2, 1, 3, 2]);
    assert.deepEqual(JSON.parse(JSON.stringify(result.brepFaces)), [{ first: 0, last: 0 }, { first: 1, last: 1 }]);
    assert.ok(lookup.every(value => value === 0));
    const next = context.createLargeMeshChunk(mesh, [{ first: 1, last: 1 }], true, lookup);
    assert.deepEqual([...next.indices], [0, 1, 2]);
    assert.deepEqual([...next.positions], [0, 0, 0, 0, 0, 10, 10, 0, 0]);
});

test('동시에 전달된 STEP 요청도 하나의 엔진에서 순서대로 처리한다', async () => {
    const { parse, calls, messages } = fixture();
    await Promise.all([parse(1), parse(2), parse(3)]);
    assert.equal(calls.init, 1);
    assert.deepEqual(messages.filter(message => message.type === 'done').map(message => message.requestId), [1, 2, 3]);
});

test('큰 WASM 힙은 가져오기 직후 정리하여 계속 보관하지 않는다', async () => {
    const { parse, calls, timers } = fixture({ heapBytes: 513 * 1024 * 1024 });
    await parse(1);
    assert.equal(calls.disposed, 1);
    assert.equal(timers.size, 0);
    await parse(2);
    assert.equal(calls.init, 2);
});

test('배열 일괄 복사는 중첩 배열과 정점 인덱스 오프셋의 기존 결과를 보존한다', () => {
    const { context } = fixture();
    for (const source of [[1, 2, 3], new Uint32Array([1, 2, 3]), [[1, 2], [3]], [1, [2, 3]]]) {
        assert.equal(context.numericArrayLength(source), 3);
        for (const offset of [0, 7]) {
            const target = new Uint32Array(5);
            assert.equal(context.copyNumbers(source, target, 1, offset), 4);
            assert.deepEqual([...target], [0, 1 + offset, 2 + offset, 3 + offset, 0]);
        }
    }
    for (const source of [[-0, -1e-100, 1], new Float32Array([-0, 0, 1])]) {
        const target = new Float32Array(3);
        context.copyNumbers(source, target, 0);
        assert.equal(Object.is(target[0], -0), false);
        const expected = Float32Array.from(source, value => Number(value) + 0);
        assert.deepEqual(target, expected);
    }
});

test('희소 정점의 Map 경로와 빠른 경로는 면 정보가 없어도 같은 결과를 만든다', () => {
    const { context, mesh } = fixture();
    const ranges = [{ first: 0, last: 1 }];
    const fallback = context.createLargeMeshChunk(mesh, ranges, false);
    const fast = context.createLargeMeshChunk(mesh, ranges, false, new Uint32Array(mesh.positions.length / 3));
    for (const property of ['positions', 'indices', 'normals']) assert.deepEqual(fast[property], fallback[property]);
    assert.equal(fast.brepFaces, null);
});
