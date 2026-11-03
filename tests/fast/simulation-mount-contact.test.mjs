import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const project = process.env.COLLISION_PROJECT;
const threeUrl = project ? pathToFileURL(`${project}/3_ToolSelector/vendor/three/three.module.js`).href
    : new URL('../../3_ToolSelector/vendor/three/three.module.js', import.meta.url).href;
const THREE = await import(threeUrl);
const systemUrl = process.env.COLLISION_SOURCE ? pathToFileURL(process.env.COLLISION_SOURCE)
    : new URL('../../2_3DSimulation/collision-system.mjs', import.meta.url);
const source = await readFile(systemUrl, 'utf8');
const { MeshCollisionSystem } = await import(`data:text/javascript;base64,${Buffer.from(
    source.replace("from 'three';", `from '${threeUrl}';`)
).toString('base64')}`);
const policyUrl = project ? pathToFileURL(`${project}/2_3DSimulation/collision-policy-core.mjs`)
    : new URL('../../2_3DSimulation/collision-policy-core.mjs', import.meta.url);
const { isSimulationCollisionPair } = await import(policyUrl);
const options = { pairFilter: isSimulationCollisionPair };
function mesh(x, y, z, cx = 0, cy = 0, cz = 0) {
    const result = new THREE.Mesh(new THREE.BoxGeometry(x, y, z));
    result.position.set(cx, cy, cz);
    return result;
}
function fixture() {
    const robot = new THREE.Group();
    const flange = new THREE.Group();
    robot.add(flange);
    robot.userData = { tcpFrame: {}, flangeFrame: flange, joints: [{}, {}] };
    const wrist = mesh(20, 20, 10, 0, 0, -5);
    wrist.userData = { robotJointIndex: 1, collisionToolMountCarrier: true,
        collisionIgnoreAttachedToolContact: true }; // Old scenes must not regain blanket exemptions.
    flange.add(wrist);
    const tool = new THREE.Group();
    tool.userData = { attachmentHost: robot, placement: 'tcp', collisionIgnoreHostWristJointCount: 2 };
    tool.add(mesh(12, 12, 10, 0, 0, 5));
    flange.add(tool);
    const system = new MeshCollisionSystem();
    const scan = (reversed = false) => system.checkAll(reversed ? [tool, robot] : [robot, tool], options);
    return { robot, flange, wrist, tool, system, scan };
}
function baseFixture(ceiling = false) {
    const robot = new THREE.Group();
    robot.userData.tcpFrame = {};
    const base = mesh(20, 20, 10, 0, 0, ceiling ? -5 : 5);
    base.userData = { collisionRole: 'robot-mounted-base',
        collisionMountPlane: { z: ceiling ? 5 : -5, inwardSign: ceiling ? -1 : 1 } };
    robot.add(base);
    const floor = new THREE.Group();
    floor.userData = { uploaded: true, placement: 'scene' };
    floor.add(mesh(100, 100, 10, 0, 0, ceiling ? 5 : -5));
    const system = new MeshCollisionSystem();
    const scan = () => system.checkAll([robot, floor], options);
    return { robot, base, floor, system, scan };
}

test('floor mounting contact and perimeter edges are allowed in either root order', () => {
    const f = baseFixture();
    assert.equal(f.scan().length, 0);
    assert.equal(f.system.checkAll([f.floor, f.robot], options).length, 0);
    f.floor.position.z = 0.1;
    assert.ok(f.scan().length > 0, 'Penetration beyond the numerical tolerance must be reported');
    f.floor.position.z = 0;
    assert.equal(f.scan().length, 0, 'A cached penetrating hit must clear at the mounting plane');
});

test('fixed robot base sides and moving links still collide with the installation base', () => {
    const f = baseFixture();
    f.floor.children[0].position.set(50, 0, 5);
    assert.ok(f.scan().length > 0, 'The fixed robot base itself is collision-enabled');
    f.floor.children[0].position.set(0, 0, -5);
    const link = mesh(5, 5, 5, 30, 0, 10);
    link.userData.robotJointIndex = 0;
    f.robot.add(link);
    f.system.clear();
    assert.equal(f.scan().length, 0);
    link.position.z = -2;
    assert.ok(f.scan().some(hit => hit.meshA === link));
    link.position.z = 10;
    assert.equal(f.scan().length, 0);
});

test('ceiling and rotated wall mounting planes follow the hardware transform', () => {
    for (const ceiling of [false, true]) {
        const f = baseFixture(ceiling);
        f.robot.rotation.y = Math.PI / 2;
        f.floor.rotation.y = Math.PI / 2;
        f.robot.position.set(100, 50, 25);
        f.floor.position.copy(f.robot.position);
        assert.equal(f.scan().length, 0);
        f.floor.position.x += ceiling ? -0.5 : 0.5;
        assert.ok(f.scan().length > 0);
    }
});

test('flange mounting contact is allowed but final wrist side interference is reported', () => {
    const f = fixture();
    assert.equal(f.scan().length, 0);
    assert.equal(f.scan(true).length, 0);
    f.tool.position.set(10, 0, -5);
    assert.ok(f.scan().length > 0);
    assert.ok(f.scan(true).length > 0);
    f.tool.position.set(0, 0, 0);
    assert.equal(f.scan().length, 0, 'Warm cached hits must honor mounting contact');
    f.tool.position.z = -0.1;
    assert.ok(f.scan().length > 0, 'A flange collar embedded in the wrist is not just face contact');
});

test('per-triangle filtering continues to another collision inside a merged tool mesh', () => {
    const f = fixture();
    const positions = [];
    for (const [x, y, z, cx, cy, cz] of [[12, 12, 10, 0, 0, 5], [4, 4, 4, 9, 0, -5]]) {
        const geometry = new THREE.BoxGeometry(x, y, z).toNonIndexed();
        geometry.translate(cx, cy, cz);
        positions.push(...geometry.attributes.position.array);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    f.tool.children[0].geometry = geometry;
    f.tool.children[0].position.set(0, 0, 0);
    assert.ok(f.scan().length > 0);
});

test('joint motion can bring a tool into earlier wrist links despite legacy exclusions', () => {
    const f = fixture();
    const link = mesh(4, 4, 4, 0, 0, 20);
    link.userData.robotJointIndex = 0;
    f.robot.add(link);
    assert.equal(f.scan().length, 0);
    f.flange.position.z = 15;
    assert.ok(f.scan().some(hit => hit.meshA === link));
    f.flange.position.z = 0;
    assert.equal(f.scan().length, 0);
    f.flange.rotation.y = Math.PI / 2;
    assert.equal(f.scan().length, 0, 'The mounting plane moves with the flange, independently of TCP');
});

test('complete containment and unmarked contacts are never mounting exemptions', () => {
    const f = fixture();
    f.tool.children[0].geometry = new THREE.BoxGeometry(2, 2, 2);
    f.tool.children[0].position.z = -5;
    assert.ok(f.scan().length > 0);
    const b = baseFixture();
    delete b.base.userData.collisionMountPlane;
    assert.ok(b.scan().length > 0);
});

test('installation bases made from primitive shapes obey the same contact policy', () => {
    const f = baseFixture();
    delete f.floor.userData.uploaded;
    f.floor.userData.primitiveShape = true;
    assert.equal(f.scan().length, 0);
    f.floor.position.z = 0.2;
    assert.ok(f.scan().length > 0);
});
