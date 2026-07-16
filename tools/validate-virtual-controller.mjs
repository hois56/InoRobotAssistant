import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    VIRTUAL_CONTROLLER_BRIDGE_URL,
    VIRTUAL_CONTROLLER_SAMPLE_INTERVAL_MS,
    VirtualControllerSampleBuffer,
    interpolateVirtualControllerJoints,
    parseVirtualControllerMessage
} from '../2_3DSimulation/virtual-controller-core.mjs';

assert.equal(VIRTUAL_CONTROLLER_BRIDGE_URL, 'ws://127.0.0.1:5055/ws');
assert.equal(VIRTUAL_CONTROLLER_SAMPLE_INTERVAL_MS, 4);

const robotState = parseVirtualControllerMessage(JSON.stringify({
    type: 'robotState',
    data: {
        sequence: 42,
        timestamp: 123456,
        joints: [10, -20, 30, 40, -50, 60, 0, 0],
        tcp: [100, 200, 300, 1, 2, 3]
    }
}), 20);
assert.equal(robotState.kind, 'state');
assert.deepEqual(robotState.joints.slice(0, 6), [10, -20, 30, 40, -50, 60]);
assert.deepEqual(robotState.position, [100, 200, 300]);
assert.deepEqual(robotState.rotation, [1, 2, 3]);
assert.equal(robotState.sequence, 42);
assert.equal(parseVirtualControllerMessage({ type: 'robotState', data: { joints: [1, 2, 3] } }).kind, 'invalid');
assert.deepEqual(
    interpolateVirtualControllerJoints([179, 10], [-179, 20], 0.5, ['revolute', 'prismatic']),
    [180, 15]
);

const pose = parseVirtualControllerMessage(JSON.stringify({
    type: 'traceData',
    data: {
        time: 1.25,
        pos_x: 100,
        pos_y: -200,
        pos_z: 350,
        pos_a: 10,
        pos_b: 20,
        pos_c: -30
    }
}), 25);
assert.equal(pose.kind, 'pose');
assert.deepEqual(pose.position, [100, -200, 350]);
assert.deepEqual(pose.rotation, [10, 20, -30]);
assert.equal(pose.receivedAt, 25);
assert.equal(pose.controllerTime, 1.25);

const camelPose = parseVirtualControllerMessage({
    type: 'traceData',
    data: { posX: 1, posY: 2, posZ: 3, posA: 4, posB: 5, posC: 6 }
}, 30);
assert.equal(camelPose.kind, 'pose');
assert.deepEqual(camelPose.position, [1, 2, 3]);
assert.equal(parseVirtualControllerMessage('{broken').kind, 'invalid');
assert.equal(parseVirtualControllerMessage({ type: 'traceData', data: { pos_x: 1 } }).kind, 'invalid');
assert.equal(parseVirtualControllerMessage({
    type: 'traceData',
    data: { pos_x: null, pos_y: 2, pos_z: 3, pos_a: 4, pos_b: 5, pos_c: 6 }
}).kind, 'invalid');

const buffer = new VirtualControllerSampleBuffer(4);
buffer.push({ ...pose, receivedAt: 100, position: [0, 0, 0] });
buffer.push({ ...pose, receivedAt: 104, position: [4, 0, 0] });
buffer.push({ ...pose, receivedAt: 108, position: [8, 0, 0] });
const sampleWindow = buffer.getWindow(106);
assert.equal(sampleWindow.previous.receivedAt, 104);
assert.equal(sampleWindow.next.receivedAt, 108);
assert.equal(sampleWindow.alpha, 0.5);
assert.ok(buffer.getRateHz() >= 249 && buffer.getRateHz() <= 251);

const html = await readFile(new URL('../2_3DSimulation/index.html', import.meta.url), 'utf8');
const main = await readFile(new URL('../2_3DSimulation/main.js', import.meta.url), 'utf8');
const bridge = await readFile(new URL('../2_3DSimulation/VirtualControllerBridge/Program.cs', import.meta.url), 'utf8');
const nativeClient = await readFile(new URL('../2_3DSimulation/VirtualControllerBridge/NativeRobotClient.cs', import.meta.url), 'utf8');
assert.match(html, /id="virtual-controller-panel"/);
assert.match(html, /data-panel-toggle="virtual-controller-panel"/);
assert.match(html, /bridge\/InoRobotVirtualControllerBridge\.exe/);
assert.doesNotMatch(main, /from\s+['"]\.\/virtual-controller-core\.mjs/);
assert.match(main, /ensureVirtualControllerCore\(\)/);
assert.match(main, /type:\s*'startStream'/);
assert.match(main, /applyVirtualControllerFrame\(timestamp\)/);
assert.match(main, /previousJoints\.length >= joints\.length/);
assert.match(main, /interpolateVirtualControllerJoints/);
assert.match(main, /setJointAngle\(joint, interpolatedJoints\[index\], false\)/);
assert.match(bridge, /BridgePort = 5055/);
assert.match(bridge, /type = "robotState"/);
assert.match(nativeClient, /IMC100_Get_RobJPosHere/);

console.log('Virtual controller validation passed: optional startup, dedicated 4 ms bridge, direct joint interpolation.');
