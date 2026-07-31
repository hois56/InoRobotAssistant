import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    VIRTUAL_CONTROLLER_BRIDGE_URL,
    VIRTUAL_CONTROLLER_BRIDGE_HEALTH_URL,
    VIRTUAL_CONTROLLER_TARGET_PORT,
    VIRTUAL_CONTROLLER_TRACE_URL,
    VIRTUAL_CONTROLLER_SAMPLE_INTERVAL_MS,
    VIRTUAL_CONTROLLER_SOURCES,
    VirtualControllerSampleBuffer,
    getVirtualControllerSource,
    parseVirtualControllerMessage
} from '../2_3DSimulation/virtual-controller-core.mjs';

assert.equal(VIRTUAL_CONTROLLER_BRIDGE_URL, 'ws://127.0.0.1:5055/ws');
assert.equal(VIRTUAL_CONTROLLER_BRIDGE_HEALTH_URL, 'http://127.0.0.1:5055/api/health');
assert.equal(VIRTUAL_CONTROLLER_TARGET_PORT, 2222);
assert.equal(VIRTUAL_CONTROLLER_TRACE_URL, 'ws://127.0.0.1:5000/ws');
assert.equal(VIRTUAL_CONTROLLER_SAMPLE_INTERVAL_MS, 4);
assert.equal(VIRTUAL_CONTROLLER_SOURCES.trace.startCommand, 'startTrace');
assert.equal(getVirtualControllerSource('trace').stopCommand, 'stopTrace');
assert.equal(getVirtualControllerSource('unknown').id, 'bridge');

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
const jointsOnlyState = parseVirtualControllerMessage({
    type: 'robotState',
    data: { joints: [10, -20, 30, 40], tcp: [] }
}, 21);
assert.equal(jointsOnlyState.kind, 'state');
assert.equal(jointsOnlyState.position, null);
assert.equal(jointsOnlyState.rotation, null);
const poseOnlyTrace = parseVirtualControllerMessage(JSON.stringify({
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
assert.equal(poseOnlyTrace.kind, 'invalid');
assert.equal(poseOnlyTrace.reason, 'trace-joints');

const traceJointState = parseVirtualControllerMessage({
    type: 'traceData',
    data: {
        time: 2.5,
        pos_x: 100,
        pos_y: 200,
        pos_z: 300,
        pos_a: 10,
        pos_b: 20,
        pos_c: 30,
        joint_pos_j1: 1,
        joint_pos_j2: 2,
        joint_pos_j3: 3,
        joint_pos_j4: 4,
        joint_pos_j5: 5,
        joint_pos_j6: 6
    }
}, 26);
assert.equal(traceJointState.kind, 'state');
assert.deepEqual(traceJointState.joints, [1, 2, 3, 4, 5, 6]);
assert.equal(traceJointState.position, null);
assert.equal(traceJointState.rotation, null);

const tracePackedJointState = parseVirtualControllerMessage({
    type: 'traceData',
    data: { joints: [10, 20, 30, 40, 50, 60] }
}, 27);
assert.equal(tracePackedJointState.kind, 'state');
assert.deepEqual(tracePackedJointState.joints, [10, 20, 30, 40, 50, 60]);
assert.equal(tracePackedJointState.position, null);

const camelPose = parseVirtualControllerMessage({
    type: 'traceData',
    data: { posX: 1, posY: 2, posZ: 3, posA: 4, posB: 5, posC: 6 }
}, 30);
assert.equal(camelPose.kind, 'invalid');
assert.equal(camelPose.reason, 'trace-joints');
assert.equal(parseVirtualControllerMessage('{broken').kind, 'invalid');
assert.equal(parseVirtualControllerMessage({ type: 'traceData', data: { pos_x: 1 } }).kind, 'invalid');
assert.equal(parseVirtualControllerMessage({
    type: 'traceData',
    data: { pos_x: null, pos_y: 2, pos_z: 3, pos_a: 4, pos_b: 5, pos_c: 6 }
}).kind, 'invalid');

const buffer = new VirtualControllerSampleBuffer();
buffer.push({ ...tracePackedJointState, receivedAt: 100, joints: [0, 0, 0, 0, 0, 0] });
assert.equal(buffer.getLatest().sampleId, 1);
assert.deepEqual(buffer.getLatest().joints, [0, 0, 0, 0, 0, 0]);
buffer.push({ ...tracePackedJointState, receivedAt: 104, joints: [4, 0, 0, 0, 0, 0] });
assert.equal(buffer.getLatest().sampleId, 2);
assert.deepEqual(buffer.getLatest().joints, [4, 0, 0, 0, 0, 0]);
buffer.push({ ...tracePackedJointState, receivedAt: 108, joints: [8, 0, 0, 0, 0, 0] });
assert.equal(buffer.getLatest().sampleId, 3);
assert.deepEqual(buffer.getLatest().joints, [8, 0, 0, 0, 0, 0]);
assert.ok(buffer.getRateHz() >= 249 && buffer.getRateHz() <= 251);
const html = await readFile(new URL('../2_3DSimulation/index.html', import.meta.url), 'utf8');
const main = await readFile(new URL('../2_3DSimulation/main.js', import.meta.url), 'utf8');
const bridge = await readFile(new URL('../2_3DSimulation/VirtualControllerBridge/Program.cs', import.meta.url), 'utf8');
const nativeClient = await readFile(new URL('../2_3DSimulation/VirtualControllerBridge/NativeRobotClient.cs', import.meta.url), 'utf8');
assert.match(html, /id="virtual-controller-panel"/);
assert.match(html, /data-panel-toggle="virtual-controller-panel"/);
assert.match(html, /bridge\/InoRobotVirtualControllerBridge\.zip/);
assert.match(html, /id="virtual-controller-source"/);
assert.match(html, /id="virtual-controller-kind"/);
assert.match(html, /id="virtual-controller-ip"/);
assert.match(html, /class="virtual-controller-controller-settings"/);
assert.doesNotMatch(html, /virtual-controller-endpoint|127\.0\.0\.1:5055/);
assert.doesNotMatch(html, /컨트롤러 포트|3333 \(고정\)/);
assert.match(html, /id="virtual-controller-bridge-start"/);
assert.match(html, /id="view-presets-panel"/);
assert.match(html, /data-panel-toggle="view-presets-panel"/);
assert.match(html, /data-view-slot="3"/);
assert.doesNotMatch(html, /view-b-index|view-b-monitor|view-b-start|view-b-stop/);
assert.doesNotMatch(html, /<span>현재 로봇<\/span>/);
assert.doesNotMatch(html, /<span>체크 로봇<\/span>/);
assert.match(html, /InoRobotTrace_V1\.5\.zip/);
assert.doesNotMatch(main, /from\s+['"]\.\/virtual-controller-core\.mjs/);
assert.match(main, /ensureVirtualControllerCore\(\)/);
assert.match(main, /virtual-controller-core\.mjs\?v=20260725-vc-port-1/);
assert.match(main, /source\.startCommand/);
assert.match(main, /startVirtualControllerStream/);
assert.match(main, /stopVirtualControllerBridge/);
assert.match(main, /inorobot-vc-bridge:\/\/start/);
assert.match(main, /function endVirtualControllerSessionForSourceExit\(source\)/);
assert.match(main, /TRACE_SOURCE_LIVENESS_TIMEOUT_MS = 2500/);
assert.match(main, /function isVirtualControllerSourceLive\(timestamp\)/);
assert.match(main, /function monitorVirtualControllerBridgeHealth\(silent = false\)/);
assert.match(main, /new WebSocket\(source\.socketUrl\)/);
assert.match(main, /applyVirtualControllerFrame\(timestamp\)/);
assert.match(main, /function monitorVirtualControllerStream\(\)/);
assert.match(main, /VIRTUAL_CONTROLLER_STREAM_STALL_MS = 750/);
assert.match(main, /function scheduleVirtualControllerReconnect\(source, message = ''\)/);
assert.match(main, /controller\.reconnectAttempt/);
assert.match(main, /const sample = controller\.samples\.getLatest\(\)/);
assert.match(main, /sample\.sampleId <= controller\.lastAppliedSampleId/);
assert.match(main, /sample\.joints\.length < joints\.length/);
assert.match(main, /setJointAngle\(joint, (?:sample\.joints\[index\]|value), false\)/);
assert.match(main, /function addViewMotionStep\(\)/);
assert.match(main, /step\.motion === 'VIEW'/);
assert.match(main, /Trace에서 관절 위치\(J1~J6\)를 가져올 수 없습니다\./);
assert.doesNotMatch(main, /sampleQuaternionForRobot|isTraceIkSolutionContinuous|TRACE_POSE_FALLBACK_STATUS/);
assert.match(bridge, /BridgePort = 5055/);
assert.match(bridge, /ControllerPort = 2222/);
assert.match(bridge, /INOROBOT_BRIDGE_TOKEN/);
assert.match(bridge, /INOROBOT_BRIDGE_ORIGINS/);
assert.match(bridge, /RandomNumberGenerator\.GetBytes/);
assert.match(bridge, /https:\/\/inovancerobot\.com/);
assert.match(bridge, /controllerKind = root\.TryGetProperty\("controllerKind"/);
assert.match(bridge, /robot\.Connect\(ip, ControllerPort\)/);
assert.doesNotMatch(bridge, /!requestedRealController \|\| !realControllerAllowed/);
assert.match(bridge, /TimeSpan\.FromSeconds\(10\)/);
assert.match(bridge, /TimeSpan\? timeout = null/);
assert.match(bridge, /ReceiveMessageAsync\(socket, sessionCancellation\.Token\);/);
assert.match(bridge, /controllerConnectionLost/);
assert.match(bridge, /robot\.Connect\(controllerIp, ControllerPort, 3000\)/);
assert.match(bridge, /IsAllowedOrigin/);
assert.match(bridge, /type == "shutdown"/);
assert.doesNotMatch(bridge, /AccessControlAllowOrigin = "\*"/);
assert.match(nativeClient, /IMC100_Get_RobJPosHere/);
assert.match(nativeClient, /int port = 2222/);
assert.match(nativeClient, /DisconnectUnsafe\(\);\r?\n\s*return null;/);
assert.match(nativeClient, /double\[\] tcp = Array\.Empty<double>\(\)/);
assert.match(nativeClient, /if \(tcpResult >= 0\)/);

console.log('Virtual controller validation passed: joint sync and saved-view integration.');
