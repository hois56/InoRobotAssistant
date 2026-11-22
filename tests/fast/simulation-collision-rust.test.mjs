import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadCollisionSystem } from '../support/load-collision-system.mjs';

const threeUrl = new URL('../../3_ToolSelector/vendor/three/three.module.js', import.meta.url).href;
const THREE = await import(threeUrl);
const { MeshCollisionSystem } = await loadCollisionSystem(threeUrl);

function random(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
        return state / 2 ** 32;
    };
}

function stlGeometry(file) {
    const stl = readFileSync(new URL(`../../2_3DSimulation/models/${file}`, import.meta.url));
    const count = stl.readUInt32LE(80);
    const positions = Float32Array.from({ length: count * 9 }, (_, i) => stl.readFloatLE(84 + Math.floor(i / 9) * 50 + 12 + i % 9 * 4));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geometry;
}

const shapes = [
    () => new THREE.BoxGeometry(40, 30, 20),
    () => new THREE.SphereGeometry(18, 24, 16),
    () => new THREE.TorusKnotGeometry(14, 4, 96, 12),
    () => new THREE.CylinderGeometry(8, 12, 40, 20),
    () => new THREE.IcosahedronGeometry(16, 2),
    () => stlGeometry('IR-R10H-120/P2.stl')
];

function root(name, geometry, next, spread) {
    const group = new THREE.Group();
    group.name = name;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.name = name + '/mesh';
    group.add(mesh);
    place(group, next, spread);
    return group;
}

function place(group, next, spread) {
    group.position.set((next() - 0.5) * spread, (next() - 0.5) * spread, (next() - 0.5) * spread);
    group.rotation.set(next() * Math.PI * 2, next() * Math.PI * 2, next() * Math.PI * 2);
    group.scale.set(0.6 + next(), 0.6 + next(), 0.6 + next());
    group.updateMatrixWorld(true);
}

function fixed(name, geometry) {
    const group = new THREE.Group();
    group.name = name;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.name = name + '/mesh';
    group.add(mesh);
    group.updateMatrixWorld(true);
    return group;
}

const describeHit = hit => [hit.objectA.name, hit.objectB.name, hit.meshA.name, hit.meshB.name, hit.kind,
    hit.triangleA, hit.triangleB, hit.point.x, hit.point.y, hit.point.z];
const describeStats = stats => [stats.modelPairs, stats.meshPairs, stats.triangleTests, stats.warmHitReuses, stats.cachedTriangleRechecks, stats.collisionCount];

function both(run) {
    const native = new MeshCollisionSystem();
    const reference = new MeshCollisionSystem({ native: false });
    return { native: run(native), reference: run(reference), native_system: native, reference_system: reference };
}

test('Rust collision BVH reports the same hits, points and triangle tests as the JavaScript reference', () => {
    let hits = 0, triangleTests = 0;
    for (const seed of [1, 7, 19, 42]) {
        const next = random(seed);
        const geometries = shapes.map(make => make());
        const roots = geometries.map((geometry, index) => root(`r${index}`, geometry, next, 70));
        const native = new MeshCollisionSystem();
        const reference = new MeshCollisionSystem({ native: false });
        for (let frame = 0; frame < 5; frame += 1) {
            const options = { now: frame * 100 };
            const left = native.checkAll(roots, options);
            const right = reference.checkAll(roots, options);
            assert.deepEqual(left.map(describeHit), right.map(describeHit), `seed ${seed} frame ${frame}`);
            assert.deepEqual(describeStats(native.lastStats), describeStats(reference.lastStats), `seed ${seed} frame ${frame} stats`);
            hits += left.length;
            triangleTests += native.lastStats.triangleTests;
            const moved = roots[frame % roots.length];
            place(moved, next, 50);
        }
        assert.ok([...native.geometryCache.values()].every(bvh => bvh.native), 'the engine builds every BVH');
        assert.ok([...reference.geometryCache.values()].every(bvh => !bvh.native));
        native.clear();
    }
    assert.ok(hits > 10 && triangleTests > 1000, `scenes exercise the narrow phase (${hits} hits, ${triangleTests} tests)`);
});

test('containment, mount contact, point inside and surface distance match the JavaScript reference', () => {
    // A closed sphere entirely inside another reports containment, not a surface hit.
    const outer = fixed('outer', new THREE.SphereGeometry(30, 24, 16));
    const inner = fixed('inner', new THREE.SphereGeometry(5, 12, 8));
    [outer, inner].forEach(group => { group.position.set(2, -1, 3); group.updateMatrixWorld(true); });
    let { native, reference } = both(system => system.checkAll([outer, inner]).map(describeHit));
    assert.deepEqual(native, reference);
    assert.equal(native[0]?.[4], 'containment');

    // A robot base resting on a scene plate is permitted; pushing it into the plate is not.
    const robot = fixed('robot', new THREE.BoxGeometry(20, 20, 20));
    robot.userData.tcpFrame = new THREE.Object3D();
    robot.children[0].userData.collisionMountPlane = { z: -10, inwardSign: 1 };
    const plate = fixed('plate', new THREE.BoxGeometry(60, 60, 4));
    plate.userData.placement = 'scene';
    const outcomes = [];
    for (const depth of [-12, -11.5]) {
        plate.position.set(0, 0, depth);
        plate.updateMatrixWorld(true);
        ({ native, reference } = both(system => system.checkAll([robot, plate]).map(describeHit)));
        assert.deepEqual(native, reference, `plate at ${depth}`);
        outcomes.push(native.length);
    }
    assert.deepEqual(outcomes, [0, 1], 'resting on the plate is permitted, sinking into it is a collision');

    const next = random(5);
    const solids = [root('box', new THREE.BoxGeometry(30, 20, 10), next, 40), root('ball', new THREE.SphereGeometry(12, 20, 14), next, 40)];
    const points = Array.from({ length: 120 }, () => new THREE.Vector3((next() - 0.5) * 60, (next() - 0.5) * 60, (next() - 0.5) * 60));
    ({ native, reference } = both(system => points.map(point => system.isPointInside(solids, point))));
    assert.deepEqual(native, reference);
    assert.ok(native.some(Boolean) && native.some(inside => !inside));

    const near = root('near', new THREE.TorusKnotGeometry(10, 3, 64, 8), next, 60);
    const far = root('far', new THREE.CylinderGeometry(6, 6, 30, 16), next, 60);
    const distances = [0, 0.5, 2, 5, 10, 20, 40];
    ({ native, reference } = both(system => distances.map(distance => system.isWithinDistance(near, far, distance))));
    assert.deepEqual(native, reference);
});

test('geometry the engine declines keeps the JavaScript BVH and mixed pairs still match', () => {
    const broken = new THREE.SphereGeometry(10, 12, 8);
    const position = broken.getAttribute('position');
    // An unreferenced vertex after the indexed ones does not matter to either path,
    // but a NaN in a referenced vertex sends the geometry to the JavaScript BVH.
    position.setXYZ(0, NaN, 0, 0);
    const left = fixed('nan', broken);
    const right = fixed('ok', new THREE.BoxGeometry(12, 12, 12));
    right.position.set(6, 0, 0);
    right.updateMatrixWorld(true);
    const { native, reference, native_system: system } = both(system => system.checkAll([left, right]).map(describeHit));
    assert.deepEqual(native, reference);
    const kinds = [...system.geometryCache.values()].map(bvh => Boolean(bvh.native)).sort();
    assert.deepEqual(kinds, [false, true]);
});
