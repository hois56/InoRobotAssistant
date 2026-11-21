import { readSimulationMarkup } from './read-simulation-markup.cjs';
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
// A complete, finite Trace pose is kept as controller TCP feedback (see simulation-controller-tcp tests).
assert.deepEqual(traceJointState.position, [100, 200, 300]);
assert.deepEqual(traceJointState.rotation, [10, 20, 30]);

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
const html = readSimulationMarkup();
const main = await readFile(new URL('../2_3DSimulation/main.js', import.meta.url), 'utf8');
const bridge = await readFile(new URL('../2_3DSimulation/VirtualControllerBridge/src/main.rs', import.meta.url), 'utf8');
const nativeClient = await readFile(new URL('../2_3DSimulation/VirtualControllerBridge/src/sdk.rs', import.meta.url), 'utf8');
const worker = await readFile(new URL('../2_3DSimulation/VirtualControllerBridge/src/worker.rs', import.meta.url), 'utf8');
assert.match(html, /id="virtual-controller-panel"/);
assert.match(html, /data-panel-toggle="virtual-controller-panel"/);
assert.match(html, /id="virtual-controller-connections"/);
assert.match(html, /id="virtual-controller-add"/);
assert.match(html, /bridge\/InoRobotVirtualControllerBridge\.zip[^"]*" download="InoRobotVirtualControllerBridge\.zip"/);
assert.match(html, /id="virtual-controller-source"/);
assert.match(html, /id="virtual-controller-kind"/);
assert.match(html, /id="virtual-controller-ip"/);
assert.match(html, /class="virtual-controller-controller-settings"/);
assert.doesNotMatch(html, /id="virtual-controller-grip-toggle"/);
assert.doesNotMatch(html, /virtual-controller-endpoint|127\.0\.0\.1:5055/);
assert.doesNotMatch(html, /컨트롤러 포트|3333 \(고정\)/);
assert.match(html, /id="virtual-controller-bridge-start"/);
assert.match(html, /id="view-presets-panel"/);
assert.match(html, /data-panel-toggle="view-presets-panel"/);
assert.match(html, /data-view-slot="3"/);
assert.doesNotMatch(html, /view-b-index|view-b-monitor|view-b-start|view-b-stop/);
assert.doesNotMatch(html, /<span>현재 로봇<\/span>/);
assert.doesNotMatch(html, /<span>체크 로봇<\/span>/);
assert.match(html, /\.\/trace-compat\/InoRobotTrace_V1\.5\.zip/);
assert.doesNotMatch(main, /from\s+['"]\.\/virtual-controller-core\.mjs/);
assert.match(main, /ensureVirtualControllerCore\(\)/);
assert.match(main, /import\('\.\/virtual-controller-core\.mjs(?:\?v=[^']+)?'\)/);
assert.match(main, /source\.startCommand/);
assert.match(main, /startVirtualControllerStream/);
assert.match(main, /stopVirtualControllerBridge/);
assert.match(main, /inorobot-vc-bridge:\/\/start/);
assert.match(main, /function endVirtualControllerSessionForSourceExit\(source(?:, controller = state\.virtualController)?\)/);
assert.match(main, /TRACE_SOURCE_LIVENESS_TIMEOUT_MS = 2500/);
assert.match(main, /function isVirtualControllerSourceLive\(timestamp(?:, controller = state\.virtualController)?\)/);
assert.match(main, /function monitorVirtualControllerBridgeHealth\(silent = false\)/);
assert.match(main, /VIRTUAL_CONTROLLER_BRIDGE_HEALTH_FAILURE_LIMIT = 3/);
assert.match(main, /bridgeHealthFailureCount/);
assert.match(main, /bridgeHealthCheckSequence/);
assert.match(main, /bridgeHealthMonitorGeneration/);
assert.match(main, /new WebSocket\(source\.socketUrl\)/);
assert.match(main, /socketGeneration/);
assert.match(main, /isCurrentSocket/);
assert.match(main, /Virtual controller WebSocket closed\./);
assert.match(main, /code: Number\(event\.code\) \|\| 0/);
assert.match(main, /reason: String\(event\.reason \|\| ''\)/);
assert.match(main, /Virtual controller bridge health check failed\./);
assert.match(main, /Virtual controller bridge health check returned an unusable response\./);
assert.match(main, /applyVirtualControllerFrame\(timestamp\)/);
assert.match(main, /function monitorVirtualControllerStream\(controller(?: = state\.virtualController)?\)/);
assert.doesNotMatch(main, /gripInference:/);
assert.doesNotMatch(main, /updateControllerGripInference/);
assert.doesNotMatch(main, /CONTROLLER_GRIP_CONTACT_HOLD_MS/);
assert.match(main, /VIRTUAL_CONTROLLER_STREAM_STALL_MS = 750/);
const sceneSelectionFunction = main.match(
    /function selectSceneModel\([\s\S]*?(?=\r?\nfunction beginNumericTransformHistory)/
)?.[0] || '';
assert.match(
    sceneSelectionFunction,
    /if \(!isVirtualControllerActive\(\)\) \{\s*state\.virtualController\.targetRobotId = model\.userData\.motionInstanceId;\s*\}/,
    'Selecting a robot in the model tree must not retarget an active controller.'
);
assert.match(main, /function scheduleVirtualControllerReconnect\(source, message = '', controller = state\.virtualController\)/);
assert.match(main, /virtualControllers: \[\]/);
assert.match(main, /function createVirtualControllerSession\(template = null\)/);
assert.match(main, /function registerVirtualControllerSession\(controller\)/);
assert.match(main, /getVirtualControllerSessions\(\)\.forEach\(\(controller\) =>/);
assert.match(main, /function applyVirtualControllerFrameForController\(timestamp, controller\)/);
assert.match(
    main,
    /async function connectVirtualController\(\)[\s\S]*?getMotionSession\(targetRobot\)[\s\S]*?isOlpRuntimeRunning\(getOlpRuntimeForRobot\(targetRobot\)\)/,
    'A controller connection must only be blocked by motion on its target robot.'
);
assert.match(main, /function isVirtualControllerActiveForRobot\(robot\)/);
assert.match(main, /!isVirtualControllerActiveForRobot\(robot\)/);
assert.match(main, /const activeRobotController = isVirtualControllerActiveForRobot\(robot\)/);
assert.match(main, /controller\.reconnectAttempt/);
assert.match(main, /parsed\.type === 'controllerReconnectFailed'/);
assert.match(main, /Virtual controller native feedback interrupted\./);
assert.match(main, /Virtual controller native reconnect failed\./);
assert.match(main, /controller\.reconnectMessage/);
assert.match(
    main,
    /function disconnectVirtualController\(controller(?: = state\.virtualController)?\)[\s\S]*?pendingInterferenceReads\.clear\(\);[\s\S]*?pendingInterferenceToolReads\.clear\(\);/
);
assert.match(main, /const sample = controller\.samples\.getLatest\(\)/);
assert.match(main, /sample\.sampleId <= controller\.lastAppliedSampleId/);
assert.match(main, /sample\.joints\.length < joints\.length/);
assert.match(main, /setJointAngle\(joint, (?:sample\.joints\[index\]|value), false(?:, true)?\)/);
assert.match(main, /function addViewMotionStep\(\)/);
assert.match(main, /step\.motion === 'VIEW'/);
assert.match(main, /Trace에서 관절 위치\(J1~J6\)를 가져올 수 없습니다\./);
assert.doesNotMatch(main, /sampleQuaternionForRobot|isTraceIkSolutionContinuous|TRACE_POSE_FALLBACK_STATUS/);
assert.match(bridge, /const BRIDGE_PORT: u16 = 5055/);
assert.match(bridge, /"controllerPort":2222/);
assert.match(bridge, /type Slots = Mutex<\[Option<Arc<Mutex<Connection>>>; 64\]>/);
assert.match(bridge, /app.reserve\(Arc::clone\(&connection\)\)/);
assert.match(bridge, /INOROBOT_BRIDGE_TOKEN/);
assert.match(bridge, /INOROBOT_BRIDGE_ORIGINS/);
assert.match(bridge, /getrandom::fill/);
assert.match(bridge, /https:\/\/inovancerobot\.com/);
assert.match(bridge, /Duration::from_secs\(10\), socket.recv\(\)/);
assert.match(bridge, /if origin.is_some\(\) && !allowed/);
assert.match(bridge, /"shutdown"/);
assert.match(worker, /real && !self\.worker\.allow_real/);
assert.match(worker, /self\.connect\(ip, real, 5\)/);
assert.match(worker, /self\.connect\(ip, real, 3\)/);
assert.match(worker, /controllerConnectionLost/);
assert.match(worker, /controllerReconnectFailed/);
assert.match(worker, /now\.duration_since\(\*start\)/);
assert.match(worker, /span < Duration::from_millis\(100\)/);
assert.match(worker, /self\.failures = None;/);
assert.match(worker, /\.map_or\(&\[\]\[\.\.\]/);
assert.match(nativeClient, /IMC100_Get_RobJPosHere/);
assert.match(nativeClient, /IMC100_Get_RobPosHere/);
assert.match(nativeClient, /include_bytes!\("\.\.\/Native\/MSVCR120\.dll"\)/);
assert.match(nativeClient, /include_bytes!\(".*IMC100API\.dll"\)/);

console.log('Virtual controller validation passed: joint sync and saved-view integration.');
