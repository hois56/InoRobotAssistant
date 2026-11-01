import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const workerSource = readFileSync(new URL('../../2_3DSimulation/step-import-worker.js', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
const encode = text => new TextEncoder().encode(text).buffer;
const fixtureStep = `ISO-10303-21;HEADER;FILE_DESCRIPTION(('ignore; PRODUCT(''text'')'),'2;1');ENDSEC;DATA;
/* PRODUCT('fake','fake','CAD_Lightweight merged part',()); */
#11=PRODUCT('same','합친 부품','CAD_Lightweight merged part',(#900));
#12=PRODUCT('same','합친 부품','CAD_Lightweight merged part v2',(#900));
#13=PRODUCT('same','합친 부품','',(#900));
#21=PRODUCT_DEFINITION_FORMATION('','',#11);#22=PRODUCT_DEFINITION_FORMATION('','',#12);
#23=PRODUCT_DEFINITION_FORMATION('','',#13);
#31=PRODUCT_DEFINITION('design','',#21,#901);#32=PRODUCT_DEFINITION('design','',#22,#901);#33=PRODUCT_DEFINITION('design','',#23,#901);
#41=NEXT_ASSEMBLY_USAGE_OCCURRENCE('1','O''Brien \\X2\\D569CE5C\\X0\\','',#50,#31,$);
#42=NEXT_ASSEMBLY_USAGE_OCCURRENCE('2','합친 부품','',#50,#32,$);
#43=NEXT_ASSEMBLY_USAGE_OCCURRENCE('3','합친 부품','',#50,#33,$);
#99=CARTESIAN_POINT('PRODUCT; not metadata',(1.2345678901234567,-0.,3.));ENDSEC;END-ISO-10303-21;`;

function fixture(nativeReader = null) {
    const messages = []; let handler;
    const context = vm.createContext({ Float32Array, Uint8Array, Uint16Array, Uint32Array, ArrayBuffer,
        DataView, TextEncoder, TextDecoder, Symbol, performance, console, setTimeout, clearTimeout,
        importScripts() {}, occtimportjs: async () => ({ ReadStepFile: nativeReader }),
        self: { addEventListener(_type, callback) { handler = callback; },
            postMessage(message, transfer) { messages.push(structuredClone(message, { transfer })); } }
    });
    vm.runInContext(workerSource, context);
    return { context, messages, parse: fileBuffer => handler({ data: { type: 'parse', requestId: 1, fileBuffer } }) };
}

test('CAD_Lightweight marker는 PRODUCT/NAUO 참조로 식별하고 같은 이름의 일반 제품은 변경하지 않는다', () => {
    const { context } = fixture(); const original = encode(fixtureStep);
    const prepared = context.prepareMergedStepImport(original);
    const tagged = new TextDecoder().decode(prepared.fileBuffer);
    assert.equal(prepared.mergedTags.size, 4);
    assert.equal(prepared.mergedTags.get('__CADLW_OCC_41__').name, "O'Brien 합친");
    assert.equal(prepared.mergedTags.get('__CADLW_OCC_42__').name, '합친 부품');
    assert.match(tagged, /#13=PRODUCT\('same','합친 부품','',/);
    assert.match(tagged, /#43=NEXT_ASSEMBLY_USAGE_OCCURRENCE\('3','합친 부품'/);
    assert.match(tagged, /1\.2345678901234567,-0\.,3\./);
    assert.equal(new TextDecoder().decode(original), fixtureStep, 'Original transferred source remains unchanged');
    assert.match(tagged, /ignore; PRODUCT\(''text''\)/);
});

test('표시명이 같은 합친 제품들은 occurrence별 ID를 유지하고 일반 여러 솔리드는 계속 구분한다', () => {
    const { context } = fixture(); const { mergedTags } = context.prepareMergedStepImport(encode(fixtureStep));
    const root = { children: [
        { name: '__CADLW_OCC_41__', children: [{ name: 'Solid A', meshes: [0] }, { name: 'Solid B', meshes: [1] }] },
        { name: '__CADLW_OCC_42__', meshes: [2, 3] },
        { name: '합친 부품', meshes: [4, 5] }
    ] };
    const parts = context.indexStepHierarchy(root, [], mergedTags);
    assert.equal(parts.get(0).partId, parts.get(1).partId);
    assert.equal(parts.get(2).partId, parts.get(3).partId);
    assert.notEqual(parts.get(0).partId, parts.get(2).partId);
    assert.equal(parts.get(0).parentPartId, undefined);
    assert.equal(parts.get(0).mergedAtomic, true);
    assert.notEqual(parts.get(4).partId, parts.get(5).partId);
    assert.equal(parts.get(4).parentPartId, 'cad-part-2');
});

function nativeMesh(color, offset = 0) {
    return { color, attributes: {
        position: { array: new Float32Array([offset, 0, 0, offset + 1, 0, 0, offset, 1, 0]) },
        normal: { array: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]) }
    }, index: { array: new Uint32Array([0, 1, 2]) }, brep_faces: [{ first: 0, last: 0 }] };
}

test('표준 Worker는 표시명이 같은 합친 제품마다 색상을 유지한 실제 메시 한 개를 보낸다', async () => {
    const { parse, messages } = fixture(bytes => {
        const text = new TextDecoder().decode(bytes);
        assert.match(text, /__CADLW_PRODUCT_11__/);
        return { success: true, root: { children: [
            { name: '__CADLW_OCC_41__', meshes: [0, 1] },
            { name: '__CADLW_OCC_42__', meshes: [2, 3] },
            { name: '합친 부품', meshes: [4, 5] }
        ] }, meshes: [nativeMesh([1, 0, 0]), nativeMesh([0, 0, 1], 10), nativeMesh([0, 1, 0], 20),
            nativeMesh([0, 0, 0], 30), nativeMesh([1, 1, 1], 40), nativeMesh([1, 1, 1], 50)] };
    });
    await parse(encode(fixtureStep));
    assert.equal(messages.at(-1).type, 'done');
    const meshes = messages.filter(message => message.type === 'mesh').map(message => message.mesh);
    const atomic = meshes.filter(mesh => mesh.mergedAtomic);
    assert.equal(atomic.length, 2); assert.equal(meshes.length, 4);
    assert.equal(new Set(atomic.map(mesh => mesh.partId)).size, 2);
    assert.deepEqual([...atomic[0].colors.slice(0, 3)], [1, 0, 0]);
    assert.deepEqual([...atomic[0].colors.slice(9, 12)], [0, 0, 1]);
    assert.deepEqual(atomic[0].brepFaces, [{ first: 0, last: 0 }, { first: 1, last: 1 }]);
    assert.deepEqual([...atomic[0].positions.slice(9, 12)], [10, 0, 0]);
    assert.equal(atomic[0].materialGroups, undefined);
    assert.equal(atomic[0].parentPartId, undefined);
});

test('합친 메시의 공유 꼭짓점은 서로 다른 면 색상을 섞지 않고 삼각형·스냅 순서를 유지한다', () => {
    const { context } = fixture();
    const entry = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
        indices: new Uint32Array([0, 1, 2, 0, 3, 1]), normals: new Float32Array(12).fill(1),
        positionLength: 12, indexLength: 6, normalLength: 12,
        brepFaces: [{ first: 0, last: 0, color: [1, 0, 0] }, { first: 1, last: 1, color: [0, 0, 1] }] };
    const merged = context.packAtomicMergedStep([entry], { partId: 'one', partName: 'Merged' });
    assert.equal(merged.positions.length, 18);
    assert.deepEqual([...merged.positions.slice(0, 3)], [...merged.positions.slice(9, 12)]);
    assert.deepEqual([...merged.colors.slice(0, 3)], [1, 0, 0]);
    assert.deepEqual([...merged.colors.slice(9, 12)], [0, 0, 1]);
    assert.deepEqual([...merged.indices], [0, 1, 2, 3, 4, 5]);
    assert.deepEqual(JSON.parse(JSON.stringify(merged.brepFaces)), [{ first: 0, last: 0 }, { first: 1, last: 1 }]);
});

test('대용량 XCAF도 marked 제품의 compound 전체를 한 개 부품·한 메시로 처리한다', () => {
    const { context, messages } = fixture();
    const prepared = context.prepareMergedStepImport(encode(fixtureStep));
    const document = { getRoots: () => [1], getChildren: label => label === 1 ? [2, 3] : [],
        getLabelInfo: label => ({ name: label === 1 ? '__CADLW_OCC_42__' : 'Solid', shapeHandle: 100 + label }) };
    const parts = context.collectXcafParts(document, new Map(), prepared.mergedTags);
    assert.equal(parts.length, 1); assert.equal(parts[0].partName, '합친 부품'); assert.equal(parts[0].mergedAtomic, true);
    const mesh = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        normals: new Float32Array(9).fill(1), indices: new Uint32Array([0, 1, 2]), faceGroups: new Uint32Array([0, 3, 99]) };
    assert.equal(context.postLargeMeshChunks(mesh, {}, 1, parts[0]), 1);
    const output = messages[0].mesh;
    assert.equal(output.mergedAtomic, true); assert.equal(output.colors.length, 9); assert.equal(output.largeModelChunk, undefined);
});

test('Renderer와 가져오기 캐시는 단일 메시의 정점 색상을 유지한다', () => {
    assert.match(mainSource, /const STEP_IMPORT_CACHE_VERSION = 5;/);
    assert.match(mainSource, /step-mesh-v9-atomic-merged-parts/);
    assert.match(mainSource, /step-import-worker\.js\?v=20261031-atomic-merged-parts-1/);
    class Geometry { constructor() { this.attributes = {}; } setAttribute(name, value) { this.attributes[name] = value; } setIndex(value) { this.index = value; } computeBoundingBox() {} computeBoundingSphere() {} }
    class Attribute { constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; } }
    class Mesh { constructor(geometry, material) { this.geometry = geometry; this.material = material; this.userData = {}; } }
    const material = { color: { values: [], fromArray(values) { this.values = values; }, toArray() { return this.values; }, setRGB(...values) { this.values = values; } } };
    const context = vm.createContext({ THREE: { BufferGeometry: Geometry, BufferAttribute: Attribute, Mesh }, Float32Array, Uint32Array, ArrayBuffer,
        createImportedPlacementMaterial: () => material, getValidatedStepBrepFaces: mesh => mesh.userData.stepBrepFaces });
    vm.runInContext(['createStepMeshFromWorker', 'stepMeshCacheBytes'].map(name => mainSource.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))[0]).join('\n'), context);
    const definition = { positions: new Float32Array(9), normals: new Float32Array(9), indices: new Uint32Array([0, 1, 2]), colors: new Float32Array(9),
        color: [1, 1, 1], partId: 'one', partName: 'Merged', mergedAtomic: true };
    const mesh = context.createStepMeshFromWorker(definition, 0, 'tool');
    assert.equal(mesh.geometry.attributes.color.array, definition.colors);
    assert.equal(mesh.material.vertexColors, true); assert.equal(Array.isArray(mesh.material), false);
    assert.equal(mesh.userData.cadParentPartKey, undefined);
    assert.equal(context.stepMeshCacheBytes([definition]), 120);
});
