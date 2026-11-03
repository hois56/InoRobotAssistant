import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCadLightweightGltfUnits } from '../../2_3DSimulation/gltf-import-units.mjs';
function fixture(generator) {
    return {asset:{generator},scene:{userData:{},scale:{value:1,multiplyScalar(x){this.value*=x;}},updateMatrixWorld(){}}};
}
test('CAD_Lightweight GLB는 mm로 한 번만 변환한다',()=>{
    const gltf=fixture('CAD_Lightweight');applyCadLightweightGltfUnits(gltf);
    assert.equal(gltf.scene.scale.value,1000);
    applyCadLightweightGltfUnits(gltf);assert.equal(gltf.scene.scale.value,1000);
});
test('다른 기존 GLB의 배율은 변경하지 않는다',()=>{
    const gltf=fixture('Other exporter');applyCadLightweightGltfUnits(gltf);
    assert.equal(gltf.scene.scale.value,1);
});
