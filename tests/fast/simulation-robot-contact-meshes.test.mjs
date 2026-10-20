import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isSimulationCollisionPair } from '../../2_3DSimulation/collision-policy-core.mjs';

const threeUrl = new URL('../../3_ToolSelector/vendor/three/three.module.js', import.meta.url).href;
const THREE = await import(threeUrl);
const source = readFileSync(new URL('../../2_3DSimulation/collision-system.mjs', import.meta.url), 'utf8')
    .replace("from 'three';", `from '${threeUrl}';`);
const { MeshCollisionSystem } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function fixture(robotBodies = true) {
    const arm = new THREE.Group(), other = new THREE.Group();
    if (robotBodies) for (const root of [arm, other]) root.userData.tcpFrame = {};
    const box = (parent, name, width, x) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 2, 2), new THREE.MeshBasicMaterial());
        mesh.name = name; mesh.position.x = x; parent.add(mesh); return mesh;
    };
    const body = box(arm, 'first arm body', 4, 0);
    const shaft = box(other, 'second arm shaft', 1, -1);
    const otherBody = box(other, 'second arm body', 1, 1);
    [arm, other].forEach(root => root.updateMatrixWorld(true));
    return { arm, other, body, shaft, otherBody };
}

test('한 팔이 상대 샤프트와 본체에 동시에 닿으면 모든 접촉 부위를 순서와 캐시에 관계없이 보고한다', () => {
    const { arm, other, body, shaft, otherBody } = fixture();
    const expected = new Set([body, shaft, otherBody]);
    const system = new MeshCollisionSystem();
    const meshes = hits => new Set(hits.flatMap(hit => [hit.meshA, hit.meshB]));
    for (const roots of [[arm, other], [other, arm]]) {
        assert.deepEqual(meshes(system.checkAll(roots, { pairFilter: isSimulationCollisionPair })), expected);
        assert.deepEqual(meshes(system.checkAll(roots, { changedRoots: new Set([arm]) })), expected);
    }
    otherBody.position.x = 10; other.updateMatrixWorld(true);
    assert.deepEqual(meshes(system.checkAll([arm, other], { changedRoots: new Set([other]) })), new Set([body, shaft]));
    other.position.y = 10; other.updateMatrixWorld(true);
    assert.equal(system.checkAll([arm, other], { changedRoots: new Set([other]) }).length, 0);
});

test('고정 CAD 모델은 기존처럼 부위별 대표 접촉만 검사한다', () => {
    const { arm, other } = fixture(false);
    assert.equal(new MeshCollisionSystem().checkAll([arm, other]).length, 1);
});
