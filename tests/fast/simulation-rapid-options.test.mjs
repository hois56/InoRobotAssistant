import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const threeSource=fs.readFileSync(new URL('../../3_ToolSelector/vendor/three/three.module.js',import.meta.url),'utf8');
const THREE=await import(`data:text/javascript;base64,${Buffer.from(threeSource).toString('base64')}`);

const toolCore = await import('../../2_3DSimulation/tool-data-core.mjs');
const state = { models: [] };
const context = vm.createContext({
    THREE, state,
    normalizeToolLoad: toolCore.normalizeToolLoad,
    combineToolLoads: toolCore.combineToolLoads,
    ensureRobotTcpProfiles: robot => robot?.userData.tcpProfiles || [],
    normalizeArmLoadProperties: source => ({ ...source }),
    getArmLoadJointIndex: model => model.userData.attachmentJointIndex
});
const source=fs.readFileSync(new URL('../../2_3DSimulation/main.js',import.meta.url),'utf8');
vm.runInContext(source.match(/function getRobotRapidMoveOptions\([^]*?\n\}/)[0], context);
const getOptions = context.getRobotRapidMoveOptions;
const robot = new THREE.Group();
const j2 = new THREE.Group();
robot.add(j2);
robot.position.set(400, -200, 30);
robot.rotation.z = 0.7;
j2.rotation.z = -0.3;
robot.userData = {
    manifest: { robotType: 'scara', structure: [325, 275, 0, 20], rapidMove: { enabled: true } },
    motionModelName: 'IR-S7-60Z20S-INT',
    motionModelFolder: 'IR-S7-60Z20',
    joints: [{}, { group: j2 }],
    activeTcpProfileIndex: 1,
    tcpProfiles: [
        { position: new THREE.Vector3(), load: toolCore.normalizeToolLoad() },
        { position: new THREE.Vector3(10, 20, 30), load: { mass: 2, cog: [1, 2, 3], inertia: [0.01, 0.02, 0.03] } }
    ]
};
const mount = new THREE.Group();
mount.position.set(158, 0, 78);
j2.add(mount);
const arm = new THREE.Group();
arm.position.set(10, 20, 30);
arm.rotation.z = Math.PI / 2;
arm.scale.set(2, 2, 2); // Stored properties already include model scale.
arm.visible = false; // Visibility does not remove a physical load.
arm.userData = {
    placement: 'arm-load', attachmentHost: robot, attachmentJointIndex: 1,
    armLoadProperties: { mass: 3, cogX: 4, cogY: 5, cogZ: 6, ixx: 0.1, iyy: 0.2, izz: 0.3 }
};
mount.add(arm);
state.models.push(arm);
let result = getOptions(robot, {
    gripLoad: { mass: 1, cog: [2, 3, 4], inertia: [0.001, 0.002, 0.003] },
    accelerationPercent: 80, decelerationPercent: 70, accelerationRamp: [50, 60]
});
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
assert.equal(result.toolLoad.mass, 2);
assert.deepEqual(Array.from(result.toolLoad.cog), [1, 2, 3]);
assert.deepEqual(Array.from(result.gripLoad.cog), [12, 23, 34]);
assert.equal(result.armLoads.length, 1);
assert.equal(result.armLoads[0].linkIndex, 1);
[163, 24, 114].forEach((expected, axis) => close(result.armLoads[0].cog[axis], expected));
[0.2, 0.1, 0.3].forEach((expected, axis) => close(result.armLoads[0].inertia[axis], expected));
assert.equal(result.accelerationPercent, 80);
assert.equal(result.decelerationPercent, 70);
assert.equal(result.jerkPercent, 50);
assert.equal(result.stopJerkPercent, 60);
assert.equal(result.modelFolder, 'IR-S7-60Z20');
assert.equal(result.modelName, 'IR-S7-60Z20S-INT');
assert.equal(result.loadDiagnostics.length, 0);

robot.userData.activeTcpProfileIndex = 0;
robot.userData.tcpLiveProfile = robot.userData.tcpProfiles[1];
result = getOptions(robot);
assert.equal(result.toolLoad.mass, 0);
assert.equal(result.gripLoad, undefined);
arm.userData.armLoadProperties.cogX = null;
result = getOptions(robot);
assert.ok(result.loadDiagnostics.some(message => message.includes('missing-cogX')));

console.log('Rapid options helper: flange payload, Tool 0, grip translation, J2 mount offset/rotation, visibility and units passed.');
