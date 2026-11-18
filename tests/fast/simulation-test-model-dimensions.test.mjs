import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { TEST_MODEL_CATALOG, getTestModelSelection } from '../../2_3DSimulation/test-model-catalog.mjs';
import { getTestModelDimensionFields, normalizeTestModelDimensions, resizeTestModelContent } from '../../2_3DSimulation/test-model-dimensions.mjs';
import { normalizeConveyorSettings } from '../../2_3DSimulation/conveyor-core.mjs';

const threeSource = readFileSync(new URL('../../3_ToolSelector/vendor/three/three.module.js', import.meta.url), 'utf8');
const THREE = await import(`data:text/javascript;base64,${Buffer.from(threeSource).toString('base64')}`);

test('3D 모델별 치수는 독립적으로 검증하고 미선택 모델과 Tool 치수는 적용하지 않는다', () => {
    const selected = getTestModelSelection({ base: 1, 'square-object': 2 }, {
        base: { length: 1200, width: 800, height: 650 },
        'square-object': { length: 80, width: 60, height: 30 },
        vision: { width: 0 }
    });
    assert.deepEqual(selected.map(s => s.dimensions), [{ length: 1200, width: 800, height: 650 }, { length: 80, width: 60, height: 30 }]);
    assert.deepEqual(getTestModelDimensionFields('single-vac'), []);
    assert.equal(getTestModelSelection({ 'single-vac': 1 })[0].dimensions, undefined);
    for (const value of [{ length: 0 }, { width: '' }, { height: NaN }, { length: 10001 }])
        assert.throws(() => normalizeTestModelDimensions('base', value));
});

test('전체 3D 모델의 기본값은 실제 STEP 치수이며 변경 후에도 원점과 부품 구분을 유지한다', async () => {
    const require = createRequire(import.meta.url);
    const occt = await require('../../3_ToolSelector/vendor/occt/occt-import-js.js')();
    for (const asset of TEST_MODEL_CATALOG.filter(a => a.category === 'model')) {
        const parsed = occt.ReadStepFile(readFileSync(new URL(`../../2_3DSimulation/test-assets/${asset.file}`, import.meta.url)), null);
        assert.equal(parsed.success, true, asset.id);
        const root = new THREE.Group();
        for (const mesh of parsed.meshes) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3));
            const object = new THREE.Mesh(geometry); object.name = mesh.name; root.add(object);
        }
        const original = new THREE.Box3().setFromObject(root);
        const defaults = getTestModelDimensionFields(asset.id).map(field => field.value);
        original.getSize(new THREE.Vector3()).toArray().forEach((size, axis) => assert.ok(Math.abs(size - defaults[axis]) < .001, asset.id));
        const originalGeometry = root.children[0].geometry;
        resizeTestModelContent(root, asset.id, {});
        assert.equal(root.children[0].geometry, originalGeometry, asset.id + ': defaults must leave geometry unchanged');
        const dimensions = Object.fromEntries(['length', 'width', 'height'].map((key, axis) => [key, defaults[axis] * [1.2, 1.5, 1.25][axis]]));
        resizeTestModelContent(root, asset.id, dimensions);
        const box = new THREE.Box3().setFromObject(root);
        box.getSize(new THREE.Vector3()).toArray().forEach((size, axis) => assert.ok(Math.abs(size - Object.values(dimensions)[axis]) < .002, asset.id));
        assert.deepEqual(root.scale.toArray(), [1, 1, 1]);
        assert.equal(root.children.length, parsed.meshes.length);
        if (asset.id === 'base') assert.equal(box.max.z, 0, 'base mounting surface remains at Z=0');
        else if (asset.id !== 'equipment') assert.equal(box.min.z, 0, asset.id + ': floor stays at Z=0');
    }
});

test('일반 컨베이어도 띠를 표시하고 실제 운전·역방향·정지에 맞춰 같은 띠를 갱신한다', () => {
    const source = readFileSync(new URL('../../2_3DSimulation/conveyor-visuals.mjs', import.meta.url), 'utf8')
        .replace(/^import .*;\r?\n/gm, '').replace('export function ', 'function ');
    const context = vm.createContext({ THREE, normalizeConveyorSettings });
    vm.runInContext(source, context);
    const root = new THREE.Group();
    const original = new THREE.MeshStandardMaterial();
    const belt = new THREE.Mesh(new THREE.BoxGeometry(1000, 300, 60), original);
    belt.name = 'Endless_belt_width100_thickness3'; root.add(belt);
    const visuals = context.createConveyorVisuals();
    visuals.update([], [], () => null, 0, [root]);
    assert.notEqual(belt.material, original, 'a catalog conveyor needs markings before a motion mapping exists');
    assert.match(belt.material.customProgramCacheKey(), /conveyor-capsule-v1/);
    const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' };
    belt.material.onBeforeCompile(shader, null);
    assert.equal(shader.uniforms.conveyorCapsule.value.z, 470);
    const mapping = { action: 'CONVEYOR', conveyorAxis: 'X', conveyorSpeed: 100 };
    const material = belt.material;
    visuals.update([mapping], [mapping], () => root, .1, [root]);
    assert.equal(belt.material, material);
    assert.equal(shader.uniforms.conveyorTravel.value, 10);
    visuals.update([mapping], [], () => root, .1, [root]);
    assert.equal(shader.uniforms.conveyorTravel.value, 10);
    visuals.update([mapping], [{ ...mapping, conveyorAxis: '-X' }], () => root, .1, [root]);
    assert.equal(shader.uniforms.conveyorTravel.value, 0);
    visuals.update([], [], () => null, 0, []);
    assert.equal(belt.material, original);
});
