import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../2_3DSimulation/step-import-worker.js', import.meta.url), 'utf8');
function fixture() {
    const released = [];
    const context = vm.createContext({ ArrayBuffer, Map, DEFAULT_COLOR: [.749, .78, .835],
        getCompleteLargeMeshFaceRanges: () => [{first:0,last:0}, {first:1,last:1}] });
    for (const name of ['stepSrgbToLinear', 'resolveXcafFaceColors'])
        vm.runInContext(source.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`))[0], context);
    const kernel = { getShapeType: () => 'face', release: id => released.push(id),
        subShapeHashes: id => ({1:[11,12], 2:[21,22], 3:[11], 4:[12]})[id] };
    const document = { getSubShapes: () => [3,4],
        getLabelInfo: id => ({shapeHandle:id, hasColor:true, color:id===3 ? [1,0,0] : [0,0,0]}),
        exportGLTF: () => { throw new Error('memory access out of bounds'); } };
    const mesh = { faceGroups:new Int32Array([0,3,21,3,3,22]) };
    const part = {prototypeLabel:1,shapeHandle:1,color:[.2,.2,.2]};
    return {context,kernel,document,mesh,part,released};
}
test('STEP 색상은 GLB 변환 없이 배치 전후 면을 연결하고 검정색을 보존한다', () => {
    const f=fixture();
    const result=f.context.resolveXcafFaceColors(f.kernel,f.document,f.mesh,f.part,2);
    assert.deepEqual(JSON.parse(JSON.stringify(result.surfaceFaceColors)),[[1,0,0],[0,0,0]]);
    assert.deepEqual(f.released,[3,4]);
    assert.ok(Math.abs(f.context.stepSrgbToLinear([.5])[0]-.21404114)<1e-7);
});
test('STEP 색상 조회 실패 시에도 네이티브 면 핸들을 해제한다', () => {
    const f=fixture();
    f.kernel.subShapeHashes=()=>{throw new Error('invalid face');};
    assert.throws(()=>f.context.resolveXcafFaceColors(f.kernel,f.document,f.mesh,f.part,2),/invalid face/);
    assert.deepEqual(f.released,[3,4]);
});
