import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const threeUrl = new URL('../../3_ToolSelector/vendor/three/three.module.js', import.meta.url).href;
const THREE = await import(threeUrl);
const source = await readFile(new URL('../../2_3DSimulation/collision-system.mjs', import.meta.url), 'utf8');
const { MeshCollisionSystem } = await import(`data:text/javascript;base64,${Buffer.from(
    source.replace("from 'three';", `from '${threeUrl}';`)
).toString('base64')}`);

function boxRoot(...positions) {
    const root = new THREE.Group();
    for (const x of positions) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
        mesh.position.x = x;
        root.add(mesh);
    }
    return root;
}

test('멀리 떨어진 대형 CAD 조립품은 메시 쌍 검색을 시작하지 않는다', () => {
    const system = new MeshCollisionSystem();
    const probe = boxRoot(0, 2, 4, 6);
    const assembly = boxRoot(...Array.from({ length: 250 }, (_, index) => 100 + index * 2));
    let rootScans = 0;
    const scan = system.checkRootPair.bind(system);
    system.checkRootPair = (...args) => { rootScans += 1; return scan(...args); };
    assert.deepEqual(system.checkAll([probe, assembly]), []);
    assert.equal(rootScans, 0, 'Disjoint assemblies must bypass the nested mesh scan.');
    assert.equal(system.lastStats.triangleTests, 0);
    assert.equal(system.geometryCache.size, 0, 'A distant assembly must not build exact geometry BVHs.');

    assembly.position.x = -100;
    const hits = system.checkAll([probe, assembly], { changedRoots: new Set([assembly]) });
    assert.equal(rootScans, 1, 'Moving an assembly into contact must refresh its aggregate bounds.');
    assert.equal(hits.length, 4, 'Every colliding probe mesh must retain its contact.');
});

test('조립품 전체 범위 안의 빈 공간에서는 겹치지 않는 메시의 동작 정책을 조회하지 않는다', () => {
    const system = new MeshCollisionSystem();
    const probe = boxRoot(0);
    const frame = boxRoot(-100, 100);
    let policyCalls = 0;
    const meshPairFilter = () => { policyCalls += 1; return true; };
    assert.deepEqual(system.checkAll([probe, frame], { meshPairFilter }), []);
    assert.equal(policyCalls, 0, 'Hollow model bounds must not trigger policy work for distant individual meshes.');

    frame.children[1].position.x = 0.25;
    assert.equal(system.checkAll([probe, frame], { meshPairFilter }).length, 1);
    assert.equal(policyCalls, 1, 'Only the overlapping mesh must need a policy decision.');
});

test('이전 충돌 메시가 벗어나면 정책 조회와 캐시 삼각형 재검사를 건너뛴다', () => {
    const system = new MeshCollisionSystem();
    const probe = boxRoot(0);
    const assembly = boxRoot(0.25, -5);
    assert.equal(system.checkAll([probe, assembly]).length, 1);
    assembly.children[0].position.x = 5;
    let policyCalls = 0;
    const hits = system.checkAll([probe, assembly], {
        changedRoots: new Set([assembly]),
        meshPairFilter: () => { policyCalls += 1; return true; }
    });
    assert.deepEqual(hits, []);
    assert.equal(policyCalls, 0, 'A separated cached contact must be rejected before its policy callback.');
    assert.equal(system.lastStats.cachedTriangleRechecks, 0);
});

test('여러 로봇 링크가 동시에 닿으면 모든 링크 조합을 정확히 유지한다', () => {
    const system = new MeshCollisionSystem();
    const left = boxRoot(0, 0.25);
    const right = boxRoot(0.1, 0.35);
    left.userData.tcpFrame = {};
    right.userData.tcpFrame = {};
    const hits = system.checkAll([left, right]);
    assert.equal(hits.length, 4);
    assert.equal(new Set(hits.map(hit => `${hit.meshA.uuid}|${hit.meshB.uuid}`)).size, 4);
    assert.equal(system.checkAll([left, right]).length, 4, 'Cached hits must preserve every robot link combination.');
});

test('범위 최적화 후에도 숨김·충돌 형상 변경과 정확한 삼각형 검사를 반영한다', () => {
    const system = new MeshCollisionSystem();
    const probe = boxRoot(0);
    const obstacle = boxRoot(3);
    assert.deepEqual(system.checkAll([probe, obstacle]), []);
    obstacle.children[0].userData.collisionGeometry = new THREE.BoxGeometry(6, 2, 2);
    assert.equal(system.checkAll([probe, obstacle]).length, 1,
        'Changing collision geometry must refresh bounds even without a transform change.');
    obstacle.children[0].visible = false;
    assert.deepEqual(system.checkAll([probe, obstacle]), []);
    obstacle.children[0].visible = true;
    assert.equal(system.checkAll([probe, obstacle]).length, 1);

    const triangle = new THREE.BufferGeometry();
    triangle.setAttribute('position', new THREE.Float32BufferAttribute([
        0.4, 0.6, 0.6, 0.6, 0.4, 0.6, 0.6, 0.6, 0.4
    ], 3));
    const nearCorner = new THREE.Group();
    nearCorner.add(new THREE.Mesh(triangle));
    assert.deepEqual(system.checkAll([probe, nearCorner]), [],
        'Overlapping bounds alone must never become a collision.');
    assert.ok(system.lastStats.triangleTests > 0, 'Overlapping bounds must retain exact narrow-phase checks.');
});
