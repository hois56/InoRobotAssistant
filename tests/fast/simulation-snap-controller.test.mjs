import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const threeSource = readFileSync(new URL('../../3_ToolSelector/vendor/three/three.module.js', import.meta.url), 'utf8');
const THREE = await import(`data:text/javascript;base64,${Buffer.from(threeSource).toString('base64')}`);
const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
const names = ['moveRobotTcpToSimulationSnap', 'applySnapFaceOrientation', 'updateSnapFaceOrientationUi',
  'updateSimulationSnapButton', 'isMotionActive', 'isRobotMotionActive', 'isVirtualControllerActive',
  'isVirtualControllerActiveForRobot', 'getVirtualControllerForRobot', 'getVirtualControllerSessions'];
const functions = names.map(name => source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))[0]).join('\n');

function fixture({ connected = false, motion = false, olp = false, workOrigin = false, manualMove = false } = {}) {
  const robots = ['first', 'second'].map(id => {
    const robot = new THREE.Group();
    const tcp = new THREE.Group();
    robot.add(tcp);
    robot.userData = { motionInstanceId: id, tcpFrame: tcp, joints: [{ angle: 0 }] };
    return robot;
  });
  const robot = robots[connected ? 0 : 1];
  const controller = { wanted: true, targetRobotId: 'first' };
  const button = () => ({ disabled: false, classList: { toggle() {} }, setAttribute() {} });
  const el = { btnSnapMove: button(), btnSnapFaceHorizontal: button(), btnSnapFaceVertical: button() };
  const state = { virtualControllers: [controller], virtualController: controller,
    motionSessions: new Map(motion ? [['first', {}]] : []),
    olp: { workOriginBusy: workOrigin, manualMoveBusy: manualMove },
    snapMoveMode: true, placement: {}, measurement: {}, zeroPointEdit: {}, sketch: {} };
  let solves = 0, history = 0;
  const context = vm.createContext({ THREE, state, el,
    isOlpRunning: () => olp, getJogTargetRobot: () => robot, getJogTargetRobots: () => [robot],
    getActiveSimulationSnapFaceSelection: () => ({}), getSimulationSnapFaceNormal: () => new THREE.Vector3(0, 0, 1),
    getCurrentTcpPoseBase: () => ({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion() }),
    getRobotControllerBaseFrame: target => target,
    solveRobotIK(target) { solves++; target.userData.joints[0].angle = 20; return { success: true }; },
    captureSceneSnapshot: () => ({}), recordHistory() { history++; }, uiText: text => text,
    ...Object.fromEntries(['setStatus', 'setBaseJogStatus', 'syncJointControls', 'updateTcpPresentation',
      'syncBaseJogGizmoFromRobot', 'queueCollaborationRobotState', 'clearJogCollisionLock',
      'preferSnapFaceWristConfiguration', 'clearSimulationSnapFaceSelection', 'invalidateSimulationSnapCandidates',
      'hideSimulationSnapMarker', 'resetSimulationSnapMarkerCameraScale', 'setBaseJogGizmoEnabled'].map(name => [name, () => {}]))
  });
  vm.runInContext(functions, context);
  return { context, state, el, robots, solves: () => solves, history: () => history };
}

test('1번만 컨트롤러에 연결하면 2번 스냅 이동과 면 정렬을 허용한다', () => {
  const f = fixture();
  f.context.updateSimulationSnapButton();
  assert.equal(f.el.btnSnapMove.disabled, false);
  assert.equal(f.el.btnSnapFaceHorizontal.disabled, false);
  assert.equal(f.el.btnSnapFaceVertical.disabled, false);
  assert.equal(f.context.moveRobotTcpToSimulationSnap({ worldPoint: new THREE.Vector3(10, 20, 30) }), true);
  for (const mode of ['horizontal', 'vertical']) assert.equal(f.context.applySnapFaceOrientation(mode), true);
  assert.equal(f.solves(), 3);
  assert.equal(f.history(), 3);
  assert.equal(f.robots[0].userData.joints[0].angle, 0);
});

for (const options of [{ connected: true }, { motion: true }, { olp: true }, { workOrigin: true }, { manualMove: true }]) {
  test(`연결된 로봇과 기존 프로그램 이동 제한을 유지한다 ${JSON.stringify(options)}`, () => {
    const f = fixture(options);
    f.context.updateSnapFaceOrientationUi();
    assert.equal(f.el.btnSnapFaceHorizontal.disabled, true);
    assert.equal(f.el.btnSnapFaceVertical.disabled, true);
    assert.equal(f.context.moveRobotTcpToSimulationSnap({ worldPoint: new THREE.Vector3(10, 20, 30) }), false);
    for (const mode of ['horizontal', 'vertical']) assert.equal(f.context.applySnapFaceOrientation(mode), false);
    f.context.updateSimulationSnapButton();
    assert.equal(f.el.btnSnapMove.disabled, true);
    assert.equal(f.state.snapMoveMode, false);
    assert.equal(f.solves(), 0);
    assert.equal(f.history(), 0);
    assert.ok(f.robots.every(robot => robot.userData.joints[0].angle === 0));
  });
}
